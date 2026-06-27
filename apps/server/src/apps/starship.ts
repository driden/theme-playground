import path from "node:path";
import os from "node:os";
import { config } from "@playground/lib/config";

export async function render(
  theme: string,
  configurationFile: string,
): Promise<{ ansi: string | null; error: string | null }> {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? os.homedir(),
    LANG: process.env.LANG ?? "en_US.UTF-8",
    TERM: "xterm-256color",
    STARSHIP_CONFIG: configurationFile,
  };
  try {
    const proc = Bun.spawn(
      [
        "starship",
        "prompt",
        "--terminal-width=120",
        "--status=0",
        "--cmd-duration=1234",
        "--jobs=0",
      ],
      { cwd: path.join(config().themesDir, theme), env, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exit = await proc.exited;
    if (exit !== 0) return { ansi: null, error: stderr.trim() || `starship exited ${exit}` };
    return { ansi: stdout, error: null };
  } catch (e: unknown) {
    console.error(e);
    return { ansi: null, error: "starship binary not found in PATH" };
  }
}
