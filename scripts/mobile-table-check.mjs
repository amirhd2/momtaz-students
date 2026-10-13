// Mobile check: province table horizontal scroll + sticky vertical header together
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const pwd = page.locator('input[type="password"]');
  await pwd.waitFor({ state: 'visible', timeout: 30000 });
  await pwd.fill('1234');
  await page.getByRole('button', { name: /ورود به سامانه/ }).click();
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForTimeout(600);

  await page.locator('nav button', { hasText: 'استان‌ها' }).click();
  await page.waitForTimeout(1000);

  const res = await page.evaluate(() => {
    const scrollDiv = document.querySelector('div[class*="max-h-[440px]"]');
    const thead = scrollDiv.querySelector('thead');
    const before = thead.getBoundingClientRect().top;
    // horizontal scroll to the left edge (RTL: scrollLeft negative in Chrome)
    scrollDiv.scrollLeft = -400;
    // vertical scroll
    scrollDiv.scrollTop = 200;
    return new Promise((resolve) => setTimeout(() => {
      resolve({
        scrollWidth: scrollDiv.scrollWidth,
        clientWidth: scrollDiv.clientWidth,
        horizScrollable: scrollDiv.scrollWidth > scrollDiv.clientWidth,
        scrollLeft: scrollDiv.scrollLeft,
        scrollTop: scrollDiv.scrollTop,
        stickyDrift: Math.abs(thead.getBoundingClientRect().top - before),
      });
    }, 350));
  });
  console.log(JSON.stringify(res, null, 2));
  if (!res.horizScrollable) throw new Error('table should be horizontally scrollable on mobile');
  if (res.scrollLeft === 0) throw new Error('horizontal scroll did not apply');
  if (res.scrollTop < 150) throw new Error('vertical scroll did not apply');
  if (res.stickyDrift > 2) throw new Error('sticky header drifted during combined scroll');
  console.log('=== MOBILE COMBINED SCROLL PASS ===');
} finally {
  await browser.close();
}
