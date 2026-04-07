use anyhow::Result;

const HELP_OVERVIEW: &str = "\
hoin

Cross-platform CLI for one-shot image character classification.

Commands:
  categorize [PATH]          Classify images under PATH and move them into routed folders
  model-info                 Show the embedded model name and bundled ONNX payloads
  extract-model --output-dir DIR
                             Write the embedded ONNX payloads to DIR
  help                       Show this guide

Options for categorize:
  --dry-run                  Print planned moves without modifying files
  --ja                       Use Japanese character names when supported
  --min-confidence <FLOAT>   Skip results below the threshold (default: 0.3)

Examples:
  hoin categorize .
  hoin categorize --dry-run /path/to/images
  hoin categorize --dry-run --ja /path/to/images
  hoin model-info
  hoin extract-model --output-dir ./extracted-model

Notes:
  - This binary embeds exactly one model at build time.
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
        assert!(HELP_OVERVIEW.contains("extract-model"));
    }
}
