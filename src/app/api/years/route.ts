import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';
import { GROUP_KEYS } from '@/lib/counts';

const DEFAULT_PRIZES: Record<string, number> = {
  G1_3: 0,
  G4_6: 0,
  G7_9: 0,
  G10_12: 0,
  UNI: 0,
};

export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const years = await db.year.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { students: true, groups: true } } },
  });
  return Response.json({
    years: years.map((y) => ({
      id: y.id,
      name: y.name,
      isActive: y.isActive,
      studentCount: y._count.students,
      groupCount: y._count.groups,
    })),
  });
}

export async function POST(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { name?: string; copyFromYearId?: string };
  const name = (body.name ?? '').trim();
  if (!name) return jsonError('نام سال را وارد کنید');

  const nameNorm = normalizeFa(name);
  const allYears = await db.year.findMany({ select: { id: true, name: true } });
  if (allYears.some((y) => normalizeFa(y.name) === nameNorm)) {
    return jsonError('سالی با این نام از قبل وجود دارد');
  }

  // منبع کپی: سال مشخص‌شده یا آخرین سال موجود
  const sourceId =
    body.copyFromYearId && allYears.some((y) => y.id === body.copyFromYearId)
      ? body.copyFromYearId
      : allYears[0]?.id ?? null;

  const year = await db.year.create({ data: { name, isActive: false } });

  if (sourceId) {
    // کپی مبالغ جوایز از سال مبدأ
    const sourcePrizes = await db.prizeRate.findMany({ where: { yearId: sourceId } });
    for (const key of GROUP_KEYS) {
      const found = sourcePrizes.find((p) => p.group === key);
      await db.prizeRate.create({
        data: { yearId: year.id, group: key, amount: found?.amount ?? 0 },
      });
    }
    // کپی ساختار بخش‌ها از سال مبدأ
    const sourceSections = await db.section.findMany({ where: { yearId: sourceId } });
    for (const section of sourceSections) {
      await db.section.create({
        data: { yearId: year.id, name: section.name, type: section.type },
      });
    }
  } else {
    for (const [group, amount] of Object.entries(DEFAULT_PRIZES)) {
      await db.prizeRate.create({ data: { yearId: year.id, group, amount } });
    }
    await db.section.create({ data: { yearId: year.id, name: 'ستاد', type: 'INDIVIDUAL' } });
  }

  return Response.json({ year: { id: year.id, name: year.name, isActive: year.isActive } }, { status: 201 });
}
