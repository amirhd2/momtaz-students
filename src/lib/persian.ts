// ابزارهای فارسی: نرمال‌سازی متن، تبدیل اعداد، نام مقاطع

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** تبدیل اعداد فارسی/عربی به لاتین */
export function toLatinDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    out += ch;
  }
  return out;
}

/** تبدیل ارقام لاتین به فارسی (برای نمایش) */
export function toPersianDigits(s: string | number): string {
  return String(s).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** نرمال‌سازی متن فارسی برای مقایسه و جستجو (یکسان‌سازی حروف هم‌ارز) */
export function normalizeFa(input: string): string {
  return (input ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ئ/g, 'ی')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإٱآ]/g, 'ا')
    .replace(/\u200c/g, ' ') // نیم‌فاصله → فاصله
    .replace(/[\u064B-\u065F\u0670]/g, '') // اعراب
    .replace(/\s+/g, ' ')
    .trim();
}

/** نرمال‌سازی ورودی معدل: تبدیل جداکننده‌ها و ارقام (شامل ممیز فارسی «/») */
export function normalizeGpaInput(input: string): string {
  return toLatinDigits(normalizeFa(input))
    .replace(/[٫،,/]/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/** قالب‌بندی عدد با جداکننده هزارگان فارسی */
export function formatNumberFa(n: number): string {
  const s = Math.round(n).toString();
  return toPersianDigits(s.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}

/** قالب‌بندی مبلغ با واحد تومان */
export function formatToman(n: number): string {
  return `${formatNumberFa(n)} تومان`;
}

/** نمایش معدل (حفظ حروف یا عدد اعشاری) */
export function formatGpaDisplay(raw: string, value: number | null): string {
  if (value !== null && value !== undefined) {
    const rounded = Math.round(value * 100) / 100;
    const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return toPersianDigits(s);
  }
  return raw;
}

export const GRADE_NAMES: Record<number, string> = {
  1: 'اول',
  2: 'دوم',
  3: 'سوم',
  4: 'چهارم',
  5: 'پنجم',
  6: 'ششم',
  7: 'هفتم',
  8: 'هشتم',
  9: 'نهم',
  10: 'دهم',
  11: 'یازدهم',
  12: 'دوازدهم',
};

/** نام نمایشی مقطع */
export function gradeLabel(grade: number | null): string {
  if (grade === null || grade === undefined) return 'دانشجو';
  return `پایه ${GRADE_NAMES[grade] ?? grade}`;
}

export const GENDERS = {
  FEMALE: 'دختر',
  MALE: 'پسر',
} as const;

export type Gender = keyof typeof GENDERS;
