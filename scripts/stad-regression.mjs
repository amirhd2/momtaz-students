// Regression: ستاد (student-view) table — sticky header + horizontal scroll sanity
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const pwd = page.locator('input[type="password"]');
  await pwd.waitFor({ state: 'visible', timeout: 30000 });
  await pwd.fill('1234');
  await page.getByRole('button', { name: /ورود به سامانه/ }).click();
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForTimeout(600);

  await page.locator('nav button', { hasText: 'ستاد' }).click();
  await page.waitForTimeout(900);

  const res = await page.evaluate(() => {
    const container = document.querySelector('.custom-scroll [data-slot="table-container"]');
    if (!container) return { found: false };
    const scrollDiv = container.parentElement;
    const thead = scrollDiv.querySelector('thead');
    const before = thead.getBoundingClientRect().top;
    scrollDiv.scrollTop = 120;
    return new Promise((resolve) => setTimeout(() => {
      resolve({
        found: true,
        containerOverflowX: getComputedStyle(container).overflowX,
        scrollOverflowX: getComputedStyle(scrollDiv).overflowX,
        theadPos: getComputedStyle(thead).position,
        drift: Math.abs(thead.getBoundingClientRect().top - before),
        scrollTop: scrollDiv.scrollTop,
        scrollWidth: scrollDiv.scrollWidth,
        clientWidth: scrollDiv.clientWidth,
      });
    }, 300));
  });
  console.log(JSON.stringify(res, null, 2));
  if (!res.found) throw new Error('student table not found');
  if (res.containerOverflowX !== 'visible') throw new Error('inner container should be overflow-visible');
  if (res.theadPos !== 'sticky' || res.drift > 2) throw new Error('sticky failed on ستاد table');
  if (res.scrollWidth > res.clientWidth && res.scrollOverflowX !== 'auto') {
    throw new Error('wide table has no horizontal scrollbar');
  }
  console.log('=== ستاد TABLE REGRESSION PASS ===');
} finally {
  await browser.close();
}
