import { PrismaClient } from '@prisma/client'
import { resolveDbLocation, type DbLocationInfo } from '@/lib/db-location'

// محل فایل دیتابیس یک‌بار در هر پروسه تعیین می‌شود:
// - production: پوشه داده پایدار خارج از پوشه برنامه (نصب/آپدیت جدید داده‌ها را پاک نمی‌کند)
// - development: همان db/custom.db پروژه (سازگاری با prisma db push)
const location: DbLocationInfo = resolveDbLocation()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __dbLocation?: DbLocationInfo
}
globalForPrisma.__dbLocation = location

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // لاگ کوئری‌ها غیرفعال باشد — در حجم بالا سربار محسوس و کندی ایجاد می‌کند
    log: [],
    // مسیر واقعی فایل دیتابیس (override بر DATABASE_URL برای استقرار پایدار)
    datasourceUrl: location.url,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
