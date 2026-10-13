// منطق ساخت فایل‌های اکسل — مشترک بین نسخه سروری و نسخه مرورگری (استاتیک)
// هیچ وابستگی به دیتابیس یا Node ندارد؛ داده‌ها به‌صورت پارامتر تزریق می‌شوند.
// ماژول ExcelJS هم از بیرون تزریق می‌شود (سرور: exceljs — مرورگر: همان پکیج با فیلد browser).
import type ExcelJS from 'exceljs';
import { gradeLabel, GENDERS, formatGpaDisplay, normalizeFa } from '@/lib/persian';
import { groupOfGrade, GRADE_GROUPS, type GroupKey } from '@/lib/gpa';
import { IMPORT_HEADERS } from '@/lib/excel-import';

const HEADER_FILL = 'FF1F3A5F';
const SUBTOTAL_FILL = 'FFDCE6F1';
const TOTAL_FILL = 'FF1F3A5F';
const ALT_FILL = 'FFF2F6FB'; // ردیف یک‌درمیان خلاصه والدین
const SECTION_FILL = 'FFEEF3F9'; // ردیف واحد (سطح دوم)
const SAMPLE_FILL = 'FFF3F6FA';
const BORDER_COLOR = 'FFC9D4E3';

export interface ExportStudent {
  fullName: string;
  gender: string;
  grade: number | null;
  gpaRaw: string;
  gpaValue: number | null;
  parentName: string;
  parentRank: string;
  parentUnit: string;
  isException: boolean;
}

export interface ExportGroupRecord {
  title: string;
  counts: string;
}

export interface YearMeta {
  id: string;
  name: string;
}

export interface SectionMeta {
  id: string;
  name: string;
}

export function rateMapOf(prizes: Array<{ group: string; amount: number }>): Record<GroupKey, number> {
  return Object.fromEntries(
    GRADE_GROUPS.map((g) => [g.key, prizes.find((p) => p.group === g.key)?.amount ?? 0])
  ) as Record<GroupKey, number>;
}

function formatFa(n: number): string {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n));
}

function thinBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    left: { style: 'thin', color: { argb: BORDER_COLOR } },
    right: { style: 'thin', color: { argb: BORDER_COLOR } },
  };
}

interface StudentRow {
  name: string;
  gender: string;
  grade: number | null;
  gpa: string;
  parent: string;
  rank: string;
  unit: string;
  amount: number;
  exception: boolean;
}

function mapStudentRows(students: ExportStudent[], rates: Record<GroupKey, number>): StudentRow[] {
  return students.map((st) => ({
    name: st.fullName,
    gender: GENDERS[st.gender as keyof typeof GENDERS] ?? st.gender,
    grade: st.grade,
    gpa: formatGpaDisplay(st.gpaRaw, st.gpaValue),
    parent: st.parentName,
    rank: st.parentRank,
    unit: st.parentUnit,
    amount: rates[groupOfGrade(st.grade).key] ?? 0,
    exception: st.isException,
  }));
}

const STUDENT_HEADERS = [
  'ردیف',
  'نام و نام خانوادگی',
  'جنسیت',
  'مقطع',
  'معدل',
  'والد شاغل در سازمان',
  'طبقه',
  'واحد',
  'مبلغ جایزه (تومان)',
  'وضعیت',
];

const STUDENT_COL_WIDTHS = [
  { width: 6 }, // ردیف
  { width: 28 }, // نام
  { width: 8 }, // جنسیت
  { width: 14 }, // مقطع
  { width: 12 }, // معدل
  { width: 26 }, // والد
  { width: 12 }, // طبقه
  { width: 18 }, // واحد
  { width: 16 }, // مبلغ
  { width: 10 }, // وضعیت
];

