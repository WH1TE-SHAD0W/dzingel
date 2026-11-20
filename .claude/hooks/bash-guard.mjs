// Per-agent PreToolUse gate, wired from agent frontmatter.
//
//   node bash-guard.mjs gh-readonly   any command allowed, but `gh` may only READ
//                                      (developer, tester — translation of the workshop's
//                                      github-issues-readonly / github-repos-readonly MCP grants)
//   node bash-guard.mjs readonly      only read-only git/gh/inspection commands at all
//                                      (reviewer, documenter — translation of "no execute tool")
//
// Only the issue-manager agent may write to GitHub, and it does not use this hook.
import { readInput, deny, segments } from "./lib.mjs";

const mode = process.argv[2] ?? "gh-readonly";
const input = await readInput();
const cmd = input?.tool_input?.command;
if (typeof cmd !== "string" || !cmd.trim()) process.exit(0);

const GH_READ = [
  /^gh\s+issue\s+(view|list|status)\b/,
  /^gh\s+pr\s+(view|list|diff|status|checks)\b/,
  /^gh\s+(label|milestone)\s+list\b/,
  /^gh\s+repo\s+view\b/,
  /^gh\s+search\s+(issues|prs)\b/,
  /^gh\s+auth\s+status\b/,
];
const GH_API_WRITE = /\s(-X|--method)\s*(POST|PUT|PATCH|DELETE)|\s(-f|-F|--field|--raw-field|--input)\b/i;

function ghAllowed(seg) {
  if (/^gh\s+api\b/.test(seg)) return !GH_API_WRITE.test(seg);
  return GH_READ.some((re) => re.test(seg));
}

const READONLY = [
  /^git\s+(status|diff|log|show|blame|ls-files|rev-parse|merge-base|shortlog)\b/,
  /^git\s+branch(\s+(-a|-r|--list|--show-current|-v+))*\s*$/,
  /^git\s+remote(\s+(-v|get-url\s+\S+))?\s*$/,
  /^(ls|pwd|wc|head|tail|sort|uniq|grep|rg|cat|echo|date)\b/,
  /^(Get-ChildItem|Get-Content|Select-String|Get-Date)\b/i,
];

const segs = segments(cmd);

for (const seg of segs) {
  if (/^gh\b/.test(seg) && !ghAllowed(seg)) {
    deny(
      `Your GitHub access is read-only: \`${seg}\` is not allowed. ` +
        "Only the issue-manager agent creates, edits, labels, comments on or closes issues. " +
        "Report what should change and let the supervisor route it to issue-manager.",
    );
  }
  if (mode === "docs-writer") {
    if (/^git\s+add\s+(--\s+)?(docs\/\S*\s*)+$/.test(seg)) continue;
    if (/^git\s+commit\s+(-m\s+("[^"]*"|'[^']*')\s*)+$/.test(seg)) continue;
  }
  if (mode === "readonly" || mode === "docs-writer") {
    const s = seg.replace(/\d?>\s*(\/dev\/null|\$null)/gi, "");
    if (/(^|[^>&])>{1,2}(?!&)/.test(s) || /\bOut-File\b|\bSet-Content\b/i.test(seg)) {
      deny("You are a read-only agent: output redirection to files is not allowed.");
    }
    if (!/^gh\b/.test(seg) && !READONLY.some((re) => re.test(seg))) {
      deny(
        `You are a read-only agent and cannot run \`${seg}\`. ` +
          "Allowed: read-only git (status/diff/log/show/blame), read-only gh, and inspection commands. " +
          "Ask the supervisor to route execution (tests, builds) to developer or tester.",
      );
    }
  }
}
process.exit(0);
