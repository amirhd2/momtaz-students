import { db } from '@/lib/db';
import { requireAuth, jsonError, readInt } from '@/lib/server';
import { GROUP_KEYS } from '@/lib/counts';
import type { GroupKey } from '@/lib/gpa';

/** به‌روزرسانی مبالغ جوایز سال */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const year = await db.year.findUnique({ where: { id } });
  if (!year) return jsonError('سال یافت نشد', 404);

  const body = (await req.json().catch(() => ({}))) as { amounts?: Record<string, unknown> };
  const amounts = body.amounts ?? {};

  for (const key of GROUP_KEYS) {
    const amount = Math.max(0, readInt(amounts[key], -1));
    if (amount < 0) continue;
    await db.prizeRate.upsert({
      where: { yearId_group: { yearId: id, group: key } },
      create: { yearId: id, group: key, amount },
      update: { amount },
    });
  }

  const prizes = await db.prizeRate.findMany({ where: { yearId: id } });
  return Response.json({
    prizes: Object.fromEntries(
      GROUP_KEYS.map((key) => [key, prizes.find((p) => p.group === key)?.amount ?? 0])
    ) as Record<GroupKey, number>,
  });
}
