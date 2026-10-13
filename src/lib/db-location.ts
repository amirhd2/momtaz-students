// ─────────────────────────────────────────────────────────────────────────────
// محل ذخیره دیتابیس — «امانت‌دار داده‌ها»
//
// مشکل: فایل دیتابیس داخل پوشه برنامه بود (db/custom.db)؛ با نصب آپدیت جدید
// (جایگزینی پوشه برنامه) فایل دیتابیس هم حذف/بازنویسی می‌شد و داده‌های کاربر
// با داده‌های پیش‌فرض جایگزین می‌شد.
//
// راه‌حل: در حالت production فایل دیتابیس در یک «پوشه داده پایدار» خارج از
// پوشه برنامه نگهداری می‌شود (متناسب با سیستم‌عامل). نصب یا به‌روزرسانی برنامه
// هرگز این پوشه را دست نمی‌زند. در اولین اجرای نسخه جدید، اگر دیتابیس قدیمی
// داخل پوشه برنامه پیدا شود، خودکار به محل پایدار منتقل (کپی) می‌شود.
// علاوه بر آن، در هر اجرای سرور یک نسخه پشتیبان خودکار نگهداری می‌شود.
//
// در حالت dev (توسعه) رفتار قبلی حفظ می‌شود تا prisma db push و ابزارهای
// توسعه با همان db/custom.db کار کنند.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface BackupInfo {
  file: string;
  name: string;
  size: number;
  mtime: number;
}

export interface DbLocationInfo {
  /** persistent = پوشه داده پایدار (production) | legacy-dev = داخل پوشه برنامه (فقط توسعه) */
  storageKind: 'persistent' | 'legacy-dev';
  /** URL اتصال Prisma (file:...) */
  url: string;
  dataDir: string;
  dbPath: string;
  backupsDir: string;
  backups: BackupInfo[];
  /** فایلی که داده‌های قدیمی از آن منتقل شده است (فقط بار اول) */
  migratedFrom: string | null;
  /** آیا در این اجرا پشتیبان خودکار گرفته شد */
  backedUpThisRun: boolean;
}

const APP_DIR_NAME = 'StudentRegistry';
const DB_FILE_NAME = 'data.db';
const BACKUPS_DIR_NAME = 'backups';
const MAX_AUTO_BACKUPS = 7;

const globalForDbLocation = globalThis as unknown as {
  __dbLocation?: DbLocationInfo;
};

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

/** پوشه داده پایدار متناسب با سیستم‌عامل — خارج از پوشه برنامه */
function userDataDir(): string {
  // اولویت اول: مسیر صریح (برای استقرار سفارشی/تست)
  const override = process.env.DATA_DIR?.trim();
  if (override) return path.resolve(override);

  if (process.platform === 'win32') {
    // %APPDATA%\StudentRegistry  →  C:\Users\<user>\AppData\Roaming\StudentRegistry
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      APP_DIR_NAME
    );
  }
  if (process.platform === 'darwin') {
    // ~/Library/Application Support/StudentRegistry
    return path.join(os.homedir(), 'Library', 'Application Support', APP_DIR_NAME);
  }
  // لینوکس: XDG_DATA_HOME یا ~/.local/share/StudentRegistry
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    APP_DIR_NAME
  );
}

/** تبدیل file: URL به مسیر فایل (بهترین تلاش؛ در صورت شکست مسیر خام برمی‌گردد) */
function fileUrlToPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith('file:')) return null;
  let p = trimmed.slice('file:'.length);
  if (!p) return null;
  try {
    p = decodeURIComponent(p);
  } catch {
    // مسیر شامل % واقعی بود — همان مسیر خام استفاده می‌شود
  }
  return p;
}

/** مسیرهای محتمل دیتابیس قدیمی داخل پوشه برنامه (نسخه‌های قبلی برنامه) */
function legacyCandidates(): string[] {
  const out: string[] = [];
  const push = (p?: string | null) => {
    if (p) out.push(p);
  };

  // مسیری که .env نسخه قبلی مشخص کرده بود — قوی‌ترین سرنخ
  push(fileUrlToPath(process.env.DATABASE_URL ?? ''));

  // مسیرهای نسبی شناخته‌شده نسبت به پوشه اجرا (server.js مستقل به پوشه خودش chdir می‌کند)
  const cwd = process.cwd();
  for (const rel of [path.join('db', 'custom.db'), path.join('prisma', 'dev.db')]) {
    push(path.join(cwd, rel));
    push(path.resolve(cwd, '..', rel));
    push(path.resolve(cwd, '..', '..', rel));
  }

  // حذف تکراری‌ها
  return [...new Set(out)];
}

