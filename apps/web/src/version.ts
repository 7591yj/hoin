import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceVersion(): string {
  if (process.env.HOIN_VERSION) return process.env.HOIN_VERSION;

  const versionFiles = [
    path.resolve(process.cwd(), "VERSION"),
    path.resolve(path.dirname(process.execPath), "VERSION"),
  ];
  for (const versionFile of versionFiles) {
    if (existsSync(versionFile)) return readFileSync(versionFile, "utf8").trim();
  }

  const workspaceManifestPath = path.resolve(import.meta.dir, "../../..", "Cargo.toml");
  const workspaceManifest = readFileSync(workspaceManifestPath, "utf8");
  const version = workspaceManifest.match(
    /^\[workspace\.package\][\s\S]*?^version = "([^"]+)"/m,
  )?.[1];

  if (!version) {
    throw new Error(`Failed to read workspace version from ${workspaceManifestPath}`);
  }

  return version;
}

export const workspaceVersion = readWorkspaceVersion();
