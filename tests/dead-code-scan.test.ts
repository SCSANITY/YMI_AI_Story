/**
 * Scanner contract tests for scripts/dead-code-scan.ts (PLATFORM-HEALTH-001 S-E-1).
 * Each case builds a minimal fixture repo in a temp dir and runs buildInventory.
 * Covers the fail-closed semantics from plan v2 / Codex scanner review:
 * literal dynamic import preserves exports; unresolved chunks demote to keep;
 * fs/readdir variants demote; .sql/extensionless files are in scope; unused
 * exports still surface; Worker fixture SHA256SUMS closure is verified.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildInventory } from "../scripts/dead-code-scan";

function makeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dead-code-scan-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "fixture", scripts: {} }));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

const APP_ENTRY = { "app/page.tsx": "export default function Page() { return null }\n" };

test("literal dynamic import keeps target reachable and preserves its exports", () => {
  const dir = makeRepo({
    "app/page.tsx": "import { open } from '../src/entry'\nexport default function Page() { return open }\n",
    "src/entry.ts": "export async function open() { const m = await import('./lazy'); return m.used() }\n",
    "src/lazy.ts": "export function used() { return 1 }\nexport function alsoKept() { return 2 }\n",
  });
  const inv = buildInventory(dir);
  assert.ok(!inv.candidates.unreferencedFiles.some((f) => f.file.includes("lazy")), "lazy.ts must stay reachable");
  assert.ok(!inv.candidates.unusedExports.some((e) => e.file.includes("lazy")), "no export of a dynamic-imported module is flagged");
});

test("non-literal dynamic import demotes path-chunk matches to unknown/keep", () => {
  const dir = makeRepo({
    "app/page.tsx": "import { load } from '../src/entry'\nexport default function Page() { return load }\n",
    "src/entry.ts": "export async function load(name: string) { return import(`./plugins/${name}`) }\n",
    "src/plugins/foo.ts": "export const foo = 1\n",
  });
  const inv = buildInventory(dir);
  assert.ok(inv.unknownKeep.some((f) => f.file.includes("plugins/foo")), "plugins/foo.ts must be demoted to keep");
  assert.ok(!inv.candidates.unreferencedFiles.some((f) => f.file.includes("plugins/foo")), "must not be a deletion candidate");
});

test("fs readdir over a literal directory demotes contained files", () => {
  const dir = makeRepo({
    "app/page.tsx": "import { names } from '../src/entry'\nexport default function Page() { return names }\n",
    "src/entry.ts": "import { readdirSync } from 'node:fs'\nexport const names = readdirSync('./src/data')\n",
    "src/data/x.sql": "SELECT 1;\n",
  });
  const inv = buildInventory(dir);
  assert.ok(inv.unknownKeep.some((f) => f.file.includes("data/x.sql")), "x.sql must be demoted to keep");
});

test("unreferenced .sql file with no references is a candidate (in scope)", () => {
  const dir = makeRepo({
    ...APP_ENTRY,
    "src/queries/orphan.sql": "SELECT 2;\n",
  });
  const inv = buildInventory(dir);
  assert.ok(inv.candidates.unreferencedFiles.some((f) => f.file.includes("orphan.sql")), ".sql files must be scanned");
});

test("unused named export is flagged while the used one is not", () => {
  const dir = makeRepo({
    "app/page.tsx": "import { x } from '../src/entry'\nexport default function Page() { return x }\n",
    "src/entry.ts": "import { usedFn } from './live'\nexport const x = usedFn()\n",
    "src/live.ts": "export function usedFn() { return 1 }\nexport function deadFn() { return 2 }\n",
  });
  const inv = buildInventory(dir);
  const flagged = inv.candidates.unusedExports.filter((e) => e.file.includes("live"));
  assert.deepEqual(flagged.map((e) => e.name), ["deadFn"]);
});

test("top-level directory chunks never demote unrelated files", () => {
  const dir = makeRepo({
    "app/page.tsx": "import { load } from '../src/entry'\nexport default function Page() { return load }\n",
    "src/entry.ts": "export async function load(name: string) { return import(`./${name}`) }\n",
    "src/unrelated.ts": "export const alone = 1\n",
  });
  const inv = buildInventory(dir);
  // the only static chunk is "./" -> resolves to "src", a top-level scan dir: not matchable
  assert.ok(inv.candidates.unreferencedFiles.some((f) => f.file.includes("unrelated")), "unrelated.ts must stay a candidate");
});

test("fs readFile with ../ (file-dir) relative path still demotes the real target", () => {
  const dir = makeRepo({
    "app/page.tsx": "import { load } from '../src/entry'\nexport default function Page() { return load }\n",
    "src/entry.ts": "export { load } from './lib/reader'\n",
    "src/lib/reader.ts": "import { readFileSync } from 'node:fs'\nimport path from 'node:path'\nexport const load = () => readFileSync(path.join(__dirname, '../data/x.sql'), 'utf8')\n",
    "src/data/x.sql": "SELECT 1;\n",
  });
  const inv = buildInventory(dir);
  assert.ok(inv.unknownKeep.some((f) => f.file.includes("data/x.sql")), "../ file-dir relative fs path must demote x.sql to keep");
});

test("Worker fixture SHA256SUMS manifest closure is re-hashed and verified", () => {
  const sql = "SELECT 42;\n";
  const hash = createHash("sha256").update(sql).digest("hex");
  const dir = makeRepo({
    ...APP_ENTRY,
    "tests/fixtures/external-contracts/worker/payload.sql": sql,
    "tests/fixtures/external-contracts/SHA256SUMS": `${hash}  worker/payload.sql\n`,
    "tests/worker-cloud-contract.test.mjs": "import test from 'node:test'\ntest('x', () => {})\n",
    "app/api/internal/worker-callback/route.ts": "export async function POST() { return Response.json({}) }\n",
  });
  const inv = buildInventory(dir);
  assert.equal(inv.workerContract.sha256sums.present, true);
  assert.equal(inv.workerContract.sha256sums.entries, 1);
  assert.equal(inv.workerContract.sha256sums.verified, 1);
  assert.deepEqual(inv.workerContract.sha256sums.mismatches, []);
  assert.equal(inv.workerContract.contractTest, "present");
  assert.equal(inv.workerContract.callbackRoute, "present");
});
