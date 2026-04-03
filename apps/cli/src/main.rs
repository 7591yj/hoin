use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};

mod embedded_model {
    include!(concat!(env!("OUT_DIR"), "/embedded_model.rs"));
}

#[derive(Debug, Parser)]
#[command(name = "hoin")]
#[command(about = "Cross-platform CLI for one-shot image character classification")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    ModelInfo,
    ExtractModel {
        #[arg(long)]
        output_dir: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Command::ModelInfo) => print_model_info(),
        Some(Command::ExtractModel { output_dir }) => extract_model(&output_dir),
        None => {
            println!("HOIN");
            print_model_summary();
            Ok(())
        }
    }
}

fn print_model_summary() {
    match embedded_model::EMBEDDED_MODEL.as_ref() {
        Some(model) => println!("Embedded model: {}", model.name),
        None => println!("Embedded model: none"),
    }
}

fn print_model_info() -> Result<()> {
    let Some(model) = embedded_model::EMBEDDED_MODEL.as_ref() else {
        bail!("no embedded model was compiled into this executable");
    };

    println!("model: {}", model.name);
    print_artifact_line(&model.onnx);

    if let Some(file) = model.onnx_data.as_ref() {
        print_artifact_line(file);
    }

    if let Some(file) = model.class_map.as_ref() {
        print_artifact_line(file);
    }

    if let Some(file) = model.config.as_ref() {
        print_artifact_line(file);
    }

    Ok(())
}

fn print_artifact_line(file: &embedded_model::EmbeddedFile) {
    println!(
        "artifact: {} ({} bytes)",
        file.relative_path,
        file.bytes.len()
    );
}

fn extract_model(output_dir: &Path) -> Result<()> {
    let Some(model) = embedded_model::EMBEDDED_MODEL.as_ref() else {
        bail!("no embedded model was compiled into this executable");
    };

    write_embedded_file(output_dir, &model.onnx)?;

    if let Some(file) = model.onnx_data.as_ref() {
        write_embedded_file(output_dir, file)?;
    }

    if let Some(file) = model.class_map.as_ref() {
        write_embedded_file(output_dir, file)?;
    }

    if let Some(file) = model.config.as_ref() {
        write_embedded_file(output_dir, file)?;
    }

    println!(
        "Extracted embedded model '{}' into {}",
        model.name,
        output_dir.display()
    );

    Ok(())
}

fn write_embedded_file(output_dir: &Path, file: &embedded_model::EmbeddedFile) -> Result<()> {
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
