// Static assertions on the self-hosting package (issue #20): docker-compose.yml,
// Dockerfiles, nginx.conf, .env.example, .gitignore. Reads files as text, no YAML
// dependency, comments stripped before matching. No Docker needed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

/** Strip `#` comments (line start, or preceded by whitespace). Good enough for these files. */
function stripHash(text) {
  return text
    .split("\n")
    .map((l) => (/^\s*#/.test(l) ? "" : l.replace(/\s#\s.*$/, "")))
    .join("\n");
}
/** Nginx: strip # comments. */
const stripNginx = stripHash;

/** Block of a key at a given indent: lines after `<indent>key:` while indented deeper. */
function block(text, key, indent = 0) {
  const lines = text.split("\n");
  const pad = " ".repeat(indent);
  const start = lines.findIndex((l) => l.startsWith(`${pad}${key}:`) && !l.startsWith(`${pad} `));
  if (start === -1) return null;
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "") { out.push(l); continue; }
    const lead = l.match(/^ */)[0].length;
    if (lead <= indent) break;
    out.push(l);
  }
  return out.join("\n");
}

const composeRaw = read("docker-compose.yml");
const compose = stripHash(composeRaw);
const services = block(compose, "services");
const api = block(services, "api", 2);
const web = block(services, "web", 2);
const apiDockerfile = stripHash(read("api/Dockerfile"));
const webDockerfile = stripHash(read("web/Dockerfile"));
const nginxRaw = read("web/nginx.conf");
const nginx = stripNginx(nginxRaw);
const envExample = read(".env.example");
const gitignore = read(".gitignore");

describe("#20 AC1 compose defines exactly api and web", () => {
  it("#20 AC1: the services block has exactly the service keys api and web", () => {
    assert.ok(services, "no top-level services:");
    const names = [...services.matchAll(/^ {2}([A-Za-z0-9_.-]+):\s*$/gm)].map((m) => m[1]).sort();
    assert.deepEqual(names, ["api", "web"]);
    assert.ok(api && web);
  });
});

