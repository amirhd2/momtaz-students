import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4174;
const BASE = `http://localhost:${PORT}/momtaz-students`;
const server = spawn('node', ['scripts/serve-out.mjs', 'out', String(PORT)], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 200));
});
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.fill('input[type="password"]', '1234');
await page.click('button[type="submit"]');
await page.waitForSelector('text=ستاد', { timeout: 15000 });

await page.click('button[aria-label="افزودن دانش‌آموز جدید"]');
await page.waitForSelector('div[role="dialog"]');

await page.fill('div[role="dialog"] input[placeholder="مثال: علی محمدی"] >> nth=0', 'علی محمدی تست استاتیک');
await page.click('div[role="dialog"] label[for="gender-m"]');

// مقطع — تایپ با رویدادهای واقعی کیبورد
const grade = page.locator('#student-grade');
await grade.click();
await grade.pressSequentially('پنجم', { delay: 60 });
await page.waitForTimeout(400);
console.log('grade value:', await grade.inputValue());

await page.fill('div[role="dialog"] input[placeholder*="19.75"]', '20');
await page.waitForTimeout(300);
await page.fill('div[role="dialog"] input[placeholder="مثال: علی محمدی"] >> nth=1', 'رضا محمدی');
await page.waitForTimeout(900);

// وضعیت دکمه ثبت
const btn = page.locator('div[role="dialog"] button:has-text("ثبت دانش‌آموز")');
console.log('submit disabled?', await btn.isDisabled());
await btn.click();
await page.waitForTimeout(1500);

const dlgText = await page.locator('div[role="dialog"]').textContent().catch(() => '');
console.log('dialog text:', dlgText?.replace(/\s+/g, ' ').slice(0, 400));
const toastText = await page.locator('[data-sonner-toast]').allTextContents().catch(() => []);
console.log('toasts:', toastText.join(' | ').slice(0, 300));
const dialogOpen = await page.locator('div[role="dialog"]').count();
console.log('dialog still open?', dialogOpen > 0);
const rowCount = await page.locator('td:has-text("علی محمدی تست استاتیک")').count();
console.log('row count:', rowCount);
await page.screenshot({ path: 'scripts/shots/debug-static-form.png' });

await browser.close();
server.kill();
