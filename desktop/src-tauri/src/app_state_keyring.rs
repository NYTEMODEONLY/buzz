/// Service name for the desktop OS keyring. Debug builds default to a distinct
/// service, while standalone worktree launches may request a scoped dev service.
fn dev_keyring_service(configured: Option<String>) -> String {
    configured
        .filter(|service| service.starts_with("buzz-desktop-dev."))
        .unwrap_or_else(|| "buzz-desktop-dev".to_string())
}

fn release_keyring_service(configured: Option<&'static str>) -> &'static str {
    match configured {
        None => "buzz-desktop",
        Some(service)
            if !service.is_empty()
                && service.chars().all(|character| {
                    character.is_ascii_alphanumeric() || ".-_".contains(character)
                }) =>
        {
            service
        }
        Some(_) => panic!("invalid BUZZ_DESKTOP_BUILD_KEYRING_SERVICE"),
    }
}

pub(crate) fn keyring_service() -> &'static str {
    if cfg!(debug_assertions) {
        static DEV_SERVICE: std::sync::OnceLock<String> = std::sync::OnceLock::new();
        DEV_SERVICE
            .get_or_init(|| dev_keyring_service(std::env::var("BUZZ_DEV_KEYRING_SERVICE").ok()))
            .as_str()
    } else {
        release_keyring_service(option_env!("BUZZ_DESKTOP_BUILD_KEYRING_SERVICE"))
    }
}

pub(super) fn migration_marker_name(service: &str, default_name: &str) -> String {
    if service == "buzz-desktop" || service == "buzz-desktop-dev" {
        default_name.to_string()
    } else {
        format!("identity.{service}.migrated")
    }
}

#[cfg(test)]
mod tests {
    use super::{dev_keyring_service, migration_marker_name, release_keyring_service};

    #[test]
    fn standalone_scope_must_remain_under_dev_service() {
        assert_eq!(
            dev_keyring_service(Some("buzz-desktop-dev.example".to_string())),
            "buzz-desktop-dev.example"
        );
        assert_eq!(
            dev_keyring_service(Some("buzz-desktop".to_string())),
            "buzz-desktop-dev"
        );
    }

    #[test]
    fn standalone_scope_uses_its_own_migration_marker() {
        assert_eq!(
            migration_marker_name("buzz-desktop", "identity.migrated"),
            "identity.migrated"
        );
        assert_eq!(
            migration_marker_name("buzz-desktop-dev", "identity.migrated"),
            "identity.migrated"
        );
        assert_eq!(
            migration_marker_name("buzz-desktop-dev.example", "identity.migrated"),
            "identity.buzz-desktop-dev.example.migrated"
        );
    }

    #[test]
    fn release_scope_accepts_only_stable_service_names() {
        assert_eq!(
            release_keyring_service(Some("buzz-desktop-canary")),
            "buzz-desktop-canary"
        );
        assert_eq!(release_keyring_service(None), "buzz-desktop");
    }

    #[test]
    #[should_panic(expected = "invalid BUZZ_DESKTOP_BUILD_KEYRING_SERVICE")]
    fn release_scope_fails_closed_on_an_invalid_service_name() {
        release_keyring_service(Some("bad service"));
    }
}
