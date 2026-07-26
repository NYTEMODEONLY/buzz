use super::super::{known_acp_runtime, known_acp_runtime_exact, normalize_agent_args};

#[test]
fn resolves_grok_runtime_without_claiming_the_bare_agent_shim() {
    let runtime = known_acp_runtime_exact("grok").expect("grok runtime should exist");
    assert_eq!(runtime.label, "Grok Build");
    assert_eq!(runtime.commands, &["grok"]);
    assert_eq!(runtime.aliases, &["grok-build", "grokbuild"]);
    assert_eq!(runtime.skill_dir, Some(".grok/skills"));
    assert_eq!(runtime.avatar_url, super::super::grok::AVATAR_URL);
    assert!(runtime.provider_locked);
    assert!(runtime.auth_probe_args.is_none());
    assert!(
        known_acp_runtime("agent").is_none(),
        "the generic agent shim must remain unclaimed"
    );
}

#[test]
fn normalizes_grok_to_native_acp_args() {
    let expected = vec![
        "agent".to_string(),
        "--always-approve".to_string(),
        "stdio".to_string(),
    ];
    assert_eq!(normalize_agent_args("grok", Vec::new()), expected);
    assert_eq!(
        normalize_agent_args("grok-build", vec!["acp".into()]),
        vec![
            "agent".to_string(),
            "--always-approve".to_string(),
            "stdio".to_string(),
        ]
    );
    assert_eq!(
        normalize_agent_args("grok", vec!["agent".into(), "stdio".into()]),
        vec!["agent".to_string(), "stdio".to_string()]
    );
}

#[test]
fn grok_process_name_is_an_owned_runtime_candidate() {
    assert!(crate::managed_agents::runtime::KNOWN_AGENT_BINARIES.contains(&"grok"));
}
