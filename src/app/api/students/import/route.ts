// درج گروهی دانش‌آموزان از فایل اکسل — اعتبارسنجی کامل سمت سرور + تراکنش
import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';
import { validateGpa } from '@/lib/gpa';
import { detectGender } from '@/lib/persian-names';

interface ImportRowBody {
  fullName?: string;
  gender?: string;
  grade?: number | null;
  gpaRaw?: string;
  isException?: boolean;
  parentName?: string;
  parentRank?: string;
  parentUnit?: string;
}

function cleanStr(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

export async function POST(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    yearId?: string;
    sectionId?: string;
    rows?: ImportRowBody[];
  };

  const yearId = cleanStr(body.yearId);
  const sectionId = cleanStr(body.sectionId);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!yearId || !sectionId) return jsonError('سال یا بخش مشخص نیست');
  if (rows.length === 0) return jsonError('ردیفی برای ثبت وجود ندارد');
  if (rows.length > 1000) return jsonError('تعداد ردیف‌ها بیش از حد مجاز است');

  const section = await db.section.findUnique({ where: { id: sectionId } });
  if (!section || section.yearId !== yearId) return jsonError('بخش یافت نشد', 404);
  if (section.type !== 'INDIVIDUAL') return jsonError('ورود گروهی فقط برای بخش‌های تکی است');

  // نام‌های موجود بخش برای تشخیص تکراری
  const existing = await db.student.findMany({
    where: { yearId, sectionId },
    select: { nameNorm: true, fullName: true },
  });
  const existingNorms = new Set(existing.map((e) => e.nameNorm));
  const existingByName = new Map(existing.map((e) => [e.nameNorm, e.fullName]));

  const toInsert: Array<{
    yearId: string;
    sectionId: string;
    fullName: string;
    nameNorm: string;
    gender: string;
    grade: number | null;
    gpaRaw: string;
    gpaValue: number | null;
    isException: boolean;
    parentName: string;
    parentRank: string;
    parentUnit: string;
  }> = [];

  const skipped: Array<{ name: string; reason: string }> = [];

  for (const row of rows) {
    const fullName = cleanStr(row.fullName);
    if (!fullName) {
      skipped.push({ name: '(بدون نام)', reason: 'نام دانش‌آموز خالی است' });
      continue;
    }
    const nameNorm = normalizeFa(fullName);

    if (existingNorms.has(nameNorm)) {
      skipped.push({ name: fullName, reason: `نام تکراری است (قبلاً «${existingByName.get(nameNorm) ?? fullName}» ثبت شده)` });
      continue;
    }

    const gender =
      row.gender === 'FEMALE' || row.gender === 'MALE'
        ? row.gender
        : detectGender(fullName) === 'MALE'
          ? 'MALE'
          : detectGender(fullName) === 'FEMALE'
            ? 'FEMALE'
            : '';
    if (!gender) {
      skipped.push({ name: fullName, reason: 'جنسیت مشخص نشده است' });
      continue;
    }

    const grade =
      row.grade === null || row.grade === undefined
        ? null
        : Number.isInteger(Number(row.grade)) && Number(row.grade) >= 1 && Number(row.grade) <= 12
          ? Number(row.grade)
          : undefined;
    if (grade === undefined) {
      skipped.push({ name: fullName, reason: 'مقطع تحصیلی نامعتبر است' });
      continue;
    }

    const gpaRaw = cleanStr(row.gpaRaw);
    if (!gpaRaw) {
      skipped.push({ name: fullName, reason: 'معدل خالی است' });
      continue;
    }

    const validation = validateGpa(grade, gpaRaw);
    if (!validation.valid && row.isException !== true) {
      skipped.push({ name: fullName, reason: validation.message ?? 'معدل نامعتبر است' });
      continue;
    }

    toInsert.push({
      yearId,
      sectionId,
      fullName,
      nameNorm,
      gender,
      grade,
      gpaRaw: validation.normalizedRaw || gpaRaw,
      gpaValue: validation.gpaValue,
      isException: !validation.valid && row.isException === true,
      parentName: cleanStr(row.parentName),
      parentRank: cleanStr(row.parentRank),
      parentUnit: cleanStr(row.parentUnit),
    });

    // جلوگیری از تکرار داخل خود فایل
    existingNorms.add(nameNorm);
    existingByName.set(nameNorm, fullName);
  }

  if (toInsert.length > 0) {
    await db.$transaction(
      toInsert.map((data) => db.student.create({ data }))
    );
  }

  return Response.json({ inserted: toInsert.length, skipped });
}
