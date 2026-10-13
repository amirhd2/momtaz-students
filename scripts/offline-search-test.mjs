// تست E2E: ۱) اجرای کامل برنامه بدون اینترنت (بلاک همه درخواست‌های خارجی)
// ۲) جعبه جستجوی استان با فیلتر زنده و نرمال‌سازی حروف
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const shots = path.join(process.cwd(), 'scripts', 'shots');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

// ── شبیه‌سازی قطع اینترنت: هر درخواستی که به سرور برنامه (localhost) نرود بلاک می‌شود ──
let blocked = 0;
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(BASE)) return route.continue();
  blocked++;
  return route.abort();
});

let failed = false;
const check = (cond, msg) => {
  console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failed = true;
};

try {
  // ── ۱) آفلاین: کل جریان برنامه بدون هیچ درخواست خارجی ──
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="password"]', '1234');
  await page.click('button:has-text("ورود به سامانه")');
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForSelector('table tbody tr td', { timeout: 15000 });
  console.log('ورود و لود ستاد بدون اینترنت: انجام شد');
  check(blocked === 0, `هیچ درخواست خارجی بلاک نشد (بلاک‌شده: ${blocked})`);

  // فونت وزیرمتن لوکال؟ بررسی اینکه هیچ resource خارجی لود نشده
  await page.click('nav[aria-label="ناوبری بخش‌ها"] button:has-text("استان‌ها")');
  await page.waitForSelector('table tbody tr', { timeout: 15000 });
  await page.waitForTimeout(600);
  check(blocked === 0, `صفحه استان‌ها هم بدون درخواست خارجی (بلاک‌شده: ${blocked})`);

  // نشانگر آفلاین: رخداد offline دستی → بج ظاهر شود
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForTimeout(300);
  const badge = await page.locator('header :text("حالت آفلاین")').count();
  check(badge > 0, 'نشانگر «حالت آفلاین» در هدر ظاهر شد');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(300);
  const badgeGone = await page.locator('header :text("حالت آفلاین")').count();
  check(badgeGone === 0, 'نشانگر با برگشت اینترنت محو شد');

  // ── ۲) جعبه جستجوی استان ──
  const searchInput = page.locator('input[aria-label="جستجوی استان"]');
  check((await searchInput.count()) === 1, 'جعبه جستجوی استان در نوار ابزار وجود دارد');

  // موقعیت: سمت چپ دکمه‌های خروجی (در RTL یعنی x جعبه > x دکمه اکسل… در واقع جعبه بعد از دکمه‌هاست)
  const excelBox = await page.locator('button:has-text("خروجی اکسل")').boundingBox();
  const searchBox = await searchInput.boundingBox();
  // در RTL مختصات x از چپ شروع می‌شود — جعبه جستجو باید x کمتری از دکمه اکسل (سمت راست) داشته باشد
  check(
    excelBox && searchBox && searchBox.x < excelBox.x,
    `جعبه جستجو سمت چپِ دکمه خروجی است (excel x=${Math.round(excelBox?.x ?? 0)}, search x=${Math.round(searchBox?.x ?? 0)})`
  );

  // تعداد ردیف‌های اولیه (۳۱ استان) — فقط جدول اصلی (نه جدول StatsBox)
  const mainRows = page.locator('div.max-h-\\[440px\\] table tbody tr');
  const allRows = await mainRows.count();
  check(allRows === 31, `بدون جستجو ۳۱ ردیف (${allRows})`);

  // جستجوی دقیق
  await searchInput.fill('تهران');
  await page.waitForTimeout(250);
  let rows = await mainRows.count();
  let firstCell = await mainRows.first().locator('td').first().textContent();
  check(rows === 1 && firstCell?.includes('تهران'), `«تهران» → ۱ ردیف (${rows}: ${firstCell?.trim()})`);
  const countLabel = await page.locator('text=/^۱ استان$/').count();
  check(countLabel > 0, 'برچسب شمارنده «۱ استان» نشان داده شد');

  // جستجوی جزئی
  await searchInput.fill('یز');
  await page.waitForTimeout(250);
  rows = await mainRows.count();
  firstCell = await mainRows.first().locator('td').first().textContent();
  check(rows === 1 && firstCell?.includes('یزد'), `«یز» → یزد (${rows}: ${firstCell?.trim()})`);

  // نرمال‌سازی: «ي» عربی به‌جای «ی» فارسی — «ايلام» باید ایلام را پیدا کند
  await searchInput.fill('ايلام'); // ي عربی
  await page.waitForTimeout(250);
  rows = await mainRows.count();
  firstCell = await mainRows.first().locator('td').first().textContent();
  check(rows === 1 && firstCell?.includes('ایلام'), `«ايلام» با ي عربی → ایلام (نرمال‌سازی کار می‌کند: ${rows}: ${firstCell?.trim()})`);

  // نامی که استان نیست → پیام یافت نشد (برنامه به داده غلط تطبیق ندهد)
  await searchInput.fill('ايران');
  await page.waitForTimeout(250);
  firstCell = await mainRows.first().locator('td').first().textContent();
  check(firstCell?.includes('یافت نشد'), `«ایران» (استان نیست) → پیام یافت نشد (${firstCell?.trim().slice(0, 30)})`);

  // نتیجه خالی
  await searchInput.fill('zzz');
  await page.waitForTimeout(250);
  const notFound = await page.locator('div.max-h-\\[440px\\] table tbody :text("یافت نشد")').count();
  check(notFound > 0, 'عبارت بی‌معنی → پیام یافت نشد');

  // دکمه پاک کردن
  await page.click('[aria-label="پاک کردن جستجو"]');
  await page.waitForTimeout(250);
  rows = await mainRows.count();
  check(rows === 31, `پاک کردن جستجو → برگشت به ۳۱ ردیف (${rows})`);

  await page.screenshot({ path: path.join(shots, 'province-search.png') });
} finally {
  await browser.close();
}

console.log(failed ? '❌ برخی تست‌ها رد شدند' : '✅ همه تست‌ها پاس شد');
process.exit(failed ? 1 : 0);
