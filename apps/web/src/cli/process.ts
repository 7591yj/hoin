import { resolveBin } from "./bin.ts";

export async function runHoin(
  args: string[],
  readStderrStream: (stderr: ReadableStream<Uint8Array>) => Promise<string> = (stderr) =>
    new Response(stderr).text(),
): Promise<{ stdout: string; stderr: string }> {
  const bin = await resolveBin();
  const proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    readStderrStream(proc.stderr),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`hoin exited with code ${exitCode}: ${stderr}`);
  return { stdout, stderr };
}
