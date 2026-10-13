// تست E2E: دکمه‌های «ترتیب نمایش» (جدیدترین/الفبایی) در صفحه استان‌ها
// ۱) دکمه انتخاب‌شده با همان سرمه‌ای پررنگ هدر (bg-primary) مشخص باشد
// ۲) دکمه انتخاب‌نشده کاملاً متمایز (پس‌زمینه شفاف/خاکستری) باشد
// ۳) aria-pressed درست باشد
// ۴) سوییچ بین دو حالت واقعاً ترتیب ردیف‌ها را عوض کند (الفبایی = مرتب‌شده فارسی)
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const shots = path.join(process.cwd(), 'scripts', 'shots');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

let failed = false;
const check = (cond, msg) => {
  console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failed = true;
};

/** جمع‌کردن عنوان استان‌ها به ترتیب نمایش فعلی */
const rowTitles = async (page) =>
  page.$$eval('div.max-h-\\[440px\\] table tbody tr td:first-child', (cells) =>
    cells.map((c) => c.textContent?.trim() ?? '')
  );

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="password"]', '1234');
  await page.click('button:has-text("ورود به سامانه")');
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.click('nav[aria-label="ناوبری بخش‌ها"] button:has-text("استان‌ها")');
  await page.waitForSelector('div.max-h-\\[440px\\] table tbody tr', { timeout: 15000 });
  await page.waitForTimeout(500);

  // ── ساختار دکمه‌ها ──
  const recentBtn = page.locator('button:has-text("جدیدترین")').first();
  const alphaBtn = page.locator('button:has-text("الفبایی")').first();
  check((await recentBtn.count()) === 1, 'دکمه «جدیدترین» وجود دارد');
  check((await alphaBtn.count()) === 1, 'دکمه «الفبایی» وجود دارد');

  // رنگ مرجع: سرمه‌ای هدر (bg-primary)
  const headerColor = await page.$eval('header', (el) => getComputedStyle(el).backgroundColor);
  console.log(`  رنگ هدر (مرجع bg-primary): ${headerColor}`);

  const bgOf = (loc) =>
    loc.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
    }));

  /** دورکردن موس از دکمه‌ها تا حالت hover رنگ را عوض نکند */
  const parkMouse = async () => {
    await page.mouse.move(5, 500);
    await page.waitForTimeout(150);
  };

  // ── حالت پیش‌فرض: جدیدترین انتخاب باشد ──
  const recentState = await bgOf(recentBtn);
  const alphaState0 = await bgOf(alphaBtn);
  check(
    recentState.bg === headerColor,
    `حالت پیش‌فرض: «جدیدترین» با سرمه‌ای هدر پر شده (${recentState.bg})`
  );
  check(
    alphaState0.bg !== headerColor,
    `حالت پیش‌فرض: «الفبایی» پررنگ نیست (${alphaState0.bg})`
  );
  check(
    (await recentBtn.getAttribute('aria-pressed')) === 'true' &&
      (await alphaBtn.getAttribute('aria-pressed')) === 'false',
    'aria-pressed حالت پیش‌فرض درست است'
  );

  const titlesRecent = await rowTitles(page);

  // ── سوییچ به الفبایی ──
  await alphaBtn.click();
  await parkMouse();
  const alphaState = await bgOf(alphaBtn);
  const recentState1 = await bgOf(recentBtn);
  check(alphaState.bg === headerColor, `بعد از کلیک: «الفبایی» سرمه‌ای شد (${alphaState.bg})`);
  check(
    recentState1.bg !== headerColor,
    `بعد از کلیک: «جدیدترین» دیگر پررنگ نیست (${recentState1.bg})`
  );
  check(
    (await alphaBtn.getAttribute('aria-pressed')) === 'true' &&
      (await recentBtn.getAttribute('aria-pressed')) === 'false',
    'aria-pressed بعد از سوییچ درست است'
  );

  // ── ترتیب واقعی: لیست الفبایی باید دقیقاً مرتب‌شده فارسی باشد ──
  const titlesAlpha = await rowTitles(page);
  const sortedFa = [...titlesAlpha].sort((a, b) => a.localeCompare(b, 'fa'));
  const sameOrder =
    titlesAlpha.length === sortedFa.length &&
    titlesAlpha.every((t, i) => t === sortedFa[i]);
  check(sameOrder, `حالت الفبایی: ردیف‌ها مرتب فارسی‌اند (${titlesAlpha.length} ردیف)`);
  check(
    titlesAlpha.length === titlesRecent.length,
    'تعداد ردیف‌ها در دو حالت یکی است'
  );
  const orderChanged = titlesAlpha.some((t, i) => t !== titlesRecent[i]);
  check(orderChanged, 'سوییچ سورت واقعاً ترتیب نمایش را عوض کرد');

  await page.screenshot({ path: path.join(shots, 'sort-toggle-alpha.png') });

  // ── برگشت به جدیدترین ──
  await recentBtn.click();
  await parkMouse();
  const recentState2 = await bgOf(recentBtn);
  const titlesRecent2 = await rowTitles(page);
  check(
    recentState2.bg === headerColor,
    'برگشت به «جدیدترین»: دوباره سرمه‌ای شد'
  );
  const backSame =
    titlesRecent2.length === titlesRecent.length &&
    titlesRecent2.every((t, i) => t === titlesRecent[i]);
  check(backSame, 'ترتیب جدیدترین دقیقاً مثل قبل از سوییچ برگشت');

  await page.screenshot({ path: path.join(shots, 'sort-toggle-recent.png') });
} finally {
  await browser.close();
}

console.log(failed ? '❌ برخی تست‌ها رد شدند' : '✅ همه تست‌ها پاس شد');
process.exit(failed ? 1 : 0);
