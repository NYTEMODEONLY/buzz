use serde::Serialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const RESPONSE_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodexProviderUsage {
    provider: &'static str,
    plan_type: Option<String>,
    used_percent: u64,
    remaining_percent: u64,
    resets_at: Option<i64>,
    window_duration_minutes: Option<u64>,
    credit_balance: Option<String>,
    reset_credits_available: Option<u64>,
    lifetime_tokens: Option<u64>,
    latest_daily_tokens: Option<u64>,
    latest_daily_date: Option<String>,
    fetched_at: u64,
}

#[tauri::command]
pub async fn get_codex_provider_usage() -> Result<CodexProviderUsage, String> {
    let codex_path = crate::managed_agents::resolve_command("codex")
        .ok_or_else(|| "codex_not_installed".to_string())?;

    tokio::task::spawn_blocking(move || read_codex_provider_usage(&codex_path))
        .await
        .map_err(|_| "codex_usage_task_failed".to_string())?
}

fn read_codex_provider_usage(codex_path: &std::path::Path) -> Result<CodexProviderUsage, String> {
    let mut command = Command::new(codex_path);
    command
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // App-server stderr can contain local configuration details. The
        // indicator exposes stable error codes instead of forwarding it.
        .stderr(Stdio::null());
    if let Some(workdir) = crate::managed_agents::default_agent_workdir() {
        command.current_dir(workdir);
    }
    if let Some(path) = crate::managed_agents::login_shell_path() {
        command.env("PATH", path);
    }
    // The npm/Homebrew Codex launcher can hand off to a native binary. Keep
    // the whole launcher tree in one process group so timeout/error cleanup
    // also closes descendants that inherited stdout.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    crate::util::configure_no_window(&mut command);

    let mut child = command
        .spawn()
        .map_err(|_| "codex_app_server_start_failed".to_string())?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| finish_with_error(&mut child, "codex_app_server_stdin_unavailable"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| finish_with_error(&mut child, "codex_app_server_stdout_unavailable"))?;

    for message in app_server_requests() {
        writeln!(stdin, "{message}")
            .map_err(|_| finish_with_error(&mut child, "codex_app_server_write_failed"))?;
    }
    stdin
        .flush()
        .map_err(|_| finish_with_error(&mut child, "codex_app_server_write_failed"))?;

    let (sender, receiver) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            if sender.send(line).is_err() {
                break;
            }
        }
    });

    let deadline = Instant::now() + RESPONSE_TIMEOUT;
    let mut rate_limits = None;
    let mut token_usage = None;

    while rate_limits.is_none() || token_usage.is_none() {
        let now = Instant::now();
        if now >= deadline {
            stop_child(&mut child);
            let _ = reader.join();
            return Err("codex_usage_timeout".to_string());
        }

        match receiver.recv_timeout(deadline.saturating_duration_since(now)) {
            Ok(Ok(line)) => {
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(error_code) = response_error_code(&message) {
                    stop_child(&mut child);
                    let _ = reader.join();
                    return Err(error_code);
                }
                match message.get("id").and_then(Value::as_u64) {
                    Some(2) => rate_limits = message.get("result").cloned(),
                    Some(3) => token_usage = message.get("result").cloned(),
                    _ => {}
                }
            }
            Ok(Err(_)) => {
                stop_child(&mut child);
                let _ = reader.join();
                return Err("codex_app_server_read_failed".to_string());
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                stop_child(&mut child);
                let _ = reader.join();
                return Err("codex_usage_timeout".to_string());
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                stop_child(&mut child);
                let _ = reader.join();
                return Err("codex_app_server_closed".to_string());
            }
        }
    }

    stop_child(&mut child);
    let _ = reader.join();
    normalize_usage(
        rate_limits.as_ref().expect("rate limits checked above"),
        token_usage.as_ref().expect("token usage checked above"),
        unix_timestamp(),
    )
}

