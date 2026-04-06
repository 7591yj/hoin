use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};

pub(crate) const DEFAULT_MIN_CONFIDENCE: f32 = 0.3;

#[derive(Debug, Parser)]
#[command(name = "hoin")]
#[command(about = "Cross-platform CLI for one-shot image character classification")]
pub(crate) struct Cli {
    #[command(subcommand)]
    pub(crate) command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub(crate) enum Command {
    Categorize(CategorizeArgs),
    ModelInfo,
    ExtractModel {
        #[arg(long)]
        output_dir: PathBuf,
    },
}

#[derive(Debug, Clone, Args)]
pub(crate) struct CategorizeArgs {
    #[arg(default_value = ".")]
    pub(crate) path: PathBuf,
    #[arg(long)]
    pub(crate) dry_run: bool,
    #[arg(
        long,
        help = "Use Japanese character names when supported by the embedded model"
    )]
    pub(crate) ja: bool,
    #[arg(long, default_value_t = DEFAULT_MIN_CONFIDENCE)]
    pub(crate) min_confidence: f32,
}
