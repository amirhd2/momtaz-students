// تست E2E نسخه مرورگری (استاتیک) — ورود، ثبت دانش‌آموز، ماندگاری داده، خروجی اکسل، پشتیبان
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/momtaz-students`;
const results = [];
const check = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' | ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

const server = spawn('node', ['scripts/serve-out.mjs', 'out', String(PORT)], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 800));

mkdirSync('scripts/shots', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
const failedRequests = [];
page.on('requestfailed', (req) => failedRequests.push(req.url()));

try {
  // ۱) ورود
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', '1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=ستاد', { timeout: 15000 });
  check('ورود با رمز 1234 و نمایش بخش ستاد', true);

  // ۲) هیچ درخواست API به سرور نرفته باشد (فایل‌های استاتیک فقط)
  const nonStatic = failedRequests.filter((u) => !u.includes('favicon'));
  check('هیچ درخواست شبکه‌ای شکست‌خورده نباشد', nonStatic.length === 0, nonStatic.slice(0, 3).join(' , '));

  // ۳) ثبت دانش‌آموز
  await page.click('button[aria-label="افزودن دانش‌آموز جدید"]');
  await page.waitForSelector('div[role="dialog"]', { timeout: 8000 });
  await page.fill('div[role="dialog"] input[placeholder="مثال: علی محمدی"] >> nth=0', 'علی محمدی تست استاتیک');
  await page.click('div[role="dialog"] label[for="gender-m"]');
  const grade = page.locator('#student-grade');
  await grade.click();
  await grade.pressSequentially('پنجم', { delay: 40 });
  await page.fill('div[role="dialog"] input[placeholder*="19.75"]', 'خیلی خوب');
  await page.fill('div[role="dialog"] input[placeholder="مثال: علی محمدی"] >> nth=1', 'رضا محمدی');
  await page.click('div[role="dialog"] button:has-text("ثبت دانش‌آموز")');
  await page.waitForSelector('td:has-text("علی محمدی تست استاتیک")', { timeout: 10000 });
  check('ثبت دانش‌آموز و نمایش در جدول', true);

  // ۴) ماندگاری: رفرش کامل — داده باید از IndexedDB بیاید (بدون سرور)
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=ستاد', { timeout: 15000 });
  const stillThere = await page.locator('td:has-text("علی محمدی تست استاتیک")').count();
  check('ماندگاری داده بعد از رفرش (IndexedDB)', stillThere > 0);

  // ۵) خروجی اکسل سمت مرورگر (Blob)
  await page.click('button:has-text("خروجی اکسل")');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('[role="menuitem"]:has-text("نام دانش‌آموز")'),
  ]);
  const dlPath = 'scripts/shots/static-export-test.xlsx';
  await download.saveAs(dlPath);
  check(
    'دانلود خروجی اکسل سمت مرورگر',
    existsSync(dlPath) && download.suggestedFilename().endsWith('.xlsx'),
    download.suggestedFilename()
  );
  const head = readFileSync(dlPath).subarray(0, 2).toString();
  check('فایل اکسل معتبر (امضای PK)', head === 'PK');

  // ۶) پشتیبان JSON از تنظیمات
  await page.click('button[aria-label="تنظیمات"]');
  await page.click('button[role="tab"]:has-text("پشتیبان‌گیری")');
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('button:has-text("دانلود فایل پشتیبان")'),
  ]);
  const bp = 'scripts/shots/static-backup-test.json';
  await dl2.saveAs(bp);
  const j = JSON.parse(readFileSync(bp, 'utf8'));
  check(
    'فایل پشتیبان JSON معتبر و هم‌ساختار نسخه سروری',
    j.app === 'student-excellence-registry' && Array.isArray(j.years) && j.years.length > 0
  );

  // ۷) بازیابی همان پشتیبان (چرخه کامل) و اطمینان از بازگشت داده‌ها
  await page.setInputFiles('input[type="file"]', bp);
  await page.click('[role="alertdialog"] button:has-text("بازیابی و جایگزینی")');
  await page.waitForSelector('[role="alertdialog"]', { state: 'detached', timeout: 15000 });
  await page.click('header button:has-text("ستاد")');
  await page.waitForSelector('td:has-text("علی محمدی تست استاتیک")', { timeout: 15000 });
  check('بازیابی پشتیبان و بازگشت کامل داده‌ها', true);

  await page.screenshot({ path: 'scripts/shots/static-edition.png' });
} catch (e) {
  check('بدون استثنا در اجرای تست', false, String(e).slice(0, 200));
  try {
    await page.screenshot({ path: 'scripts/shots/static-edition-fail.png' });
  } catch {}
} finally {
  await browser.close();
  server.kill();
}

console.log(results.join('\n'));
if (pageErrors.length) console.log('PAGE ERRORS:', pageErrors.slice(0, 5).join(' | '));
