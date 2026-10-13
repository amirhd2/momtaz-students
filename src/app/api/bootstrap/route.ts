import { db } from '@/lib/db';
import { ensureSeed } from '@/lib/auth';
import { requireAuth } from '@/lib/server';
import { GROUP_KEYS } from '@/lib/counts';
import type { GroupKey } from '@/lib/gpa';

/** داده اولیه برنامه: سال‌ها، سال فعال، جوایز، بخش‌ها */
export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  await ensureSeed();

  const years = await db.year.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      isActive: true,
      prizes: { select: { group: true, amount: true } },
      sections: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          type: true,
          _count: { select: { students: true, groups: true } },
        },
      },
    },
  });

  const activeYear = years.find((y) => y.isActive) ?? years[0] ?? null;

  const payload = {
    years: years.map((y) => ({
      id: y.id,
      name: y.name,
      isActive: y.isActive,
      sections: y.sections.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        studentCount: s._count.students,
        groupCount: s._count.groups,
      })),
    })),
    activeYearId: activeYear?.id ?? null,
    prizes: activeYear
      ? (Object.fromEntries(
          GROUP_KEYS.map((key) => [key, activeYear.prizes.find((p) => p.group === key)?.amount ?? 0])
        ) as Record<GroupKey, number>)
      : null,
  };

  return Response.json(payload);
}
