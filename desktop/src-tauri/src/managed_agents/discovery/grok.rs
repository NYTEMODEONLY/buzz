use super::KnownAcpRuntime;

pub(super) const AVATAR_URL: &str = "https://x.ai/icon.png";

// Grok Build speaks ACP natively over stdio (`grok agent stdio`) and does not
// need a separate adapter. The install may also expose a bare `agent` shim;
// discovery intentionally claims only `grok` so other harnesses can safely
// disambiguate that generic command name.
pub(super) const RUNTIME: KnownAcpRuntime = KnownAcpRuntime {
    id: "grok",
    label: "Grok Build",
    commands: &["grok"],
    aliases: &["grok-build", "grokbuild"],
    avatar_url: AVATAR_URL,
    mcp_command: Some("buzz-dev-mcp"),
    mcp_hooks: false,
    underlying_cli: Some("grok"),
    cli_install_commands: &["curl -fsSL https://x.ai/cli/install.sh | bash"],
    cli_install_commands_windows: &[],
    adapter_install_commands: &[],
    install_instructions_url: "https://docs.x.ai/build/overview",
    cli_install_hint: "Install Grok Build via the official xAI install script.",
    adapter_install_hint: "",
    skill_dir: Some(".grok/skills"),
    supports_acp_model_switching: false,
    model_env_var: Some("XAI_MODEL"),
    provider_env_var: None,
    provider_locked: true,
    default_env: &[],
    config_file_path: Some("~/.grok/config.toml"),
    config_file_format: Some("toml"),
    supports_acp_native_config: false,
    thinking_env_var: None,
    max_tokens_env_var: None,
    context_limit_env_var: None,
    required_normalized_fields: &[],
    login_hint: Some("Run `grok login` to authenticate (or set XAI_API_KEY)."),
    // Current Grok Build has no stable non-interactive auth-status command:
    // `grok models` exits successfully even while reporting logged out.
    auth_probe_args: None,
};

pub(super) fn matches(command: &str) -> bool {
    matches!(command, "grok" | "grok-build" | "grokbuild")
}

pub(super) fn default_args() -> Vec<String> {
    ["agent", "--always-approve", "stdio"]
        .into_iter()
        .map(str::to_string)
        .collect()
}

pub(super) fn normalize_args(args: Vec<String>) -> Vec<String> {
    if args.is_empty() || (args.len() == 1 && args[0].eq_ignore_ascii_case("acp")) {
        default_args()
    } else {
        args
    }
}
