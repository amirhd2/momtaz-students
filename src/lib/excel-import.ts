// منطق تفسیر و اعتبارسنجی ردیف‌های فایل اکسل ورود گروهی (مشترک کلاینت/سرور)
import { normalizeFa, normalizeGpaInput, toLatinDigits } from './persian';
import { parseGpa, validateGpa, groupOfGrade } from './gpa';
import { detectGender, parseGenderText, type DetectedGender } from './persian-names';

export const IMPORT_HEADERS = [
  'نام و نام خانوادگی دانش‌آموز',
  'مقطع تحصیلی',
  'معدل',
  'نام والد شاغل در سازمان',
  'طبقه',
  'واحد',
  'جنسیت (اختیاری)',
];

export type GenderSource = 'column' | 'auto' | 'manual' | 'unknown';

export interface ParsedImportRow {
  /** شماره ردیف در فایل اکسل (برای نمایش) */
  fileRow: number;
  /** سلول‌های خام برای نمایش */
  raw: string[];
  include: boolean;
  fullName: string;
  grade: number | null;
  /** متن رزولوشده مقطع برای نمایش (مثلاً «پایه پنجم» یا «اول تا سوم → پایه اول») */
  gradeDisplay: string;
  gpaRaw: string;
  gpaValue: number | null;
  parentName: string;
  parentRank: string;
  parentUnit: string;
  gender: DetectedGender;
  genderSource: GenderSource;
  /** تفسیر ستون جنسیت فایل: null = خالی، true = متن نامفهوم */
  genderColumnInvalid?: boolean;
  /** تخلف از قاعده معدل → فقط با استثنا ثبت می‌شود */
  gpaViolation: boolean;
  isException: boolean;
  /** خطاهای بازدارنده (ردیف قابل درج نیست) */
  errors: string[];
  /** تکراری با رکوردهای موجود یا داخل فایل */
  duplicate: boolean;
  duplicateWith?: string;
}

const GROUP_RANGE_PATTERNS: Array<[RegExp, number]> = [
  [/اول\s*تا\s*سوم/, 1],
  [/چهارم\s*تا\s*ششم/, 4],
  [/هفتم\s*تا\s*نهم/, 7],
  [/دهم\s*تا\s*دوازدهم/, 10],
];

const ORDINALS: Array<[string, number]> = [
  ['دوازدهم', 12], ['یازدهم', 11], ['دهم', 10], ['نهم', 9], ['هشتم', 8], ['هفتم', 7],
  ['ششم', 6], ['پنجم', 5], ['چهارم', 4], ['سوم', 3], ['دوم', 2], ['اول', 1],
];

/** واژه‌های اضافی که از متن مقطع حذف می‌شوند تا تطبیق دقیق توکن ممکن شود */
const GRADE_FILLER_WORDS = new Set([
  'پایه', 'کلاس', 'مقطع', 'دبستان', 'دبیرستان', 'متوسطه', 'ابتدایی', 'هنرستان', 'بزرگسال',
]);

const GRADE_NAMES_FA = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];

/**
 * تفسیر متن مقطع تحصیلی:
 * عدد 1-12، «پایه پنجم»، «دانشجو/دانشگاه»، بازه‌ها («اول تا سوم» → اولین پایه بازه)
 * تطبیق اعداد ترتیبی توکن‌به‌توکن و دقیق است تا «سیزدهم» به «دهم» تطبیق نکند.
 */
export function parseGradeText(text: string): { ok: boolean; grade: number | null; display: string } | null {
  const norm = normalizeGpaInput(text);
  if (!norm) return null;

  for (const [re, grade] of GROUP_RANGE_PATTERNS) {
    if (re.test(norm)) {
      const g = groupOfGrade(grade);
      return { ok: true, grade, display: `${norm} → ${g.label}` };
    }
  }
  if (/دانشجو|دانشگاه|دانشجوی/.test(norm)) {
    return { ok: true, grade: null, display: 'دانشگاهی' };
  }
  const lat = toLatinDigits(norm).replace(/\s+/g, ' ').trim();
  if (/^\d{1,2}$/.test(lat)) {
    const n = parseInt(lat, 10);
    if (n >= 1 && n <= 12) return { ok: true, grade: n, display: `پایه ${GRADE_NAMES_FA[n - 1]}` };
    return { ok: false, grade: null, display: norm };
  }
  const tokens = norm.split(/\s+/).filter((t) => t && !GRADE_FILLER_WORDS.has(t));
  for (const token of tokens) {
    const hit = ORDINALS.find(([word]) => token === word);
    if (hit) {
      return { ok: true, grade: hit[1], display: `پایه ${GRADE_NAMES_FA[hit[1] - 1]}` };
    }
  }
  return { ok: false, grade: null, display: norm };
}

