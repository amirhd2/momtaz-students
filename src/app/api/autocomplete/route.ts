import { db } from '@/lib/db';
import { requireAuth } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';

const FIELDS = ['parentName', 'parentRank', 'parentUnit', 'gpaRaw'] as const;
type Field = (typeof FIELDS)[number];

function parseFields(raw: string | null): Field[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((f) => f.trim())
    .filter((f): f is Field => (FIELDS as readonly string[]).includes(f));
}

/** فهرست مقادیر یکتای ثبت‌شده برای اتوکامپلت — با fields=all همه فیلدها در یک درخواست */
export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const yearId = url.searchParams.get('yearId') ?? '';
  const sectionId = url.searchParams.get('sectionId') ?? '';

  // حالت دسته‌ای: fields=all یا fields=parentName,parentUnit
  const fieldsParam = url.searchParams.get('fields');
  const batchFields =
    fieldsParam === 'all' ? [...FIELDS] : fieldsParam ? parseFields(fieldsParam) : [];

  const where = {
    ...(yearId ? { yearId } : {}),
    ...(sectionId ? { sectionId } : {}),
  };

  if (batchFields.length > 0) {
    // یک کوئری به‌جای چند درخواست جداگانه — فقط ستون‌های لازم
    const select = Object.fromEntries(batchFields.map((f) => [f, true])) as Record<Field, boolean>;
    const rows = (await db.student.findMany({ where, select })) as Record<Field, string>[];
    const out: Record<Field, string[]> = {} as Record<Field, string[]>;
    for (const f of batchFields) {
      out[f] = Array.from(
        new Set(rows.map((r) => normalizeFa(r[f]).trim()).filter((v) => v.length > 0))
      ).sort((a, b) => a.localeCompare(b, 'fa'));
    }
    // مقادیر معدل حروفی برای اتوکامپلت
    if (batchFields.includes('gpaRaw')) {
      out.gpaRaw.push('خیلی خوب', 'خوب', 'نسبتا خوب', 'متوسط', 'قابل قبول');
    }
    return Response.json(out);
  }

  // حالت تک‌فیلدی (سازگار با نسخه قبلی)
  const field = url.searchParams.get('field') ?? '';
  if (!FIELDS.includes(field as Field)) {
    return Response.json({ values: [] });
  }

  const rows = await db.student.findMany({
    where,
    select: { parentName: true, parentRank: true, parentUnit: true, gpaRaw: true },
    distinct: [field as Field],
  });

  const values = Array.from(
    new Set(rows.map((r) => normalizeFa(r[field as Field]).trim()).filter((v) => v.length > 0))
  ).sort((a, b) => a.localeCompare(b, 'fa'));

  // مقادیر معدل حروفی برای اتوکامپلت
  if (url.searchParams.get('gpaWords') === '1') {
    values.push('خیلی خوب', 'خوب', 'نسبتا خوب', 'متوسط', 'قابل قبول');
  }

  return Response.json({ values });
}
