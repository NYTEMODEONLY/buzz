use super::{
    finish_with_error, grok_proto, join_reader, read_bounded_jsonl_with_codes, stop_child,
    unix_timestamp, ProviderUsageAccount, ProviderUsageId, ProviderUsageSnapshot,
    ProviderUsageTotals, ProviderUsageWindow, RESPONSE_TIMEOUT,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

const MAX_AUTH_BYTES: u64 = 256 * 1024;
const MAX_WEB_RESPONSE_BYTES: usize = 512 * 1024;
const WEB_BILLING_ENDPOINT: &str =
    "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";

pub(super) struct Credentials {
    pub(super) access_token: String,
    pub(super) expires_at: Option<i64>,
    pub(super) account_type: Option<String>,
    pub(super) login_method: Option<String>,
}

impl Credentials {
    pub(super) fn is_expired(&self, now: u64) -> bool {
        self.expires_at
            .is_some_and(|expires_at| expires_at <= now as i64)
    }

    pub(super) fn is_team(&self) -> bool {
        self.account_type
            .as_deref()
            .is_some_and(|value| value.trim().eq_ignore_ascii_case("team"))
    }

    pub(super) fn public_account(&self) -> ProviderUsageAccount {
        ProviderUsageAccount {
            label: None,
            account_type: self.account_type.clone(),
            login_method: self.login_method.clone(),
        }
    }
}

pub(super) fn capability(cli_installed: bool) -> (&'static str, &'static str) {
    capability_for(
        load_credentials(&auth_path()),
        cli_installed,
        unix_timestamp(),
    )
}

pub(super) fn capability_for(
    credentials: Result<Credentials, String>,
    cli_installed: bool,
    now: u64,
) -> (&'static str, &'static str) {
    match credentials {
        Ok(credentials) if !credentials.is_expired(now) => (
            "available",
            "Uses your existing local Grok sign-in without browser access",
        ),
        _ if cli_installed => (
            "not_authenticated",
            "Run grok login to read your Grok allowance",
        ),
        _ => ("not_installed", "Install and sign in to the Grok CLI"),
    }
}

fn home() -> PathBuf {
    std::env::var_os("GROK_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".grok")))
        .unwrap_or_else(|| PathBuf::from(".grok"))
}

pub(super) fn auth_path() -> PathBuf {
    home().join("auth.json")
}

pub(super) fn load_credentials(path: &Path) -> Result<Credentials, String> {
    let metadata = fs::metadata(path).map_err(|_| "grok_not_authenticated".to_string())?;
    if !metadata.is_file() {
        return Err("grok_not_authenticated".to_string());
    }
    if metadata.len() > MAX_AUTH_BYTES {
        return Err("grok_auth_invalid".to_string());
    }

    let file = fs::File::open(path).map_err(|_| "grok_auth_unavailable".to_string())?;
    let mut data = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_AUTH_BYTES + 1)
        .read_to_end(&mut data)
        .map_err(|_| "grok_auth_unavailable".to_string())?;
    if data.len() as u64 > MAX_AUTH_BYTES {
        return Err("grok_auth_invalid".to_string());
    }
    parse_credentials(&data)
}

pub(super) fn parse_credentials(data: &[u8]) -> Result<Credentials, String> {
    let root: BTreeMap<String, Value> =
        serde_json::from_slice(data).map_err(|_| "grok_auth_invalid".to_string())?;
    let entry = select_preferred_entry(&root, unix_timestamp())
        .ok_or_else(|| "grok_not_authenticated".to_string())?;

    let access_token = entry
        .get("key")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "grok_not_authenticated".to_string())?;
    let expires_at = entry
        .get("expires_at")
        .and_then(Value::as_str)
        .and_then(parse_rfc3339_timestamp);
    let account_type = entry
        .get("principal_type")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned);
    let login_method = entry
        .get("auth_mode")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            if value.eq_ignore_ascii_case("oidc") {
                "SuperGrok".to_string()
            } else {
                value.to_string()
            }
        });

    Ok(Credentials {
        access_token,
        expires_at,
        account_type,
        login_method,
    })
}

