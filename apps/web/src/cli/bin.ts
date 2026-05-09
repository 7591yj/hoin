import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOIN_BINARY = process.platform === "win32" ? "hoin.exe" : "hoin";

export async function resolveBin(): Promise<string> {
  if (process.env.HOIN_BIN) return process.env.HOIN_BIN;

  const candidates = [
    path.resolve(process.cwd(), HOIN_BINARY),
    path.resolve(__dirname, "../../../..", "target/debug/hoin"),
    path.resolve(__dirname, "../../../..", "target/release/hoin"),
    path.resolve(path.dirname(process.execPath), HOIN_BINARY),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return HOIN_BINARY;
}
