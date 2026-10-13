import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';
import { serializeCounts, type GroupCounts } from '@/lib/counts';

interface GroupBody {
  title?: string;
  counts?: Partial<GroupCounts>;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const existing = await db.groupRecord.findUnique({ where: { id } });
  if (!existing) return jsonError('رکورد یافت نشد', 404);

  const body = (await req.json().catch(() => ({}))) as GroupBody;

  let titleNorm = existing.titleNorm;
  let title = existing.title;
  if (typeof body.title === 'string' && body.title.trim()) {
    title = body.title.trim();
    titleNorm = normalizeFa(title);
    const dup = await db.groupRecord.findFirst({
      where: { yearId: existing.yearId, sectionId: existing.sectionId, titleNorm, id: { not: id } },
    });
    if (dup) {
      return Response.json(
        { error: `برای «${dup.title}» قبلاً رکورد ثبت شده است` },
        { status: 422 }
      );
    }
  }

  const counts = body.counts ? serializeCounts(body.counts) : existing.counts;

  const record = await db.groupRecord.update({
    where: { id },
    data: { title, titleNorm, counts },
  });

  return Response.json({ record });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const existing = await db.groupRecord.findUnique({ where: { id } });
  if (!existing) return jsonError('رکورد یافت نشد', 404);

  await db.groupRecord.delete({ where: { id } });
  return Response.json({ ok: true });
}