/** تفسیر معدل یک ردیف بر اساس مقطع — خطای بازدارنده یا تخلف (استثنا) یا موفق */
export function interpretGpa(grade: number | null, text: string): {
  ok: boolean;
  violation: boolean;
  gpaRaw: string;
  gpaValue: number | null;
  message?: string;
} {
  const group = groupOfGrade(grade);
  const raw = String(text ?? '').trim();

  // مقاطع اول تا ششم: خالی → پیش‌فرض خودکار «خیلی خوب» (مطابق فرم ثبت)
  if (!raw && group.minGpa === null) {
    return { ok: true, violation: false, gpaRaw: group.requiredWord!, gpaValue: null };
  }
  if (!raw) {
    return { ok: false, violation: false, gpaRaw: '', gpaValue: null, message: 'معدل الزامی است' };
  }

  const parsed = parseGpa(raw);
  if (parsed.kind === 'invalid') {
    return { ok: false, violation: false, gpaRaw: raw, gpaValue: null, message: 'معدل نامعتبر است (عدد 0 تا 20 یا «خیلی خوب»)' };
  }

  const validation = validateGpa(grade, raw);
  if (validation.valid) {
    return { ok: true, violation: false, gpaRaw: validation.normalizedRaw, gpaValue: validation.gpaValue };
  }
  // قابل قبول با پذیرش استثنا
  return { ok: true, violation: true, gpaRaw: validation.normalizedRaw || raw, gpaValue: validation.gpaValue, message: validation.message };
}

/** تبدیل مقدار سلول ExcelJS به متن قابل پردازش (سمت سرور در import-parse) */
export function cellToText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'boolean') return v ? '1' : '';
  if (v instanceof Date) return '__DATE__';
  const obj = v as Record<string, unknown>;
  if (typeof obj.text === 'string') return obj.text.trim();
  if (typeof obj.result === 'number' || typeof obj.result === 'string') return String(obj.result).trim();
  if (typeof obj.richText === 'object' && Array.isArray(obj.richText)) {
    return (obj.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('').trim();
  }
  return String(v).trim();
}

export const GPA_DATE_CELL = '__DATE__';

/**
 * ساخت ردیف‌های قابل نمایش از سلول‌های خام خوانده‌شده از فایل
 * existingNorms: نام‌های نرمال‌شده ثبت‌شده فعلی بخش (برای تشخیص تکراری)
 */
export function buildImportRows(
  rawRows: Array<{ fileRow: number; cells: string[] }>,
  existingNorms: Set<string>
): ParsedImportRow[] {
  const seenInFile = new Map<string, ParsedImportRow>();

  const rows = rawRows.map((r) => {
    const [name = '', gradeText = '', gpaText = '', parent = '', rank = '', unit = '', genderText = ''] = r.cells;
    const cleanName = String(name ?? '').replace(/\s+/g, ' ').trim();

    const row: ParsedImportRow = {
      fileRow: r.fileRow,
      raw: r.cells.map((c) => String(c ?? '')),
      include: true,
      fullName: cleanName,
      grade: null,
      gradeDisplay: '',
      gpaRaw: '',
      gpaValue: null,
      parentName: String(parent ?? '').replace(/\s+/g, ' ').trim(),
      parentRank: String(rank ?? '').replace(/\s+/g, ' ').trim(),
      parentUnit: String(unit ?? '').replace(/\s+/g, ' ').trim(),
      gender: null,
      genderSource: 'unknown',
      gpaViolation: false,
      isException: false,
      errors: [],
      duplicate: false,
    };

    // نام
    if (!cleanName) {
      row.errors.push('نام دانش‌آموز خالی است');
    } else {
      const norm = normalizeFa(cleanName);
      if (existingNorms.has(norm)) row.duplicate = true;
    }

    // مقطع
    const gradeParsed = parseGradeText(String(gradeText ?? ''));
    if (!gradeParsed) {
      row.errors.push('مقطع تحصیلی خالی است');
    } else if (!gradeParsed.ok) {
      row.errors.push('مقطع تحصیلی نامعتبر است');
    } else {
      row.grade = gradeParsed.grade;
      row.gradeDisplay = gradeParsed.display;
    }

    // معدل
    if (String(gpaText ?? '') === GPA_DATE_CELL) {
      row.errors.push('ستون معدل به‌صورت تاریخ خوانده شد — لطفاً سلول را با فرمت متن بنویسید (مثلاً 19.5)');
    } else if (gradeParsed?.ok) {
      const g = interpretGpa(row.grade, String(gpaText ?? ''));
      if (!g.ok) {
        row.errors.push(g.message ?? 'معدل نامعتبر است');
      } else {
        row.gpaRaw = g.gpaRaw;
        row.gpaValue = g.gpaValue;
        row.gpaViolation = g.violation;
        row.isException = g.violation;
      }
    } else if (String(gpaText ?? '').trim()) {
      row.gpaRaw = String(gpaText).trim();
    }

    // جنسیت: ستون اختیاری → در صورت خالی بودن تشخیص خودکار از نام
    const genderParsed = parseGenderText(String(genderText ?? ''));
    if (genderParsed === 'invalid') {
      row.gender = detectGender(cleanName);
      row.genderSource = row.gender ? 'auto' : 'unknown';
      row.genderColumnInvalid = true;
    } else if (genderParsed === null) {
      row.gender = detectGender(cleanName);
      row.genderSource = row.gender ? 'auto' : 'unknown';
    } else {
      row.gender = genderParsed;
      row.genderSource = 'column';
    }

    return row;
  });

  // تکراری داخل خود فایل
  for (const row of rows) {
    if (!row.fullName) continue;
    const norm = normalizeFa(row.fullName);
    const first = seenInFile.get(norm);
    if (first) {
      row.duplicate = true;
      row.duplicateWith = first.fullName;
    } else {
      seenInFile.set(norm, row);
    }
  }

  return rows;
}

/** آیا ردیف برای درج آماده است؟ */
export function rowImportable(row: ParsedImportRow): boolean {
  return row.include && row.errors.length === 0 && !row.duplicate && row.gender !== null;
}