function listBackups(backupsDir: string): BackupInfo[] {
  try {
    return fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const full = path.join(backupsDir, f);
        const st = fs.statSync(full);
        return { file: full, name: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

/** گرفتن یک پشتیبان خودکار و نگهداری چند نسخه آخر */
function takeAutoBackup(dbPath: string, backupsDir: string): void {
  try {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
      now.getHours()
    )}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const target = path.join(backupsDir, `auto-${stamp}.db`);
    fs.copyFileSync(dbPath, target);
    // فایل‌های جانبی WAL/SHM در صورت وجود
    for (const ext of ['-wal', '-shm']) {
      const side = dbPath + ext;
      if (fs.existsSync(side)) {
        try {
          fs.copyFileSync(side, target + ext);
        } catch {
          /* جانبی مهم نیست */
        }
      }
    }
    // گردش: فقط آخرین نسخه‌ها بمانند
    const backups = listBackups(backupsDir);
    for (const old of backups.slice(MAX_AUTO_BACKUPS)) {
      try {
        fs.unlinkSync(old.file);
      } catch {
        /* اگر حذف نشد مهم نیست */
      }
    }
  } catch (err) {
    // پشتیبان‌گیری هرگز نباید اجرای برنامه را متوقف کند
    console.warn('[db-location] auto-backup failed:', err);
  }
}

/**
 * تعیین محل دیتابیس (یک‌بار در هر پروسه) + انتقال داده‌های قدیمی + پشتیبان خودکار.
 * باید قبل از ساخت PrismaClient صدا زده شود.
 */
export function resolveDbLocation(): DbLocationInfo {
  if (globalForDbLocation.__dbLocation) return globalForDbLocation.__dbLocation;

  // فاز build نباید هیچ اثر جانبی روی فایل‌ها بگذارد
  if (isBuildPhase()) {
    const info: DbLocationInfo = {
      storageKind: 'legacy-dev',
      url: process.env.DATABASE_URL || `file:${path.join(process.cwd(), 'db', 'custom.db').replace(/\\/g, '/')}`,
      dataDir: process.cwd(),
      dbPath: path.join(process.cwd(), 'db', 'custom.db'),
      backupsDir: path.join(process.cwd(), 'db'),
      backups: [],
      migratedFrom: null,
      backedUpThisRun: false,
    };
    globalForDbLocation.__dbLocation = info;
    return info;
  }

  // حالت توسعه: همان db پروژه (سازگاری با prisma db push و ابزارهای توسعه)
  if (process.env.NODE_ENV !== 'production') {
    const envPath = fileUrlToPath(process.env.DATABASE_URL ?? '');
    const devPath =
      envPath && path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), 'db', 'custom.db');
    const info: DbLocationInfo = {
      storageKind: 'legacy-dev',
      url: `file:${devPath.replace(/\\/g, '/')}`,
      dataDir: path.dirname(devPath),
      dbPath: devPath,
      backupsDir: path.dirname(devPath),
      backups: [],
      migratedFrom: null,
      backedUpThisRun: false,
    };
    globalForDbLocation.__dbLocation = info;
    return info;
  }

  // ── production: پوشه داده پایدار ──
  const dataDir = userDataDir();
  const dbPath = path.join(dataDir, DB_FILE_NAME);
  const backupsDir = path.join(dataDir, BACKUPS_DIR_NAME);

  let migratedFrom: string | null = null;

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
  } catch (err) {
    // اگر ساخت پوشه ممکن نشد، برنامه نباید از کار بیفتد — به مسیر قدیمی برمی‌گردیم
    console.error('[db-location] cannot create data dir, falling back to app folder:', err);
    const fallback = path.join(process.cwd(), 'db', 'custom.db');
    const info: DbLocationInfo = {
      storageKind: 'legacy-dev',
      url: `file:${fallback.replace(/\\/g, '/')}`,
      dataDir: path.dirname(fallback),
      dbPath: fallback,
      backupsDir: path.dirname(fallback),
      backups: [],
      migratedFrom: null,
      backedUpThisRun: false,
    };
    globalForDbLocation.__dbLocation = info;
    return info;
  }

  // اولین اجرای نسخه جدید؟ دیتابیس قدیمی داخل پوشه برنامه را پیدا و منتقل کن
  if (!fs.existsSync(dbPath)) {
    for (const candidate of legacyCandidates()) {
      try {
        if (!candidate || candidate === dbPath) continue;
        if (!fs.existsSync(candidate)) continue;
        // هرگز دیتابیسِ خود پوشه داده پایدار را به خودش کپی نکن
        if (path.resolve(candidate) === path.resolve(dbPath)) continue;
        fs.copyFileSync(candidate, dbPath);
        for (const ext of ['-wal', '-shm']) {
          const side = candidate + ext;
          if (fs.existsSync(side)) {
            try {
              fs.copyFileSync(side, dbPath + ext);
            } catch {
              /* جانبی مهم نیست */
            }
          }
        }
        migratedFrom = candidate;
        console.log(`[db-location] existing database migrated from: ${candidate}`);
        break;
      } catch (err) {
        console.warn('[db-location] migration candidate failed:', candidate, err);
      }
    }
  }

  // پشتیبان خودکار در هر اجرای سرور (خیلی سریع است؛ فایل چندصد کیلوبایتی)
  let backedUpThisRun = false;
  if (fs.existsSync(dbPath)) {
    takeAutoBackup(dbPath, backupsDir);
    backedUpThisRun = true;
  }

  // URL برای Prisma — اسلش رو به جلو تا در ویندوز هم معتبر باشد
  const url = `file:${dbPath.replace(/\\/g, '/')}`;

  const info: DbLocationInfo = {
    storageKind: 'persistent',
    url,
    dataDir,
    dbPath,
    backupsDir,
    backups: listBackups(backupsDir),
    migratedFrom,
    backedUpThisRun,
  };
  globalForDbLocation.__dbLocation = info;
  console.log(`[db-location] database file: ${dbPath}`);
  return info;
}

/** اطلاعات محل ذخیره برای نمایش در تنظیمات (بدون اثر جانبی) */
export function getDbLocationInfo(): DbLocationInfo {
  const info = resolveDbLocation();
  if (info.storageKind === 'persistent') {
    // لیست پشتیبان‌ها هر بار تازه خوانده شود
    return { ...info, backups: listBackups(info.backupsDir) };
  }
  return info;
}
