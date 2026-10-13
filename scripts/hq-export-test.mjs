// E2E: ستاد exports — parent payment summary + rank→unit hierarchy (Excel & PDF)
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/.tmp/test-out';
fs.mkdirSync(OUT, { recursive: true });

const GRADE_NAMES = { 1: 'اول', 2: 'دوم', 3: 'سوم', 4: 'چهارم', 5: 'پنجم', 6: 'ششم', 7: 'هفتم', 8: 'هشتم', 9: 'نهم', 10: 'دهم', 11: 'یازدهم', 12: 'دوازدهم' };
const gradeLabel = (g) => (g === null || g === undefined ? 'دانشجو' : `پایه ${GRADE_NAMES[g] ?? g}`);
const groupOfGrade = (g) => (g === null || g === undefined ? 'UNI' : g <= 3 ? 'G1_3' : g <= 6 ? 'G4_6' : g <= 9 ? 'G7_9' : 'G10_12');
const normFa = (s) =>
  (s ?? '')
    .replace(/ي/g, 'ی').replace(/ى/g, 'ی').replace(/ك/g, 'ک').replace(/ئ/g, 'ی')
    .replace(/[ۀة]/g, 'ه').replace(/[أإٱآ]/g, 'ا')
    .replace(/\u200c/g, ' ').replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  // ---------- login ----------
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const pwd = page.locator('input[type="password"]');
  await pwd.waitFor({ state: 'visible', timeout: 30000 });
  await pwd.fill('1234');
  await page.getByRole('button', { name: /ورود به سامانه/ }).click();
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForTimeout(500);

  // ---------- bootstrap ----------
  const boot = await page.evaluate(async () => {
    const r = await fetch('/api/bootstrap', { credentials: 'include' });
    return r.json();
  });
  const year = boot.years.find((y) => y.id === boot.activeYearId);
  const stad = year.sections.find((s) => s.name.includes('ستاد'));
  const prizes = boot.prizes;
  const yearId = year.id;
  const sectionId = stad.id;
  console.log('year:', year.name, '| ستاد students:', stad.studentCount, '| prizes:', JSON.stringify(prizes));

  const listStudents = () =>
    page.evaluate(async ({ yearId, sectionId }) => {
      const r = await fetch(`/api/students?yearId=${yearId}&sectionId=${sectionId}`, { credentials: 'include' });
      return (await r.json()).students;
    }, { yearId, sectionId });

  const before = await listStudents();
  console.log('existing ستاد students:', before.length);

  // ---------- idempotent: remove leftovers from previous runs ----------
  const seedNames = new Set(['سارا رضایی', 'امیر رضایی', 'نگار رضایی', 'رضا رضایی', 'ترانه حسینی', 'نیما حسینی']);
  for (const st of before) {
    if (seedNames.has(st.fullName)) {
      await page.evaluate(async (id) => {
        await fetch(`/api/students/${id}`, { method: 'DELETE', credentials: 'include' });
      }, st.id);
      console.log('removed leftover:', st.fullName);
    }
  }
  const baseline = (await listStudents()).length;
  console.log('baseline (after leftover cleanup):', baseline);

  // ---------- seed (same-name parent in two units → separation test) ----------
  const seed = [
    { fullName: 'سارا رضایی', gender: 'FEMALE', grade: 3, gpaRaw: 'خیلی خوب', parentName: 'علی رضایی', parentRank: '۲', parentUnit: 'امور مالی' },
    { fullName: 'امیر رضایی', gender: 'MALE', grade: 5, gpaRaw: 'خیلی خوب', parentName: 'علی رضایی', parentRank: '۲', parentUnit: 'امور مالی' },
    { fullName: 'نگار رضایی', gender: 'FEMALE', grade: 8, gpaRaw: '19.5', parentName: 'علی رضایی', parentRank: '۲', parentUnit: 'امور مالی' },
    { fullName: 'رضا رضایی', gender: 'MALE', grade: 10, gpaRaw: '18.5', parentName: 'علی رضایی', parentRank: '۳', parentUnit: 'فناوری اطلاعات' },
    { fullName: 'ترانه حسینی', gender: 'FEMALE', grade: 2, gpaRaw: 'خیلی خوب', parentName: 'مریم حسینی', parentRank: '۲', parentUnit: 'امور مالی' },
    { fullName: 'نیما حسینی', gender: 'MALE', grade: 2, gpaRaw: 'خیلی خوب', parentName: 'مریم حسینی', parentRank: '۲', parentUnit: 'امور مالی' },
  ];
  const created = [];
  for (const s of seed) {
    const res = await page.evaluate(async ({ body }) => {
      const r = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      return { status: r.status, json: await r.json() };
    }, { body: { ...s, yearId, sectionId } });
    if (res.status !== 201) throw new Error('seed failed: ' + JSON.stringify(res));
    created.push(res.json.student.id);
  }
  console.log('seeded:', created.length);

  // ---------- expected model ----------
  const students = await listStudents();
  const amountOf = (st) => prizes[groupOfGrade(st.grade)] ?? 0;
  const parentsMap = new Map();
  for (const st of students) {
    const key = [normFa(st.parentName), normFa(st.parentUnit), normFa(st.parentRank)].join('|');
    if (!parentsMap.has(key)) parentsMap.set(key, { name: st.parentName.trim() || '—', unit: st.parentUnit.trim(), rank: st.parentRank.trim(), list: [] });
    parentsMap.get(key).list.push(st);
  }
  const expectedParents = [...parentsMap.values()]
    .map((p) => ({
      name: p.name,
      unit: p.unit,
      rank: p.rank,
      count: p.list.length,
      amount: p.list.reduce((s, st) => s + amountOf(st), 0),
      grades: [...p.list].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99)).map((st) => gradeLabel(st.grade)).join('، '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa') || a.unit.localeCompare(b.unit, 'fa') || a.rank.localeCompare(b.rank, 'fa'));
  const grandAmount = students.reduce((s, st) => s + amountOf(st), 0);
  console.log('expected parents:', expectedParents.length, '| grand:', grandAmount);

  // ---------- navigate to ستاد + downloads ----------
  // PDF از state سمت کلاینت رندر می‌شود — بعد از seed باید صفحه رفرش شود
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('nav[aria-label="ناوبری بخش‌ها"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.locator('nav button', { hasText: 'ستاد' }).first().click();
  await page.waitForTimeout(900);

  const downloadViaMenu = async (menuBtnName, itemName, savePath) => {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      (async () => {
        await page.getByRole('button', { name: menuBtnName }).first().click();
        const item = page.getByRole('menuitem', { name: itemName }).first();
        await item.waitFor({ state: 'visible', timeout: 10000 });
        await item.click();
      })(),
    ]);
    await dl.saveAs(savePath);
    console.log('saved:', savePath, fs.statSync(savePath).size, 'bytes');
  };

  await downloadViaMenu('خروجی اکسل', 'والد شاغل (خلاصه پرداخت)', `${OUT}/hq-parent.xlsx`);
  await downloadViaMenu('خروجی اکسل', 'طبقه و واحد', `${OUT}/hq-rankunit.xlsx`);
  await downloadViaMenu('خروجی PDF', 'والد شاغل (خلاصه پرداخت)', `${OUT}/hq-parent.pdf`);
  await downloadViaMenu('خروجی PDF', 'طبقه و واحد', `${OUT}/hq-rankunit.pdf`);

  // ---------- verify parent summary xlsx ----------
  const wbP = new ExcelJS.Workbook();
  await wbP.xlsx.readFile(`${OUT}/hq-parent.xlsx`);
  const wsP = wbP.getWorksheet('والدین شاغل');
  if (!wsP) throw new Error('sheet والدین شاغل not found: ' + wbP.worksheets.map((w) => w.name).join(','));
  const headersP = [];
  for (let c = 1; c <= 7; c++) headersP.push(String(wsP.getCell(4, c).value ?? ''));
  console.log('parent headers:', JSON.stringify(headersP));
  const expHeadersP = ['ردیف', 'والد شاغل در سازمان', 'واحد سازمانی', 'طبقه', 'تعداد فرزندان', 'مقاطع فرزندان', 'مبلغ کل (تومان)'];
  if (headersP.join('|') !== expHeadersP.join('|')) throw new Error('parent headers mismatch');

  let r = 5;
  const gotParents = [];
  let totalRowP = null;
  while (true) {
    const v = wsP.getCell(r, 1).value;
    if (v === null || v === undefined || v === '') break;
    if (String(v).includes('جمع کل')) {
      totalRowP = { count: wsP.getCell(r, 5).value, amount: wsP.getCell(r, 7).value };
      break;
    }
    gotParents.push({
      name: String(wsP.getCell(r, 2).value ?? ''),
      unit: String(wsP.getCell(r, 3).value ?? ''),
      rank: String(wsP.getCell(r, 4).value ?? ''),
      count: Number(wsP.getCell(r, 5).value ?? 0),
      grades: String(wsP.getCell(r, 6).value ?? ''),
      amount: Number(wsP.getCell(r, 7).value ?? 0),
    });
    r += 1;
  }
  console.log('parent rows found:', gotParents.length);
  if (gotParents.length !== expectedParents.length) {
    throw new Error(`parent count mismatch: got ${gotParents.length} expected ${expectedParents.length}`);
  }
  for (let i = 0; i < expectedParents.length; i++) {
    const e = expectedParents[i];
    const g = gotParents[i];
    const label = `${e.name}/${e.unit}`;
    if (g.name !== e.name) throw new Error(`row ${i + 1} name: ${g.name} ≠ ${e.name}`);
    if (g.unit !== (e.unit || '—')) throw new Error(`${label} unit: ${g.unit} ≠ ${e.unit}`);
    if (g.count !== e.count) throw new Error(`${label} count: ${g.count} ≠ ${e.count}`);
    if (g.amount !== e.amount) throw new Error(`${label} amount: ${g.amount} ≠ ${e.amount}`);
    if (g.grades !== e.grades) throw new Error(`${label} grades: "${g.grades}" ≠ "${e.grades}"`);
  }
  // same-name parent separation: two rows with name علی رضایی but different units
  const aliRows = gotParents.filter((p) => p.name === 'علی رضایی');
  console.log('علی رضایی rows:', aliRows.length, '→', JSON.stringify(aliRows.map((p) => p.unit)));
  if (aliRows.length !== 2) throw new Error('same-name parent not separated!');
  if (!totalRowP || totalRowP.count !== students.length || totalRowP.amount !== grandAmount) {
    throw new Error(`grand total mismatch: ${JSON.stringify(totalRowP)} vs count=${students.length} amount=${grandAmount}`);
  }
  console.log('PARENT XLSX: PASS ✔');

  // ---------- verify rankUnit xlsx ----------
  const wbR = new ExcelJS.Workbook();
  await wbR.xlsx.readFile(`${OUT}/hq-rankunit.xlsx`);
  const wsR = wbR.getWorksheet('طبقه و واحد');
  if (!wsR) throw new Error('sheet طبقه و واحد not found');

  const rankOrder = [];
  let cur = null;
  let curUnit = null;
  let grandCellR = null;
  const studentRowsSeen = [];
  for (let rr = 5; rr <= wsR.rowCount; rr++) {
    const v1 = wsR.getCell(rr, 1).value;
    if (v1 === null || v1 === undefined || v1 === '') continue;
    const s = String(v1);
    if (s.startsWith('طبقه: ')) {
      cur = { rank: s.slice('طبقه: '.length).trim(), units: [], total: null };
      rankOrder.push(cur);
      curUnit = null;
    } else if (s.startsWith('واحد: ')) {
      curUnit = { label: s, amount: Number(wsR.getCell(rr, 9).value ?? 0), students: [] };
      cur.units.push(curUnit);
    } else if (s.startsWith('جمع طبقه: ')) {
      cur.total = Number(wsR.getCell(rr, 9).value ?? 0);
    } else if (s === 'جمع کل') {
      grandCellR = Number(wsR.getCell(rr, 9).value ?? 0);
    } else {
      const row = { name: String(wsR.getCell(rr, 2).value ?? ''), rank: String(wsR.getCell(rr, 7).value ?? ''), unit: String(wsR.getCell(rr, 8).value ?? '') };
      curUnit.students.push(row);
      studentRowsSeen.push(row);
    }
  }

  // expected rank→unit structure
  const expRank = new Map();
  for (const st of students) {
    const rk = (st.parentRank || '').trim() || '—';
    const un = (st.parentUnit || '').trim() || '—';
    if (!expRank.has(rk)) expRank.set(rk, new Map());
    const units = expRank.get(rk);
    if (!units.has(un)) units.set(un, []);
    units.get(un).push(st);
  }
  const expRanksSorted = [...expRank.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fa'));
  const studentKey = (st) => `${st.fullName}|${(st.parentRank || '').trim() || '—'}|${(st.parentUnit || '').trim() || '—'}`;
  const gotStudentKeys = new Set(studentRowsSeen.map((x) => `${x.name}|${x.rank}|${x.unit}`));
  const expStudentKeys = students.map(studentKey);
  if (gotStudentKeys.size !== students.length) throw new Error(`student rows: ${gotStudentKeys.size} ≠ ${students.length}`);
  for (const k of expStudentKeys) if (!gotStudentKeys.has(k)) throw new Error('missing student row: ' + k);

  if (rankOrder.length !== expRanksSorted.length) throw new Error(`rank sections: ${rankOrder.length} ≠ ${expRanksSorted.length}`);
  for (let i = 0; i < expRanksSorted.length; i++) {
    const [expRankLabel, expUnits] = expRanksSorted[i];
    const got = rankOrder[i];
    if (got.rank !== expRankLabel) throw new Error(`rank order: ${got.rank} ≠ ${expRankLabel}`);
    const expUnitsSorted = [...expUnits.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fa'));
    if (got.units.length !== expUnitsSorted.length) throw new Error(`units under ${expRankLabel}: ${got.units.length} ≠ ${expUnitsSorted.length}`);
    let expRankTotal = 0;
    for (let j = 0; j < expUnitsSorted.length; j++) {
      const [expUnitLabel, list] = expUnitsSorted[j];
      const gotUnit = got.units[j];
      if (!gotUnit.label.startsWith(`واحد: ${expUnitLabel}`)) throw new Error(`unit label: ${gotUnit.label} ≠ واحد: ${expUnitLabel}`);
      const expUnitTotal = list.reduce((s, st) => s + amountOf(st), 0);
      expRankTotal += expUnitTotal;
      if (gotUnit.amount !== expUnitTotal) throw new Error(`unit amount ${expRankLabel}/${expUnitLabel}: ${gotUnit.amount} ≠ ${expUnitTotal}`);
      if (gotUnit.students.length !== list.length) throw new Error(`unit student count ${expRankLabel}/${expUnitLabel}: ${gotUnit.students.length} ≠ ${list.length}`);
      for (const srow of gotUnit.students) {
        if (srow.rank !== expRankLabel || srow.unit !== expUnitLabel) {
          throw new Error(`student ${srow.name} in wrong section (${srow.rank}/${srow.unit} vs ${expRankLabel}/${expUnitLabel})`);
        }
      }
    }
    if (got.total !== expRankTotal) throw new Error(`rank total ${expRankLabel}: ${got.total} ≠ ${expRankTotal}`);
  }
  if (grandCellR !== grandAmount) throw new Error(`grand total: ${grandCellR} ≠ ${grandAmount}`);
  console.log('RANK-UNIT XLSX: PASS ✔ (ranks:', rankOrder.map((x) => x.rank).join('، '), ')');

  // ---------- cleanup ----------
  for (const id of created) {
    await page.evaluate(async (id) => {
      await fetch(`/api/students/${id}`, { method: 'DELETE', credentials: 'include' });
    }, id);
  }
  const after = await listStudents();
  if (after.length !== baseline) throw new Error(`cleanup failed: ${after.length} ≠ ${baseline}`);
  console.log('cleanup ok — ستاد back to', after.length, 'students');

  console.log('=== HQ EXPORT TESTS PASS ===');
} finally {
  await browser.close();
}
