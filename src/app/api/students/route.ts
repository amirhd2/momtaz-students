import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';
import { validateGpa } from '@/lib/gpa';

interface StudentBody {
  yearId?: string;
  sectionId?: string;
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
  return typeof v === 'string' ? v.trim() : '';
}

/** اعتبارسنجی مشترک ایجاد/ویرایش */
async function validateStudent(body: StudentBody, excludeId?: string) {
  const yearId = cleanStr(body.yearId);
  const sectionId = cleanStr(body.sectionId);
  const fullName = cleanStr(body.fullName);
  const gender = body.gender === 'FEMALE' || body.gender === 'MALE' ? body.gender : '';
  const grade = body.grade === null || body.grade === undefined ? null : Number(body.grade);
  const gpaRaw = cleanStr(body.gpaRaw);
  const parentName = cleanStr(body.parentName);
  const parentRank = cleanStr(body.parentRank);
  const parentUnit = cleanStr(body.parentUnit);

  if (!yearId || !sectionId) return { error: 'سال یا بخش مشخص نیست' } as const;
  const cleanName = fullName.replace(/\s+/g, ' ');
  if (!cleanName) return { error: 'نام و نام خانوادگی دانش‌آموز الزامی است' } as const;
  if (!gender) return { error: 'جنسیت را انتخاب کنید' } as const;
  if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 12)) {
    return { error: 'مقطع تحصیلی نامعتبر است' } as const;
  }
  if (!gpaRaw) return { error: 'معدل را وارد کنید' } as const;

  // کنترل تکراری بودن نام
  const nameNorm = normalizeFa(cleanName);
  const dup = await db.student.findFirst({
    where: { yearId, sectionId, nameNorm, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (dup) {
    return { error: `دانش‌آموزی با نام «${dup.fullName}» قبلاً در این بخش ثبت شده است`, duplicate: true } as const;
  }

  // اعتبارسنجی معدل سمت سرور
  const validation = validateGpa(grade, gpaRaw);
  if (!validation.valid && !body.isException) {
    return { error: validation.message ?? 'معدل نامعتبر است', gpaInvalid: true } as const;
  }

  return {
    data: {
      yearId,
      sectionId,
      fullName: cleanName,
      nameNorm,
      gender,
      grade,
      gpaRaw: validation.normalizedRaw || gpaRaw,
      gpaValue: validation.gpaValue,
      isException: !validation.valid && body.isException === true,
      parentName,
      parentRank,
      parentUnit,
    },
  } as const;
}

export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const yearId = url.searchParams.get('yearId') ?? '';
  const sectionId = url.searchParams.get('sectionId') ?? '';
  if (!yearId || !sectionId) return jsonError('سال یا بخش مشخص نیست');

  const students = await db.student.findMany({
    where: { yearId, sectionId },
    orderBy: { createdAt: 'asc' },
  });
  return Response.json({ students });
}

export async function POST(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as StudentBody;
  const result = await validateStudent(body);
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  const student = await db.student.create({ data: result.data });
  return Response.json({ student }, { status: 201 });
}
