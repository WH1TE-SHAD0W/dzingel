// Static assertions on the CI/CD configuration (epic #17: issues #13, #14, #16).
// Reads the files as text; no YAML dependency. Comments are stripped before
// matching so that explanatory comments cannot satisfy or break a check.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

/** Remove YAML comments (a `#` at line start or preceded by whitespace, outside `${{ }}`). */
function stripYamlComments(text) {
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*#/.test(line)) return "";
      const m = line.match(/\s#(?![^{]*\}\})/);
      return m ? line.slice(0, m.index) : line;
    })
    .join("\n");
}

/** Remove // line comments from JSONC (not inside strings — good enough for this file). */
function stripJsonc(text) {
  return text.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const ciRaw = read(".github/workflows/ci.yml");
const smokeRaw = read(".github/workflows/smoke.yml");
const ci = stripYamlComments(ciRaw);
const smoke = stripYamlComments(smokeRaw);
const wranglerRaw = read("api/wrangler.jsonc");
const wrangler = stripJsonc(wranglerRaw);

/** Extract the block of top-level key `key:` (lines until the next top-level key). */
function topLevelBlock(text, key) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (start === -1) return null;
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

/** All `run:` commands in a workflow (single-line form). */
function runCommands(text) {
  return [...text.matchAll(/^\s*(?:-\s*)?run:\s*(.+)$/gm)].map((m) => m[1].trim());
}

const workflows = { "ci.yml": ci, "smoke.yml": smoke };

describe("#13 AC1 CI triggers", () => {
  it("#13 AC1: ci.yml runs on pull_request and on push to main", () => {
    const on = topLevelBlock(ci, "on");
    assert.ok(on, "ci.yml has no top-level on:");
    assert.match(on, /^\s+pull_request:/m);
    assert.match(on, /^\s+push:/m);
    assert.match(on, /branches:\s*\[\s*["']?main["']?\s*\]|branches:\s*\n\s+-\s*["']?main["']?/);
  });

  it("#13 AC1: pull_request is not restricted to a branch subset or path filter", () => {
    const on = topLevelBlock(ci, "on");
    const pr = on.match(/^\s+pull_request:(.*)\n((?:\s{4,}.*\n?)*)/m);
    assert.ok(pr);
    assert.doesNotMatch(pr[0], /paths(-ignore)?:/);
  });
});

describe("#13 AC2 Node 24, npm ci, npm cache", () => {
  it("#13 AC2: ci.yml uses setup-node with node-version 24 and cache: npm", () => {
    assert.match(ci, /uses:\s*actions\/setup-node@/);
    assert.match(ci, /node-version:\s*["']?24["']?\s*$/m);
    assert.match(ci, /cache:\s*["']?npm["']?\s*$/m);
  });

  it("#13 AC2: ci.yml installs with npm ci (not npm install)", () => {
    const runs = runCommands(ci);
    assert.ok(runs.includes("npm ci"), `npm ci missing; runs: ${runs.join(" | ")}`);
    assert.ok(!runs.some((r) => /^npm (install|i)\b/.test(r)), "npm install used instead of npm ci");
  });

  it("#16 AC3: smoke.yml uses Node 24", () => {
    assert.match(smoke, /node-version:\s*["']?24["']?\s*$/m);
  });
});

describe("#13 AC3/AC4 required commands", () => {
  const required = [
    "npm test -w api",
    "npm run typecheck -w api",
    "npm test -w web",
    "npm run build -w web",
    "npm run typecheck -w web", // AC4: decision applied = astro check runs in CI
  ];
  for (const cmd of required) {
    it(`#13 AC3/AC4: ci.yml runs \`${cmd}\``, () => {
      assert.ok(runCommands(ci).includes(cmd), `missing run: ${cmd}`);
    });
  }

  it("#13 AC3: no step swallows failures (continue-on-error, `|| true`)", () => {
    assert.doesNotMatch(ci, /continue-on-error:\s*true/);
    assert.doesNotMatch(ci, /\|\|\s*true/);
    assert.doesNotMatch(ci, /set \+e/);
  });

  it("#13 AC3: npm ci runs before the first test/build command", () => {
    const runs = runCommands(ci);
    const ciIdx = runs.indexOf("npm ci");
    const firstOther = runs.findIndex((r) => r !== "npm ci");
    assert.ok(ciIdx !== -1 && ciIdx < firstOther || firstOther === -1);
  });

  it("#13 AC4: web package has a real typecheck script and @astrojs/check installed", () => {
    const pkg = JSON.parse(read("web/package.json"));
    assert.equal(pkg.scripts?.typecheck, "astro check");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(deps["@astrojs/check"], "@astrojs/check missing");
    assert.ok(deps.typescript, "typescript missing");
  });

  it("scripts tests run in CI (npm run test:scripts) and root script exists", () => {
    assert.ok(runCommands(ci).includes("npm run test:scripts"));
    const pkg = JSON.parse(read("package.json"));
    assert.match(pkg.scripts["test:scripts"], /node --test/);
  });
});

describe("#13 AC5 / #16 AC3 permissions and secrets", () => {
  for (const [name, text] of Object.entries(workflows)) {
    it(`#13 AC5/#16 AC3: ${name} declares top-level permissions: contents: read`, () => {
      const perms = topLevelBlock(text, "permissions");
      assert.ok(perms, `${name} has no top-level permissions:`);
      assert.match(perms, /^\s+contents:\s*read\s*$/m);
    });

    it(`#13 AC5/#16 AC3: ${name} grants no write permission anywhere`, () => {
      assert.doesNotMatch(text, /:\s*write\b/);
      assert.doesNotMatch(text, /permissions:\s*write-all/);
    });

    it(`#13 AC5/#16 AC3: ${name} references no secrets (incl. in comments)`, () => {
      assert.doesNotMatch(text, /secrets\./);
      assert.doesNotMatch(text, /secrets\[/);
      assert.doesNotMatch(text, /secrets:\s*inherit/);
      assert.doesNotMatch(text, /GITHUB_TOKEN/);
    });

    it(`#13 AC9/#16 AC3: ${name} has no deploy step and no Cloudflare/wrangler usage`, () => {
      assert.doesNotMatch(text, /wrangler/i);
      assert.doesNotMatch(text, /deploy/i);
      assert.doesNotMatch(text, /CLOUDFLARE/i);
      assert.doesNotMatch(text, /cloudflare\//i);
    });

    it(`#13 AC5: ${name} checkout does not persist credentials`, () => {
      assert.match(text, /persist-credentials:\s*false/);
    });
  }
});

describe("#13 AC6 concurrency", () => {
  it("#13 AC6: ci.yml has a concurrency group keyed on PR/ref with cancel-in-progress: true", () => {
    const conc = topLevelBlock(ci, "concurrency");
    assert.ok(conc, "ci.yml has no top-level concurrency:");
    assert.match(conc, /group:\s*\S+/);
    assert.match(conc, /github\.(event\.pull_request\.number|ref|head_ref)/);
    assert.match(conc, /cancel-in-progress:\s*true/);
  });
});

describe("#13 AC7 pinned actions", () => {
  for (const [name, text] of Object.entries(workflows)) {
    it(`#13 AC7: every uses: in ${name} is pinned to a 40-hex commit SHA`, () => {
      const uses = [...text.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
      assert.ok(uses.length > 0, "no actions found");
      for (const u of uses) {
        if (u.startsWith("./")) continue; // local actions are versioned with the repo
        assert.match(u, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `not SHA-pinned: ${u}`);
      }
    });

    it(`#13 AC7: each pinned action in ${name} states its version in a comment`, () => {
      const lines = text === ci ? ciRaw : smokeRaw;
      for (const m of lines.matchAll(/uses:\s*\S+@[0-9a-f]{40}(.*)$/gm)) {
        assert.match(m[1], /#\s*v\d+/, `no version comment on: ${m[0]}`);
      }
    });
  }
});

describe("#13 AC9 only one gating workflow", () => {
  it("#13 AC9: .github/workflows contains only ci.yml and smoke.yml; none deploys", () => {
    const files = readdirSync(join(root, ".github/workflows")).filter((f) => /\.ya?ml$/.test(f)).sort();
    assert.deepEqual(files, ["ci.yml", "smoke.yml"]);
  });

  it("#13 AC9: smoke.yml does not run on pull_request/push (it is not a gate)", () => {
    const on = topLevelBlock(smoke, "on");
    assert.doesNotMatch(on, /pull_request|push:/);
  });
});

describe("#16 AC3/AC6 smoke workflow", () => {
  it("#16 AC3: smoke.yml triggers on workflow_dispatch and schedule (cron)", () => {
    const on = topLevelBlock(smoke, "on");
    assert.ok(on);
    assert.match(on, /^\s+workflow_dispatch:/m);
    assert.match(on, /^\s+schedule:/m);
    assert.match(on, /cron:\s*["'][^"']+["']/);
  });

  it("#16 AC3: smoke.yml reads PUBLIC_URL from vars.PUBLIC_URL (not hard-coded)", () => {
    assert.match(smoke, /PUBLIC_URL:\s*\$\{\{\s*vars\.PUBLIC_URL\s*\}\}/);
    assert.doesNotMatch(smoke, /https?:\/\/(?!github\.com)/, "a URL is hard-coded in smoke.yml");
  });

  it("#16 AC6: smoke.yml runs the smoke script without masking its exit code", () => {
    const runs = runCommands(smoke);
    assert.ok(runs.some((r) => /^node scripts\/smoke-check\.mjs$/.test(r) || r === "npm run smoke"), runs.join(" | "));
    assert.doesNotMatch(smoke, /continue-on-error:\s*true/);
    assert.doesNotMatch(smoke, /\|\|\s*true/);
  });

  it("#16 AC3: smoke.yml passes no URL argument (env var is the only source)", () => {
    const runs = runCommands(smoke).filter((r) => r.includes("smoke"));
    for (const r of runs) assert.doesNotMatch(r, /https?:/);
  });
});

describe("#14 AC1 api/wrangler.jsonc", () => {
  it("#14 AC1: compatibility_flags contains nodejs_compat exactly once", () => {
    const occurrences = wrangler.match(/nodejs_compat\b/g) ?? [];
    assert.equal(occurrences.length, 1);
    assert.match(wrangler, /"compatibility_flags"\s*:\s*\[\s*"nodejs_compat"\s*\]/);
  });

  it("#14 AC1: D1 binding DB, database name/id and preview_urls: false unchanged", () => {
    assert.match(wrangler, /"binding"\s*:\s*"DB"/);
    assert.match(wrangler, /"database_name"\s*:\s*"dzingel"/);
    assert.match(wrangler, /"database_id"\s*:\s*"5fbe18de-0940-4b48-bd0c-c02bf02855b8"/);
    assert.match(wrangler, /"migrations_dir"\s*:\s*"migrations"/);
    assert.match(wrangler, /"preview_urls"\s*:\s*false/);
    assert.match(wrangler, /"workers_dev"\s*:\s*false/);
    assert.match(wrangler, /"name"\s*:\s*"dzingel-api"/);
  });

  it("#14 AC1: wrangler.jsonc is valid JSON once comments are stripped", () => {
    const cfg = JSON.parse(wrangler);
    assert.deepEqual(cfg.compatibility_flags, ["nodejs_compat"]);
    assert.equal(cfg.d1_databases.length, 1);
    assert.equal(cfg.d1_databases[0].binding, "DB");
  });
});

describe("#22 AC3 no Snyk token in workflows", () => {
  /** All files under a directory, recursively (mirrors `grep -r`). */
  function filesUnder(dir) {
    return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? filesUnder(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
    );
  }

  it("#22 AC3: no file under .github/workflows mentions SNYK_TOKEN (case-insensitive, comments count)", () => {
    const files = filesUnder(".github/workflows");
    assert.ok(files.length > 0, "no workflow files found");
    const hits = files.filter((f) => /SNYK_TOKEN/i.test(read(f)));
    assert.deepEqual(hits, [], `SNYK_TOKEN referenced in: ${hits.join(", ")}`);
  });
});
