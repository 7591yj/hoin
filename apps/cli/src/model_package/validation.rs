use std::{fs, io::Read, path::Path};

use anyhow::{Context, Result, bail};

pub(super) fn assert_not_git_lfs_pointer(path: &Path, model_name: &str) -> Result<()> {
    let mut file = fs::File::open(path)
        .with_context(|| format!("read model '{model_name}' artifact {}", path.display()))?;
    let mut bytes = [0_u8; 42];
    let bytes_read = file
        .read(&mut bytes)
        .with_context(|| format!("read model '{model_name}' artifact {}", path.display()))?;

    if bytes[..bytes_read].starts_with(b"version https://git-lfs.github.com/spec/") {
        bail!(
            "model '{model_name}' artifact at {} is a Git LFS pointer; fetch the real model artifact before running hoin",
            path.display()
        );
    }

    Ok(())
}