function writeTitleAndDate(ws: ExcelJS.Worksheet, title: string, lastCol: number) {
  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, lastCol);
  const dateCell = ws.getCell(2, 1);
  dateCell.value = `تاریخ تهیه گزارش: ${new Date().toLocaleDateString('fa-IR')}`;
  dateCell.alignment = { horizontal: 'center' };
  dateCell.font = { size: 10, color: { argb: 'FF666666' } };
}

function writeHeaderRow(ws: ExcelJS.Worksheet, rowIndex: number, headers: string[]) {
  const headerRow = ws.getRow(rowIndex);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 24;
}

/** نویسنده ردیف دانش‌آموز (جدول ۱۰ ستونی) با شماره ردیف پیوسته */
function makeStudentRowWriter(ws: ExcelJS.Worksheet, state: { rowIndex: number }) {
  let serial = 0;
  return (row: StudentRow) => {
    serial += 1;
    const r = ws.getRow(state.rowIndex);
    r.getCell(1).value = serial;
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(2).value = row.name;
    r.getCell(3).value = row.gender;
    r.getCell(3).alignment = { horizontal: 'center' };
    r.getCell(4).value = gradeLabel(row.grade);
    r.getCell(4).alignment = { horizontal: 'center' };
    r.getCell(5).value = row.gpa;
    r.getCell(5).alignment = { horizontal: 'center' };
    r.getCell(6).value = row.parent || '—';
    r.getCell(7).value = row.rank || '—';
    r.getCell(7).alignment = { horizontal: 'center' };
    r.getCell(8).value = row.unit || '—';
    r.getCell(9).value = row.amount;
    r.getCell(9).numFmt = '#,##0';
    r.getCell(9).alignment = { horizontal: 'center' };
    r.getCell(10).value = row.exception ? 'استثنا' : '';
    r.getCell(10).alignment = { horizontal: 'center' };
    if (row.exception) {
      r.getCell(10).font = { color: { argb: 'FFB45309' }, bold: true };
      r.eachCell((cell) => {
        if (Number(cell.col) !== 10) cell.font = { ...cell.font, color: { argb: 'FF92400E' } };
      });
    }
    state.rowIndex += 1;
  };
}

