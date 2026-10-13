// تعریف گروه‌های مقطعی و قوانین اعتبارسنجی معدل (مشترک کلاینت و سرور)
import { normalizeGpaInput } from './persian';

export type GroupKey = 'G1_3' | 'G4_6' | 'G7_9' | 'G10_12' | 'UNI';

export interface GradeGroup {
  key: GroupKey;
  label: string;
  grades: number[] | 'UNI';
  minGpa: number | null; // حداقل معدل قابل قبول (null = فقط حروف)
  requiredWord?: string;
}

export const GRADE_GROUPS: GradeGroup[] = [
  { key: 'G1_3', label: 'اول تا سوم', grades: [1, 2, 3], minGpa: null, requiredWord: 'خیلی خوب' },
  { key: 'G4_6', label: 'چهارم تا ششم', grades: [4, 5, 6], minGpa: null, requiredWord: 'خیلی خوب' },
  { key: 'G7_9', label: 'هفتم تا نهم', grades: [7, 8, 9], minGpa: 19 },
  { key: 'G10_12', label: 'دهم تا دوازدهم', grades: [10, 11, 12], minGpa: 18 },
  { key: 'UNI', label: 'دانشگاهی', grades: 'UNI', minGpa: 17 },
];

/** یافتن گروه مقطعی از روی پایه */
export function groupOfGrade(grade: number | null): GradeGroup {
  if (grade === null || grade === undefined) {
    return GRADE_GROUPS.find((g) => g.key === 'UNI')!;
  }
  return GRADE_GROUPS.find((g) => Array.isArray(g.grades) && g.grades.includes(grade))!;
}

export type GpaParseResult =
  | { kind: 'word'; word: string }
  | { kind: 'number'; value: number }
  | { kind: 'invalid'; raw: string };

const WORD_MAP: Array<[RegExp, string]> = [
  [/^خیلی\s*خوب$/, 'خیلی خوب'],
  [/^عالی$/, 'خیلی خوب'],
  [/^خوب$/, 'خوب'],
  [/^نسبتا(ً)?\s*خوب$/, 'نسبتا خوب'],
  [/^متوسط$/, 'متوسط'],
  [/^قابل\s*قبول$/, 'قابل قبول'],
];

/** تجزیه ورودی معدل: عدد یا حروف */
export function parseGpa(rawInput: string): GpaParseResult {
  const norm = normalizeGpaInput(rawInput);
  if (!norm) return { kind: 'invalid', raw: rawInput };

  // تطبیق حروف
  for (const [re, canonical] of WORD_MAP) {
    if (re.test(norm)) return { kind: 'word', word: canonical };
  }

  // تطبیق عدد (شامل اعشاری)
  if (/^\d{1,2}(\.\d{1,2})?$/.test(norm)) {
    const value = parseFloat(norm);
    return { kind: 'number', value };
  }

  return { kind: 'invalid', raw: rawInput };
}

export interface GpaValidation {
  valid: boolean;
  /** پیام خطا در صورت نامعتبر بودن */
  message?: string;
  /** آیا امکان پذیرش استثنا وجود دارد (همیشه برای موارد نامعتبر بله) */
  canAcceptException: boolean;
  gpaValue: number | null;
  normalizedRaw: string;
}

/** گزینه‌های دراپ‌داون مقطع: پایه 1 تا 12 + دانشجو */
export const GRADE_OPTIONS: Array<{ grade: number | null; label: string }> = [
  ...Array.from({ length: 12 }, (_, i) => ({ grade: i + 1 as number | null, label: `پایه ${['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'][i]}` })),
  { grade: null, label: 'دانشجو (دانشگاهی)' },
];

const ORDINAL_WORDS: Array<[string, number]> = [
  ['اول', 1], ['دوم', 2], ['سوم', 3], ['چهارم', 4], ['پنجم', 5], ['ششم', 6],
  ['هفتم', 7], ['هشتم', 8], ['نهم', 9], ['دهم', 10], ['یازدهم', 11], ['دوازدهم', 12],
];

