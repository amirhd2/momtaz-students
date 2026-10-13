// Positive selection test: edit flow — its own province must remain selectable
// via typing + Enter (allowedNormTitle path)
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: false,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const pwd = page.locator('input[type="password"]');
  await pwd.waitFor({ state: 'visible', timeout: 30000 });
  await pwd.fill('1234');
  await page.getByRole('button', { name: /ورود به سامانه/ }).click();
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForTimeout(800);

  await page.locator('nav button', { hasText: 'استان‌ها' }).click();
  await page.waitForTimeout(600);

  // open edit dialog of first record
  const editBtn = page.locator('button[aria-label^="ویرایش"]').first();
  await editBtn.waitFor({ state: 'visible', timeout: 10000 });
  await editBtn.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await page.waitForTimeout(300);

  const currentTitle = await page.locator('[role="dialog"] button[aria-label="انتخاب استان"]').textContent();
  console.log('current province in edit:', currentTitle?.trim());

  // open popover, type own province name, press Enter
  await page.locator('button[aria-label="انتخاب استان"]').click();
  await page.waitForSelector('[data-slot="popover-content"]', { timeout: 5000 });
  await page.waitForTimeout(250);
  const searchBox = page.getByPlaceholder(/تایپ کنید تا نام استان فیلتر شود/);
  const name = (currentTitle || '').replace('انتخاب استان...', '').trim();
  await searchBox.fill(name);
  await page.waitForTimeout(300);
  const selectable = await page
    .locator('[data-slot="popover-content"] [role="listbox"] button:not([disabled])')
    .count();
  console.log('own province selectable rows after filter:', selectable);
  await searchBox.press('Enter');
  await page.waitForTimeout(300);
  const newValue = await page.locator('[role="dialog"] button[aria-label="انتخاب استان"]').textContent();
  const popoverClosed = (await page.locator('[data-slot="popover-content"]').count()) === 0;
  console.log('after Enter value:', newValue?.trim(), '| popover closed:', popoverClosed);

  const ok = newValue?.includes(name) && popoverClosed;
  console.log(`=== EDIT-FLOW TYPE-SELECT: ${ok ? 'PASS' : 'FAIL'} ===`);

  // close without saving
  await page.getByRole('button', { name: 'انصراف' }).click();
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}
