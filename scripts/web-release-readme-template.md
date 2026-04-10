# hoin Web UI

This archive contains the `hoin` web UI and a matching native `hoin` CLI build.
Models are distributed as separate release archives.

## Quick Start

1. Download and extract one or more `hoin-*-model-*.tar.gz` archives.
2. Move or copy the extracted `models/` directory next to this web UI executable.
3. Open a terminal in this directory.
4. Run `./@@WEB_BINARY_FILE@@`.
5. Open the printed local URL in a browser.

After setup, the directory should look like:

```text
.
├── @@WEB_BINARY_FILE@@
├── @@CLI_BINARY_FILE@@
├── README.md
├── public/
└── models/
    └── holo-hoin/
        ├── holo-hoin.onnx
        └── hoin-model.json
```

## Common Commands

```bash
./@@WEB_BINARY_FILE@@
HOST=127.0.0.1 PORT=3000 ./@@WEB_BINARY_FILE@@
HOIN_BIN=./@@CLI_BINARY_FILE@@ ./@@WEB_BINARY_FILE@@
```

## Functions

- Starts a local browser UI for selecting models and target folders.
- Uses the bundled `@@CLI_BINARY_FILE@@` executable for classification and file moves.
- Serves only from the local machine by default.

## Notes

- The web UI modifies files when you apply a categorize plan.
- Keep `public/` next to `@@WEB_BINARY_FILE@@`.
- Set `HOIN_BIN` to use a different CLI executable.
- Set `HOIN_PUBLIC_DIR` only if you move the `public/` directory.
