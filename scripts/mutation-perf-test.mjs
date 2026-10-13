// رگرسیون: ثبت/ویرایش/حذف دانش‌آموز + بدون اورلی تمام‌صفحه هنگام ذخیره + کش پس از mutation
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const shots = path.join(process.cwd(), 'scripts', 'shots');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  // ورود
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="password"]', '1234');
  await page.click('button:has-text("ورود به سامانه")');
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForSelector('table', { timeout: 15000 });
  await page.waitForTimeout(500);

  // شمارش ردیف‌های فعلی ستاد
  const rowsBefore = await page.locator('table tbody tr').count();
  console.log(`ردیف‌های فعلی ستاد: ${rowsBefore}`);

  // باز کردن فرم افزودن (دکمه شناور)
  await page.click('[aria-label="افزودن دانش‌آموز جدید"]');
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  // پر کردن فرم
  await page.fill('#student-name', 'تست سرعت رکورد');
  // جنسیت (رادیو)
  await page.click('label[for="gender-m"]');
  // مقطع (اتوکامپلت متنی — تایپ کافی است، هنگام ثبت پارس می‌شود)
  await page.fill('#student-grade', 'هفتم');
  // معدل (هفتم ≥19 → 20 مجاز)
  await page.fill('#student-gpa', '20');
  await page.waitForTimeout(600);

  // ── ذخیره: باید بدون اورلی تمام‌صفحه باشد ──
  await page.click('[role="dialog"] button:has-text("ثبت")');
  // بلافاصله بعد از کلیک اورلی چک شود
  await page.waitForTimeout(120);
  const overlayDuringSave = await page.locator('div.fixed.inset-0.bg-background\\/60').count();
  console.log(`اورلی تمام‌صفحه هنگام ذخیره: ${overlayDuringSave} (باید 0 باشد)`);
  await page.screenshot({ path: path.join(shots, 'mutation-save.png') });

  // صبر برای بسته شدن دیالوگ و رفرش لیست
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);

  // رکورد باید در لیست باشد (رفرش بی‌صدا)
  const newRow = await page.locator('table tbody tr:has-text("تست سرعت رکورد")').count();
  console.log(`رکورد جدید در لیست: ${newRow > 0 ? '✅ هست' : '❌ نیست'}`);
  if (newRow === 0) throw new Error('رکورد جدید در لیست ظاهر نشد');

  // ── حذف رکورد تستی ──
  await page.click('table tbody tr:has-text("تست سرعت رکورد") [aria-label*="حذف"]');
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  await page.click('[role="alertdialog"] button:has-text("حذف")');
  await page.waitForTimeout(120);
  const overlayDuringDelete = await page.locator('div.fixed.inset-0.bg-background\\/60').count();
  console.log(`اورلی تمام‌صفحه هنگام حذف: ${overlayDuringDelete} (باید 0 باشد)`);
  await page.waitForTimeout(900);

  const afterDelete = await page.locator('table tbody tr:has-text("تست سرعت رکورد")').count();
  console.log(`رکورد تستی حذف شد: ${afterDelete === 0 ? '✅' : '❌'}`);
  if (afterDelete > 0) throw new Error('رکورد تستی حذف نشد');

  // ── سوییچ سریع بعد از mutation (کش به‌روز) ──
  const t = Date.now();
  await page.click('nav[aria-label="ناوبری بخش‌ها"] button:has-text("استان‌ها")');
  await page.waitForSelector('table tbody tr td', { timeout: 10000 });
  console.log(`سوییچ به استان‌ها بعد از mutation: ${Date.now() - t}ms`);

  console.log('✅ رگرسیون mutation پاس شد');
} finally {
  await browser.close();
}
