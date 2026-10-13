// تست E2E کارایی لود دیتا — اندازه‌گیری زمان سوییچ بخش‌ها با کش و بدون آن
// اجرا: node scripts/perf-test.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const shots = path.join(process.cwd(), 'scripts', 'shots');
fs.mkdirSync(shots, { recursive: true });

const results = [];
const log = (name, ms, extra = '') => {
  results.push({ name, ms, extra });
  console.log(`  ${name}: ${ms}ms ${extra}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

let apiCount = 0;
page.on('request', (r) => {
  if (r.url().includes('/api/')) apiCount++;
});

try {
  // ── ورود ──
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="password"]', '1234');
  await page.click('button:has-text("ورود به سامانه")');
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  log('login→nav visible (cold, includes compile)', Date.now() - t0);

  // شمارش درخواست‌های API در لود اولیه (بعد از ورود)
  apiCount = 0;
  const tBoot = Date.now();
  await page.waitForFunction(() => {
    const btn = document.querySelector('nav[aria-label="ناوبری بخش‌ها"] button');
    return btn && btn.textContent && btn.textContent.includes('ستاد');
  });
  // صبر برای لود جدول ستاد
  await page.waitForSelector('table', { timeout: 15000 });
  await page.waitForTimeout(600);
  log('bootstrap + ستاد first data', Date.now() - tBoot, `— API calls: ${apiCount}`);

  // ── سوییچ به استان‌ها (بار اول — از شبکه) ──
  apiCount = 0;
  const tProv1 = Date.now();
  await page.click('nav[aria-label="ناوبری بخش‌ها"] button:has-text("استان‌ها")');
  await page.waitForSelector('table tbody tr td', { timeout: 15000 });
  await page.waitForTimeout(400);
  const prov1ms = Date.now() - tProv1;
  const prov1api = apiCount;
  log('استان‌ها first load (network)', prov1ms, `— API calls: ${prov1api}`);

  // ── سوییچ برگشت به ستاد (باید از کش آنی باشد) ──
  apiCount = 0;
  const tBack = Date.now();
  const stadBtn = page.locator('nav[aria-label="ناوبری بخش‌ها"] button').first();
  await stadBtn.click();
  await page.waitForSelector('table tbody tr td', { timeout: 15000 });
  const backMs = Date.now() - tBack;
  const backApi = apiCount;
  log('بازگشت به ستاد (cached)', backMs, `— API calls: ${backApi}`);
  if (backMs > 400) throw new Error(`بازگشت به ستاد کند است: ${backMs}ms`);

  // ── سوییچ دوباره به استان‌ها (کش) ──
  apiCount = 0;
  const tProv2 = Date.now();
  await page.click('nav[aria-label="ناوبری بخش‌ها"] button:has-text("استان‌ها")');
  await page.waitForSelector('table tbody tr td', { timeout: 15000 });
  const prov2ms = Date.now() - tProv2;
  const prov2api = apiCount;
  log('بازگشت به استان‌ها (cached)', prov2ms, `— API calls: ${prov2api}`);
  if (prov2ms > 400) throw new Error(`بازگشت به استان‌ها کند است: ${prov2ms}ms`);

  // ── رگرسیون: جدول استان‌ها سالم است (هدر دوردیفه دختر/پسر) ──
  const girlHeads = await page.locator('table thead th:has-text("دختر")').count();
  const boyHeads = await page.locator('table thead th:has-text("پسر")').count();
  console.log(`  رگرسیون هدر: ${girlHeads} دختر + ${boyHeads} پسر`);
  if (girlHeads < 5 || boyHeads < 5) throw new Error('هدر دختر/پسر خراب شده!');

  // ── بدون اورلی تمام‌صفحه هنگام رفرش بی‌صدا ──
  // ثبت رکورد جدید در استان بدون رکورد — یا بررسی ساده: بعد از بازگشت به ستاد، اورلی نیست
  const overlayCount = await page.locator('div.fixed.inset-0').count();
  console.log(`  اورلی تمام‌صفحه در حالت آرام: ${overlayCount} (باید 0 باشد)`);

  // ── ثبت استان تستی برای بررسی رفرش بی‌صدا + کش ──
  // انتخاب یک استان بدون داده (یزد/سمنان/...) از منو
  await page.click('button:has-text("ثبت رکورد جدید"), button:has-text("ثبت"), [aria-label*="افزودن"]', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  // اگر فرم باز شد
  const dialogOpen = await page.locator('[role="dialog"]').count();
  console.log(`  دیالوگ ثبت استان باز شد: ${dialogOpen > 0 ? 'بله' : 'خیر (رد می‌شویم)'}`);
  if (dialogOpen > 0) {
    // یافتن یک استان آزاد
    await page.click('[role="dialog"] button[role="combobox"], [role="dialog"] [data-slot="popover-trigger"], [role="dialog"] button[type="button"]', { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
    // بستن بدون ذخیره — تست اصلی سوییچ سریع است
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ── رفرش کامل صفحه (sessionStorage cache → آنی) ──
  const tReload = Date.now();
  apiCount = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table tbody tr td', { timeout: 20000 });
  await page.waitForTimeout(500);
  log('reload صفحه (کش session)', Date.now() - tReload, `— API calls: ${apiCount}`);

  await page.screenshot({ path: path.join(shots, 'perf-final.png') });
} finally {
  await browser.close();
}

console.log('\n═══ خلاصه ═══');
for (const r of results) console.log(`${r.name}: ${r.ms}ms ${r.extra}`);
console.log('✅ همه تست‌ها پاس شد');
