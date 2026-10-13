import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import { hashPassword, sessionTokenFor, SESSION_COOKIE, invalidateAuthCache } from '@/lib/auth';

export async function PUT(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
  };

  const current = (body.currentPassword ?? '').trim();
  const next = (body.newPassword ?? '').trim();

  const settings = await db.settings.findUnique({ where: { id: 'main' } });
  if (!settings) return jsonError('تنظیمات یافت نشد', 500);

  if (settings.passwordHash !== hashPassword(current)) {
    return jsonError('رمز فعلی صحیح نیست');
  }
  if (next.length < 4) {
    return jsonError('رمز جدید باید حداقل 4 کاراکتر باشد');
  }

  const newHash = hashPassword(next);
  await db.settings.update({ where: { id: 'main' }, data: { passwordHash: newHash } });
  invalidateAuthCache();

  const res = Response.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(sessionTokenFor(newHash))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
  return res;
}
