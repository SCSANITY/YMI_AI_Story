#!/usr/bin/env tsx
/**
 * PLATFORM-HEALTH-001 S-E-1: read-only dead-code inventory scanner.
 *
 * Plan: docs/operations/health/PLATFORM_HEALTH_001/S_E_DEAD_CODE_PLAN_2026-11-03.md
 *
 * Builds the import graph from reserved entries (Next.js route/metadata
 * conventions, package.json script targets, root configs, vercel.json
 * declarations, public/), then classifies what no entry can reach.
 *
 * Fail-closed semantics (plan v2):
 * - literal dynamic import()/require() counts as a NAMESPACE import of the
 *   target (all its exports preserved);
 * - non-literal dynamic references and fs/glob directory reads demote any
 *   candidate matching their literal path chunks to unknown/keep;
 * - shared Worker contract files are keep-by-default and verified as a
 *   manifest closure (SHA256SUMS re-hashed, Worker HEAD recorded).
 *
 * This script never modifies the repository.
 *
 * Usage: tsx scripts/dead-code-scan.ts --out <inventory.json>
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
export const ASSET_EXTS = [".json", ".css", ".sql", ".png", ".webp", ".jpg", ".jpeg", ".svg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".wav", ".webm", ".mp4", ".pdf", ".txt", ".md"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".codex-worktrees", "dist", "out", "release", ".vercel"]);
const SCAN_DIRS = ["app", "src", "components", "scripts", "tests", "public"];

const ROUTE_BASES = new Set(["page", "route", "layout", "template", "loading", "error", "not-found", "default"]);
const META_BASES = new Set(["sitemap", "robots", "manifest", "icon", "apple-icon", "opengraph-image", "twitter-image", "favicon"]);
const RESERVED_EXPORTS = new Set([
  "default", "metadata", "generateMetadata", "generateStaticParams", "generateViewport",
  "viewport", "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime",
  "preferredRegion", "maxDuration", "config",
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
]);
const RESERVED_DEPS = new Set(["@types/node"]); // ambient compiler types, no import site
// readFile/readdir as fs.*, fs.promises.*, or bare named imports; glob variants
const FS_GLOB_RE = /\b(?:fs\.(?:promises\.)?(?:readFile|readdir)|(?<![\w$.])readFile(?:Sync)?\s*\(|(?<![\w$.])readdir(?:Sync)?\s*\(|(?<![\w$.])glob(?:Sync)?\s*\(|fast-glob)/;

const sha256hex = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function walk(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile()) {
      const ext = path.extname(name).toLowerCase();
      if (CODE_EXTS.includes(ext) || ASSET_EXTS.includes(ext) || ext === "") acc.push(full);
    }
  }
}

interface FileInfo {
  deps: string[];
  packages: string[];
  exports: string[];
  importedNames: Map<string, Set<string>>;
  starImports: Set<string>;
  unresolved: string[];
  unresolvedChunks: string[];
  text: string;
}

export function buildInventory(root: string) {
  const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");

  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), files);
  for (const f of ["proxy.ts", "instrumentation.ts", "next.config.ts", "next.config.mjs", "next.config.js", "postcss.config.mjs", "postcss.config.js", "eslint.config.mjs", "eslint.config.js", "tailwind.config.ts", "tailwind.config.js"]) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) files.push(p);
  }
  const fileSet = new Set(files.map((f) => path.resolve(f)));

  const tsconfigPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  const compilerOptions = tsconfigPath
    ? ts.parseJsonConfigFileContent(ts.readConfigFile(tsconfigPath, ts.sys.readFile).config, ts.sys, root).options
    : ({} as ts.CompilerOptions);

  const resolveSpecifier = (spec: string, fromFile: string): string | null => {
    if (!spec.startsWith(".") && !spec.startsWith("@/") && !spec.startsWith("~/")) return null;
    const r = ts.resolveModuleName(spec, fromFile, compilerOptions, ts.sys);
    if (r.resolvedModule) {
      const p = path.resolve(r.resolvedModule.resolvedFileName);
      return fileSet.has(p) ? p : null;
    }
    const base = path.resolve(path.dirname(fromFile), spec);
    const allExts = [...CODE_EXTS, ...ASSET_EXTS];
    for (const e of allExts) if (fileSet.has(base + e)) return base + e;
    if (fileSet.has(base)) return base;
    for (const e of CODE_EXTS) if (fileSet.has(path.join(base, "index" + e))) return path.resolve(path.join(base, "index" + e));
    return null;
  };

  const isEntry = (file: string): boolean => {
    const r = rel(file);
    const base = path.basename(file).replace(/\.[^.]+$/, "");
    if (r.startsWith("public/")) return true;
    if (r.startsWith("scripts/") || r.startsWith("tests/")) return true;
    if (r.startsWith("src/") && /\.test\.(ts|tsx)$/.test(r)) return true;
    if (!r.includes("/")) return true;
    if (r.startsWith("app/")) {
      if (ROUTE_BASES.has(base) && CODE_EXTS.includes(path.extname(file))) return true;
      if (META_BASES.has(base)) return true;
    }
    return false;
  };

  const vercelNotes: string[] = [];
  const vercelPath = path.join(root, "vercel.json");
  if (fs.existsSync(vercelPath)) {
    try {
      const v = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
      for (const c of v.crons ?? []) {
        const routeFile = path.join(root, "app", String(c.path).replace(/^\//, ""), "route.ts");
        vercelNotes.push(fileSet.has(routeFile) ? `cron ${c.path} -> ${rel(routeFile)} (route entry)` : `cron ${c.path} -> MISSING route file`);
      }
      for (const h of v.headers ?? []) vercelNotes.push(`headers source ${h.source} (public asset glob; public/** is rooted)`);
    } catch {
      vercelNotes.push("vercel.json parse failed");
    }
  }

  const entries = new Set<string>(files.filter(isEntry).map((f) => path.resolve(f)));
  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const cmd of Object.values(pkgJson.scripts ?? {}) as string[]) {
    for (const tok of cmd.split(/\s+/)) {
      if (tok.includes("*")) {
        const prefix = tok.split("*")[0];
        if (prefix.includes("/")) for (const f of fileSet) if (rel(f).startsWith(prefix)) entries.add(f);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(tok)) continue;
      const p = path.resolve(root, tok);
      if (fileSet.has(p)) entries.add(p);
    }
  }

  // --- parse pass ----------------------------------------------------------
  const infos = new Map<string, FileInfo>();
  const pkgName = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
  const PATHISH_RE = /^(?!node:)(?!https?:)(?:[\w.-]*\/[\w./-]*|[\w-][\w.-]*\.[a-z0-9]{1,5})$/i;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const text = fs.readFileSync(file, "utf8");
    const info: FileInfo = { deps: [], packages: [], exports: [], importedNames: new Map(), starImports: new Set(), unresolved: [], unresolvedChunks: [], text };
    infos.set(path.resolve(file), info);
    if (!CODE_EXTS.includes(ext)) continue;

    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    const pushName = (target: string, name: string) => {
      if (!info.importedNames.has(target)) info.importedNames.set(target, new Set());
      info.importedNames.get(target)!.add(name);
    };
    const addImportNames = (target: string, clause: ts.ImportClause | ts.NamedImportBindings | undefined) => {
      if (!clause) return;
      if (ts.isImportClause(clause)) {
        if (clause.name) pushName(target, "default");
        if (clause.namedBindings) addImportNames(target, clause.namedBindings);
      } else if (ts.isNamespaceImport(clause)) {
        info.starImports.add(target);
      } else if (ts.isNamedImports(clause)) {
        for (const el of clause.elements) pushName(target, (el.propertyName ?? el.name).text);
      }
    };
    // static path-like chunks inside an expression (template parts, "+" parts)
    const pushChunk = (raw: string, channel: "import" | "fs") => {
      if (raw.length < 3 || !PATHISH_RE.test(raw)) return;
      if (raw.startsWith("/")) return; // URL/route path, not a module path
      let c = raw.replace(/\\/g, "/").replace(/\/+$/, "");
      if (channel === "import") {
        if (!raw.startsWith(".")) return; // bare specifiers are dependency-pass material
        c = rel(path.resolve(path.dirname(file), raw)); // import specifiers are file-relative
      } else {
        c = c.replace(/^\.\//, ""); // fs paths resolve against process cwd (repo root)
        if (raw.startsWith("..")) {
          // __dirname-style usage: also record the file-dir-resolved form
          const alt = rel(path.resolve(path.dirname(file), raw));
          if (alt.length >= 3 && !alt.startsWith("..")) info.unresolvedChunks.push(alt);
        }
      }
      if (c.length >= 3) info.unresolvedChunks.push(c);
    };
    const collectChunks = (node: ts.Node, channel: "import" | "fs"): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        pushChunk(node.text, channel);
      } else if (ts.isTemplateExpression(node)) {
        pushChunk(node.head.text, channel);
        for (const span of node.templateSpans) pushChunk(span.literal.text, channel);
      }
      ts.forEachChild(node, (child) => collectChunks(child, channel));
    };

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        const target = resolveSpecifier(spec, file);
        if (target) {
          info.deps.push(target);
          addImportNames(target, node.importClause);
        } else info.packages.push(pkgName(spec));
      } else if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const spec = node.moduleSpecifier.text;
          const target = resolveSpecifier(spec, file);
          if (target) {
            info.deps.push(target);
            if (node.exportClause && ts.isNamedExports(node.exportClause)) {
              for (const el of node.exportClause.elements) pushName(target, (el.propertyName ?? el.name).text);
            } else if (!node.exportClause) info.starImports.add(target);
          } else info.packages.push(pkgName(spec));
        } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) info.exports.push(el.name.text);
        }
      } else if (ts.isCallExpression(node)) {
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
        if ((isDynamicImport || isRequire) && node.arguments.length > 0) {
          const arg = node.arguments[0];
          if (ts.isStringLiteral(arg)) {
            const target = resolveSpecifier(arg.text, file);
            if (target) {
              info.deps.push(target);
              info.starImports.add(target); // namespace semantics: preserve all exports
            } else info.packages.push(pkgName(arg.text));
          } else {
            info.unresolved.push(`${isDynamicImport ? "import()" : "require()"} with non-literal specifier`);
            collectChunks(arg, "import");
          }
        } else if (!isDynamicImport && !isRequire && node.arguments.length > 0) {
          const callee = node.expression.getText(sf);
          if (/(?:^|\.)(?:readFileSync|readFile|readdirSync|readdir|globSync|glob)$/.test(callee)) {
            collectChunks(node.arguments[0], "fs"); // literal fs/glob targets become demotion chunks
          }
        }
      }
      const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) {
          info.exports.push(node.name.text);
        } else if (ts.isVariableStatement(node)) {
          for (const d of node.declarationList.declarations) if (ts.isIdentifier(d.name)) info.exports.push(d.name.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (/export\s+default/.test(text)) info.exports.push("default");
    const fsMatch = text.match(FS_GLOB_RE);
    if (fsMatch) info.unresolved.push(`fs/glob usage: ${fsMatch[0]}`);
  }

  // --- reachability --------------------------------------------------------
  const reachable = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop()!;
    if (reachable.has(f)) continue;
    reachable.add(f);
    for (const d of infos.get(f)?.deps ?? []) if (!reachable.has(d)) stack.push(d);
  }

  const reachableInfos = [...reachable].map((f) => infos.get(f)!).filter(Boolean);
  const unreachable = files.filter((f) => !reachable.has(path.resolve(f)));

  // fail-closed demotion chunks from reachable files with unresolved markers
  const demotionChunks = new Set<string>();
  for (const f of reachable) {
    const fi = infos.get(f)!;
    if (fi.unresolved.length === 0) continue;
    for (const c of fi.unresolvedChunks) demotionChunks.add(c.replace(/^\.\//, ""));
  }

  const isMatchableChunk = (c: string) =>
    c.length >= 4 && !SCAN_DIRS.includes(c) && (c.includes("/") || /\.[a-z0-9]{1,5}$/i.test(c));
  const unknownKeep: { file: string; reason: string }[] = [];
  const unreferencedFiles: { file: string; evidence: string }[] = [];
  for (const f of unreachable) {
    const r = rel(f);
    const base = path.basename(f).replace(/\.[^.]+$/, "");
    const frag = r.replace(/\.[^.]+$/, "");
    const chunkHit = [...demotionChunks].find((c) => {
      if (!isMatchableChunk(c)) return false;
      return r === c || r.startsWith(c + "/") || (c.includes(".") && r.endsWith("/" + c));
    });
    if (chunkHit) {
      unknownKeep.push({ file: r, reason: `matches path chunk "${chunkHit}" from an unresolved dynamic/fs reference` });
      continue;
    }
    const hits: string[] = [];
    if (base.length >= 3) {
      for (const [rf, ri] of infos) {
        if (!reachable.has(rf)) continue;
        if (ri.text.includes(base) || ri.text.includes(frag)) {
          hits.push(rel(rf));
          if (hits.length >= 3) break;
        }
      }
    }
    if (hits.length > 0) unknownKeep.push({ file: r, reason: `string reference in reachable: ${hits.join(", ")}` });
    else unreferencedFiles.push({ file: r, evidence: "no static importer, no string reference, no unresolved-chunk match" });
  }

  // --- dependencies --------------------------------------------------------
  const usedPkgs = new Set<string>();
  for (const ri of reachableInfos) for (const p of ri.packages) usedPkgs.add(p);
  const configText = files.filter((f) => !rel(f).includes("/")).map((f) => infos.get(path.resolve(f))!.text).join("\n") + "\n" + JSON.stringify(pkgJson.scripts ?? {});
  const unusedDependencies: { name: string; kind: string; evidence: string }[] = [];
  for (const [name, kind] of [...Object.keys(pkgJson.dependencies ?? {}).map((n) => [n, "dependencies"] as const), ...Object.keys(pkgJson.devDependencies ?? {}).map((n) => [n, "devDependencies"] as const)]) {
    if (RESERVED_DEPS.has(name)) continue;
    if (usedPkgs.has(name)) continue;
    if (name.startsWith("@types/") && usedPkgs.has(name.slice(7))) continue;
    if (new RegExp(`\\b${name.replace(/[/@.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(configText)) continue;
    unusedDependencies.push({ name, kind, evidence: "no import in reachable set, no config/script reference" });
  }

  // --- unused exports ------------------------------------------------------
  const importedNamesOf = new Map<string, Set<string>>();
  const starOf = new Set<string>();
  for (const ri of reachableInfos) {
    for (const [t, names] of ri.importedNames) {
      if (!importedNamesOf.has(t)) importedNamesOf.set(t, new Set());
      for (const n of names) importedNamesOf.get(t)!.add(n);
    }
    for (const t of ri.starImports) starOf.add(t);
  }
  const unusedExports: { file: string; name: string; evidence: string }[] = [];
  for (const f of reachable) {
    if (entries.has(f)) continue;
    const r = rel(f);
    if (r.startsWith("app/")) continue;
    const info = infos.get(f)!;
    for (const name of info.exports) {
      if (RESERVED_EXPORTS.has(name)) continue;
      if (starOf.has(f)) continue;
      if (!importedNamesOf.get(f)?.has(name)) {
        unusedExports.push({ file: r, name, evidence: "exported but no reachable importer names it" });
      }
    }
  }

  const unresolvedReport = [...reachable]
    .flatMap((f) => (infos.get(f)!.unresolved.length ? [{ file: rel(f), items: infos.get(f)!.unresolved, chunks: infos.get(f)!.unresolvedChunks }] : []));

  // --- Worker contract closure --------------------------------------------
  const fixturesDir = path.join(root, "tests", "fixtures", "external-contracts");
  const fixtureFiles: string[] = [];
  walk(fixturesDir, fixtureFiles);
  const sumsPath = path.join(fixturesDir, "SHA256SUMS");
  const sumsCheck: { entries: number; verified: number; mismatches: string[]; present: boolean } = { entries: 0, verified: 0, mismatches: [], present: fs.existsSync(sumsPath) };
  if (sumsCheck.present) {
    for (const line of fs.readFileSync(sumsPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
      if (!m) continue;
      sumsCheck.entries++;
      const fixtureRel = `tests/fixtures/external-contracts/${m[2].trim()}`;
      // Hash the canonical git blob (index is LF); fall back to working-tree bytes.
      let bytes: Buffer | null = null;
      try {
        bytes = execSync(`git show :${fixtureRel}`, { cwd: root, maxBuffer: 1 << 26 });
      } catch { /* not indexed */ }
      if (!bytes && fs.existsSync(path.join(fixturesDir, m[2].trim()))) bytes = fs.readFileSync(path.join(fixturesDir, m[2].trim()));
      if (bytes && sha256hex(bytes) === m[1].toLowerCase()) sumsCheck.verified++;
      else sumsCheck.mismatches.push(m[2].trim());
    }
  }
  let workerHead = "unavailable";
  try {
    workerHead = execSync("git rev-parse HEAD", { cwd: path.resolve(root, "..", "worker") }).toString().trim();
  } catch { /* sibling repo absent */ }
  const workerContract = {
    fixturesDir: fs.existsSync(fixturesDir) ? rel(fixturesDir) : "MISSING",
    fixtureFileCount: fixtureFiles.length,
    sha256sums: sumsCheck,
    contractTest: fs.existsSync(path.join(root, "tests", "worker-cloud-contract.test.mjs")) ? "present" : "MISSING",
    callbackRoute: fs.existsSync(path.join(root, "app", "api", "internal", "worker-callback", "route.ts")) ? "present" : "MISSING",
    workerRepoHead: workerHead,
    policy: "shared-contract files are keep-by-default; changes require dual-repo verification",
  };

  let head = "unknown";
  try {
    head = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
  } catch { /* not a git worktree */ }

  return {
    generatedAt: new Date().toISOString(),
    root,
    head,
    totals: { files: files.length, entries: entries.size, reachable: reachable.size, unreachable: unreachable.length },
    reservedRoots: { routeBases: [...ROUTE_BASES], metaBases: [...META_BASES], vercel: vercelNotes, scriptAndTestTargets: "scripts/**, tests/**, src/**/*.test.ts, package.json script file tokens", public: "public/** rooted (URL-addressable)" },
    reservedExports: [...RESERVED_EXPORTS],
    reservedDependencies: [...RESERVED_DEPS],
    failClosed: { demotionChunks: demotionChunks.size, rule: "literal dynamic import/require = namespace import; unresolved-chunk or string match => unknown/keep" },
    workerContract,
    candidates: { unreferencedFiles, unusedDependencies, unusedExports },
    unknownKeep,
    unresolvedReferences: unresolvedReport,
  };
}

function main() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > 0 ? path.resolve(process.argv[outIdx + 1]) : null;
  const inv = buildInventory(process.cwd());
  console.log([
    `files=${inv.totals.files} entries=${inv.totals.entries} reachable=${inv.totals.reachable} unreachable=${inv.totals.unreachable}`,
    `candidates: unreferencedFiles=${inv.candidates.unreferencedFiles.length} unusedDependencies=${inv.candidates.unusedDependencies.length} unusedExports=${inv.candidates.unusedExports.length}`,
    `unknownKeep=${inv.unknownKeep.length} unresolvedRefs=${inv.unresolvedReferences.length} demotionChunks=${inv.failClosed.demotionChunks}`,
    `workerContract: fixtures=${inv.workerContract.fixtureFileCount} sha256sums=${inv.workerContract.sha256sums.verified}/${inv.workerContract.sha256sums.entries} verified, worker@${inv.workerContract.workerRepoHead.slice(0, 7)}`,
  ].join("\n"));
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(inv, null, 2));
    console.log(`inventory written: ${outPath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
