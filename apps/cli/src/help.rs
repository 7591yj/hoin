use anyhow::Result;

const HELP_OVERVIEW: &str = "\
hoin

Cross-platform CLI for one-shot image character classification.

Commands:
  categorize [PATH]          Classify images under PATH and move them into routed folders
  model-info                 Show the selected model name and ONNX payloads
  help                       Show this guide

Options for categorize:
  --model-dir <DIR>          Use this model package directory (or HOIN_MODEL_DIR)
  --dry-run                  Print planned moves without modifying files
  --ja                       Use Japanese character names when supported
  --min-confidence <FLOAT>   Skip results below the threshold (default: 0.3)
  --file <PATH>              Classify a specific file; may be repeated
  --progress-json            Emit JSON progress events to stderr
  --fail-on-failed           Exit non-zero if any file fails to process
  --fail-on-skipped          Exit non-zero if any file is skipped due to low confidence
  --fail-on-empty            Exit non-zero if no image files are found

Examples:
  hoin categorize --model-dir ./models/holo-hoin .
  hoin categorize --model-dir ./models/holo-hoin --dry-run /path/to/images
  hoin categorize --model-dir ./models/holo-hoin --dry-run --ja /path/to/images
  hoin categorize --model-dir ./models/holo-hoin --dry-run --file ./a.png --file ./b.png /path/to/images
  hoin categorize --model-dir ./models/holo-hoin --dry-run --json --progress-json /path/to/images
  hoin categorize --model-dir ./models/holo-hoin --json --fail-on-failed --fail-on-empty /path/to/images
  hoin model-info --model-dir ./models/holo-hoin

Notes:
  - Model packages are selected with --model-dir, HOIN_MODEL_DIR, or a single ./models/<name> package.
  - Running without a subcommand behaves like `hoin categorize .`.
  - Use `hoin --help` for the clap-generated flag summary.
";

pub(crate) fn print_help_overview() -> Result<()> {
    println!("{HELP_OVERVIEW}");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::HELP_OVERVIEW;

    #[test]
    fn help_overview_mentions_japanese_option() {
        assert!(HELP_OVERVIEW.contains("--ja"));
        assert!(HELP_OVERVIEW.contains("--model-dir"));
    }
}
