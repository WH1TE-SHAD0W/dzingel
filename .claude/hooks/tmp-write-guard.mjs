// PreToolUse gate for Write/Edit: the agent may write only into the OS temp directory.
// Used by pr-manager and pr-reviewer, which need a file for `gh pr create|comment --body-file`
// (bodies are multi-line, and the Bash guards split commands on newlines and `|`), but must never
// change the repository.
import os from "node:os";
import path from "node:path";
import { readInput, deny } from "./lib.mjs";

const input = await readInput();
const file = input?.tool_input?.file_path;
if (typeof file !== "string" || !file) process.exit(0);

const tmp = path.resolve(os.tmpdir()).toLowerCase() + path.sep;
const target = path.resolve(file).toLowerCase();
if (!target.startsWith(tmp)) {
  deny(
    `You may write only under the temp directory (${os.tmpdir()}), for a PR body or comment file. ` +
      "You never change files in the repository.",
  );
}
process.exit(0);
