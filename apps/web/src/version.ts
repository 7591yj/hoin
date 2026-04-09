import { readFileSync } from "node:fs";
import path from "node:path";

const workspaceManifestPath = path.resolve(import.meta.dir, "../../..", "Cargo.toml");
const workspaceManifest = readFileSync(workspaceManifestPath, "utf8");

export const workspaceVersion = workspaceManifest.match(
  /^\[workspace\.package\][\s\S]*?^version = "([^"]+)"/m,
)?.[1];

if (!workspaceVersion) {
  throw new Error(`Failed to read workspace version from ${workspaceManifestPath}`);
}
