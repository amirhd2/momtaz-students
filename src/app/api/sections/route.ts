import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';

/** افزودن بخش جدید به سال فعال */
export async function POST(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    yearId?: string;
    name?: string;
    type?: string;
  };

  const yearId = (body.yearId ?? '').trim();
  const name = (body.name ?? '').trim();
  const type = body.type === 'GROUP' ? 'GROUP' : body.type === 'INDIVIDUAL' ? 'INDIVIDUAL' : '';

  if (!yearId) return jsonError('سال مشخص نیست');
  if (!name) return jsonError('نام بخش را وارد کنید');
  if (!type) return jsonError('نوع بخش را انتخاب کنید');

  const year = await db.year.findUnique({ where: { id: yearId } });
  if (!year) return jsonError('سال یافت نشد', 404);

  const nameNorm = normalizeFa(name);
  const sections = await db.section.findMany({ where: { yearId } });
  if (sections.some((s) => normalizeFa(s.name) === nameNorm)) {
    return jsonError('بخشی با این نام از قبل وجود دارد');
  }

  const section = await db.section.create({ data: { yearId, name, type } });
  return Response.json(
    { section: { id: section.id, name: section.name, type: section.type } },
    { status: 201 }
  );
}
