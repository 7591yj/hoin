# hoin-web

Web UI for [hoin-cli](../cli/README.md).

## Functions

- Scans for model directories and browses target folders within allowed roots.
- Shows thumbnails, selection state, dry-run planned moves, and apply/revert actions.
- Exposes a JSON API for the browser UI.
- Shows categorize status and progress in the bottom bar.

## Routes

- `GET /api/version`
- `GET /api/models`
- `GET /api/browse`
- `GET /api/thumbnail`
- `POST /api/categorize/preview`
- `POST /api/categorize/apply`
- `GET /api/categorize/progress`
- `POST /api/revert`
- `GET /api/session`

## Notes

- The web API only resolves paths inside the allowed roots defined in [allowed-paths.ts](./src/allowed-paths.ts).
- Preview progress is phase-level for "categorize all". Apply progress is
  determinate and updates per processed move.
- The web package shells out to the `hoin` binary through `src/cli.ts`.
- If `HOIN_BIN` is set, that binary path is used.
- Release packages prefer a `hoin` or `hoin.exe` executable next to `hoin-web`.
- Otherwise it prefers `target/debug/hoin`, then `target/release/hoin`, then
  falls back to `hoin` on `PATH`.
- Release packages read static browser assets from `./public` next to `hoin-web`.
- Set `HOIN_PUBLIC_DIR` to use a different static asset directory.

## Restrictions

- Real-time per-file preview progress for "categorize all" would require CLI
  output changes because `apps/cli` returns final preview JSON only after the
  dry-run completes.
