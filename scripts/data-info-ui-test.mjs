// تست UI: کارت «محل نگهداری داده‌ها» در تنظیمات → تب پشتیبان‌گیری
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const shots = path.join(process.cwd(), 'scripts', 'shots');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

let failed = false;
const check = (cond, msg) => {
  console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failed = true;
};

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="password"]', '1234');
  await page.click('button:has-text("ورود به سامانه")');
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });

  // ورود به تنظیمات (دکمه چرخ‌دنده هدر)
  await page.locator('header button[aria-label*="تنظیمات"], header button:has(svg.lucide-settings)').first().click();
  await page.waitForTimeout(600);

  // تب پشتیبان‌گیری
  await page.click('button[role="tab"]:has-text("پشتیبان‌گیری")');
  await page.waitForTimeout(800);

  const card = page.locator('text=محل نگهداری داده‌ها روی این سیستم');
  check((await card.count()) === 1, 'کارت «محل نگهداری داده‌ها» نمایش داده شد');

  const pathCode = page.locator('code.font-mono').first();
  const pathText = (await pathCode.textContent()) ?? '';
  check(pathText.includes('custom.db') || pathText.includes('data.db'), `مسیر فایل داده نمایش داده شد: ${pathText.trim()}`);

  const copyBtn = page.locator('button[aria-label="کپی مسیر"]');
  check((await copyBtn.count()) === 1, 'دکمه کپی مسیر وجود دارد');

  const bullets = await page.locator('text=هرگز داده‌های شما را پاک نمی‌کند').count();
  check(bullets >= 1, 'توضیح «آپدیت داده‌ها را پاک نمی‌کند» نمایش داده شد');

  // در dev پشتیبان خودکار گرفته نمی‌شود؛ لیست فقط وقتی پشتیبانی موجود باشد ظاهر می‌شود.
  // همیشه‌نمایش: توضیح پشتیبان خودکار در بندهای کارت
  const autoBk = await page.locator('text=پشتیبان خودکار').count();
  check(autoBk >= 1, 'توضیح پشتیبان خودکار در کارت نمایش داده شد');

  await page.screenshot({ path: path.join(shots, 'data-location-card.png') });
} finally {
  await browser.close();
}

console.log(failed ? '❌ برخی تست‌ها رد شدند' : '✅ همه تست‌ها پاس شد');
process.exit(failed ? 1 : 0);
