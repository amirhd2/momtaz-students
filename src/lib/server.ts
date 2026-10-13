// ابزارهای مشترک روت‌های API
import { isAuthed, unauthorized, SESSION_COOKIE } from '@/lib/auth';

export function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export async function requireAuth(req: Request): Promise<Response | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!(await isAuthed(token))) return unauthorized();
  return null;
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function readInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}
