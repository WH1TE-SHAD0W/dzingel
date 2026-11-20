// PreToolUse gate for Bash and PowerShell, applied to the main session and every subagent.
// Translated from the workshop's .github/hooks/scripts/block-dangerous-commands.{sh,ps1}.
import { readInput, deny } from "./lib.mjs";

const input = await readInput();
const cmd = input?.tool_input?.command;
if (typeof cmd !== "string" || !cmd.trim()) process.exit(0);

const rules = [
  [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, "recursive force delete (rm -rf)"],
  [/Remove-Item\b.*-Recurse.*-Force|Remove-Item\b.*-Force.*-Recurse/i, "recursive force delete (Remove-Item -Recurse -Force)"],
  [/\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b)/i, "force push"],
  [/\bgit\s+clean\s+-[a-z]*f/i, "git clean -f"],
  [/\bgit\s+reset\s+--hard\b/i, "git reset --hard"],
  [/\bgit\s+branch\s+-D\b/, "force branch delete"],
  [/\bDROP\s+(TABLE|DATABASE)\b/i, "DROP TABLE/DATABASE"],
  [/\b(curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(ba|z)?sh\b|\|\s*(iex|Invoke-Expression)\b/i, "piping a download into a shell"],
  [/\bwrangler\s+(delete|d1\s+delete)\b/i, "deleting a Cloudflare worker or D1 database"],
  [/\bwrangler\s+d1\s+execute\b.*--remote/i, "executing SQL against the remote D1 database"],
  [/\bgh\s+(repo\s+delete|issue\s+delete|release\s+delete)\b/i, "deleting GitHub resources"],
  [/\b(npm|npx)\s+publish\b/i, "publishing a package"],
];

for (const [re, what] of rules) {
  if (re.test(cmd)) {
    deny(
      `Blocked by repository policy (CLAUDE.md §Destructive operations): ${what}. ` +
        "Stop and explain to the human what you would run and why; prefer a reversible alternative.",
    );
  }
}
process.exit(0);