describe("#20 AC3 only web publishes a port", () => {
  it("#20 AC3: web has ports mapping to container port 8080", () => {
    const ports = block(web, "ports", 4);
    assert.ok(ports, "web has no ports:");
    assert.match(ports, /:8080"?\s*$/m);
  });

  it("#20 AC3: api has no ports key (expose only, if anything)", () => {
    assert.doesNotMatch(api, /^ {4}ports:/m);
    assert.doesNotMatch(compose.replace(web, ""), /^\s+ports:/m, "ports: appears outside web");
  });

  it("#20 AC3: api does not use network_mode: host", () => {
    assert.doesNotMatch(api, /network_mode/);
  });
});

describe("#20 AC4 database on a named volume", () => {
  it("#20 AC4: a named volume is declared at top level", () => {
    const vols = block(compose, "volumes", 0);
    assert.ok(vols, "no top-level volumes:");
    const names = [...vols.matchAll(/^ {2}([A-Za-z0-9_.-]+):/gm)].map((m) => m[1]);
    assert.ok(names.length >= 1);
    assert.ok(names.includes("dzingel-data"));
  });

  it("#20 AC4: api mounts the named volume (not a bind mount) at a container path", () => {
    const vols = block(api, "volumes", 4);
    assert.ok(vols, "api has no volumes:");
    const m = vols.match(/-\s*([^\s:]+):(\/[^\s:]+)/);
    assert.ok(m, "no volume mount found");
    assert.equal(m[1], "dzingel-data");
    assert.doesNotMatch(m[1], /^[./~]/, "bind mount instead of named volume");
  });

  it("#20 AC4: DB_FILE is inside the volume mount path", () => {
    const mount = block(api, "volumes", 4).match(/-\s*[^\s:]+:(\/[^\s:]+)/)[1];
    const dbFile = api.match(/DB_FILE:\s*(\S+)/)?.[1];
    assert.ok(dbFile, "DB_FILE not set in api environment");
    assert.ok(dbFile.startsWith(`${mount}/`), `${dbFile} is not under ${mount}`);
  });

  it("#20 AC4: api Dockerfile pre-creates /data owned by node", () => {
    assert.match(apiDockerfile, /mkdir \/data[^\n]*chown node:node \/data/);
  });
});

describe("#20 AC5 Node 24 and non-root users", () => {
  it("#20 AC5: every api image stage is based on node:24", () => {
    const froms = [...apiDockerfile.matchAll(/^FROM\s+(\S+)/gim)].map((m) => m[1]);
    assert.ok(froms.length >= 1);
    for (const f of froms) assert.match(f, /^node:24(\b|-)/, `not Node 24: ${f}`);
  });

  it("#20 AC5: api image ends with USER node, after the last FROM", () => {
    const final = apiDockerfile.split(/^FROM\s/im).pop();
    const users = [...final.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
    assert.equal(users.at(-1), "node");
  });

  it("#20 AC5: web image final stage sets USER nginx and listens on an unprivileged port", () => {
    const final = webDockerfile.split(/^FROM\s/im).pop();
    const users = [...final.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
    assert.equal(users.at(-1), "nginx");
    const port = Number(nginx.match(/listen\s+(\d+)/)?.[1]);
    assert.ok(port > 1024, `nginx listens on privileged port ${port}`);
  });

  it("#20 AC5: neither Dockerfile ends as root", () => {
    for (const df of [apiDockerfile, webDockerfile]) {
      assert.doesNotMatch(df, /^USER\s+(root|0)\b/m);
    }
  });
});

describe("#20 AC6 BETTER_AUTH_SECRET is mandatory", () => {
  const line = api.match(/BETTER_AUTH_SECRET:\s*(.+)$/m)?.[1] ?? "";

  it("#20 AC6: uses ${BETTER_AUTH_SECRET:?message} (fails when unset or empty)", () => {
    assert.match(line, /^\$\{BETTER_AUTH_SECRET:\?[^}]+\}$/);
  });

  it("#20 AC6: the error message names the variable", () => {
    const msg = line.match(/:\?([^}]+)\}/)?.[1] ?? "";
    assert.match(msg, /BETTER_AUTH_SECRET/);
  });

  it("#20 AC6: no default value (`:-` / `-`) and no literal secret in compose", () => {
    assert.doesNotMatch(line, /\$\{BETTER_AUTH_SECRET:?-/);
    // The only BETTER_AUTH_SECRET assignment is the variable substitution above.
    const assigns = [...compose.matchAll(/BETTER_AUTH_SECRET:\s*(\S.*)$/gm)].map((m) => m[1]);
    for (const a of assigns) assert.match(a, /^\$\{/);
  });

  it("#20 AC6: the message contains no long secret-like token", () => {
    const msg = line.match(/:\?([^}]+)\}/)?.[1] ?? "";
    assert.doesNotMatch(msg, /[A-Za-z0-9+/=_-]{32,}/);
  });
});

describe("#20 AC7 forwarded-for is overwritten, not appended", () => {
  it("#20 AC7: nginx sets X-Forwarded-For to $remote_addr", () => {
    assert.match(nginx, /proxy_set_header\s+X-Forwarded-For\s+\$remote_addr;/);
  });

  it("#20 AC7: nginx never uses $proxy_add_x_forwarded_for (comments excluded)", () => {
    assert.doesNotMatch(nginx, /proxy_add_x_forwarded_for/);
  });

  it("#20 AC7: nginx does not trust a client-supplied header via real_ip or $http_x_forwarded_for", () => {
    assert.doesNotMatch(nginx, /set_real_ip_from|real_ip_header/);
    assert.doesNotMatch(nginx, /\$http_x_forwarded_for/i);
  });

  it("#20 AC7: /api/ is proxied to the api service on 8787", () => {
    const loc = block(nginx.replace(/\{/g, ":").replace(/\}/g, ""), "location /api/", 4);
    assert.match(nginx, /location\s+\/api\/\s*\{[^}]*proxy_pass\s+http:\/\/api:8787;/);
    assert.ok(loc !== undefined);
  });

  it("#20 AC7: X-Forwarded-For is set inside the /api/ location", () => {
    assert.match(
      nginx,
      /location\s+\/api\/\s*\{[^}]*proxy_set_header\s+X-Forwarded-For\s+\$remote_addr;[^}]*\}/,
    );
  });
});

