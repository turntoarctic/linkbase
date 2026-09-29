/**
 * i18n 守护脚本（13 §7 / T0.8）：
 *  1. zh-CN 与 en key 集合一致（缺失/多余都报错）；
 *  2. LB_* 错误码在两个语言都有文案（10 §6 × 13 §4）；
 *  3. apps/web/src 源码无硬编码 CJK 文案（注释除外；i18n 资源与测试除外）。
 * 用法：node scripts/check-i18n.mjs（CI / bun run check 内）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(root, 'apps/web/src/i18n/locales');
const SRC_DIR = join(root, 'apps/web/src');

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`  ✗ ${msg}`);
};

// ---- 1/2. 资源检查 ----

const zhCN = JSON.parse(readFileSync(join(LOCALES_DIR, 'zh-CN.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf8'));

function collectKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' ? collectKeys(v, key) : [key];
  });
}

console.log('[i18n] key parity (13 §7-2)');
const zhKeys = new Set(collectKeys(zhCN));
const enKeys = new Set(collectKeys(en));
for (const k of zhKeys) if (!enKeys.has(k)) fail(`en missing key: ${k}`);
for (const k of enKeys) if (!zhKeys.has(k)) fail(`zh-CN missing key: ${k}`);
if (!failed) console.log(`  ✓ ${zhKeys.size} keys aligned`);

console.log('[i18n] LB_* error copy (10 §6 × 13 §7-3)');
const codes = [
  'LB_VALIDATION', 'LB_UNAUTHORIZED', 'LB_TOKEN_INVALID', 'LB_FORBIDDEN', 'LB_NOT_FOUND',
  'LB_PAGE_NOT_FOUND', 'LB_EMAIL_TAKEN', 'LB_TAG_EXISTS', 'LB_RATE_LIMITED',
  'LB_PAYLOAD_TOO_LARGE', 'LB_INTERNAL',
];
for (const code of codes) {
  if (!zhCN.errors?.[code]) fail(`zh-CN errors.${code} missing`);
  if (!en.errors?.[code]) fail(`en errors.${code} missing`);
}
if (!failed) console.log(`  ✓ ${codes.length} codes covered`);

// ---- 3. 硬编码文案扫描（13 §7-1）----

const CJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
const isSource = (name) => name.endsWith('.ts') || name.endsWith('.tsx');
const isTest = (name) => /\.(test|spec)\.[tj]sx?$/.test(name);
const SKIP_DIRS = new Set(['i18n', 'node_modules']);

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...listFiles(p));
    } else if (isSource(name) && !isTest(name)) {
      out.push(p);
    }
  }
  return out;
}

console.log('[i18n] no hardcoded copy in components (13 §7-1)');
let scanned = 0;
for (const file of listFiles(SRC_DIR)) {
  scanned += 1;
  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlockComment = false;
  lines.forEach((rawLine, i) => {
    let line = rawLine;
    // 剥离注释：先去掉同行完整的块注释，再跟踪跨行块注释，最后去行注释
    line = line.replace(/\/\*.*?\*\//g, '');
    const openIdx = line.indexOf('/*');
    if (openIdx !== -1) {
      inBlockComment = true;
      line = line.slice(0, openIdx);
    } else if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    const lineCommentIdx = line.indexOf('//');
    if (lineCommentIdx !== -1) line = line.slice(0, lineCommentIdx);
    if (CJK.test(line)) {
      fail(`${file}:${i + 1} → ${line.trim().slice(0, 80)}`);
    }
  });
}
if (!failed) console.log(`  ✓ ${scanned} files clean`);

process.exit(failed ? 1 : 0);