fn select_preferred_entry(root: &BTreeMap<String, Value>, now: u64) -> Option<&Value> {
    let usable = |value: &&Value| {
        value
            .get("key")
            .and_then(Value::as_str)
            .is_some_and(|key| !key.trim().is_empty())
    };
    let healthy = |value: &Value| {
        value
            .get("expires_at")
            .and_then(Value::as_str)
            .and_then(parse_rfc3339_timestamp)
            .is_none_or(|expires_at| expires_at > now as i64)
    };
    let newest = |(_, value): &(&String, &Value)| {
        value
            .get("create_time")
            .and_then(Value::as_str)
            .and_then(parse_rfc3339_timestamp)
            .unwrap_or(i64::MIN)
    };

    let oidc = root
        .iter()
        .filter(|(scope, value)| scope.starts_with("https://auth.x.ai::") && usable(value));
    if let Some((_, entry)) = oidc
        .clone()
        .filter(|(_, value)| healthy(value))
        .max_by_key(newest)
    {
        return Some(entry);
    }
    let legacy = root.iter().filter(|(scope, value)| {
        (scope.as_str() == "https://accounts.x.ai/sign-in" || scope.contains("/sign-in"))
            && usable(value)
    });
    if let Some((_, entry)) = legacy
        .clone()
        .filter(|(_, value)| healthy(value))
        .max_by_key(newest)
    {
        return Some(entry);
    }
    oidc.max_by_key(newest)
        .or_else(|| legacy.max_by_key(newest))
        .map(|(_, value)| value)
}

pub(super) fn parse_rfc3339_timestamp(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.timestamp())
}

pub(super) fn read_provider_usage(
    grok_path: Option<&Path>,
) -> Result<ProviderUsageSnapshot, String> {
    let cli_error = match grok_path.map(read_cli_usage) {
        Some(Ok(mut snapshot)) => {
            snapshot.account = load_credentials(&auth_path())
                .ok()
                .map(|credentials| credentials.public_account());
            return Ok(snapshot);
        }
        Some(Err(error)) => Some(error),
        None => None,
    };

    let credentials = match load_credentials(&auth_path()) {
        Ok(credentials) => credentials,
        Err(auth_error) => {
            return match (grok_path, cli_error.as_deref()) {
                (None, None) if auth_error == "grok_not_authenticated" => {
                    Err("grok_not_installed".to_string())
                }
                (_, Some("grok_usage_method_unavailable")) => Err(auth_error),
                (_, Some(cli_error)) if auth_error == "grok_not_authenticated" => {
                    Err(cli_error.to_string())
                }
                _ => Err(auth_error),
            };
        }
    };
    read_web_usage(&credentials)
}

pub(super) fn initialize_request() -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "1",
            "clientCapabilities": {
                "fs": {
                    "readTextFile": false,
                    "writeTextFile": false
                },
                "terminal": false
            }
        }
    })
}

pub(super) fn billing_request() -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "x.ai/billing",
        "params": {}
    })
}

