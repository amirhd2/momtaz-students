import ExcelJS from 'exceljs';
import { db } from '@/lib/db';
import { requireAuth, jsonError } from '@/lib/server';
import {
  buildProvincesSheet,
  buildStudentsSheet,
  buildParentSummarySheet,
  buildRankUnitSheet,
  rateMapOf,
} from '@/lib/excel-export';

/** خروجی اکسل — منطق ساخت فایل در lib/excel-export.ts است (مشترک با نسخه مرورگری) */
export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? 'students';
  const yearId = url.searchParams.get('yearId') ?? '';

  if (!yearId) return jsonError('سال مشخص نیست');
  const year = await db.year.findUnique({ where: { id: yearId }, include: { prizes: true } });
  if (!year) return jsonError('سال یافت نشد', 404);
  const rates = rateMapOf(year.prizes);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'سامانه ثبت دانش‌آموزان ممتاز';

  if (type === 'provinces') {
    const sectionParam = url.searchParams.get('sectionId');
    const sectionId = sectionParam && sectionParam !== '' ? sectionParam : null;
    const section = sectionId ? await db.section.findUnique({ where: { id: sectionId } }) : null;
    const records = await db.groupRecord.findMany({
      where: { yearId: year.id, sectionId },
      orderBy: { title: 'asc' },
    });
    buildProvincesSheet(workbook, {
      year: { id: year.id, name: year.name },
      rates,
      sectionName: section?.name ?? null,
      records,
    });
  } else {
    const sectionId = url.searchParams.get('sectionId') ?? '';
    const groupBy = url.searchParams.get('groupBy') ?? 'parent';
    const section = await db.section.findUnique({ where: { id: sectionId } });
    if (!section || section.yearId !== year.id) return jsonError('بخش یافت نشد', 404);
    const students = await db.student.findMany({ where: { sectionId: section.id } });
    const ctx = { year: { id: year.id, name: year.name }, section: { id: section.id, name: section.name }, rates, students };
    if (groupBy === 'parent') {
      // خلاصه پرداخت به ازای هر والد شاغل (مخصوص واحد مالی)
      buildParentSummarySheet(workbook, ctx);
    } else if (groupBy === 'rankUnit') {
      // گروه‌بندی دوسطحی: اول طبقه، بعد واحدهای همان طبقه
      buildRankUnitSheet(workbook, ctx);
    } else {
      buildStudentsSheet(workbook, { ...ctx, groupBy });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const today = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
  const filename = `export-${today}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
