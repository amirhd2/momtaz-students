import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const year = await db.year.findUnique({ where: { id } });
  if (!year) return jsonError('سال یافت نشد', 404);

  const body = (await req.json().catch(() => ({}))) as { name?: string; isActive?: boolean };

  const data: { name?: string; isActive?: boolean } = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    const name = body.name.trim();
    const dup = await db.year.findFirst({ where: { name, id: { not: id } } });
    if (dup) return jsonError('سالی با این نام وجود دارد');
    data.name = name;
  }

  if (body.isActive === true && !year.isActive) {
    await db.year.updateMany({ data: { isActive: false } });
    data.isActive = true;
  }

  const updated = await db.year.update({ where: { id }, data });
  return Response.json({ year: { id: updated.id, name: updated.name, isActive: updated.isActive } });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const year = await db.year.findUnique({ where: { id } });
  if (!year) return jsonError('سال یافت نشد', 404);

  const total = await db.year.count();
  if (total <= 1) return jsonError('حداقل یک سال باید در برنامه باقی بماند');

  await db.year.delete({ where: { id } });

  if (year.isActive) {
    const next = await db.year.findFirst({ orderBy: { createdAt: 'desc' } });
    if (next) await db.year.update({ where: { id: next.id }, data: { isActive: true } });
  }

  return Response.json({ ok: true });
}
