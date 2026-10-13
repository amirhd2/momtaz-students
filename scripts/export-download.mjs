// Download province Excel + PDF exports in a real browser and save them for visual inspection
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const OUT = '/tmp/xlsx-check';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const pwd = page.locator('input[type="password"]');
  await pwd.waitFor({ state: 'visible', timeout: 30000 });
  await pwd.fill('1234');
  await page.getByRole('button', { name: /ورود به سامانه/ }).click();
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForTimeout(800);

  await page.locator('nav button', { hasText: 'استان‌ها' }).click();
  await page.waitForTimeout(800);

  // PDF export
  const [pdfDl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: 'خروجی PDF' }).click(),
  ]);
  const pdfPath = `${OUT}/province-ui.pdf`;
  await pdfDl.saveAs(pdfPath);
  console.log('PDF saved:', pdfPath, fs.statSync(pdfPath).size, 'bytes');

  // Excel export
  const [xlsDl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: 'خروجی اکسل' }).click(),
  ]);
  const xlsPath = `${OUT}/province-ui.xlsx`;
  await xlsDl.saveAs(xlsPath);
  console.log('XLSX saved:', xlsPath, fs.statSync(xlsPath).size, 'bytes');

  console.log('=== UI EXPORT DOWNLOADS PASS ===');
} finally {
  await browser.close();
}
