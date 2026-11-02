#!/usr/bin/env tsx
/**
 * PLATFORM-HEALTH-001 S-E-1: read-only dead-code inventory scanner.
 *
 * Plan: docs/operations/health/PLATFORM_HEALTH_001/S_E_DEAD_CODE_PLAN_2026-11-03.md
 *
 * Builds the import graph from reserved entries (Next.js route/metadata
 * conventions, package.json script targets, root configs, vercel.json
 * declarations, public/), then classifies what no entry can reach.
 * Fail-closed: unresolved dynamic references and string matches demote a
 * candidate to unknown/keep. This script never modifies the repository.
 *
 * Usage: tsx scripts/dead-code-scan.mts --out <inventory.json>
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx > 0 ? path.resolve(process.argv[outIdx + 1]) : null;

const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const ASSET_EXTS = [".json", ".css", ".png", ".webp", ".jpg", ".jpeg", ".svg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".wav", ".webm", ".mp4", ".pdf", ".txt", ".md"];
const ALL_EXTS = [...CODE_EXTS, ...ASSET_EXTS];
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

const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");

function walk(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && ALL_EXTS.includes(path.extname(name).toLowerCase())) acc.push(full);
  }
}

const files: string[] = [];
for (const d of SCAN_DIRS) walk(path.join(root, d), files);
for (const f of ["proxy.ts", "instrumentation.ts", "next.config.ts", "next.config.mjs", "next.config.js", "postcss.config.mjs", "postcss.config.js", "eslint.config.mjs", "eslint.config.js", "tailwind.config.ts", "tailwind.config.js"]) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) files.push(p);
}
const fileSet = new Set(files.map((f) => path.resolve(f)));

// --- tsconfig / module resolution -----------------------------------------
const tsconfigPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
const compilerOptions = tsconfigPath
  ? ts.parseJsonConfigFileContent(ts.readConfigFile(tsconfigPath, ts.sys.readFile).config, ts.sys, root).options
  : ({} as ts.CompilerOptions);

function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("@/") && !spec.startsWith("~/")) return null; // bare package
  const r = ts.resolveModuleName(spec, fromFile, compilerOptions, ts.sys);
  if (r.resolvedModule) {
    const p = path.resolve(r.resolvedModule.resolvedFileName);
    if (fileSet.has(p)) return p;
    return null; // resolved into node_modules or declaration-only
  }
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const e of ALL_EXTS) if (fileSet.has(base + e)) return base + e;
  if (fileSet.has(base)) return base;
  for (const e of CODE_EXTS) if (fileSet.has(path.join(base, "index" + e))) return path.resolve(path.join(base, "index" + e));
  return null;
}

// --- entries ---------------------------------------------------------------
function isEntry(file: string): boolean {
  const r = rel(file);
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  if (r.startsWith("public/")) return true;
  if (r.startsWith("scripts/") || r.startsWith("tests/")) return true;
  if (r.startsWith("src/") && /\.test\.(ts|tsx)$/.test(r)) return true;
  if (!r.includes("/")) return true; // root configs
  if (r.startsWith("app/")) {
    if (ROUTE_BASES.has(base) && CODE_EXTS.includes(path.extname(file))) return true;
    if (META_BASES.has(base)) return true;
  }
  return false;
}

// vercel.json external-caller roots (cron -> app route, headers -> public assets)
const vercelNotes: string[] = [];
const vercelPath = path.join(root, "vercel.json");
if (fs.existsSync(vercelPath)) {
  try {
    const v = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
    for (const c of v.crons ?? []) {
      const routeFile = path.join(root, "app", String(c.path).replace(/^\//, ""), "route.ts");
      if (fileSet.has(routeFile)) vercelNotes.push(`cron ${c.path} -> ${rel(routeFile)} (already a route entry)`);
      else vercelNotes.push(`cron ${c.path} -> MISSING route file`);
    }
    for (const h of v.headers ?? []) vercelNotes.push(`headers source ${h.source} (public asset glob; public/** is already rooted)`);
  } catch {
    vercelNotes.push("vercel.json parse failed");
  }
}

const entries = new Set<string>(files.filter(isEntry).map((f) => path.resolve(f)));

// package.json script values name files directly (tsx --test lists, node scripts)
const pkgJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const cmd of Object.values(pkgJson.scripts ?? {}) as string[]) {
  for (const tok of cmd.split(/\s+/)) {
    if (tok.includes("*")) {
      const prefix = tok.split("*")[0];
      if (prefix.includes("/")) for (const f of fileSet) if (rel(f).startsWith(prefix)) entries.add(f);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|mts)$/.test(tok)) continue;
    const p = path.resolve(root, tok);
    if (fileSet.has(p)) entries.add(p);
  }
}

// --- parse pass ------------------------------------------------------------
interface FileInfo {
  deps: string[];
  packages: string[];
  exports: string[];
  importedNames: Map<string, Set<string>>; // resolved file -> names imported from it
  starImports: Set<string>; // resolved files imported as namespace
  unresolved: string[]; // dynamic import/require or fs/glob flags
  text: string;
}

const infos = new Map<string, FileInfo>();
const FS_GLOB_RE = /\b(?:fs\.(readFile|readFileSync|readdir|readdirSync)|readFileSync|readdirSync|globSync|fast-glob|glob\()/;
const pkgName = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const text = fs.readFileSync(file, "utf8");
  const info: FileInfo = { deps: [], packages: [], exports: [], importedNames: new Map(), starImports: new Set(), unresolved: [], text };
  infos.set(path.resolve(file), info);
  if (!CODE_EXTS.includes(ext)) continue;

  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

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
  const pushName = (target: string, name: string) => {
    if (!info.importedNames.has(target)) info.importedNames.set(target, new Set());
    info.importedNames.get(target)!.add(name);
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
          if (target) info.deps.push(target);
          else info.packages.push(pkgName(arg.text));
        } else {
          info.unresolved.push(`${isDynamicImport ? "import()" : "require()"} with non-literal specifier`);
        }
      }
    }
    // exported declarations
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

// --- reachability ----------------------------------------------------------
const reachable = new Set<string>();
const stack = [...entries];
while (stack.length) {
  const f = stack.pop()!;
  if (reachable.has(f)) continue;
  reachable.add(f);
  for (const d of infos.get(f)?.deps ?? []) if (!reachable.has(d)) stack.push(d);
}

// --- candidates ------------------------------------------------------------
const reachableInfos = [...reachable].map((f) => infos.get(f)!).filter(Boolean);
const unreachable = files.filter((f) => !reachable.has(path.resolve(f)));

const unknownKeep: { file: string; reason: string }[] = [];
const unreferencedFiles: { file: string; evidence: string }[] = [];
for (const f of unreachable) {
  const r = rel(f);
  const base = path.basename(f).replace(/\.[^.]+$/, "");
  const frag = r.replace(/\.[^.]+$/, "");
  const hits: string[] = [];
  for (const ri of reachableInfos) {
    if (ri.text.includes(base) || ri.text.includes(frag)) {
      const rf = rel([...infos.entries()].find(([, v]) => v === ri)![0]);
      hits.push(rf);
      if (hits.length >= 3) break;
    }
  }
  if (hits.length > 0) unknownKeep.push({ file: r, reason: `string reference in reachable: ${hits.join(", ")}` });
  else unreferencedFiles.push({ file: r, evidence: "no static importer, no string reference in reachable set" });
}

// unused dependencies
const usedPkgs = new Set<string>();
for (const ri of reachableInfos) for (const p of ri.packages) usedPkgs.add(p);
const configText = files.filter((f) => !rel(f).includes("/")).map((f) => infos.get(path.resolve(f))!.text).join("\n") + "\n" + JSON.stringify(pkgJson.scripts ?? {});
const RESERVED_DEPS = new Set(["@types/node"]); // ambient compiler types, no import site
const unusedDependencies: { name: string; kind: string; evidence: string }[] = [];
for (const [name, kind] of [...Object.keys(pkgJson.dependencies ?? {}).map((n) => [n, "dependencies"] as const), ...Object.keys(pkgJson.devDependencies ?? {}).map((n) => [n, "devDependencies"] as const)]) {
  if (RESERVED_DEPS.has(name)) continue;
  if (usedPkgs.has(name)) continue;
  if (name.startsWith("@types/") && usedPkgs.has(name.slice(7))) continue;
  if (new RegExp(`\\b${name.replace(/[/@.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(configText)) continue;
  unusedDependencies.push({ name, kind, evidence: "no import in reachable set, no config/script reference" });
}

// unused named exports (conservative: only in reachable non-entry files)
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
  if (isEntry(f)) continue;
  const r = rel(f);
  if (r.startsWith("app/")) continue; // route-convention exports are reserved
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
  .flatMap((f) => (infos.get(f)!.unresolved.length ? [{ file: rel(f), items: infos.get(f)!.unresolved }] : []));

const inventory = {
  generatedAt: new Date().toISOString(),
  root,
  head: (() => { try { return execSync("git rev-parse HEAD", { cwd: root }).toString().trim(); } catch { return "unknown"; } })(),
  totals: { files: files.length, entries: entries.size, reachable: reachable.size, unreachable: unreachable.length },
  reservedRoots: { routeBases: [...ROUTE_BASES], metaBases: [...META_BASES], vercel: vercelNotes, scriptAndTestTargets: "scripts/**, tests/**, src/**/*.test.ts", public: "public/** rooted (URL-addressable)" },
  reservedExports: [...RESERVED_EXPORTS],
  candidates: { unreferencedFiles, unusedDependencies, unusedExports },
  unknownKeep,
  unresolvedReferences: unresolvedReport,
};

const summary = [
  `files=${files.length} entries=${entries.size} reachable=${reachable.size} unreachable=${unreachable.length}`,
  `candidates: unreferencedFiles=${unreferencedFiles.length} unusedDependencies=${unusedDependencies.length} unusedExports=${unusedExports.length}`,
  `unknownKeep=${unknownKeep.length} unresolvedRefs=${unresolvedReport.length}`,
].join("\n");
console.log(summary);

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2));
  console.log(`inventory written: ${outPath}`);
}