fn read_cli_usage(grok_path: &Path) -> Result<ProviderUsageSnapshot, String> {
    let mut command = Command::new(grok_path);
    command
        .args(["agent", "stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(path) = crate::managed_agents::login_shell_path() {
        command.env("PATH", path);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    crate::util::configure_no_window(&mut command);

    let mut child = command
        .spawn()
        .map_err(|_| "grok_cli_start_failed".to_string())?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| finish_with_error(&mut child, "grok_cli_stdin_unavailable"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| finish_with_error(&mut child, "grok_cli_stdout_unavailable"))?;

    write_message(&mut child, &mut stdin, &initialize_request())?;
    let (sender, receiver) = mpsc::channel();
    let mut reader = Some(std::thread::spawn(move || {
        read_bounded_jsonl_with_codes(
            stdout,
            sender,
            "grok_cli_read_failed",
            "grok_usage_response_too_large",
        )
    }));
    let deadline = Instant::now() + RESPONSE_TIMEOUT;

    if let Err(code) = wait_for_response(&receiver, deadline, 1) {
        stop_child(&mut child);
        join_reader(&mut reader);
        return Err(code);
    }
    if let Err(code) = write_message(&mut child, &mut stdin, &billing_request()) {
        join_reader(&mut reader);
        return Err(code);
    }
    let billing = match wait_for_response(&receiver, deadline, 2) {
        Ok(result) => result,
        Err(code) => {
            stop_child(&mut child);
            join_reader(&mut reader);
            return Err(code);
        }
    };
    stop_child(&mut child);
    join_reader(&mut reader);

    normalize_cli_usage(&billing, unix_timestamp())
}

fn write_message(child: &mut Child, stdin: &mut impl Write, message: &Value) -> Result<(), String> {
    writeln!(stdin, "{message}")
        .and_then(|_| stdin.flush())
        .map_err(|_| finish_with_error(child, "grok_cli_write_failed"))
}

fn wait_for_response(
    receiver: &mpsc::Receiver<Result<String, String>>,
    deadline: Instant,
    expected_id: u64,
) -> Result<Value, String> {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return Err("grok_usage_timeout".to_string());
        }
        match receiver.recv_timeout(deadline.saturating_duration_since(now)) {
            Ok(Ok(line)) => {
                let message = serde_json::from_str::<Value>(&line)
                    .map_err(|_| "grok_usage_invalid_response".to_string())?;
                if message.get("id").and_then(Value::as_u64) != Some(expected_id) {
                    continue;
                }
                if let Some(error) = message.get("error") {
                    return Err(classify_rpc_error(error));
                }
                return message
                    .get("result")
                    .cloned()
                    .ok_or_else(|| "grok_usage_invalid_response".to_string());
            }
            Ok(Err(code)) => return Err(code),
            Err(mpsc::RecvTimeoutError::Timeout) => return Err("grok_usage_timeout".to_string()),
            Err(mpsc::RecvTimeoutError::Disconnected) => return Err("grok_cli_closed".to_string()),
        }
    }
}

pub(super) fn classify_rpc_error(error: &Value) -> String {
    let code = error.get("code").and_then(Value::as_i64);
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if code == Some(-32601)
        || message == "method not found"
        || message.starts_with("method not found:")
    {
        return "grok_usage_method_unavailable".to_string();
    }
    if message.contains("authentication required")
        || message.contains("not authenticated")
        || message.contains("grok login")
        || message.contains("token expired")
    {
        return "grok_not_authenticated".to_string();
    }
    if message.contains("timeout") || message.contains("deadline") {
        return "grok_usage_temporarily_unavailable".to_string();
    }
    "grok_usage_unavailable".to_string()
}

pub(super) fn normalize_cli_usage(
    billing: &Value,
    fetched_at: u64,
) -> Result<ProviderUsageSnapshot, String> {
    let limit = billing
        .pointer("/monthlyLimit/val")
        .and_then(Value::as_i64)
        .filter(|value| *value > 0)
        .ok_or_else(|| "grok_usage_invalid_response".to_string())?;
    let used = billing
        .pointer("/usage/totalUsed/val")
        .and_then(Value::as_i64)
        .filter(|value| *value >= 0)
        .ok_or_else(|| "grok_usage_invalid_response".to_string())?;
    let used_percent = ((used as f64 / limit as f64) * 100.0)
        .clamp(0.0, 100.0)
        .round() as u64;
    let start = billing
        .pointer("/billingCycle/billingPeriodStart")
        .and_then(Value::as_str)
        .and_then(parse_rfc3339_timestamp);
    let end = billing
        .pointer("/billingCycle/billingPeriodEnd")
        .and_then(Value::as_str)
        .and_then(parse_rfc3339_timestamp);
    let duration_minutes = start
        .zip(end)
        .and_then(|(start, end)| (end > start).then_some(((end - start) / 60) as u64));

    Ok(snapshot(
        used_percent,
        end,
        duration_minutes,
        "grokCliBilling",
        "exact",
        None,
        fetched_at,
    ))
}