/** ردیف سکشن: برچسب ادغام‌شده ستون ۱-۸ + مبلغ ادغام‌شده ستون ۹-۱۰ */
function writeSectionRow(
  ws: ExcelJS.Worksheet,
  state: { rowIndex: number },
  label: string,
  amount: number | null,
  fill: string
) {
  ws.mergeCells(state.rowIndex, 1, state.rowIndex, 8);
  const labelCell = ws.getCell(state.rowIndex, 1);
  labelCell.value = label;
  labelCell.font = { bold: true };
  labelCell.alignment = { horizontal: 'center' };
  labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  const amountCell = ws.getCell(state.rowIndex, 9);
  if (amount !== null) {
    amountCell.value = amount;
    amountCell.numFmt = '#,##0';
  }
  amountCell.font = { bold: true };
  amountCell.alignment = { horizontal: 'center' };
  amountCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  ws.getCell(state.rowIndex, 10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (amount !== null) ws.mergeCells(state.rowIndex, 9, state.rowIndex, 10);
  state.rowIndex += 1;
}

/** ردیف جمع کل نهایی برای جدول‌های ۱۰ ستونی */
function writeGrandTotal10(ws: ExcelJS.Worksheet, state: { rowIndex: number }, grandTotal: number) {
  ws.mergeCells(state.rowIndex, 1, state.rowIndex, 8);
  const labelCell = ws.getCell(state.rowIndex, 1);
  labelCell.value = 'جمع کل';
  const amountCell = ws.getCell(state.rowIndex, 9);
  amountCell.value = grandTotal;
  amountCell.numFmt = '#,##0';
  for (let c = 1; c <= 10; c++) {
    const cell = ws.getCell(state.rowIndex, c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
    cell.alignment = { horizontal: 'center' };
  }
  state.rowIndex += 1;
}

export interface StudentsSheetOpts {
  year: YearMeta;
  section: SectionMeta;
  rates: Record<GroupKey, number>;
  groupBy: string;
  students: ExportStudent[];
}

/** خروجی جزئی (نام دانش‌آموز + گروه‌بندی‌های تک‌کلیدی قدیمی rank/unit) */
export function buildStudentsSheet(workbook: ExcelJS.Workbook, opts: StudentsSheetOpts) {
  const { year, section, rates, groupBy, students } = opts;
  const ws = workbook.addWorksheet('دانش‌آموزان', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [...STUDENT_COL_WIDTHS];

  writeTitleAndDate(ws, `خروجی دانش‌آموزان ممتاز — بخش ${section.name} — سال تحصیلی ${year.name}`, 10);
  writeHeaderRow(ws, 4, STUDENT_HEADERS);

  const rows = mapStudentRows(students, rates);
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const state = { rowIndex: 5 };
  const writeStudentRow = makeStudentRowWriter(ws, state);

  if (groupBy === 'student') {
    rows.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    rows.forEach(writeStudentRow);
  } else {
    const keyOf = (row: StudentRow) =>
      (groupBy === 'parent' ? row.parent : groupBy === 'rank' ? row.rank : row.unit).trim() || '—';
    rows.sort((a, b) => keyOf(a).localeCompare(keyOf(b), 'fa') || a.name.localeCompare(b.name, 'fa'));
    const groupLabel = groupBy === 'parent' ? 'والد' : groupBy === 'rank' ? 'طبقه' : 'واحد';
    const groups = new Map<string, StudentRow[]>();
    for (const row of rows) {
      const key = keyOf(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    for (const [key, list] of groups) {
      const subtotal = list.reduce((s, r) => s + r.amount, 0);
      writeSectionRow(ws, state, `${groupLabel}: ${key}`, subtotal, SUBTOTAL_FILL);
      list.forEach(writeStudentRow);
    }
  }

  writeGrandTotal10(ws, state, grandTotal);
}

export interface ParentSummaryOpts {
  year: YearMeta;
  section: SectionMeta;
  rates: Record<GroupKey, number>;
  students: ExportStudent[];
}

/**
 * خلاصه پرداخت به ازای هر والد شاغل — مخصوص ارسال به واحد مالی.
 * هر والد یک ردیف: تعداد فرزندان + مقاطعشان + رقم کلی قابل واریز.
 * هویت والد = نام + واحد + طبقه (نرمال‌شده) تا والدین هم‌نام اشتباهی یکی نشوند.
 */
export function buildParentSummarySheet(workbook: ExcelJS.Workbook, opts: ParentSummaryOpts) {
  const { year, section, rates, students } = opts;
  const ws = workbook.addWorksheet('والدین شاغل', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  const lastCol = 7;
  ws.columns = [
    { width: 6 }, // ردیف
    { width: 28 }, // والد
    { width: 22 }, // واحد
    { width: 12 }, // طبقه
    { width: 12 }, // تعداد فرزندان
    { width: 46 }, // مقاطع فرزندان
    { width: 20 }, // مبلغ کل
  ];

  writeTitleAndDate(
    ws,
    `خلاصه پرداخت به ازای هر والد شاغل — بخش ${section.name} — سال تحصیلی ${year.name}`,
    lastCol
  );
  writeHeaderRow(ws, 4, [
    'ردیف',
    'والد شاغل در سازمان',
    'واحد سازمانی',
    'طبقه',
    'تعداد فرزندان',
    'مقاطع فرزندان',
    'مبلغ کل (تومان)',
  ]);

  const rows = mapStudentRows(students, rates);

  interface ParentGroup {
    name: string;
    unit: string;
    rank: string;
    list: StudentRow[];
  }
  const groups = new Map<string, ParentGroup>();
  for (const row of rows) {
    const key = [normalizeFa(row.parent), normalizeFa(row.unit), normalizeFa(row.rank)].join('|');
    let g = groups.get(key);
    if (!g) {
      g = { name: row.parent.trim() || '—', unit: row.unit.trim(), rank: row.rank.trim(), list: [] };
      groups.set(key, g);
    }
    g.list.push(row);
  }
  const parents = Array.from(groups.values()).sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'fa') ||
      a.unit.localeCompare(b.unit, 'fa') ||
      a.rank.localeCompare(b.rank, 'fa')
  );

  let rowIndex = 5;
  let serial = 0;
  let grandAmount = 0;
  let grandChildren = 0;

  for (const p of parents) {
    serial += 1;
    const kids = [...p.list].sort(
      (a, b) => (a.grade ?? 99) - (b.grade ?? 99) || a.name.localeCompare(b.name, 'fa')
    );
    const gradesText = kids.map((k) => gradeLabel(k.grade)).join('، ');
    const total = p.list.reduce((s, k) => s + k.amount, 0);
    grandAmount += total;
    grandChildren += p.list.length;

    const r = ws.getRow(rowIndex);
    const fill = serial % 2 === 0 ? ALT_FILL : null;
    const cells: Array<{ col: number; value: string | number; align: 'center' | 'right'; bold?: boolean; wrap?: boolean }> = [
      { col: 1, value: serial, align: 'center' },
      { col: 2, value: p.name, align: 'right', bold: true },
      { col: 3, value: p.unit || '—', align: 'right' },
      { col: 4, value: p.rank || '—', align: 'center' },
      { col: 5, value: p.list.length, align: 'center', bold: true },
      { col: 6, value: gradesText, align: 'right', wrap: true },
      { col: 7, value: total, align: 'center', bold: true },
    ];
    for (const c of cells) {
      const cell = r.getCell(c.col);
      cell.value = c.value;
      cell.alignment = { horizontal: c.align, vertical: 'middle', wrapText: Boolean(c.wrap) };
      if (c.bold) cell.font = { bold: true };
      if (c.col === 7) cell.numFmt = '#,##0';
      if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      thinBorder(cell);
    }
    r.height = 22;
    rowIndex += 1;
  }

  // ردیف جمع کل
  ws.mergeCells(rowIndex, 1, rowIndex, 4);
  ws.getCell(rowIndex, 1).value = 'جمع کل';
  ws.getCell(rowIndex, 5).value = grandChildren;
  const amountCell = ws.getCell(rowIndex, 7);
  amountCell.value = grandAmount;
  amountCell.numFmt = '#,##0';
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(rowIndex, c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    thinBorder(cell);
  }
}

export interface RankUnitOpts {
  year: YearMeta;
  section: SectionMeta;
  rates: Record<GroupKey, number>;
  students: ExportStudent[];
}

/** خروجی گروه‌بندی دوسطحی: طبقه → واحدهای همان طبقه → دانش‌آموزان */
export function buildRankUnitSheet(workbook: ExcelJS.Workbook, opts: RankUnitOpts) {
  const { year, section, rates, students } = opts;
  const ws = workbook.addWorksheet('طبقه و واحد', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [...STUDENT_COL_WIDTHS];

  writeTitleAndDate(
    ws,
    `خروجی دانش‌آموزان ممتاز بر حسب طبقه و واحد — بخش ${section.name} — سال تحصیلی ${year.name}`,
    10
  );
  writeHeaderRow(ws, 4, STUDENT_HEADERS);

  const rows = mapStudentRows(students, rates);
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  const byRank = new Map<string, Map<string, StudentRow[]>>();
  for (const row of rows) {
    const rk = row.rank.trim() || '—';
    const un = row.unit.trim() || '—';
    if (!byRank.has(rk)) byRank.set(rk, new Map());
    const units = byRank.get(rk)!;
    if (!units.has(un)) units.set(un, []);
    units.get(un)!.push(row);
  }
  const ranksSorted = Array.from(byRank.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fa'));

  const state = { rowIndex: 5 };
  const writeStudentRow = makeStudentRowWriter(ws, state);

  for (const [rank, units] of ranksSorted) {
    // هدر طبقه (سطح اول)
    ws.mergeCells(state.rowIndex, 1, state.rowIndex, 10);
    const rankCell = ws.getCell(state.rowIndex, 1);
    rankCell.value = `طبقه: ${rank}`;
    rankCell.font = { bold: true, size: 12, color: { argb: 'FF1F3A5F' } };
    rankCell.alignment = { horizontal: 'center', vertical: 'middle' };
    rankCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL_FILL } };
    ws.getRow(state.rowIndex).height = 22;
    state.rowIndex += 1;

    let rankTotal = 0;
    const unitsSorted = Array.from(units.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fa'));
    for (const [unit, list] of unitsSorted) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
      const unitTotal = list.reduce((s, r) => s + r.amount, 0);
      rankTotal += unitTotal;
      writeSectionRow(ws, state, `واحد: ${unit} — تعداد: ${formatFa(list.length)} نفر`, unitTotal, SECTION_FILL);
      list.forEach(writeStudentRow);
    }
    // جمع سطح اول
    writeSectionRow(ws, state, `جمع طبقه: ${rank}`, rankTotal, SUBTOTAL_FILL);
  }

  writeGrandTotal10(ws, state, grandTotal);
}

export interface ProvincesOpts {
  year: YearMeta;
  rates: Record<GroupKey, number>;
  sectionName: string | null;
  records: ExportGroupRecord[];
}

export function buildProvincesSheet(workbook: ExcelJS.Workbook, opts: ProvincesOpts) {
  const { year, rates, sectionName, records } = opts;
  const ws = workbook.addWorksheet('استان‌ها', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // ساختار ستون‌ها: استان | (دختر | پسر) × ۵ مقطع | جمع دانش‌آموزان | مبلغ کل
  const firstGroupCol = 2;
  const tsCol = firstGroupCol + GRADE_GROUPS.length * 2; // جمع دانش‌آموزان
  const amountCol = tsCol + 1; // مبلغ کل
  const lastCol = amountCol;

  ws.columns = [
    { width: 22 }, // استان / گروه
    ...GRADE_GROUPS.flatMap(() => [{ width: 8.5 }, { width: 8.5 }]),
    { width: 14 }, // جمع دانش‌آموزان
    { width: 18 }, // مبلغ کل
  ];

  // عنوان گزارش
  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = sectionName
    ? `خروجی گروه‌های بخش ${sectionName} — سال تحصیلی ${year.name}`
    : `خروجی استان‌ها — سال تحصیلی ${year.name}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, lastCol);
  const dateCell = ws.getCell(2, 1);
  dateCell.value = `تاریخ تهیه گزارش: ${new Date().toLocaleDateString('fa-IR')}`;
  dateCell.alignment = { horizontal: 'center' };
  dateCell.font = { size: 10, color: { argb: 'FF666666' } };

  // سربرگ دو ردیفه: ردیف ۴ عنوان مقاطع (هر کدام روی دو ستون دختر/پسر) و ردیف ۵ زیرعنوان‌ها
  const headerRowIndex = 4;
  const subRowIndex = 5;

  // ستون استان/گروه و ستون‌های جمع و مبلغ — ادغام عمودی دو ردیف
  ws.mergeCells(headerRowIndex, 1, subRowIndex, 1);
  ws.getCell(headerRowIndex, 1).value = sectionName ? 'گروه' : 'استان';
  ws.mergeCells(headerRowIndex, tsCol, subRowIndex, tsCol);
  ws.getCell(headerRowIndex, tsCol).value = 'جمع دانش‌آموزان';
  ws.mergeCells(headerRowIndex, amountCol, subRowIndex, amountCol);
  ws.getCell(headerRowIndex, amountCol).value = 'مبلغ کل (تومان)';

  GRADE_GROUPS.forEach((g, i) => {
    const c1 = firstGroupCol + i * 2;
    ws.mergeCells(headerRowIndex, c1, headerRowIndex, c1 + 1);
    ws.getCell(headerRowIndex, c1).value = g.label;
    ws.getCell(subRowIndex, c1).value = 'دختر';
    ws.getCell(subRowIndex, c1 + 1).value = 'پسر';
  });

  // استایل یکسان کل نوار سربرگ
  for (let r = headerRowIndex; r <= subRowIndex; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }
  ws.getRow(headerRowIndex).height = 22;
  ws.getRow(subRowIndex).height = 18;

  let rowIndex = subRowIndex + 1;
  let grandStudents = 0;
  let grandAmount = 0;
  const groupTotals: Record<string, { f: number; m: number }> = {};

  for (const rec of records) {
    const counts = JSON.parse(rec.counts || '{}') as Record<string, { f: number; m: number }>;
    const r = ws.getRow(rowIndex);
    r.getCell(1).value = rec.title;
    let totalStudents = 0;
    let amount = 0;
    GRADE_GROUPS.forEach((g, i) => {
      const c = counts[g.key] ?? { f: 0, m: 0 };
      const f = c.f || 0;
      const m = c.m || 0;
      totalStudents += f + m;
      amount += (f + m) * (rates[g.key] ?? 0);
      const prev = groupTotals[g.key] ?? { f: 0, m: 0 };
      groupTotals[g.key] = { f: prev.f + f, m: prev.m + m };
      const fc = r.getCell(firstGroupCol + i * 2);
      fc.value = f;
      fc.alignment = { horizontal: 'center' };
      const mc = r.getCell(firstGroupCol + i * 2 + 1);
      mc.value = m;
      mc.alignment = { horizontal: 'center' };
    });
    const tsCell = r.getCell(tsCol);
    tsCell.value = totalStudents;
    tsCell.alignment = { horizontal: 'center' };
    tsCell.font = { bold: true };
    const amountCell = r.getCell(amountCol);
    amountCell.value = amount;
    amountCell.numFmt = '#,##0';
    amountCell.alignment = { horizontal: 'center' };
    amountCell.font = { bold: true };
    grandStudents += totalStudents;
    grandAmount += amount;
    rowIndex += 1;
  }

  // ردیف جمع کل — برای هر مقطع هم جمع دختر و جمع پسر جداگانه می‌آید
  const totalRow = ws.getRow(rowIndex);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = 'جمع کل';
  const tsCell = totalRow.getCell(tsCol);
  tsCell.value = grandStudents;
  const taCell = totalRow.getCell(amountCol);
  taCell.value = grandAmount;
  taCell.numFmt = '#,##0';
  GRADE_GROUPS.forEach((g, i) => {
    const t = groupTotals[g.key] ?? { f: 0, m: 0 };
    totalRow.getCell(firstGroupCol + i * 2).value = t.f;
    totalRow.getCell(firstGroupCol + i * 2 + 1).value = t.m;
  });
  for (let c = 1; c <= lastCol; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
    cell.alignment = { horizontal: 'center' };
  }
}

function addGuideRow(ws: ExcelJS.Worksheet, title: string, desc: string) {
  const row = ws.addRow([title, desc]);
  row.getCell(1).font = { bold: true };
  row.getCell(1).alignment = { vertical: 'top' };
  row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
}

/** ساخت شیت‌های فایل نمونه ورود گروهی (قالب + راهنما) داخل workbook داده‌شده */
export function buildTemplateSheets(workbook: ExcelJS.Workbook) {
  // ─── شیت اصلی: قالب ورود اطلاعات ───
  const ws = workbook.addWorksheet('دانش‌آموزان', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { width: 30 }, // نام دانش‌آموز
    { width: 16 }, // مقطع
    { width: 12 }, // معدل
    { width: 26 }, // والد
    { width: 12 }, // طبقه
    { width: 20 }, // واحد
    { width: 16 }, // جنسیت
  ];

  const headerRow = ws.getRow(1);
  IMPORT_HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  headerRow.height = 30;

  // سه ردیف نمونه — هنگام ورود واقعی این‌ها را حذف کرده یا تیکشان را در پیش‌نمایش بردارید
  const samples = [
    ['محمد رضایی', 'پایه پنجم', 'خیلی خوب', 'علی رضایی', '2', 'فناوری اطلاعات', 'پسر'],
    ['فاطمه کریمی', 'پایه دهم', '19.5', 'حسین کریمی', '1', 'مالی', 'دختر'],
    ['مریم احمدی', 'دانشجو', '17.25', 'رضا احمدی', '3', 'پشتیبانی', 'دختر'],
  ];
  for (const s of samples) {
    const row = ws.addRow(s);
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SAMPLE_FILL } };
      cell.alignment = { vertical: 'middle' };
    });
  }

  // ─── شیت راهنما ───
  const guide = workbook.addWorksheet('راهنما', { views: [{ rightToLeft: true }] });
  guide.columns = [{ width: 26 }, { width: 95 }];
  const titleRow = guide.addRow(['راهنمای پر کردن فایل ورود گروهی', '']);
  [1, 2].forEach((c) => {
    const cell = titleRow.getCell(c);
    cell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });

  addGuideRow(guide, 'نام دانش‌آموز', 'نام و نام خانوادگی کامل. نام تکراری در یک بخش پذیرفته نمی‌شود (با اعراب و حروف عربی/فارسی متفاوت هم مقایسه می‌شود).');
  addGuideRow(guide, 'مقطع تحصیلی', 'یکی از این حالت‌ها: عدد پایه (1 تا 12 یا ۱ تا ۱۲) — یا متن مثل «پایه پنجم»، «هفتم»، «دوازدهم» — یا بازه مثل «اول تا سوم»، «چهارم تا ششم»، «هفتم تا نهم»، «دهم تا دوازدهم» (اولین پایه بازه ثبت می‌شود) — یا «دانشجو» / «دانشگاه» برای دانشگاهی.');
  addGuideRow(guide, 'معدل', 'برای پایه اول تا ششم: «خیلی خوب» (اگر خالی بگذارید خودکار ثبت می‌شود). برای هفتم تا نهم: عدد حداقل 19. برای دهم تا دوازدهم: حداقل 18. برای دانشگاه: حداقل 17. اعشار با نقطه (مثل 19.5) بنویسید؛ اگر 19/5 می‌نویسید فرمت سلول را «متن» کنید تا اکسل آن را تاریخ نکند.');
  addGuideRow(guide, 'نام والد', 'نام و نام خانوادگی والد شاغل در سازمان.');
  addGuideRow(guide, 'طبقه', 'طبقه سازمانی والد (مثلاً 1 یا 2 یا ۳).');
  addGuideRow(guide, 'واحد', 'واحد سازمانی والد (مثلاً مالی، فناوری اطلاعات).');
  addGuideRow(guide, 'جنسیت (اختیاری)', 'دختر یا پسر بنویسید (یا خالی بگذارید). اگر خالی باشد، برنامه جنسیت را از نام کوچک تشخیص می‌دهد؛ نام‌های ناشناخته یا دوجنسیتی در پیش‌نمایش ورود با رنگ زرد مشخص می‌شوند تا خودتان انتخاب کنید.');
  guide.addRow([]);
  addGuideRow(guide, 'نکته مهم', 'ردیف‌های نمونه (خاکستری) فقط برای آموزش است؛ قبل از ارسال نهایی، آن‌ها را حذف کنید یا در پیش‌نمایش تیکشان را بردارید.');
  addGuideRow(guide, 'مرحله ورود', 'پس از بارگذاری فایل، جدول پیش‌نمایش نمایش داده می‌شود؛ ردیف‌های دارای خطا قرمز و تکراری‌ها مشخص می‌شوند و می‌توانید هر ردیف را حذف یا جنسیت را اصلاح کنید. سپس دکمه «ثبت» را بزنید.');
}