const GRADE_FILLER_WORDS = new Set([
  'پایه', 'کلاس', 'مقطع', 'دبستان', 'دبیرستان', 'متوسطه', 'ابتدایی', 'هنرستان', 'بزرگسال',
]);

/**
 * تفسیر متن تایپ‌شده برای مقطع:
 * خروجی null یعنی ورودی خالی است؛ ok=false یعنی نامعتبر.
 * تطبیق اعداد ترتیبی توکن‌به‌توکن و دقیق است تا «سیزدهم» به «دهم» تطبیق نکند.
 */
export function parseGradeInput(text: string): { ok: boolean; grade: number | null } | null {
  const norm = normalizeGpaInput(text);
  if (!norm) return null;
  if (/دانشجو|دانشگاه/.test(norm)) return { ok: true, grade: null };
  if (/^\d{1,2}$/.test(norm)) {
    const n = parseInt(norm, 10);
    return n >= 1 && n <= 12 ? { ok: true, grade: n } : { ok: false, grade: null };
  }
  const tokens = norm.split(/\s+/).filter((t) => t && !GRADE_FILLER_WORDS.has(t));
  for (const token of tokens) {
    const hit = ORDINAL_WORDS.find(([word]) => token === word);
    if (hit) return { ok: true, grade: hit[1] };
  }
  return { ok: false, grade: null };
}

/**
 * اعتبارسنجی معدل بر اساس مقطع:
 * - اول تا ششم: فقط «خیلی خوب» (پیش‌فرض خودکار)
 * - هفتم تا نهم: 19 به بالا
 * - دهم تا دوازدهم: 18 به بالا
 * - دانشگاهی: 17 به بالا
 * در صورت تخلف، کاربر می‌تواند با تیک، استثنا را بپذیرد.
 */
export function validateGpa(grade: number | null, rawInput: string): GpaValidation {
  const group = groupOfGrade(grade);
  const parsed = parseGpa(rawInput);
  const base = {
    canAcceptException: true,
    gpaValue: null as number | null,
    normalizedRaw: rawInput.trim(),
  };

  if (parsed.kind === 'invalid') {
    return {
      ...base,
      valid: false,
      message: 'مقدار معدل نامعتبر است (عدد بین 0 تا 20 یا عبارت مثل «خیلی خوب» وارد کنید)',
    };
  }

  if (parsed.kind === 'word') {
    if (group.minGpa === null) {
      // مقاطع اول تا ششم: فقط «خیلی خوب»
      if (parsed.word === group.requiredWord) {
        return { ...base, valid: true, normalizedRaw: parsed.word };
      }
      return {
        ...base,
        valid: false,
        message: `برای مقطع ${group.label} تنها معدل قابل قبول «${group.requiredWord}» است`,
      };
    }
    // مقاطع عددی: حروف پذیرفته نیست
    return {
      ...base,
      valid: false,
      message: `برای مقطع ${group.label} معدل باید عددی و حداقل ${group.minGpa} باشد`,
    };
  }

  // عددی
  const { value } = parsed;
  if (value < 0 || value > 20) {
    return {
      ...base,
      valid: false,
      gpaValue: value,
      message: 'معدل باید عددی بین 0 تا 20 باشد',
    };
  }

  if (group.minGpa === null) {
    return {
      ...base,
      valid: false,
      gpaValue: value,
      message: `برای مقطع ${group.label} تنها معدل قابل قبول «${group.requiredWord}» است`,
    };
  }

  if (value < group.minGpa) {
    return {
      ...base,
      valid: false,
      gpaValue: value,
      message: `معدل برای مقطع ${group.label} باید حداقل ${group.minGpa} باشد`,
    };
  }

  return { ...base, valid: true, gpaValue: value };
}
