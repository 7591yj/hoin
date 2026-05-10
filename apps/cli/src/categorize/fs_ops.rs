use std::{fs, io, path::Path};

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
    match renamore::rename_exclusive(source, destination) {
        Ok(()) => Ok(()),
        Err(error) if rename_requires_copy_fallback(&error) => {
            eprintln!(
                "warn: using copy fallback for {} -> {} ({})",
                source.display(),
                destination.display(),
                rename_fallback_reason(&error)
            );
            copy_then_unlink(source, destination)
        }
        Err(error) => Err(error).with_context(|| {
            format!(
                "move image from {} to {}",
                source.display(),
                destination.display()
            )
        }),
    }
}

fn rename_requires_copy_fallback(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::CrossesDevices | io::ErrorKind::Unsupported
    )
}

fn rename_fallback_reason(error: &io::Error) -> &'static str {
    match error.kind() {
        io::ErrorKind::CrossesDevices => "cross-device rename",
        io::ErrorKind::Unsupported => "unsupported atomic rename",
        _ => "rename failed",
    }
}

pub(super) fn copy_then_unlink(source: &Path, destination: &Path) -> Result<()> {
    copy_file_exclusive(source, destination).with_context(|| {
        format!(
            "copy image from {} to {}",
            source.display(),
            destination.display()
        )
    })?;

    if let Err(error) = fs::OpenOptions::new()
        .write(true)
        .open(destination)
        .and_then(|file| file.sync_all())
    {
        cleanup_copied_destination(destination, "sync copied image")?;
        return Err(error).with_context(|| format!("sync copied image {}", destination.display()));
    }

    if let Some(parent) = destination.parent() {
        sync_directory(parent);
    }

    if let Err(error) = fs::remove_file(source) {
        cleanup_copied_destination(destination, "remove source image after copy")?;
        return Err(error)
            .with_context(|| format!("remove source image {} after copy", source.display()));
    }

    Ok(())
}

fn cleanup_copied_destination(destination: &Path, failed_operation: &str) -> Result<()> {
    fs::remove_file(destination).with_context(|| {
        format!(
            "remove copied destination {} after failed {failed_operation}",
            destination.display()
        )
    })
}

fn copy_file_exclusive(source: &Path, destination: &Path) -> io::Result<u64> {
    let mut source_file = fs::File::open(source)?;
    let mut destination_file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    let bytes = io::copy(&mut source_file, &mut destination_file)?;

    if let Ok(metadata) = source_file.metadata() {
        destination_file.set_permissions(metadata.permissions())?;
    }

    Ok(bytes)
}

fn sync_directory(directory: &Path) {
    if let Ok(file) = fs::File::open(directory) {
        let _ = file.sync_all();
    }
}
