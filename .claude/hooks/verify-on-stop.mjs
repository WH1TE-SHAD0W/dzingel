// Stop / SubagentStop gate — translation of the workshop's agentStop `dotnet test` hook.
// Runs only when api/ or web/ code has uncommitted changes. On failure it exits 2 so the agent
// is told to keep working; `stop_hook_active` prevents an endless loop.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readInput } from "./lib.mjs";

const input = await readInput();
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const sh = (c) => execSync(c, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 170_000 });

let changed = "";
try {
  changed = sh("git status --porcelain -- api web");
} catch {
  process.exit(0); // not a git checkout or git missing: nothing to verify
}
const files = changed.split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
const apiChanged = files.some((f) => f.startsWith("api/"));
if (!apiChanged) process.exit(0);

const checks = [["typecheck (api)", "npm run -s typecheck -w api"]];
try {
  const pkg = JSON.parse(readFileSync(join(root, "api", "package.json"), "utf8"));
  if (pkg.scripts?.test) checks.push(["tests (api)", "npm test -s -w api"]);
} catch {}

for (const [name, cmd] of checks) {
  try {
    sh(cmd);
  } catch (e) {
    const out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
    process.stderr.write(
      `Verification failed — ${name} (\`${cmd}\`). Fix it before finishing, or report the failure verbatim:\n${out}\n`,
    );
    process.exit(2);
  }
}
process.exit(0);
