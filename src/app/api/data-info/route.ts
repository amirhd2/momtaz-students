import { requireAuth } from '@/lib/server';
import { getDbLocationInfo } from '@/lib/db-location';

/**
 * اطلاعات محل نگهداری داده‌ها روی این سیستم — برای نمایش در تنظیمات (تب پشتیبان‌گیری).
 * به کاربر نشان می‌دهد داده‌هایش کجا ذخیره می‌شود و چه پشتیبان‌های خودکاری موجود است.
 */
export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const info = getDbLocationInfo();
  return Response.json({
    storageKind: info.storageKind,
    dataDir: info.dataDir,
    dbPath: info.dbPath,
    backupsDir: info.backupsDir,
    backups: info.backups.slice(0, 7).map((b) => ({
      name: b.name,
      size: b.size,
      mtime: b.mtime,
    })),
    migratedFrom: info.migratedFrom,
    backedUpThisRun: info.backedUpThisRun,
  });
}
