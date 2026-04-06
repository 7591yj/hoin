mod categorize;
mod cli;
mod embedded_model;
mod model;

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

use crate::{
    categorize::categorize,
    cli::{CategorizeArgs, Cli, Command},
    embedded_model::{extract_model, print_model_info},
};

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Command::Categorize(args)) => categorize(args),
        Some(Command::ModelInfo) => print_model_info(),
        Some(Command::ExtractModel { output_dir }) => extract_model(&output_dir),
        None => categorize(CategorizeArgs {
            path: PathBuf::from("."),
            dry_run: false,
            ja: false,
            min_confidence: cli::DEFAULT_MIN_CONFIDENCE,
        }),
    }
}
