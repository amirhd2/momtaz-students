// خواندن فایل اکسل ورود گروهی و بازگرداندن ردیف‌های خام برای پیش‌نمایش
import ExcelJS from 'exceljs';
import { requireAuth, jsonError } from '@/lib/server';
import { cellToText } from '@/lib/excel-import';

const MAX_ROWS = 1000;
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('فایل ارسال نشده است');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return jsonError('فایل اکسل یافت نشد');
  if (file.size > MAX_SIZE) return jsonError('حجم فایل بیش از حد مجاز است (حداکثر ۵ مگابایت)');
  if (!/\.xlsx?$/i.test(file.name)) return jsonError('فقط فایل اکسل (xlsx) پذیرفته می‌شود');

  try {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return jsonError('فایل هیچ برگه‌ای ندارد');

    const rows: Array<{ fileRow: number; cells: string[] }> = [];

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // سرستون‌ها
      const cells: string[] = [];
      for (let c = 1; c <= 7; c++) {
        cells.push(cellToText(row.getCell(c).value));
      }
      if (cells.every((x) => !x)) return; // ردیف کاملاً خالی
      rows.push({ fileRow: rowNumber, cells });
    });

    if (rows.length === 0) {
      return jsonError('هیچ ردیف داده‌ای در فایل پیدا نشد');
    }
    if (rows.length > MAX_ROWS) {
      return jsonError(`تعداد ردیف‌ها بیش از حد مجاز است (حداکثر ${MAX_ROWS} ردیف)`);
    }

    return Response.json({ rows });
  } catch (err) {
    console.error('excel parse error', err);
    return jsonError('خواندن فایل اکسل ناموفق بود — مطمئن شوید فایل xlsx سالم است');
  }
}
