import { getCookie, requireAuth } from '@/lib/server';
import { SESSION_COOKIE, isAuthed } from '@/lib/auth';

export async function GET(req: Request) {
  const token = getCookie(req, SESSION_COOKIE);
  const ok = await isAuthed(token);
  return Response.json({ authenticated: ok });
}

export async function POST(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  return Response.json({ authenticated: true });
}
