// دانلود فایل نمونه اکسل برای ورود گروهی دانش‌آموزان
import ExcelJS from 'exceljs';
import { requireAuth, jsonError } from '@/lib/server';
import { IMPORT_HEADERS } from '@/lib/excel-import';

const HEADER_FILL = 'FF1F3A5F';
const SAMPLE_FILL = 'FFF3F6FA';

function addGuideRow(ws: ExcelJS.Worksheet, title: string, desc: string) {
  const row = ws.addRow([title, desc]);
  row.getCell(1).font = { bold: true };
  row.getCell(1).alignment = { vertical: 'top' };
  row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
}

export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'سامانه ثبت دانش‌آموزان ممتاز';

  // ─── شیت اصلی: قالب ورود اطلاعات ───
  const ws = workbook.addWorksheet('دانش‌آموزان', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { width: 30 }, // نام دانش‌آموز
    { width: 16 }, // مقطع
    { width: 12 }, // معدل
    { width: 26 }, // والد
    { width: 12 }, // طبقه
    { width: 20 }, // واحد
    { width: 16 }, // جنسیت
  ];

  const headerRow = ws.getRow(1);
  IMPORT_HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  headerRow.height = 30;

  // سه ردیف نمونه — هنگام ورود واقعی این‌ها را حذف کرده یا تیکشان را در پیش‌نمایش بردارید
  const samples = [
    ['محمد رضایی', 'پایه پنجم', 'خیلی خوب', 'علی رضایی', '2', 'فناوری اطلاعات', 'پسر'],
    ['فاطمه کریمی', 'پایه دهم', '19.5', 'حسین کریمی', '1', 'مالی', 'دختر'],
    ['مریم احمدی', 'دانشجو', '17.25', 'رضا احمدی', '3', 'پشتیبانی', 'دختر'],
  ];
  for (const s of samples) {
    const row = ws.addRow(s);
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SAMPLE_FILL } };
      cell.alignment = { vertical: 'middle' };
    });
  }

  // ─── شیت راهنما ───
  const guide = workbook.addWorksheet('راهنما', { views: [{ rightToLeft: true }] });
  guide.columns = [{ width: 26 }, { width: 95 }];
  const titleRow = guide.addRow(['راهنمای پر کردن فایل ورود گروهی', '']);
  [1, 2].forEach((c) => {
    const cell = titleRow.getCell(c);
    cell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });

  addGuideRow(guide, 'نام دانش‌آموز', 'نام و نام خانوادگی کامل. نام تکراری در یک بخش پذیرفته نمی‌شود (با اعراب و حروف عربی/فارسی متفاوت هم مقایسه می‌شود).');
  addGuideRow(guide, 'مقطع تحصیلی', 'یکی از این حالت‌ها: عدد پایه (1 تا 12 یا ۱ تا ۱۲) — یا متن مثل «پایه پنجم»، «هفتم»، «دوازدهم» — یا بازه مثل «اول تا سوم»، «چهارم تا ششم»، «هفتم تا نهم»، «دهم تا دوازدهم» (اولین پایه بازه ثبت می‌شود) — یا «دانشجو» / «دانشگاه» برای دانشگاهی.');
  addGuideRow(guide, 'معدل', 'برای پایه اول تا ششم: «خیلی خوب» (اگر خالی بگذارید خودکار ثبت می‌شود). برای هفتم تا نهم: عدد حداقل 19. برای دهم تا دوازدهم: حداقل 18. برای دانشگاه: حداقل 17. اعشار با نقطه (مثل 19.5) بنویسید؛ اگر 19/5 می‌نویسید فرمت سلول را «متن» کنید تا اکسل آن را تاریخ نکند.');
  addGuideRow(guide, 'نام والد', 'نام و نام خانوادگی والد شاغل در سازمان.');
  addGuideRow(guide, 'طبقه', 'طبقه سازمانی والد (مثلاً 1 یا 2 یا ۳).');
  addGuideRow(guide, 'واحد', 'واحد سازمانی والد (مثلاً مالی، فناوری اطلاعات).');
  addGuideRow(guide, 'جنسیت (اختیاری)', 'دختر یا پسر بنویسید (یا خالی بگذارید). اگر خالی باشد، برنامه جنسیت را از نام کوچک تشخیص می‌دهد؛ نام‌های ناشناخته یا دوجنسیتی در پیش‌نمایش ورود با رنگ زرد مشخص می‌شوند تا خودتان انتخاب کنید.');
  guide.addRow([]);
  addGuideRow(guide, 'نکته مهم', 'ردیف‌های نمونه (خاکستری) فقط برای آموزش است؛ قبل از ارسال نهایی، آن‌ها را حذف کنید یا در پیش‌نمایش تیکشان را بردارید.');
  addGuideRow(guide, 'مرحله ورود', 'پس از بارگذاری فایل، جدول پیش‌نمایش نمایش داده می‌شود؛ ردیف‌های دارای خطا قرمز و تکراری‌ها مشخص می‌شوند و می‌توانید هر ردیف را حذف یا جنسیت را اصلاح کنید. سپس دکمه «ثبت» را بزنید.');

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent('فایل-نمونه-ورود-دانش-آموزان.xlsx')}`,
    },
  });
}
