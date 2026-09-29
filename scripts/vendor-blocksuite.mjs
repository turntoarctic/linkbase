#!/usr/bin/env node
/**
 * vendor-blocksuite（05 §2.2）：把上游 BlockSuite monorepo 的包迁入 packages/blocksuite/。
 *
 * 用法：bun scripts/vendor-blocksuite.mjs --src <上游克隆> --out <输出目录>
 * 例：bun scripts/vendor-blocksuite.mjs --src packages/blocksuite --out packages/.bs-tmp
 *
 * 四步（05 §2.2，禁止手工漂移）：
 *  1. 拷贝包目录（保留原包名与 version——版本号即同步基线标识）；
 *  2. fixup tsconfig：extends 统一指向我们提供的 packages/blocksuite/tsconfig.base.json；
 *  3. fixup package.json：删生命周期 scripts 与发布字段，dependencies 原样保留；
 *  4. 输出同步报告 vendor-report.md。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const args = process.argv.slice(2);
function argOf(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}
const SRC = argOf('--src');
const OUT = argOf('--out');
if (!SRC || !OUT) {
  console.error('usage: vendor-blocksuite.mjs --src <upstream-clone> --out <dir>');
  process.exit(1);
}

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'build']);
const PKG_KEEP_KEYS = [
  'name', 'version', 'type', 'description', 'sideEffects', 'exports', 'main', 'module',
  'types', 'dependencies', 'peerDependencies', 'devDependencies', 'optionalDependencies',
];

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** 上游 tsconfig 是 JSONC（带注释），剥离后解析（足够覆盖配置文件场景） */
function readJsonc(p) {
  const raw = readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(raw);
}

function copyPackage(fromDir, toDir) {
  mkdirSync(toDir, { recursive: true });
  for (const entry of readdirSync(fromDir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const src = join(fromDir, entry);
    const st = statSync(src);
    if (st.isDirectory()) {
      cpSync(src, join(toDir, entry), { recursive: true, filter: (s) => !EXCLUDE_DIRS.has(basename(s)) });
    } else {
      cpSync(src, join(toDir, entry));
    }
  }
  fixupPackageJson(toDir);
  fixupTsconfig(toDir);
}

function fixupPackageJson(pkgDir) {
  const file = join(pkgDir, 'package.json');
  if (!existsSync(file)) return;
  const raw = readJson(file);
  const cleaned = {};
  for (const key of PKG_KEEP_KEYS) {
    if (raw[key] !== undefined) cleaned[key] = raw[key];
  }
  writeFileSync(file, JSON.stringify(cleaned, null, 2) + '\n');
}

function fixupTsconfig(pkgDir) {
  const file = join(pkgDir, 'tsconfig.json');
  if (!existsSync(file)) return;
  let cfg;
  try {
    cfg = readJsonc(file);
  } catch {
    console.warn(`  ! skip unreadable tsconfig: ${relative(OUT, pkgDir)}`);
    return;
  }
  if (!('extends' in cfg)) return;
  // 统一指向我们提供的 base（05 §2.2 第 2 步）
  cfg.extends = relative(pkgDir, join(OUT, 'tsconfig.base.json')).replace(/\\/g, '/');
  // 上游 paths/@blocksuite/* 自映射不需要（workspace 直解析），删掉避免漂移
  const compilerOptions = { ...cfg.compilerOptions };
  if (compilerOptions.paths && Object.keys(compilerOptions.paths).some((k) => k.startsWith('@blocksuite/'))) {
    const paths = { ...compilerOptions.paths };
    for (const k of Object.keys(paths)) if (k.startsWith('@blocksuite/')) delete paths[k];
    if (Object.keys(paths).length === 0) delete compilerOptions.paths;
    else compilerOptions.paths = paths;
    cfg.compilerOptions = compilerOptions;
  }
  writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

const report = { upstream: SRC, out: OUT, packages: [] };

function vendorPackage(fromDir, toDir) {
  if (!existsSync(join(fromDir, 'package.json'))) return false;
  copyPackage(fromDir, toDir);
  const pkg = readJson(join(toDir, 'package.json'));
  report.packages.push({ name: pkg.name, version: pkg.version, from: relative(SRC, fromDir), to: relative(OUT, toDir) });
  return true;
}

function vendorGroup(groupDir, toDir) {
  // 组目录自身是单包（如 ext-loader）或含子包（如 blocks/*）
  if (existsSync(join(groupDir, 'package.json'))) {
    vendorPackage(groupDir, toDir);
    return;
  }
  for (const child of readdirSync(groupDir)) {
    vendorPackage(join(groupDir, child), join(toDir, child));
  }
}

// ---- 映射（05 §2.1：framework→根平铺；affine/all→affine；affine 组加 affine- 前缀）----

const upstreamPackages = join(SRC, 'packages');
const frameworkDir = join(upstreamPackages, 'framework');
const affineDir = join(upstreamPackages, 'affine');

if (!existsSync(frameworkDir) || !existsSync(affineDir)) {
  console.error(`unexpected upstream layout at ${SRC} (need packages/framework + packages/affine)`);
  process.exit(1);
}

for (const child of readdirSync(frameworkDir)) {
  vendorPackage(join(frameworkDir, child), join(OUT, child));
}
vendorPackage(join(affineDir, 'all'), join(OUT, 'affine'));
for (const group of readdirSync(affineDir)) {
  if (group === 'all') continue;
  vendorGroup(join(affineDir, group), join(OUT, `affine-${group}`));
}

// ---- tsconfig.base（我们提供的统一基座，05 §2.2 第 2 步）----

writeFileSync(
  join(OUT, 'tsconfig.base.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ESNext',
        module: 'Preserve',
        moduleResolution: 'bundler',
        lib: ['ESNext', 'DOM', 'DOM.Iterable'],
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        isolatedModules: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        forceConsistentCasingInFileNames: true,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
    null,
    2,
  ) + '\n',
);

// ---- 同步报告（05 §2.2 第 4 步）----

report.packages.sort((a, b) => a.name.localeCompare(b.name));
const lines = [
  '# BlockSuite vendor 同步报告',
  '',
  `- 上游：https://github.com/toeverything/blocksuite.git（tag v0.22.4）`,
  `- 基线版本：${report.packages[0]?.version ?? '?'}`,
  `- 迁入包数：${report.packages.length}`,
  '',
  '本地补丁：无（改动须登记 91 §6 变更记录）',
  '',
  '## 包清单',
  '',
  '| 包 | 版本 | 上游路径 | 落位 |',
  '|----|------|----------|------|',
  ...report.packages.map((p) => `| ${p.name} | ${p.version} | ${p.from} | ${p.to} |`),
  '',
];
writeFileSync(join(OUT, 'vendor-report.md'), lines.join('\n'));

console.log(`vendored ${report.packages.length} packages → ${OUT}`);