describe("#20 privacy: nginx access log omits query strings and IPs", () => {
  const accessLogs = [...nginx.matchAll(/^\s*access_log\s+([^;]+);/gm)].map((m) => m[1].trim().split(/\s+/));
  const fmtMatch = nginx.match(/^\s*log_format\s+(\S+)\s+((?:'[^']*'\s*)+);/m);
  const fmtName = fmtMatch?.[1];
  const fmtBody = fmtMatch ? [...fmtMatch[2].matchAll(/'([^']*)'/g)].map((m) => m[1]).join("") : "";

  it("access_log is set and uses a named log_format", () => {
    assert.ok(accessLogs.length >= 1, "no access_log directive");
    assert.ok(fmtName, "no log_format defined");
    for (const [path, format] of accessLogs) {
      if (path === "off") continue;
      assert.equal(format, fmtName, `access_log ${path} does not use log_format ${fmtName}`);
    }
    assert.ok(accessLogs.some(([p]) => p !== "off"), "access_log is off or missing");
  });

  it("no access_log relies on the default combined format", () => {
    for (const parts of accessLogs) {
      if (parts[0] === "off") continue;
      assert.ok(parts.length >= 2, `bare access_log ${parts[0]} uses default combined format`);
      assert.notEqual(parts[1], "combined");
    }
    assert.doesNotMatch(nginx, /^\s*access_log\s+\/dev\/stdout\s*;/m);
  });

  it("log_format logs the path via $uri", () => {
    assert.ok(fmtBody.includes("$uri"), "log_format lacks $uri");
  });

  it("log_format contains no query string, IP, referer or user-agent variables", () => {
    for (const v of [
      "$request", "$request_uri", "$args", "$query_string", "$is_args", "$remote_addr",
      "$http_referer", "$http_user_agent", "$http_x_forwarded_for", "$realip_remote_addr",
    ]) {
      assert.ok(!new RegExp(`\\${v}(?![A-Za-z0-9_])`).test(fmtBody), `log_format contains ${v}`);
    }
  });
});

describe("#20 AC9 no secrets, no third parties, .env ignored", () => {
  it("#20 AC9: .env.example sets BETTER_AUTH_SECRET to an empty placeholder", () => {
    assert.match(envExample, /^BETTER_AUTH_SECRET=\s*$/m);
  });

  it("#20 AC9: .env.example has no secret-like or non-placeholder values", () => {
    const assigns = envExample
      .split("\n")
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => l.split("=").slice(1).join("="));
    for (const v of assigns) {
      assert.doesNotMatch(v, /[A-Za-z0-9+/=_-]{32,}/, "long token-like value in .env.example");
    }
    assert.doesNotMatch(envExample, /@(?!example\.(org|com))\S+\.\w+/);
  });

  it("#20 AC9: .env.example has no external CDN/font URLs", () => {
    for (const u of envExample.match(/https?:\/\/[^\s"']+/g) ?? []) {
      assert.match(u, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, `external URL: ${u}`);
    }
  });

  it("#20 AC9: web/nginx.conf and both Dockerfiles contain no http(s) URLs", () => {
    for (const [name, text] of [
      ["web/nginx.conf", nginx.replace(/proxy_pass\s+http:\/\/api:8787;/, "")],
      ["api/Dockerfile", apiDockerfile],
      ["web/Dockerfile", webDockerfile],
    ]) {
      assert.doesNotMatch(text, /https?:\/\//, `${name} references a URL`);
    }
    assert.doesNotMatch(nginx, /fonts\.(googleapis|gstatic)|cdn\.|cdnjs|unpkg|jsdelivr/i);
  });

  it("#20 AC9: compose only references localhost URLs", () => {
    for (const u of compose.match(/https?:\/\/[^\s"'}]+/g) ?? []) {
      assert.match(u, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, `external URL: ${u}`);
    }
  });

  it("#20 AC9: .env is gitignored (and .env.example is not)", () => {
    const rules = gitignore.split("\n").map((l) => l.trim());
    assert.ok(rules.includes(".env"), ".env not in .gitignore");
    assert.ok(!rules.some((r) => r === ".env*" || r === ".env.*" || r === ".env.example"));
  });
});
