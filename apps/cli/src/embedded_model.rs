use std::{fs, path::Path};

use anyhow::{Context, Result, bail};

mod generated {
    include!(concat!(env!("OUT_DIR"), "/embedded_model.rs"));
}

pub(crate) use generated::{EMBEDDED_MODEL, EmbeddedFile};

pub(crate) fn print_model_info() -> Result<()> {
    let Some(model) = EMBEDDED_MODEL.as_ref() else {
        bail!("no embedded model was compiled into this executable");
    };

    println!("model: {}", model.name);
    print_artifact_line(&model.onnx);

    if let Some(file) = model.onnx_data.as_ref() {
        print_artifact_line(file);
    }

    Ok(())
}

pub(crate) fn extract_model(output_dir: &Path) -> Result<()> {
    let Some(model) = EMBEDDED_MODEL.as_ref() else {
        bail!("no embedded model was compiled into this executable");
    };

    write_embedded_file(output_dir, &model.onnx)?;

    if let Some(file) = model.onnx_data.as_ref() {
        write_embedded_file(output_dir, file)?;
    }

    println!(
        "Extracted embedded model '{}' into {}",
        model.name,
        output_dir.display()
    );

    Ok(())
}

pub(crate) fn write_embedded_file(output_dir: &Path, file: &EmbeddedFile) -> Result<()> {
    let destination = output_dir.join(file.relative_path);
    let parent = destination
        .parent()
        .context("embedded file destination has no parent directory")?;

    fs::create_dir_all(parent)
        .with_context(|| format!("create destination directory {}", parent.display()))?;
    fs::write(&destination, file.bytes)
        .with_context(|| format!("write embedded file {}", destination.display()))?;

    Ok(())
}

fn print_artifact_line(file: &EmbeddedFile) {
    println!(
        "artifact: {} ({} bytes)",
        file.relative_path,
        file.bytes.len()
    );
}
