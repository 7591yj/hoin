mod categorize;
mod cli;
mod help;
mod model;
mod model_package;

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

use crate::{
    categorize::categorize,
    cli::{CategorizeArgs, Cli, Command},
    help::print_help_overview,
    model_package::print_model_info,
};

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Command::Categorize(args)) => categorize(args),
        Some(Command::Help) => print_help_overview(),
        Some(Command::ModelInfo { model_dir }) => print_model_info(model_dir.as_deref()),
        None => categorize(CategorizeArgs {
            model_dir: None,
            path: PathBuf::from("."),
            dry_run: false,
            ja: false,
            min_confidence: cli::DEFAULT_MIN_CONFIDENCE,
            json: false,
        }),
    }
}
