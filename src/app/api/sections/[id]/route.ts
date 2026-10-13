import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const section = await db.section.findUnique({ where: { id } });
  if (!section) return jsonError('بخش یافت نشد', 404);

  const body = (await req.json().catch(() => ({}))) as { name?: string; type?: string };

  const data: { name?: string; type?: string } = {};

  if (typeof body.name === 'string' && body.name.trim()) {
    const name = body.name.trim();
    const nameNorm = normalizeFa(name);
    const siblings = await db.section.findMany({ where: { yearId: section.yearId, id: { not: id } } });
    if (siblings.some((s) => normalizeFa(s.name) === nameNorm)) {
      return jsonError('بخشی با این نام وجود دارد');
    }
    data.name = name;
  }

  if (body.type === 'INDIVIDUAL' || body.type === 'GROUP') {
    if (body.type !== section.type) {
      // تغییر نوع فقط زمانی ممکن است که داده‌ای ثبت نشده باشد
      const [studentCount, groupCount] = await Promise.all([
        db.student.count({ where: { sectionId: id } }),
        db.groupRecord.count({ where: { sectionId: id } }),
      ]);
      if (studentCount + groupCount > 0) {
        return jsonError('برای تغییر نوع بخش، ابتدا داده‌های ثبت‌شده آن را حذف کنید');
      }
      data.type = body.type;
    }
  }

  const updated = await db.section.update({ where: { id }, data });
  return Response.json({ section: { id: updated.id, name: updated.name, type: updated.type } });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;

  const section = await db.section.findUnique({ where: { id } });
  if (!section) return jsonError('بخش یافت نشد', 404);

  const remaining = await db.section.count({ where: { yearId: section.yearId, id: { not: id } } });
  if (remaining === 0) {
    return jsonError('حداقل یک بخش باید در سال باقی بماند');
  }

  await db.section.delete({ where: { id } }); // داده‌ها با Cascade حذف می‌شوند
  return Response.json({ ok: true });
}
