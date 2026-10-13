// Test: sticky header on province table + دختر/پسر split columns
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/.tmp/test-out';
import fs from 'fs';
fs.mkdirSync(OUT, { recursive: true });

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

  await page.locator('nav button', { hasText: 'استان‌ها' }).click();
  await page.waitForTimeout(1000);

  const thead = page.locator('thead').first();
  await thead.waitFor({ state: 'visible', timeout: 15000 });

  // --- 1) دختر/پسر sub-columns (scoped to the province table, not StatsBox) ---
  const dokhtarCount = await page.locator('.custom-scroll thead th', { hasText: 'دختر' }).count();
  const pesarCount = await page.locator('.custom-scroll thead th', { hasText: 'پسر' }).count();
  console.log('دختر header cells:', dokhtarCount, '| پسر header cells:', pesarCount);
  if (dokhtarCount !== 5 || pesarCount !== 5) throw new Error('Expected 5+5 دختر/پسر header cells');

  // first data row should have 14 cells and total = sum of 10 gender cells
  const firstRow = page.locator('.custom-scroll tbody tr').first();
  const cellCount = await firstRow.locator('td').count();
  console.log('first row cell count:', cellCount);
  if (cellCount !== 14) throw new Error('Expected 14 cells per row, got ' + cellCount);

  const cells = await firstRow.locator('td').allInnerTexts();
  const fa2en = (s) => Number(s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[,٬,]/g, '').trim());
  const genderSum = cells.slice(1, 11).reduce((acc, v) => acc + fa2en(v), 0);
  const rowTotal = fa2en(cells[11]);
  console.log('sum of 10 gender cells =', genderSum, '| جمع cell =', rowTotal);
  if (genderSum !== rowTotal) throw new Error(`Row total mismatch: ${genderSum} vs ${rowTotal}`);

  // sample: log first province gender split
  console.log('sample row:', JSON.stringify(cells.slice(0, 6)));

  // --- 2) sticky header ---
  const info = await page.evaluate(() => {
    const container = document.querySelector('.custom-scroll [data-slot="table-container"]');
    const scrollDiv = container.parentElement;
    const thead = document.querySelector('.custom-scroll thead');
    return {
      containerOverflowX: getComputedStyle(container).overflowX,
      scrollOverflowY: getComputedStyle(scrollDiv).overflowY,
      theadPosition: getComputedStyle(thead).position,
      theadTopBefore: thead.getBoundingClientRect().top,
      scrollRectTop: scrollDiv.getBoundingClientRect().top,
      tbodyFirstTopBefore: document.querySelector('.custom-scroll tbody tr').getBoundingClientRect().top,
      scrollHeight: scrollDiv.scrollHeight,
      clientHeight: scrollDiv.clientHeight,
    };
  });
  console.log('before scroll:', JSON.stringify(info));
  if (info.containerOverflowX !== 'visible') throw new Error('container overflow-x should be visible');
  if (info.theadPosition !== 'sticky') throw new Error('thead position should be sticky');

  // scroll down inside the table container
  await page.evaluate(() => {
    const scrollDiv = document.querySelector('.custom-scroll [data-slot="table-container"]').parentElement;
    scrollDiv.scrollTop = 160;
  });
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const container = document.querySelector('.custom-scroll [data-slot="table-container"]');
    const scrollDiv = container.parentElement;
    const thead = document.querySelector('.custom-scroll thead');
    return {
      scrollTop: scrollDiv.scrollTop,
      theadTopAfter: thead.getBoundingClientRect().top,
      tbodyFirstTopAfter: document.querySelector('.custom-scroll tbody tr').getBoundingClientRect().top,
    };
  });
  console.log('after scroll:', JSON.stringify(after));

  const drift = Math.abs(after.theadTopAfter - info.theadTopBefore);
  console.log('thead drift after scroll:', drift, 'px');
  if (after.scrollTop < 100) throw new Error('Scroll did not happen (content may be shorter than max-height)');
  if (drift > 2) throw new Error(`Sticky FAILED: thead moved ${drift}px when scrolling`);
  if (after.tbodyFirstTopAfter >= after.theadTopAfter) throw new Error('tbody should be under stuck header');

  console.log('STICKY HEADER: PASS ✔');

  // screenshot of scrolled state (the unique max-h-[440px] table scroll container)
  const tableWrap = page.locator('div[class*="max-h-[440px]"]').first();
  await tableWrap.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await tableWrap.screenshot({ path: `${OUT}/province-table-scrolled.png` });
  console.log('screenshot saved:', `${OUT}/province-table-scrolled.png`);

  console.log('=== ALL TABLE TESTS PASS ===');
} finally {
  await browser.close();
}
