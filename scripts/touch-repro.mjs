// Touch-scroll reproduction test for dropdowns inside Radix layers
// Usage: node scripts/touch-repro.mjs [--label before|after]
import { chromium } from 'playwright';

const label = process.argv[2] || 'run';
const BASE = 'http://localhost:3000';

async function touchSwipe(cdp, x1, y1, x2, y2, steps = 10, delayMs = 12) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x1, y: y1, id: 1 }],
  });
  for (let i = 1; i <= steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps;
    const y = y1 + ((y2 - y1) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, id: 1 }],
    });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const results = [];
function report(name, data) {
  results.push({ name, ...data });
  console.log(`\n[${label}] ${name}`);
  console.log(JSON.stringify(data, null, 2));
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ---- login ----
  const pwd = page.locator('input[type="password"]');
  await pwd.waitFor({ state: 'visible', timeout: 30000 });
  await pwd.fill('1234');
  await page.getByRole('button', { name: /ورود به سامانه/ }).click();
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForTimeout(800);

  // ================= TEST 1: Province popover touch scroll =================
  await page.locator('nav button', { hasText: 'استان‌ها' }).click();
  await page.waitForTimeout(600);

  // open create dialog
  await page.locator('button[aria-label^="افزودن"]').first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });

  // open province popover
  await page.locator('button[aria-label="انتخاب استان"]').click();
  await page.waitForSelector('[data-slot="popover-content"]', { timeout: 10000 });
  await page.waitForTimeout(400);

  const provScroll = page.locator('[data-slot="popover-content"] div.overflow-y-auto').first();
  const provBox = await provScroll.boundingBox();
  report('province list box', { box: provBox });

  const s0 = await provScroll.evaluate((el) => ({ scrollTop: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight }));
  // swipe UP inside the list (finger from bottom to top => scroll down)
  const cx = provBox.x + provBox.width / 2;
  const y1 = provBox.y + provBox.height - 25;
  const y2 = provBox.y + 25;
  await touchSwipe(cdp, cx, y1, cx, y2, 10, 15);
  await page.waitForTimeout(400);
  const s1 = await provScroll.evaluate((el) => ({ scrollTop: el.scrollTop }));

  // swipe DOWN (finger from top to bottom => scroll back up)
  await touchSwipe(cdp, cx, provBox.y + 25, cx, provBox.y + provBox.height - 25, 10, 15);
  await page.waitForTimeout(400);
  const s2 = await provScroll.evaluate((el) => ({ scrollTop: el.scrollTop }));

  report('province popover touch scroll', {
    before: s0,
    afterSwipeUp: s1,
    afterSwipeDown: s2,
    scrolled: s1.scrollTop > s0.scrollTop,
    scrollableBack: s2.scrollTop < s1.scrollTop,
  });

  // --- typing filter test: type "تهران", verify filtering ---
  const searchBox = page.getByPlaceholder(/تایپ کنید تا نام استان فیلتر شود/);
  const popoverOpen = async () => (await page.locator('[data-slot="popover-content"]').count()) > 0;
  const openPopover = async () => {
    if (await popoverOpen()) return;
    await page.locator('button[aria-label="انتخاب استان"]').click();
    await page.waitForSelector('[data-slot="popover-content"]', { timeout: 5000 });
    await page.waitForTimeout(250);
  };
  const closePopover = async () => {
    if (!(await popoverOpen())) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  };

  await openPopover();
  await searchBox.fill('تهران');
  await page.waitForTimeout(300);
  const allRows = await page.locator('[data-slot="popover-content"] [role="listbox"] button').count();
  report('province type-to-filter', { query: 'تهران', filteredRowCount: allRows, filteredToOne: allRows === 1 });
  await closePopover();

  // --- positive selection: type the name of the first selectable province, press Enter ---
  await openPopover();
  const firstSelectable = (
    await page.locator('[data-slot="popover-content"] [role="listbox"] button:not([disabled])').allTextContents()
  )[0]?.replace(/\s+/g, ' ').trim();
  if (firstSelectable) {
    await searchBox.fill(firstSelectable);
    await page.waitForTimeout(300);
    await searchBox.press('Enter');
    await page.waitForTimeout(300);
    const pickedValue = (await page.locator('button[aria-label="انتخاب استان"]').textContent())?.replace(/\s+/g, ' ').trim();
    report('province type-to-select', {
      typed: firstSelectable,
      pickedValue,
      pickedCorrectly: pickedValue?.includes(firstSelectable) && !(await popoverOpen()),
    });
  } else {
    report('province type-to-select', { skipped: 'all provinces have data (all disabled)', pickedCorrectly: true });
  }

  // --- no-results state ---
  await openPopover();
  await searchBox.fill('XYZNOTEXIST');
  await page.waitForTimeout(300);
  const emptyMsg = await page.locator('[data-slot="popover-content"]').textContent();
  report('province search empty state', { hasEmptyMessage: emptyMsg?.includes('یافت نشد') });
  await closePopover();

  // close popover + dialog
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // fallback: click انصراف if dialog still open
  const cancelBtn = page.getByRole('button', { name: 'انصراف' });
  if (await cancelBtn.first().isVisible().catch(() => false)) {
    await cancelBtn.first().click();
  }
  await page.waitForTimeout(400);

  // ================= TEST 2: ستاد grade autocomplete =================
  // go to ستاد section (first INDIVIDUAL section named ستاد)
  const stnadBtn = page.locator('nav button', { hasText: 'ستاد' }).first();
  if (await stnadBtn.count()) {
    await stnadBtn.click();
    await page.waitForTimeout(600);

    // open new student dialog
    await page.locator('button[aria-label^="افزودن"]').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
    await page.waitForTimeout(300);

    const gradeInput = page.locator('#student-grade');
    await gradeInput.click();
    await page.waitForTimeout(400);

    // count visible suggestions
    const ul = page.locator('#student-grade ~ ul, div.relative ul[role="listbox"]').first();
    const liCount = await ul.locator('li').count();
    const ulBox = await ul.boundingBox();
    report('grade suggestions', { liCount, ulBox, expectedAll: 13 });

    if (ulBox) {
      const g0 = await ul.evaluate((el) => el.scrollTop);
      const cx2 = ulBox.x + ulBox.width / 2;
      await touchSwipe(cdp, cx2, ulBox.y + ulBox.height - 20, cx2, ulBox.y + 20, 10, 15);
      await page.waitForTimeout(400);
      const g1 = await ul.evaluate((el) => el.scrollTop);
      report('grade list touch scroll', {
        before: g0,
        after: g1,
        scrolled: g1 > g0,
      });
    }
  }

  const prov = results.find((r) => r.name === 'province popover touch scroll');
  const grade = results.find((r) => r.name === 'grade list touch scroll');
  const typeToSel = results.find((r) => r.name === 'province type-to-select');
  const typeToFilter = results.find((r) => r.name === 'province type-to-filter');
  const emptyState = results.find((r) => r.name === 'province search empty state');
  const ok =
    prov?.scrolled && prov?.scrollableBack && grade?.scrolled && typeToSel?.pickedCorrectly && typeToFilter?.filteredToOne && emptyState?.hasEmptyMessage;
  console.log(`\n=== RESULT [${label}]: ${ok ? 'ALL TOUCH/UX CHECKS PASS' : 'CHECKS FAILED'} ===`);
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}
