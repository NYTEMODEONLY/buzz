use std::path::{Path, PathBuf};

fn profile_target_dirs(root: &Path) -> [PathBuf; 2] {
    if cfg!(debug_assertions) {
        // `just dev` builds fresh debug sidecars; never prefer stale release output.
        [root.join("target/debug"), root.join("target/release")]
    } else {
        [root.join("target/release"), root.join("target/debug")]
    }
}

pub(super) fn command_search_dirs_from(
    workspace_root: PathBuf,
    current_dir: Option<PathBuf>,
    executable_parent: Option<PathBuf>,
) -> Vec<PathBuf> {
    // Packaged sidecars must win even when the compile-time workspace still exists.
    let mut dirs = executable_parent.into_iter().collect::<Vec<_>>();
    dirs.extend(profile_target_dirs(&workspace_root));
    if let Some(current_dir) = current_dir {
        dirs.extend(profile_target_dirs(&current_dir));
    }

    dirs.into_iter().fold(Vec::new(), |mut unique, dir| {
        if !unique.contains(&dir) {
            unique.push(dir);
        }
        unique
    })
}

pub(super) fn command_search_dirs() -> Vec<PathBuf> {
    command_search_dirs_from(
        super::workspace_root_dir(),
        std::env::current_dir().ok(),
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf)),
    )
}
