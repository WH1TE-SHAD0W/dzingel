// Per-agent PreToolUse gate, wired from agent frontmatter.
//
//   node bash-guard.mjs gh-readonly   any command allowed, but `gh` may only READ
//                                      (developer, tester — translation of the workshop's
//                                      github-issues-readonly / github-repos-readonly MCP grants)
//   node bash-guard.mjs readonly      only read-only git/gh/inspection commands at all
//                                      (reviewer — translation of "no execute tool")
//   node bash-guard.mjs docs-writer   readonly + `git add docs/...` and `git commit -m` (documenter)
//   node bash-guard.mjs pr-writer     readonly + `git push [-u] origin <branch>` (never main/master,
//                                      HEAD or a refspec) + `gh pr create|edit` (pr-manager)
//   node bash-guard.mjs pr-review     readonly + `gh pr comment` and `gh pr review --comment`
//                                      (pr-reviewer; it can never approve, merge or close)
//
// Only the issue-manager agent may write to GitHub Issues, and it does not use this hook.
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

// Extra gh writes per mode. Everything else on GitHub stays read-only.
const GH_EXTRA = {
  "pr-writer": [/^gh\s+pr\s+(create|edit)\b/],
  "pr-review": [
    /^gh\s+pr\s+comment\b/,
    /^gh\s+pr\s+review\b(?=.*\s(-c|--comment)\b)(?!.*\s(-a|--approve|-r|--request-changes)\b)/,
  ],
};
// Never: rewrite someone's comment, change reviewers, retarget the base, or open a PR into main
// from main.
const GH_NEVER = /\s(--delete-last|--edit-last|--add-reviewer|--remove-reviewer)\b|^gh\s+pr\s+edit\b.*\s(-B|--base)\b|\s(-H|--head)\s+(main|master)\b/;

function ghAllowed(seg) {
  if (/^gh\s+api\b/.test(seg)) return !GH_API_WRITE.test(seg);
  if ((GH_EXTRA[mode] ?? []).some((re) => re.test(seg))) return !GH_NEVER.test(seg);
  return GH_READ.some((re) => re.test(seg));
}

// pr-writer may push one feature branch to origin — nothing else.
const PUSH = /^git\s+push(\s+(-u|--set-upstream))?\s+origin\s+([A-Za-z0-9._/-]+)\s*$/;
function pushAllowed(seg) {
  const m = PUSH.exec(seg);
  return Boolean(m) && !/^(main|master|HEAD)$/.test(m[3]);
}

const READONLY = [
  /^git\s+(status|diff|log|show|blame|ls-files|rev-parse|merge-base|shortlog)\b/,
  /^git\s+branch(\s+(-a|-r|--list|--show-current|-v+))*\s*$/,
  /^git\s+remote(\s+(-v|get-url\s+\S+))?\s*$/,
  /^(ls|pwd|wc|head|tail|sort|uniq|grep|rg|cat|echo|date)\b/,
  /^(Get-ChildItem|Get-Content|Select-String|Get-Date)\b/i,
];
const RESTRICTED = ["readonly", "docs-writer", "pr-writer", "pr-review"];

const segs = segments(cmd);

for (const seg of segs) {
  if (/^gh\b/.test(seg) && !ghAllowed(seg)) {
    deny(
      `Your GitHub access does not allow \`${seg}\`. ` +
        "Only issue-manager writes to issues, only pr-manager opens or edits PRs, and pr-reviewer may " +
        "only comment. No agent merges, approves or closes. Report what should change to the supervisor.",
    );
  }
  if (mode === "pr-writer" && /^git\s+push\b/.test(seg)) {
    if (pushAllowed(seg)) continue;
    deny(
      "You may only run `git push origin <feature-branch>` (optionally with -u): never main, master, " +
        "HEAD, a refspec or extra flags.",
    );
  }
  if (mode === "docs-writer") {
    if (/^git\s+add\s+(--\s+)?(docs\/\S*\s*)+$/.test(seg)) continue;
    if (/^git\s+commit\s+(-m\s+("[^"]*"|'[^']*')\s*)+$/.test(seg)) continue;
  }
  if (RESTRICTED.includes(mode)) {
    const s = seg.replace(/\d?>\s*(\/dev\/null|\$null)/gi, "");
    if (/(^|[^>&])>{1,2}(?!&)/.test(s) || /\bOut-File\b|\bSet-Content\b/i.test(seg)) {
      deny("You are a restricted agent: output redirection to files is not allowed.");
    }
    if (!/^gh\b/.test(seg) && !READONLY.some((re) => re.test(seg))) {
      deny(
        `You are a restricted agent and cannot run \`${seg}\`. ` +
          "Allowed: read-only git (status/diff/log/show/blame), the gh commands of your role, and " +
          "inspection commands. Ask the supervisor to route execution (tests, builds) to developer or tester.",
      );
    }
  }
}
process.exit(0);