fn read_web_usage(credentials: &Credentials) -> Result<ProviderUsageSnapshot, String> {
    if credentials.is_expired(unix_timestamp()) {
        return Err("grok_not_authenticated".to_string());
    }
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(RESPONSE_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "grok_usage_temporarily_unavailable".to_string())?;

    let mut last_error = "grok_usage_temporarily_unavailable".to_string();
    for attempt in 0..2 {
        match fetch_web_once(&client, credentials) {
            Ok(snapshot) => return Ok(snapshot),
            Err(code) => {
                let retryable = code == "grok_usage_temporarily_unavailable";
                last_error = code;
                if !retryable || attempt == 1 {
                    break;
                }
            }
        }
    }
    Err(last_error)
}

fn fetch_web_once(
    client: &reqwest::blocking::Client,
    credentials: &Credentials,
) -> Result<ProviderUsageSnapshot, String> {
    let response = client
        .post(WEB_BILLING_ENDPOINT)
        .bearer_auth(&credentials.access_token)
        .header("Origin", "https://grok.com")
        .header("Referer", "https://grok.com/?_s=usage")
        .header("Accept", "*/*")
        .header("Content-Type", "application/grpc-web+proto")
        .header("x-grpc-web", "1")
        .header("x-user-agent", "connect-es/2.1.1")
        .header("User-Agent", "Buzz")
        .body(vec![0_u8; 5])
        .send()
        .map_err(|_| "grok_usage_temporarily_unavailable".to_string())?;

    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("grok_not_authenticated".to_string());
    }
    if status.as_u16() == 408 || status.as_u16() == 429 || status.is_server_error() {
        return Err("grok_usage_temporarily_unavailable".to_string());
    }
    if !status.is_success() {
        return Err("grok_usage_request_failed".to_string());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_WEB_RESPONSE_BYTES as u64)
    {
        return Err("grok_usage_response_too_large".to_string());
    }

    let header_status = response
        .headers()
        .get("grpc-status")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<i32>().ok());
    let header_message = response
        .headers()
        .get("grpc-message")
        .and_then(|value| value.to_str().ok())
        .map(grok_proto::percent_decode)
        .unwrap_or_default();
    classify_grpc_status(header_status, &header_message, credentials.is_team())?;

    let mut body = Vec::new();
    response
        .take((MAX_WEB_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut body)
        .map_err(|_| "grok_usage_temporarily_unavailable".to_string())?;
    if body.len() > MAX_WEB_RESPONSE_BYTES {
        return Err("grok_usage_response_too_large".to_string());
    }

    if let Some((status, message)) = grok_proto::trailer_status(&body) {
        classify_grpc_status(Some(status), &message, credentials.is_team())?;
    }
    let (used_percent, resets_at) = grok_proto::parse_usage(&body)?;
    Ok(snapshot(
        used_percent,
        resets_at,
        None,
        "grokWebBilling",
        "percentOnly",
        Some(credentials.public_account()),
        unix_timestamp(),
    ))
}

pub(super) fn classify_grpc_status(
    status: Option<i32>,
    message: &str,
    is_team: bool,
) -> Result<(), String> {
    let Some(status) = status.filter(|status| *status != 0) else {
        return Ok(());
    };
    let normalized = message.trim().to_ascii_lowercase();
    if status == 16
        || (status == 7
            && (normalized.contains("bad-credentials")
                || normalized.contains("unauthenticated")
                || (normalized.contains("oauth2")
                    && normalized.contains("could not be validated"))
                || (normalized.contains("access token")
                    && (normalized.contains("invalid")
                        || normalized.contains("expired")
                        || normalized.contains("could not be validated")))))
    {
        return Err("grok_not_authenticated".to_string());
    }
    if status == 9
        && is_team
        && (normalized == "no personal team" || normalized == "no personal team.")
    {
        return Err("grok_team_usage_unsupported".to_string());
    }
    if status == 4
        || status == 14
        || (status == 1
            && (normalized.contains("timeout")
                || normalized.contains("deadline")
                || normalized.contains("expired")))
    {
        return Err("grok_usage_temporarily_unavailable".to_string());
    }
    Err("grok_usage_rpc_failed".to_string())
}

