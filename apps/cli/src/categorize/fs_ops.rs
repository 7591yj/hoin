use std::{fs, path::Path};

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;

pub(super) fn read_json_file<T: DeserializeOwned>(path: &Path, label: &str) -> Result<T> {
    let text =
        fs::read_to_string(path).with_context(|| format!("read {label} {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("parse {label} {}", path.display()))
}

pub(super) fn move_file(source: &Path, destination: &Path) -> Result<()> {
    let parent = destination
        .parent()
        .context("destination has no parent directory")?;
    fs::create_dir_all(parent)
        .with_context(|| format!("create destination directory {}", parent.display()))?;
    match fs::rename(source, destination) {
        Ok(()) => Ok(()),
        Err(error) if is_cross_device_error(&error) => copy_then_unlink(source, destination),
        Err(error) => Err(error).with_context(|| {
            format!(
                "move image from {} to {}",
                source.display(),
                destination.display()
            )
        }),
    }
}

fn is_cross_device_error(error: &std::io::Error) -> bool {
    matches!(error.raw_os_error(), Some(18) | Some(17))
}

pub(super) fn copy_then_unlink(source: &Path, destination: &Path) -> Result<()> {
    fs::copy(source, destination).with_context(|| {
        format!(
            "copy image from {} to {} after cross-filesystem rename failed",
            source.display(),
            destination.display()
        )
    })?;

    fs::OpenOptions::new()
        .write(true)
        .open(destination)
        .and_then(|file| file.sync_all())
        .with_context(|| format!("sync copied image {}", destination.display()))?;

    if let Some(parent) = destination.parent() {
        sync_directory(parent);
    }

    fs::remove_file(source)
        .with_context(|| format!("remove source image {} after copy", source.display()))?;
    Ok(())
}

fn sync_directory(directory: &Path) {
    if let Ok(file) = fs::File::open(directory) {
        let _ = file.sync_all();
    }
}