fn app_server_requests() -> [Value; 4] {
    [
        json!({
            "method": "initialize",
            "id": 1,
            "params": {
                "clientInfo": {
                    "name": "buzz_desktop",
                    "title": "Buzz Desktop",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "capabilities": {
                    "experimentalApi": true,
                    "optOutNotificationMethods": [
                        "thread/started",
                        "item/agentMessage/delta"
                    ]
                }
            }
        }),
        json!({"method": "initialized", "params": {}}),
        json!({"method": "account/rateLimits/read", "id": 2, "params": null}),
        json!({"method": "account/usage/read", "id": 3, "params": null}),
    ]
}

fn response_error_code(message: &Value) -> Option<String> {
    let error = message.get("error")?;
    let detail = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if detail.contains("auth") || detail.contains("login") {
        return Some("codex_not_authenticated".to_string());
    }
    if detail.contains("experimental") || detail.contains("method") {
        return Some("codex_usage_protocol_unsupported".to_string());
    }
    Some("codex_usage_unavailable".to_string())
}

fn normalize_usage(
    rate_limits_result: &Value,
    token_usage_result: &Value,
    fetched_at: u64,
) -> Result<CodexProviderUsage, String> {
    let snapshot = rate_limits_result
        .get("rateLimits")
        .ok_or_else(|| "codex_usage_invalid_response".to_string())?;
    let primary = snapshot
        .get("primary")
        .filter(|value| !value.is_null())
        .ok_or_else(|| "codex_usage_limit_unavailable".to_string())?;
    let used_percent = primary
        .get("usedPercent")
        .and_then(Value::as_u64)
        .ok_or_else(|| "codex_usage_invalid_response".to_string())?
        .min(100);

    let latest_bucket = token_usage_result
        .get("dailyUsageBuckets")
        .and_then(Value::as_array)
        .and_then(|buckets| {
            buckets.iter().max_by_key(|bucket| {
                bucket
                    .get("startDate")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
            })
        });

    Ok(CodexProviderUsage {
        provider: "openai",
        plan_type: snapshot
            .get("planType")
            .and_then(Value::as_str)
            .map(str::to_owned),
        used_percent,
        remaining_percent: 100 - used_percent,
        resets_at: primary.get("resetsAt").and_then(Value::as_i64),
        window_duration_minutes: primary.get("windowDurationMins").and_then(Value::as_u64),
        credit_balance: snapshot
            .get("credits")
            .and_then(|credits| credits.get("balance"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        reset_credits_available: rate_limits_result
            .get("rateLimitResetCredits")
            .and_then(|credits| credits.get("availableCount"))
            .and_then(Value::as_u64),
        lifetime_tokens: token_usage_result
            .get("summary")
            .and_then(|summary| summary.get("lifetimeTokens"))
            .and_then(Value::as_u64),
        latest_daily_tokens: latest_bucket
            .and_then(|bucket| bucket.get("tokens"))
            .and_then(Value::as_u64),
        latest_daily_date: latest_bucket
            .and_then(|bucket| bucket.get("startDate"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        fetched_at,
    })
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn finish_with_error(child: &mut Child, code: &str) -> String {
    stop_child(child);
    code.to_string()
}

fn stop_child(child: &mut Child) {
    let _ = crate::managed_agents::terminate_process(child.id());
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_live_app_server_shape() {
        let rate_limits = json!({
            "rateLimits": {
                "primary": {
                    "usedPercent": 38,
                    "windowDurationMins": 10080,
                    "resetsAt": 1785258777
                },
                "credits": {
                    "balance": "0"
                },
                "planType": "pro"
            },
            "rateLimitResetCredits": {
                "availableCount": 3
            }
        });
        let tokens = json!({
            "summary": {
                "lifetimeTokens": 13597623776_u64
            },
            "dailyUsageBuckets": [
                {"startDate": "2026-07-23", "tokens": 373817016},
                {"startDate": "2026-07-24", "tokens": 61038450}
            ]
        });

        let usage = normalize_usage(&rate_limits, &tokens, 123).unwrap();
        assert_eq!(usage.provider, "openai");
        assert_eq!(usage.plan_type.as_deref(), Some("pro"));
        assert_eq!(usage.used_percent, 38);
        assert_eq!(usage.remaining_percent, 62);
        assert_eq!(usage.resets_at, Some(1785258777));
        assert_eq!(usage.window_duration_minutes, Some(10080));
        assert_eq!(usage.credit_balance.as_deref(), Some("0"));
        assert_eq!(usage.reset_credits_available, Some(3));
        assert_eq!(usage.lifetime_tokens, Some(13_597_623_776));
        assert_eq!(usage.latest_daily_tokens, Some(61_038_450));
        assert_eq!(usage.latest_daily_date.as_deref(), Some("2026-07-24"));
        assert_eq!(usage.fetched_at, 123);
    }

    #[test]
    fn clamps_invalid_percentage_and_tolerates_optional_usage() {
        let rate_limits = json!({
            "rateLimits": {
                "primary": {"usedPercent": 140}
            }
        });
        let tokens = json!({"summary": {}, "dailyUsageBuckets": null});

        let usage = normalize_usage(&rate_limits, &tokens, 1).unwrap();
        assert_eq!(usage.used_percent, 100);
        assert_eq!(usage.remaining_percent, 0);
        assert_eq!(usage.lifetime_tokens, None);
        assert_eq!(usage.latest_daily_tokens, None);
    }

    #[test]
    fn maps_auth_errors_without_forwarding_details() {
        let response = json!({
            "id": 2,
            "error": {
                "code": -32000,
                "message": "Login required for alice@example.com"
            }
        });
        assert_eq!(
            response_error_code(&response).as_deref(),
            Some("codex_not_authenticated")
        );
    }
}
