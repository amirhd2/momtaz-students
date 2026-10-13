import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { normalizeFa } from '@/lib/persian';
import { serializeCounts, type GroupCounts } from '@/lib/counts';

interface GroupBody {
  yearId?: string;
  sectionId?: string | null;
  title?: string;
  counts?: Partial<GroupCounts>;
}

export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const yearId = url.searchParams.get('yearId') ?? '';
  const sectionParam = url.searchParams.get('sectionId');
  if (!yearId || sectionParam === null) return jsonError('پارامترهای ناقص');

  const sectionId = sectionParam === '' ? null : sectionParam;

  const records = await db.groupRecord.findMany({
    where: { yearId, sectionId },
    orderBy: { title: 'asc' },
  });

  return Response.json({ records });
}

export async function POST(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as GroupBody;
  const yearId = (body.yearId ?? '').trim();
  const sectionId = body.sectionId ? String(body.sectionId).trim() : null;
  const title = (body.title ?? '').trim();

  if (!yearId) return jsonError('سال مشخص نیست');
  if (!title) return jsonError('عنوان را وارد کنید');
  if (sectionId) {
    const section = await db.section.findUnique({ where: { id: sectionId } });
    if (!section || section.yearId !== yearId) return jsonError('بخش نامعتبر است');
  }

  const titleNorm = normalizeFa(title);
  const dup = await db.groupRecord.findFirst({
    where: { yearId, sectionId, titleNorm },
  });
  if (dup) {
    return Response.json(
      { error: `برای «${dup.title}» قبلاً رکورد ثبت شده است؛ همان رکورد را ویرایش کنید` },
      { status: 422 }
    );
  }

  const counts = serializeCounts(body.counts ?? {});
  const record = await db.groupRecord.create({
    data: { yearId, sectionId, title, titleNorm, counts },
  });

  return Response.json({ record }, { status: 201 });
}
