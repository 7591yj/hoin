use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};

pub(crate) const DEFAULT_MIN_CONFIDENCE: f32 = 0.3;

#[derive(Debug, Parser)]
#[command(name = "hoin")]
#[command(about = "Cross-platform CLI for one-shot image character classification")]
#[command(disable_help_subcommand = true)]
pub(crate) struct Cli {
    #[command(subcommand)]
    pub(crate) command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub(crate) enum Command {
    Categorize(CategorizeArgs),
    Help,
    ModelInfo {
        #[arg(long)]
        model_dir: Option<PathBuf>,
    },
}

#[derive(Debug, Clone, Args)]
pub(crate) struct CategorizeArgs {
    #[arg(long)]
    pub(crate) model_dir: Option<PathBuf>,
    #[arg(default_value = ".")]
    pub(crate) path: PathBuf,
    #[arg(long)]
    pub(crate) dry_run: bool,
    #[arg(
        long,
        help = "Use Japanese character names when supported by the selected model"
    )]
    pub(crate) ja: bool,
    #[arg(long, default_value_t = DEFAULT_MIN_CONFIDENCE)]
    pub(crate) min_confidence: f32,
    #[arg(long, help = "Output results as JSON instead of human-readable text")]
    pub(crate) json: bool,
}
