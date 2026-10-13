import { db } from '@/lib/db';
import { requireAuth } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';

/** بررسی تکراری بودن نام دانش‌آموز در بخش و سال مشخص */
export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const yearId = url.searchParams.get('yearId') ?? '';
  const sectionId = url.searchParams.get('sectionId') ?? '';
  const name = url.searchParams.get('name') ?? '';
  const excludeId = url.searchParams.get('excludeId') ?? undefined;

  const nameNorm = normalizeFa(name);
  if (!yearId || !sectionId || !nameNorm) {
    return Response.json({ duplicate: false });
  }

  const dup = await db.student.findFirst({
    where: { yearId, sectionId, nameNorm, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { fullName: true },
  });

  return Response.json({ duplicate: Boolean(dup), existingName: dup?.fullName ?? null });
}