pub(super) fn snapshot(
    used_percent: u64,
    resets_at: Option<i64>,
    duration_minutes: Option<u64>,
    source_detail: &'static str,
    data_confidence: &'static str,
    account: Option<ProviderUsageAccount>,
    fetched_at: u64,
) -> ProviderUsageSnapshot {
    ProviderUsageSnapshot {
        provider: ProviderUsageId::Grok.as_str(),
        vendor: "xai",
        product: "grok",
        source: "personalAllowance",
        source_detail: Some(source_detail),
        data_confidence: Some(data_confidence),
        freshness: Some("fresh"),
        account,
        plan_type: None,
        windows: vec![ProviderUsageWindow {
            id: "grok:primary".to_string(),
            label: if duration_minutes == Some(43_200) {
                "Monthly".to_string()
            } else {
                "Allowance".to_string()
            },
            used_percent,
            remaining_percent: 100 - used_percent,
            resets_at,
            duration_minutes,
        }],
        totals: ProviderUsageTotals {
            credit_balance: None,
            reset_credits_available: None,
            lifetime_tokens: None,
            latest_daily_tokens: None,
            latest_daily_date: None,
        },
        fetched_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_requires_healthy_bounded_auth() {
        let healthy = parse_credentials(
            br#"{"https://auth.x.ai::client":{"key":"ok","expires_at":"2099-01-01T00:00:00Z"}}"#,
        );
        assert_eq!(
            capability_for(healthy, false, 1_800_000_000).0,
            "available"
        );

        let expired = parse_credentials(
            br#"{"https://auth.x.ai::client":{"key":"old","expires_at":"2020-01-01T00:00:00Z"}}"#,
        );
        assert_eq!(
            capability_for(expired, true, 1_800_000_000).0,
            "not_authenticated"
        );
        assert_eq!(
            capability_for(
                Err("grok_auth_invalid".to_string()),
                true,
                1_800_000_000,
            )
            .0,
            "not_authenticated"
        );
        assert_eq!(
            capability_for(
                Err("grok_not_authenticated".to_string()),
                false,
                1_800_000_000,
            )
            .0,
            "not_installed"
        );
    }

    #[test]
    fn selects_newest_healthy_oidc_entry_before_expired_or_legacy() {
        let credentials = parse_credentials(
            br#"{
                "https://auth.x.ai::expired": {
                    "key": "expired",
                    "create_time": "2030-01-01T00:00:00Z",
                    "expires_at": "2020-01-01T00:00:00Z"
                },
                "https://auth.x.ai::older": {
                    "key": "older",
                    "create_time": "2025-01-01T00:00:00Z",
                    "expires_at": "2099-01-01T00:00:00Z"
                },
                "https://auth.x.ai::newer": {
                    "key": "newer",
                    "create_time": "2026-01-01T00:00:00Z",
                    "expires_at": "2099-01-01T00:00:00Z"
                },
                "https://accounts.x.ai/sign-in": {
                    "key": "legacy",
                    "create_time": "2027-01-01T00:00:00Z"
                }
            }"#,
        )
        .unwrap();
        assert_eq!(credentials.access_token, "newer");
    }

    #[test]
    fn rejects_known_expired_bearer_before_web_client_creation() {
        let credentials = parse_credentials(
            br#"{"https://auth.x.ai::client":{"key":"old","expires_at":"2020-01-01T00:00:00Z"}}"#,
        )
        .unwrap();
        assert_eq!(
            read_web_usage(&credentials).unwrap_err(),
            "grok_not_authenticated"
        );
    }

    #[test]
    fn snapshot_serializes_additive_metadata_without_secrets() {
        let usage = snapshot(
            17,
            Some(1_900_000_000),
            None,
            "grokWebBilling",
            "percentOnly",
            Some(ProviderUsageAccount {
                label: None,
                account_type: Some("User".to_string()),
                login_method: Some("SuperGrok".to_string()),
            }),
            123,
        );
        let serialized = serde_json::to_value(usage).unwrap();
        assert_eq!(serialized["source"], "personalAllowance");
        assert_eq!(serialized["sourceDetail"], "grokWebBilling");
        assert_eq!(serialized["dataConfidence"], "percentOnly");
        assert_eq!(serialized["freshness"], "fresh");
        assert_eq!(serialized["account"]["loginMethod"], "SuperGrok");
        assert_eq!(serialized["windows"][0]["remainingPercent"], 83);
    }
}
