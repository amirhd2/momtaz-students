// ─────────────────────────────────────────────────────────────────────────────
// بوت‌استرپ اسکیمای دیتابیس (سمت سرور، بدون نیاز به prisma CLI)
//
// چرا؟ در استقرار کاربر (نسخه نصب‌شده) دستور prisma db push اجرا نمی‌شود.
// این ماژول تضمین می‌کند:
//   ۱) نصب تازه: جدول‌ها خودکار ساخته می‌شوند (حتی بدون فایل db آماده)
//   ۲) آپدیت برنامه: اگر نسخه جدید ستون/ایندکس جدیدی داشته باشد، به دیتابیس
//      قدیمیِ پر از داده، به‌صورت افزایشی (بدون حذف هیچ داده‌ای) اضافه می‌شود
//
// همه دستورات idempotent هستند (IF NOT EXISTS / بررسی PRAGMA) و هر بار اجرای
// سرور یک‌بار فراخوانی می‌شوند — هزینه‌ای در حد چند میلی‌ثانیه دارند.
// ─────────────────────────────────────────────────────────────────────────────
import type { PrismaClient } from '@prisma/client';

// DDL مرجع — خروجی رسمی «prisma migrate diff --from-empty» با IF NOT EXISTS
const CREATE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "passwordHash" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Year" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "PrizeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "yearId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    CONSTRAINT "PrizeRate_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "yearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Section_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "yearId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "grade" INTEGER,
    "gpaRaw" TEXT NOT NULL,
    "gpaValue" REAL,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "parentName" TEXT NOT NULL,
    "parentRank" TEXT NOT NULL,
    "parentUnit" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Student_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Student_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "GroupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "yearId" TEXT NOT NULL,
    "sectionId" TEXT,
    "title" TEXT NOT NULL,
    "titleNorm" TEXT NOT NULL,
    "counts" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupRecord_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupRecord_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
];

// ایندکس‌ها — با IF NOT EXISTS تا روی دیتابیس‌های قدیمی هم بی‌خطر باشد
const INDEX_STATEMENTS: string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "Year_name_key" ON "Year"("name")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PrizeRate_yearId_group_key" ON "PrizeRate"("yearId", "group")`,
  `CREATE INDEX IF NOT EXISTS "Student_yearId_sectionId_idx" ON "Student"("yearId", "sectionId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Student_yearId_sectionId_nameNorm_key" ON "Student"("yearId", "sectionId", "nameNorm")`,
  `CREATE INDEX IF NOT EXISTS "GroupRecord_yearId_sectionId_idx" ON "GroupRecord"("yearId", "sectionId")`,
];

/**
 * ستون‌های موردانتظار هر جدول — برای ارتقای دیتابیس‌های نسخه‌های قدیمی‌تر.
 * اگر ستونی در جدول موجود نبود، با ALTER TABLE اضافه می‌شود (داده‌ها دست‌نخورده می‌مانند).
 * نکته: ستون‌های جدید در نسخه‌های آینده باید DEFAULT داشته باشند (محدودیت SQLite در ADD COLUMN).
 */
const DESIRED_COLUMNS: Record<string, Record<string, string>> = {
  Settings: {
    id: `TEXT NOT NULL DEFAULT 'main'`,
    passwordHash: 'TEXT NOT NULL DEFAULT \'\'',
  },
  Year: {
    id: 'TEXT NOT NULL PRIMARY KEY',
    name: `TEXT NOT NULL DEFAULT ''`,
    isActive: 'BOOLEAN NOT NULL DEFAULT false',
    createdAt: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  },
  PrizeRate: {
    id: 'TEXT NOT NULL PRIMARY KEY',
    yearId: `TEXT NOT NULL DEFAULT ''`,
    group: `TEXT NOT NULL DEFAULT ''`,
    amount: 'INTEGER NOT NULL DEFAULT 0',
  },
  Section: {
    id: 'TEXT NOT NULL PRIMARY KEY',
    yearId: `TEXT NOT NULL DEFAULT ''`,
    name: `TEXT NOT NULL DEFAULT ''`,
    type: `TEXT NOT NULL DEFAULT 'GROUP'`,
    createdAt: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  },
  Student: {
    id: 'TEXT NOT NULL PRIMARY KEY',
    yearId: `TEXT NOT NULL DEFAULT ''`,
    sectionId: `TEXT NOT NULL DEFAULT ''`,
    fullName: `TEXT NOT NULL DEFAULT ''`,
    nameNorm: `TEXT NOT NULL DEFAULT ''`,
    gender: `TEXT NOT NULL DEFAULT 'MALE'`,
    grade: 'INTEGER',
    gpaRaw: `TEXT NOT NULL DEFAULT ''`,
    gpaValue: 'REAL',
    isException: 'BOOLEAN NOT NULL DEFAULT false',
    parentName: `TEXT NOT NULL DEFAULT ''`,
    parentRank: `TEXT NOT NULL DEFAULT ''`,
    parentUnit: `TEXT NOT NULL DEFAULT ''`,
    createdAt: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updatedAt: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  },
  GroupRecord: {
    id: 'TEXT NOT NULL PRIMARY KEY',
    yearId: `TEXT NOT NULL DEFAULT ''`,
    sectionId: 'TEXT',
    title: `TEXT NOT NULL DEFAULT ''`,
    titleNorm: `TEXT NOT NULL DEFAULT ''`,
    counts: `TEXT NOT NULL DEFAULT '{}'`,
    createdAt: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updatedAt: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  },
};

let schemaReady = false;

/** ساخت/ارتقای idempotent اسکیما — یک‌بار در هر پروسه، قبل از seed */
export async function ensureSchema(db: PrismaClient): Promise<void> {
  if (schemaReady) return;
  for (const stmt of CREATE_STATEMENTS) {
    await db.$executeRawUnsafe(stmt);
  }
  for (const stmt of INDEX_STATEMENTS) {
    await db.$executeRawUnsafe(stmt);
  }
  // ارتقای افزایشی: افزودن ستون‌های جاافتاده به جدول‌های قدیمی (بدون از دست رفتن داده)
  for (const [table, columns] of Object.entries(DESIRED_COLUMNS)) {
    let existing: Set<string>;
    try {
      const rows = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`);
      existing = new Set(rows.map((r) => String(r.name)));
    } catch {
      continue; // جدول اصلاً وجود ندارد — CREATE بالا مسئول است
    }
    for (const [column, ddl] of Object.entries(columns)) {
      if (existing.has(column)) continue;
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`);
        console.log(`[db-schema] column "${column}" added to "${table}" (schema upgrade)`);
      } catch (err) {
        // ستون همزمان توسط پروسه دیگری اضافه شده باشد — مشکلی نیست
        console.warn(`[db-schema] add column ${table}.${column} skipped:`, err);
      }
    }
  }
  schemaReady = true;
}
