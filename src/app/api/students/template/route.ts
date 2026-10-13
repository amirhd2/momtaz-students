// دانلود فایل نمونه اکسل برای ورود گروهی دانش‌آموزان — منطق در lib/excel-export.ts
import ExcelJS from 'exceljs';
import { requireAuth } from '@/lib/server';
import { buildTemplateSheets } from '@/lib/excel-export';

export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'سامانه ثبت دانش‌آموزان ممتاز';
  buildTemplateSheets(workbook);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent('فایل-نمونه-ورود-دانش-آموزان.xlsx')}`,
    },
  });
}
