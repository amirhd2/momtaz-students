import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';
import { validateGpa } from '@/lib/gpa';

interface StudentBody {
  fullName?: string;
  gender?: string;
  grade?: number | null;
  gpaRaw?: string;
  isException?: boolean;
  parentName?: string;
  parentRank?: string;
  parentUnit?: string;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const existing = await db.student.findUnique({ where: { id } });
  if (!existing) return jsonError('رکورد یافت نشد', 404);

  const body = (await req.json().catch(() => ({}))) as StudentBody;
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : existing.fullName;
  const gender = body.gender === 'FEMALE' || body.gender === 'MALE' ? body.gender : existing.gender;
  const grade =
    body.grade === null || body.grade === undefined ? null : Number.isInteger(Number(body.grade)) ? Number(body.grade) : existing.grade;
  const gpaRaw = typeof body.gpaRaw === 'string' ? body.gpaRaw.trim() : existing.gpaRaw;
  const parentName = typeof body.parentName === 'string' ? body.parentName.trim() : existing.parentName;
  const parentRank = typeof body.parentRank === 'string' ? body.parentRank.trim() : existing.parentRank;
  const parentUnit = typeof body.parentUnit === 'string' ? body.parentUnit.trim() : existing.parentUnit;

  if (!fullName) return jsonError('نام و نام خانوادگی دانش‌آموز الزامی است');
  if (!gpaRaw) return jsonError('معدل را وارد کنید');

  // کنترل تکراری بودن (به جز خود رکورد)
  const nameNorm = normalizeFa(fullName);
  const dup = await db.student.findFirst({
    where: { yearId: existing.yearId, sectionId: existing.sectionId, nameNorm, id: { not: id } },
  });
  if (dup) {
    return Response.json(
      { error: `دانش‌آموزی با نام «${dup.fullName}» قبلاً در این بخش ثبت شده است` },
      { status: 422 }
    );
  }

  const validation = validateGpa(grade, gpaRaw);
  if (!validation.valid && body.isException !== true) {
    return Response.json({ error: validation.message ?? 'معدل نامعتبر است' }, { status: 422 });
  }

  const student = await db.student.update({
    where: { id },
    data: {
      fullName,
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
  });

  return Response.json({ student });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const existing = await db.student.findUnique({ where: { id } });
  if (!existing) return jsonError('رکورد یافت نشد', 404);

  await db.student.delete({ where: { id } });
  return Response.json({ ok: true });
}
