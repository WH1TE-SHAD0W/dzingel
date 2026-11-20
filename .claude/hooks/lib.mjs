// Shared helpers for Claude Code hooks. Hooks receive the event as JSON on stdin.
// Contract (PreToolUse): print nothing + exit 0 to allow; print a deny decision to block.

export async function readInput() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// Split a shell command line into simple command segments on ; && || | and newlines.
// Deliberately conservative: anything it cannot reason about is treated as its own segment.
export function segments(cmd) {
  return cmd
    .split(/\|\||&&|;|\||\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
