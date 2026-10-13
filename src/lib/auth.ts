// کمک‌تابع‌های احراز هویت و مقداردهی اولیه دیتابیس (سمت سرور)
import { createHash, randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { ensureSchema } from '@/lib/db-schema';

const DEFAULT_PASSWORD = '1234';

export function hashPassword(password: string): string {
  return createHash('sha256').update(`student-app::${password}`).digest('hex');
}

export function sessionTokenFor(passwordHash: string): string {
  return createHash('sha256').update(`session::${passwordHash}`).digest('hex');
}

export const SESSION_COOKIE = 'sa_session';

export function newId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

/** اطمینان از وجود ردیف تنظیمات و داده اولیه (سال فعال، بخش ستاد، مبالغ جوایز) */
let seedChecked = false;

export async function ensureSeed(): Promise<void> {
  // فقط اولین درخواست هر پروسه بررسی می‌شود؛ در درخواست‌های بعدی هیچ کوئری‌ای اجرا نمی‌شود
  if (seedChecked) return;
  seedChecked = true;
  try {
    // ۱) ساخت/ارتقای اسکیما (نصب تازه یا آپدیت برنامه — هرگز داده حذف نمی‌کند)
    await ensureSchema(db);
    // ۲) داده اولیه فقط در صورت خالی بودن جدول‌ها
    await doSeed();
  } catch (err) {
    // در صورت خطا در اولین اجرا، در فرصت بعدی دوباره تلاش شود
    seedChecked = false;
    throw err;
  }
}

async function doSeed(): Promise<void> {
  const existing = await db.settings.findUnique({ where: { id: 'main' } });
  if (!existing) {
    await db.settings.create({ data: { id: 'main', passwordHash: hashPassword(DEFAULT_PASSWORD) } });
  }

  const yearCount = await db.year.count();
  if (yearCount === 0) {
    const year = await db.year.create({
      data: { name: '1404-1405', isActive: true },
    });
    const amounts: Record<string, number> = {
      G1_3: 1000000,
      G4_6: 1000000,
      G7_9: 1500000,
      G10_12: 2000000,
      UNI: 2500000,
    };
    for (const [group, amount] of Object.entries(amounts)) {
      await db.prizeRate.create({ data: { yearId: year.id, group, amount } });
    }
    await db.section.create({
      data: { yearId: year.id, name: 'ستاد', type: 'INDIVIDUAL' },
    });
  } else {
    // اطمینان از وجود سال فعال
    const active = await db.year.findFirst({ where: { isActive: true } });
    if (!active) {
      const first = await db.year.findFirst({ orderBy: { createdAt: 'asc' } });
      if (first) await db.year.update({ where: { id: first.id }, data: { isActive: true } });
    }
  }
}

// ─── کش در حافظه برای هش رمز — حذف کوئری دیتابیس از هر درخواست API ───
let cachedHash: { value: string; at: number } | null = null;
const SETTINGS_TTL = 10_000; // ۱۰ ثانیه

/** با تغییر رمز عبور باید صدا زده شود تا کش بلافاصله باطل شود */
export function invalidateAuthCache(): void {
  cachedHash = null;
}

async function getPasswordHash(): Promise<string | null> {
  const now = Date.now();
  if (cachedHash && now - cachedHash.at < SETTINGS_TTL) return cachedHash.value;
  const settings = await db.settings.findUnique({ where: { id: 'main' }, select: { passwordHash: true } });
  if (!settings) return null;
  cachedHash = { value: settings.passwordHash, at: now };
  return settings.passwordHash;
}

/** بررسی نشست فعال از کوکی */
export async function isAuthed(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const hash = await getPasswordHash();
  if (!hash) return false;
  return cookieValue === sessionTokenFor(hash);
}

/** پاسخ 401 استاندارد */
export function unauthorized(): Response {
  return Response.json({ error: 'برای دسترسی ابتدا وارد شوید' }, { status: 401 });
}
