#!/usr/bin/env node
/*
 * تولید sw.js نهایی برای نسخه استاتیک (گیت‌هاب پیجز)
 * ---------------------------------------------------
 * پس از `next build`، همه فایل‌های out/ را فهرست می‌کند و در قالب
 * public/sw.template.js تزریق می‌سازد تا سرویس‌ورکر «همه» فایل‌های
 * برنامه را در اولین بازدید precache کند (سناریوی قطعی طولانی اینترنت).
 *
 * استفاده:
 *   node scripts/gen-sw.mjs [--out out] [--version <sha|tag>]
 */
import { readdirSync, statSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// --- آرگومان‌ها ---
const argv = process.argv.slice(2);
const getArg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const OUT_DIR = join(ROOT, getArg('--out', 'out'));
const VERSION = getArg('--version', '') || `local-${Date.now()}`;

// پسوندهایی که باید آفلاین قابل دسترس باشند
const INCLUDE_EXT = new Set([
  '.html', '.js', '.css', '.map', '.json', '.webmanifest', '.txt', '.xml',
  '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
]);
// فایل‌هایی که نباید precache شوند (قالب + خود سرویس‌ورکر — مرورگر sw را جداگانه مدیریت می‌کند)
const SKIP_NAMES = new Set(['sw.template.js', 'sw.js']);

if (!existsSync(OUT_DIR)) {
  console.error(`✗ پوشه خروجی پیدا نشد: ${OUT_DIR} — اول next build را اجرا کنید.`);
  process.exit(1);
}

// --- پیمایش بازگشتی out/ ---
function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

const all = walk(OUT_DIR);
const urls = all
  .filter((p) => {
    const base = p.split('/').pop();
    if (SKIP_NAMES.has(base)) return false;
    return INCLUDE_EXT.has(extname(p).toLowerCase());
  })
  .map((p) => relative(OUT_DIR, p).split('\\').join('/'))
  // انکودینگ امن URL (بدون دست‌کاری اسلش‌ها)
  .map((p) => p.split('/').map(encodeURIComponent).join('/'))
  .sort();

// --- تزریق در قالب ---
const templatePath = join(ROOT, 'public', 'sw.template.js');
const template = readFileSync(templatePath, 'utf8');
const sw = template
  // ⚠️ replaceAll — رشته placeholder ممکن است در کامنت‌ها هم تکرار شده باشد
  .replaceAll('__BUILD_VERSION__', JSON.stringify(VERSION))
  .replaceAll('__PRECACHE_URLS__', JSON.stringify(urls));

writeFileSync(join(OUT_DIR, 'sw.js'), sw);
// راستی‌آزمایی: هیچ placeholder نباید باقی مانده باشد — وگرنه بیلد CI را شکست بده
if (sw.includes('__BUILD_VERSION__') || sw.includes('__PRECACHE_URLS__')) {
  console.error('✗ خطا: placeholder در sw.js باقی مانده است!');
  process.exit(1);
}
try { unlinkSync(join(OUT_DIR, 'sw.template.js')); } catch (_) {}

const totalKB = Math.round(
  urls.reduce((acc, rel) => acc + statSync(join(OUT_DIR, rel.split('/').map(decodeURIComponent).join('/'))).size, 0) / 1024
);
console.log(`✓ sw.js ساخته شد — نسخه: ${VERSION}`);
console.log(`  تعداد فایل‌های precache: ${urls.length} (${totalKB} KB)`);
