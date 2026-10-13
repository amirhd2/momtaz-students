import { db } from '@/lib/db';
import { SESSION_COOKIE, hashPassword, sessionTokenFor, ensureSeed } from '@/lib/auth';

export async function POST(req: Request) {
  await ensureSeed();
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const password = (body.password ?? '').trim();
  if (!password) {
    return Response.json({ error: 'رمز را وارد کنید' }, { status: 400 });
  }

  const settings = await db.settings.findUnique({ where: { id: 'main' } });
  if (!settings || settings.passwordHash !== hashPassword(password)) {
    return Response.json({ error: 'رمز وارد شده صحیح نیست' }, { status: 401 });
  }

  const token = sessionTokenFor(settings.passwordHash);
  const res = Response.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
  return res;
}
