import { db } from '@/lib/db';
import { requireAuth, jsonError, readInt } from '@/lib/server';
import { ensureSeed, hashPassword } from '@/lib/auth';
import { normalizeFa } from '@/lib/persian';
import { GROUP_KEYS, serializeCounts } from '@/lib/counts';
import type { GroupKey } from '@/lib/gpa';

interface BackupStudent {
  fullName: string;
  gender: string;
  grade: number | null;
  gpaRaw: string;
  gpaValue: number | null;
  isException: boolean;
  parentName: string;
  parentRank: string;
  parentUnit: string;
  createdAt?: string;
}

interface BackupYear {
  name: string;
  isActive?: boolean;
  prizes?: Record<string, number>;
  sections?: Array<{ name: string; type: string }>;
  students?: Array<BackupStudent & { sectionName?: string }>;
  groups?: Array<{ title: string; sectionName?: string | null; counts?: unknown }>;
}

/** دانلود فایل پشتیبان کامل (JSON) */
export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await ensureSeed();

  const years = await db.year.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      prizes: true,
      sections: { orderBy: { createdAt: 'asc' }, include: { students: true, groups: true } },
    },
  });

  const yearPayloads: Record<string, unknown>[] = [];
  for (const y of years) {
    const standaloneGroups = await db.groupRecord.findMany({ where: { yearId: y.id, sectionId: null } });
    yearPayloads.push({
      name: y.name,
      isActive: y.isActive,
      prizes: Object.fromEntries(
        GROUP_KEYS.map((key) => [key, y.prizes.find((p) => p.group === key)?.amount ?? 0])
      ),
      sections: y.sections.map((s) => ({ name: s.name, type: s.type })),
      students: y.sections.flatMap((s) =>
        s.students.map((st) => ({
          sectionName: s.name,
          fullName: st.fullName,
          gender: st.gender,
          grade: st.grade,
          gpaRaw: st.gpaRaw,
          gpaValue: st.gpaValue,
          isException: st.isException,
          parentName: st.parentName,
          parentRank: st.parentRank,
          parentUnit: st.parentUnit,
          createdAt: st.createdAt.toISOString(),
        }))
      ),
      groups: [
        ...y.sections.flatMap((s) =>
          s.groups.map((g) => ({
            sectionName: s.name,
            title: g.title,
            counts: JSON.parse(g.counts || '{}'),
          }))
        ),
        ...standaloneGroups.map((g) => ({
          sectionName: null,
          title: g.title,
          counts: JSON.parse(g.counts || '{}'),
        })),
      ],
    });
  }

  const payload = {
    app: 'student-excellence-registry',
    version: 1,
    exportedAt: new Date().toISOString(),
    years: yearPayloads,
  };

  const filename = `student-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/** بازیابی از فایل پشتیبان */
export async function POST(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { data?: { years?: BackupYear[] } };
  const years = body.data?.years;
  if (!Array.isArray(years) || years.length === 0) {
    return jsonError('فایل پشتیبان معتبر نیست (فهرست سال‌ها یافت نشد)');
  }

  // نام سال‌ها نباید تکراری باشد
  const names = new Set<string>();
  for (const y of years) {
    const name = (y.name ?? '').trim();
    if (!name) return jsonError('در فایل پشتیبان، سالی بدون نام وجود دارد');
    if (names.has(name)) return jsonError(`نام سال «${name}» در فایل تکراری است`);
    names.add(name);
  }

  await db.year.deleteMany({});
  await db.groupRecord.deleteMany({});
  await db.student.deleteMany({});
  await db.section.deleteMany({});
  await db.prizeRate.deleteMany({});

  let restoredStudents = 0;
  let restoredGroups = 0;

  for (const y of years) {
    const year = await db.year.create({
      data: { name: y.name.trim(), isActive: y.isActive === true },
    });

    const prizes = y.prizes ?? {};
    for (const key of GROUP_KEYS) {
      await db.prizeRate.create({
        data: { yearId: year.id, group: key, amount: Math.max(0, readInt(prizes[key], 0)) },
      });
    }

    const sectionMap = new Map<string, string>();
    for (const s of y.sections ?? []) {
      const name = (s.name ?? '').trim();
      if (!name) continue;
      const type = s.type === 'GROUP' ? 'GROUP' : 'INDIVIDUAL';
      const section = await db.section.create({ data: { yearId: year.id, name, type } });
      sectionMap.set(name, section.id);
    }

    for (const st of y.students ?? []) {
      const sectionId = st.sectionName ? sectionMap.get(st.sectionName) : undefined;
      if (!sectionId) continue;
      const fullName = (st.fullName ?? '').trim();
      if (!fullName) continue;
      const grade = st.grade === null || st.grade === undefined ? null : Number(st.grade);
      await db.student.create({
        data: {
          yearId: year.id,
          sectionId,
          fullName,
          nameNorm: normalizeFa(fullName),
          gender: st.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
          grade: grade !== null && Number.isInteger(grade) && grade >= 1 && grade <= 12 ? grade : null,
          gpaRaw: (st.gpaRaw ?? '').trim(),
          gpaValue: typeof st.gpaValue === 'number' && Number.isFinite(st.gpaValue) ? st.gpaValue : null,
          isException: st.isException === true,
          parentName: (st.parentName ?? '').trim(),
          parentRank: (st.parentRank ?? '').trim(),
          parentUnit: (st.parentUnit ?? '').trim(),
          ...(st.createdAt ? { createdAt: new Date(st.createdAt) } : {}),
        },
      });
      restoredStudents += 1;
    }

    for (const g of y.groups ?? []) {
      const title = (g.title ?? '').trim();
      if (!title) continue;
      const sectionId = g.sectionName ? sectionMap.get(g.sectionName) : null;
      const counts = serializeCounts((g.counts ?? {}) as Record<GroupKey, { f: number; m: number }>);
      await db.groupRecord.create({
        data: { yearId: year.id, sectionId, title, titleNorm: normalizeFa(title), counts },
      });
      restoredGroups += 1;
    }
  }

  // اطمینان از وجود سال فعال
  const anyActive = await db.year.findFirst({ where: { isActive: true } });
  if (!anyActive) {
    const first = await db.year.findFirst({ orderBy: { createdAt: 'asc' } });
    if (first) await db.year.update({ where: { id: first.id }, data: { isActive: true } });
  }

  const settings = await db.settings.findUnique({ where: { id: 'main' } });
  if (!settings) {
    await db.settings.create({ data: { id: 'main', passwordHash: hashPassword('1234') } });
  }

  return Response.json({ ok: true, restoredStudents, restoredGroups });
}
