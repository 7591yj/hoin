use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use walkdir::WalkDir;

pub(super) fn discover_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    for entry in WalkDir::new(root).into_iter() {
        let entry = entry.with_context(|| format!("walk directory {}", root.display()))?;
        if is_image_file(entry.path()) {
            files.push(entry.into_path());
        }
    }

    files.sort();
    Ok(files)
}

pub(super) fn discover_explicit_files(
    root: &Path,
    explicit_files: &[PathBuf],
) -> Result<Vec<PathBuf>> {
    let canonical_root = root
        .canonicalize()
        .with_context(|| format!("resolve root path {}", root.display()))?;
    let mut files = Vec::new();

    for explicit_file in explicit_files {
        let candidate = if explicit_file.is_absolute() {
            explicit_file.to_path_buf()
        } else {
            canonical_root.join(explicit_file)
        };
        let canonical = candidate
            .canonicalize()
            .with_context(|| format!("resolve explicit file {}", candidate.display()))?;

        if !is_within_directory(&candidate, root)
            && !is_within_directory(&canonical, &canonical_root)
        {
            bail!(
                "explicit file {} is outside root {}",
                canonical.display(),
                canonical_root.display()
            );
        }
        if canonical.is_file() && is_image_file(&canonical) {
            files.push(canonical);
        }
    }

    files.sort();
    files.dedup();
    Ok(files)
}

fn is_image_file(path: &Path) -> bool {
    path.is_file() && image::ImageFormat::from_path(path).is_ok()
}

fn is_within_directory(candidate: &Path, dir: &Path) -> bool {
    candidate == dir || candidate.starts_with(dir)
}
