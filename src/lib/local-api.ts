// پیاده‌سازی مرورگری تمام روت‌های API — فقط در بیلد استاتیک (NEXT_PUBLIC_DATA_MODE=local)
// خروجی هر هندلر یک Response واقعی است تا apiFetch بدون تغییر رفتار کند.
import { normalizeFa } from '@/lib/persian';
import { validateGpa } from '@/lib/gpa';
import { serializeCounts, GROUP_KEYS, type GroupCounts } from '@/lib/counts';
import { detectGender } from '@/lib/persian-names';
import { cellToText } from '@/lib/excel-import';
import {
  buildProvincesSheet,
  buildStudentsSheet,
  buildParentSummarySheet,
  buildRankUnitSheet,
  buildTemplateSheets,
  rateMapOf,
} from '@/lib/excel-export';
import {
  getState,
  markDirty,
  replaceState,
  hashPassword,
  sessionTokenFor,
  newId,
  type LocalState,
  type LocalStudent,
} from '@/lib/local-store';
import type { GroupKey } from '@/lib/gpa';

const SESSION_KEY = 'sa_local_session';
const unauthorized = () =>
  jsonRes({ error: 'برای دسترسی ابتدا وارد شوید' }, 401);

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function errRes(message: string, status = 400): Response {
  return jsonRes({ error: message }, status);
}

function fileRes(buffer: ArrayBuffer | string, contentType: string, filename: string): Response {
  return new Response(buffer as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

function readInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function cleanStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

async function getExcelJS(): Promise<typeof import('exceljs')> {
  // فیلد browser پکیج exceljs به‌صورت خودکار باندل مرورگری (dist/exceljs.min.js) را بار می‌کند
  const mod: unknown = await import('exceljs');
  const m = mod as { default?: typeof import('exceljs') } & typeof import('exceljs');
  return (m.default ?? m) as typeof import('exceljs');
}

function readBody(init: RequestInit | undefined): { json: Record<string, unknown>; form: FormData | null } {
  if (!init?.body) return { json: {}, form: null };
  if (typeof init.body === 'string') {
    try {
      return { json: JSON.parse(init.body) as Record<string, unknown>, form: null };
    } catch {
      return { json: {}, form: null };
    }
  }
  if (init.body instanceof FormData) return { json: {}, form: init.body };
  return { json: {}, form: null };
}

async function getSessionToken(): Promise<string | null> {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

async function authed(s: LocalState): Promise<boolean> {
  const token = await getSessionToken();
  if (!token) return false;
  return token === (await sessionTokenFor(s.settings.passwordHash));
}

function yearsDesc(s: LocalState) {
  return [...s.years].sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // صعودی = ترتیب درج
}
function yearsInsertionFirst(s: LocalState) {
  return yearsDesc(s);
}

/* ─────────── دانش‌آموز ─────────── */

interface StudentBody {
  yearId?: string;
  sectionId?: string;
  fullName?: string;
  gender?: string;
  grade?: number | null;
  gpaRaw?: string;
  isException?: boolean;
  parentName?: string;
  parentRank?: string;
  parentUnit?: string;
}

function validateStudent(s: LocalState, body: StudentBody, excludeId?: string) {
  const yearId = cleanStr(body.yearId);
  const sectionId = cleanStr(body.sectionId);
  const fullName = cleanStr(body.fullName);
  const gender = body.gender === 'FEMALE' || body.gender === 'MALE' ? body.gender : '';
  const grade = body.grade === null || body.grade === undefined ? null : Number(body.grade);
  const gpaRaw = cleanStr(body.gpaRaw);
  const parentName = cleanStr(body.parentName);
  const parentRank = cleanStr(body.parentRank);
  const parentUnit = cleanStr(body.parentUnit);

  if (!yearId || !sectionId) return { error: 'سال یا بخش مشخص نیست' } as const;
  const cleanName = fullName.replace(/\s+/g, ' ');
  if (!cleanName) return { error: 'نام و نام خانوادگی دانش‌آموز الزامی است' } as const;
  if (!gender) return { error: 'جنسیت را انتخاب کنید' } as const;
  if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 12)) {
    return { error: 'مقطع تحصیلی نامعتبر است' } as const;
  }
  if (!gpaRaw) return { error: 'معدل را وارد کنید' } as const;

  const nameNorm = normalizeFa(cleanName);
  const dup = s.students.find(
    (st) => st.yearId === yearId && st.sectionId === sectionId && st.nameNorm === nameNorm && st.id !== excludeId
  );
  if (dup) {
    return {
      error: `دانش‌آموزی با نام «${dup.fullName}» قبلاً در این بخش ثبت شده است`,
      duplicate: true,
    } as const;
  }

  const validation = validateGpa(grade, gpaRaw);
  if (!validation.valid && !body.isException) {
    return { error: validation.message ?? 'معدل نامعتبر است', gpaInvalid: true } as const;
  }

  return {
    data: {
      yearId,
      sectionId,
      fullName: cleanName,
      nameNorm,
      gender,
      grade,
      gpaRaw: validation.normalizedRaw || gpaRaw,
      gpaValue: validation.gpaValue,
      isException: !validation.valid && body.isException === true,
      parentName,
      parentRank,
      parentUnit,
    },
  } as const;
}

function studentToLike(st: LocalStudent) {
  return {
    fullName: st.fullName,
    gender: st.gender,
    grade: st.grade,
    gpaRaw: st.gpaRaw,
    gpaValue: st.gpaValue,
    parentName: st.parentName,
    parentRank: st.parentRank,
    parentUnit: st.parentUnit,
    isException: st.isException,
  };
}

/* ─────────── روتر اصلی ─────────── */

export async function localHandle(url: string, init?: RequestInit): Promise<Response> {
  const s = await getState();
  const u = new URL(url, 'http://local');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const method = (init?.method ?? 'GET').toUpperCase();
  const { json, form } = readBody(init);

  /* ── ورود / خروج ── */
  if (path === '/api/auth/login' && method === 'POST') {
    const password = cleanStr(json.password);
    if (!password) return errRes('رمز را وارد کنید', 400);
    const hash = await hashPassword(password);
    if (hash !== s.settings.passwordHash) return errRes('رمز وارد شده صحیح نیست', 401);
    try {
      localStorage.setItem(SESSION_KEY, await sessionTokenFor(s.settings.passwordHash));
    } catch {
      /* ignore */
    }
    return jsonRes({ ok: true });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    return jsonRes({ ok: true });
  }

  if (path === '/api/auth/me') {
    return jsonRes({ authenticated: await authed(s) });
  }

  /* ── داده اولیه ── */
  if (path === '/api/bootstrap' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const yearsDescList = [...s.years].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const activeYear = yearsDescList.find((y) => y.isActive) ?? yearsDescList[0] ?? null;
    return jsonRes({
      years: yearsDescList.map((y) => {
        const sections = s.sections
          .filter((sec) => sec.yearId === y.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((sec) => ({
            id: sec.id,
            name: sec.name,
            type: sec.type,
            studentCount: s.students.filter((st) => st.sectionId === sec.id).length,
            groupCount: s.groupRecords.filter((g) => g.sectionId === sec.id).length,
          }));
        return { id: y.id, name: y.name, isActive: y.isActive, sections };
      }),
      activeYearId: activeYear?.id ?? null,
      prizes: activeYear
        ? (Object.fromEntries(
            GROUP_KEYS.map((key) => [key, activeYear.prizes.find((p) => p.group === key)?.amount ?? 0])
          ) as Record<GroupKey, number>)
        : null,
    });
  }

  /* ── دانش‌آموزان ── */
  if (path === '/api/students/check' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const yearId = u.searchParams.get('yearId') ?? '';
    const sectionId = u.searchParams.get('sectionId') ?? '';
    const name = u.searchParams.get('name') ?? '';
    const excludeId = u.searchParams.get('excludeId') ?? undefined;
    const nameNorm = normalizeFa(name);
    if (!yearId || !sectionId || !nameNorm) return jsonRes({ duplicate: false });
    const dup = s.students.find(
      (st) =>
        st.yearId === yearId && st.sectionId === sectionId && st.nameNorm === nameNorm && st.id !== excludeId
    );
    return jsonRes({ duplicate: Boolean(dup), existingName: dup?.fullName ?? null });
  }

  if (path === '/api/students/template' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const X = await getExcelJS();
    const wb = new X.Workbook();
    wb.creator = 'سامانه ثبت دانش‌آموزان ممتاز';
    buildTemplateSheets(wb);
    const buf = await wb.xlsx.writeBuffer();
    return fileRes(
      buf as ArrayBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'فایل-نمونه-ورود-دانش-آموزان.xlsx'
    );
  }

  if (path === '/api/students/import-parse' && method === 'POST') {
    if (!(await authed(s))) return unauthorized();
    if (!form) return errRes('فایل ارسال نشده است');
    const file = form.get('file');
    if (!(file instanceof File)) return errRes('فایل اکسل یافت نشد');
    if (file.size > 5 * 1024 * 1024) return errRes('حجم فایل بیش از حد مجاز است (حداکثر ۵ مگابایت)');
    if (!/\.xlsx?$/i.test(file.name)) return errRes('فقط فایل اکسل (xlsx) پذیرفته می‌شود');
    try {
      const buf = await file.arrayBuffer();
      const X = await getExcelJS();
      const wb = new X.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      if (!ws) return errRes('فایل هیچ برگه‌ای ندارد');
      const rows: Array<{ fileRow: number; cells: string[] }> = [];
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // سرستون‌ها
        const cells: string[] = [];
        for (let c = 1; c <= 7; c++) cells.push(cellToText(row.getCell(c).value));
        if (cells.every((x) => !x)) return; // ردیف کاملاً خالی
        rows.push({ fileRow: rowNumber, cells });
      });
      if (rows.length === 0) return errRes('هیچ ردیف داده‌ای در فایل پیدا نشد');
      if (rows.length > 1000) return errRes('تعداد ردیف‌ها بیش از حد مجاز است (حداکثر 1000 ردیف)');
      return jsonRes({ rows });
    } catch {
      return errRes('خواندن فایل اکسل ناموفق بود — مطمئن شوید فایل xlsx سالم است');
    }
  }

  if (path === '/api/students/import' && method === 'POST') {
    if (!(await authed(s))) return unauthorized();
    const yearId = cleanStr(json.yearId);
    const sectionId = cleanStr(json.sectionId);
    const rows = Array.isArray(json.rows) ? (json.rows as StudentBody[]) : [];
    if (!yearId || !sectionId) return errRes('سال یا بخش مشخص نیست');
    if (rows.length === 0) return errRes('ردیفی برای ثبت وجود ندارد');
    if (rows.length > 1000) return errRes('تعداد ردیف‌ها بیش از حد مجاز است');
    const section = s.sections.find((sec) => sec.id === sectionId);
    if (!section || section.yearId !== yearId) return errRes('بخش یافت نشد', 404);
    if (section.type !== 'INDIVIDUAL') return errRes('ورود گروهی فقط برای بخش‌های تکی است');

    const existing = s.students.filter((st) => st.yearId === yearId && st.sectionId === sectionId);
    const existingNorms = new Set(existing.map((e) => e.nameNorm));
    const existingByName = new Map(existing.map((e) => [e.nameNorm, e.fullName]));

    const toInsert: LocalStudent[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const row of rows) {
      const fullName = cleanStr(row.fullName).replace(/\s+/g, ' ');
      if (!fullName) {
        skipped.push({ name: '(بدون نام)', reason: 'نام دانش‌آموز خالی است' });
        continue;
      }
      const nameNorm = normalizeFa(fullName);
      if (existingNorms.has(nameNorm)) {
        skipped.push({
          name: fullName,
          reason: `نام تکراری است (قبلاً «${existingByName.get(nameNorm) ?? fullName}» ثبت شده)`,
        });
        continue;
      }
      const gender =
        row.gender === 'FEMALE' || row.gender === 'MALE'
          ? row.gender
          : detectGender(fullName) === 'MALE'
            ? 'MALE'
            : detectGender(fullName) === 'FEMALE'
              ? 'FEMALE'
              : '';
      if (!gender) {
        skipped.push({ name: fullName, reason: 'جنسیت مشخص نشده است' });
        continue;
      }
      const gradeRaw = row.grade === null || row.grade === undefined ? null : Number(row.grade);
      const grade =
        gradeRaw !== null && Number.isInteger(gradeRaw) && gradeRaw >= 1 && gradeRaw <= 12 ? gradeRaw : undefined;
      if (grade === undefined) {
        skipped.push({ name: fullName, reason: 'مقطع تحصیلی نامعتبر است' });
        continue;
      }
      const gpaRaw = cleanStr(row.gpaRaw);
      if (!gpaRaw) {
        skipped.push({ name: fullName, reason: 'معدل خالی است' });
        continue;
      }
      const validation = validateGpa(grade, gpaRaw);
      if (!validation.valid && row.isException !== true) {
        skipped.push({ name: fullName, reason: validation.message ?? 'معدل نامعتبر است' });
        continue;
      }
      toInsert.push({
        id: newId(),
        yearId,
        sectionId,
        fullName,
        nameNorm,
        gender,
        grade,
        gpaRaw: validation.normalizedRaw || gpaRaw,
        gpaValue: validation.gpaValue,
        isException: !validation.valid && row.isException === true,
        parentName: cleanStr(row.parentName),
        parentRank: cleanStr(row.parentRank),
        parentUnit: cleanStr(row.parentUnit),
        createdAt: new Date().toISOString(),
      });
      existingNorms.add(nameNorm);
      existingByName.set(nameNorm, fullName);
    }

    if (toInsert.length > 0) {
      s.students.push(...toInsert);
      markDirty();
    }
    return jsonRes({ inserted: toInsert.length, skipped });
  }

  if (path === '/api/students' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const yearId = u.searchParams.get('yearId') ?? '';
    const sectionId = u.searchParams.get('sectionId') ?? '';
    if (!yearId || !sectionId) return errRes('سال یا بخش مشخص نیست');
    const students = s.students
      .filter((st) => st.yearId === yearId && st.sectionId === sectionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return jsonRes({ students });
  }

  if (path === '/api/students' && method === 'POST') {
    if (!(await authed(s))) return unauthorized();
    const result = validateStudent(s, json as StudentBody);
    if ('error' in result) return errRes(result.error, 422);
    const student: LocalStudent = { id: newId(), createdAt: new Date().toISOString(), ...result.data };
    s.students.push(student);
    markDirty();
    return jsonRes({ student }, 201);
  }

  const studentIdMatch = path.match(/^\/api\/students\/([^/]+)$/);
  if (studentIdMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!(await authed(s))) return unauthorized();
    const id = decodeURIComponent(studentIdMatch[1]);
    const idx = s.students.findIndex((st) => st.id === id);
    if (idx < 0) return errRes('رکورد یافت نشد', 404);
    const existing = s.students[idx];

    if (method === 'DELETE') {
      s.students.splice(idx, 1);
      markDirty();
      return jsonRes({ ok: true });
    }

    const fullName =
      typeof json.fullName === 'string' ? json.fullName.trim().replace(/\s+/g, ' ') : existing.fullName;
    const gender = json.gender === 'FEMALE' || json.gender === 'MALE' ? json.gender : existing.gender;
    const grade =
      json.grade === null || json.grade === undefined
        ? null
        : Number.isInteger(Number(json.grade))
          ? Number(json.grade)
          : existing.grade;
    const gpaRaw = typeof json.gpaRaw === 'string' ? json.gpaRaw.trim() : existing.gpaRaw;
    const parentName = typeof json.parentName === 'string' ? json.parentName.trim() : existing.parentName;
    const parentRank = typeof json.parentRank === 'string' ? json.parentRank.trim() : existing.parentRank;
    const parentUnit = typeof json.parentUnit === 'string' ? json.parentUnit.trim() : existing.parentUnit;

    if (!fullName) return errRes('نام و نام خانوادگی دانش‌آموز الزامی است');
    if (!gpaRaw) return errRes('معدل را وارد کنید');

    const nameNorm = normalizeFa(fullName);
    const dup = s.students.find(
      (st) =>
        st.yearId === existing.yearId &&
        st.sectionId === existing.sectionId &&
        st.nameNorm === nameNorm &&
        st.id !== id
    );
    if (dup) {
      return errRes(`دانش‌آموزی با نام «${dup.fullName}» قبلاً در این بخش ثبت شده است`, 422);
    }

    const validation = validateGpa(grade, gpaRaw);
    if (!validation.valid && json.isException !== true) {
      return errRes(validation.message ?? 'معدل نامعتبر است', 422);
    }

    const updated: LocalStudent = {
      ...existing,
      fullName,
      nameNorm,
      gender,
      grade,
      gpaRaw: validation.normalizedRaw || gpaRaw,
      gpaValue: validation.gpaValue,
      isException: !validation.valid && json.isException === true,
      parentName,
      parentRank,
      parentUnit,
    };
    s.students[idx] = updated;
    markDirty();
    return jsonRes({ student: updated });
  }

  /* ── اتوکامپلت ── */
  if (path === '/api/autocomplete' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const yearId = u.searchParams.get('yearId') ?? '';
    const sectionId = u.searchParams.get('sectionId') ?? '';
    const where = s.students.filter(
      (st) => (!yearId || st.yearId === yearId) && (!sectionId || st.sectionId === sectionId)
    );
    const FIELDS = ['parentName', 'parentRank', 'parentUnit', 'gpaRaw'] as const;
    const uniqSorted = (vals: string[]) =>
      Array.from(new Set(vals.map((v) => normalizeFa(v).trim()).filter((v) => v.length > 0))).sort((a, b) =>
        a.localeCompare(b, 'fa')
      );
    const fieldsParam = u.searchParams.get('fields');
    const batchFields =
      fieldsParam === 'all'
        ? [...FIELDS]
        : fieldsParam
          ? (fieldsParam
              .split(',')
              .map((f) => f.trim())
              .filter((f): f is (typeof FIELDS)[number] => (FIELDS as readonly string[]).includes(f)))
          : [];
    if (batchFields.length > 0) {
      const out: Record<string, string[]> = {};
      for (const f of batchFields) out[f] = uniqSorted(where.map((r) => r[f]));
      if (batchFields.includes('gpaRaw')) {
        out.gpaRaw.push('خیلی خوب', 'خوب', 'نسبتا خوب', 'متوسط', 'قابل قبول');
      }
      return jsonRes(out);
    }
    const field = u.searchParams.get('field') ?? '';
    if (!(FIELDS as readonly string[]).includes(field)) return jsonRes({ values: [] });
    const values = uniqSorted(where.map((r) => r[field as (typeof FIELDS)[number]]));
    if (u.searchParams.get('gpaWords') === '1') {
      values.push('خیلی خوب', 'خوب', 'نسبتا خوب', 'متوسط', 'قابل قبول');
    }
    return jsonRes({ values });
  }

  /* ── رکوردهای گروهی/استان‌ها ── */
  if (path === '/api/group-records' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const yearId = u.searchParams.get('yearId') ?? '';
    const sectionParam = u.searchParams.get('sectionId');
    if (!yearId || sectionParam === null) return errRes('پارامترهای ناقص');
    const sectionId = sectionParam === '' ? null : sectionParam;
    const records = s.groupRecords
      .filter((g) => g.yearId === yearId && g.sectionId === sectionId)
      .sort((a, b) => a.title.localeCompare(b.title, 'fa'));
    return jsonRes({ records });
  }

  if (path === '/api/group-records' && method === 'POST') {
    if (!(await authed(s))) return unauthorized();
    const yearId = cleanStr(json.yearId);
    const sectionId = json.sectionId ? String(json.sectionId).trim() : null;
    const title = cleanStr(json.title);
    if (!yearId) return errRes('سال مشخص نیست');
    if (!title) return errRes('عنوان را وارد کنید');
    if (sectionId) {
      const section = s.sections.find((sec) => sec.id === sectionId);
      if (!section || section.yearId !== yearId) return errRes('بخش نامعتبر است');
    }
    const titleNorm = normalizeFa(title);
    const dup = s.groupRecords.find(
      (g) => g.yearId === yearId && g.sectionId === sectionId && g.titleNorm === titleNorm
    );
    if (dup) {
      return errRes(`برای «${dup.title}» قبلاً رکورد ثبت شده است؛ همان رکورد را ویرایش کنید`, 422);
    }
    const record = {
      id: newId(),
      yearId,
      sectionId,
      title,
      titleNorm,
      counts: serializeCounts(json.counts as Partial<GroupCounts> | undefined ?? {}),
      createdAt: new Date().toISOString(),
    };
    s.groupRecords.push(record);
    markDirty();
    return jsonRes({ record }, 201);
  }

  const groupIdMatch = path.match(/^\/api\/group-records\/([^/]+)$/);
  if (groupIdMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!(await authed(s))) return unauthorized();
    const id = decodeURIComponent(groupIdMatch[1]);
    const idx = s.groupRecords.findIndex((g) => g.id === id);
    if (idx < 0) return errRes('رکورد یافت نشد', 404);
    const existing = s.groupRecords[idx];

    if (method === 'DELETE') {
      s.groupRecords.splice(idx, 1);
      markDirty();
      return jsonRes({ ok: true });
    }

    let title = existing.title;
    let titleNorm = existing.titleNorm;
    if (typeof json.title === 'string' && json.title.trim()) {
      title = json.title.trim();
      titleNorm = normalizeFa(title);
      const dup = s.groupRecords.find(
        (g) =>
          g.yearId === existing.yearId &&
          g.sectionId === existing.sectionId &&
          g.titleNorm === titleNorm &&
          g.id !== id
      );
      if (dup) return errRes(`برای «${dup.title}» قبلاً رکورد ثبت شده است`, 422);
    }
    const counts = json.counts ? serializeCounts(json.counts as Partial<GroupCounts>) : existing.counts;
    const updated = { ...existing, title, titleNorm, counts };
    s.groupRecords[idx] = updated;
    markDirty();
    return jsonRes({ record: updated });
  }

  /* ── سال‌ها ── */
  if (path === '/api/years' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const yearsDescList = [...s.years].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return jsonRes({
      years: yearsDescList.map((y) => ({
        id: y.id,
        name: y.name,
        isActive: y.isActive,
        studentCount: s.students.filter((st) => st.yearId === y.id).length,
        groupCount: s.groupRecords.filter((g) => g.yearId === y.id).length,
      })),
    });
  }

  if (path === '/api/years' && method === 'POST') {
    if (!(await authed(s))) return unauthorized();
    const name = cleanStr(json.name);
    if (!name) return errRes('نام سال را وارد کنید');
    const nameNorm = normalizeFa(name);
    const allYears = yearsInsertionFirst(s);
    if (allYears.some((y) => normalizeFa(y.name) === nameNorm)) {
      return errRes('سالی با این نام از قبل وجود دارد');
    }
    const copyFromYearId =
      typeof json.copyFromYearId === 'string' && allYears.some((y) => y.id === json.copyFromYearId)
        ? json.copyFromYearId
        : allYears[0]?.id ?? null;

    const year = {
      id: newId(),
      name,
      isActive: false,
      createdAt: new Date().toISOString(),
      prizes: [] as Array<{ group: string; amount: number }>,
    };
    s.years.push(year);

    if (copyFromYearId) {
      const source = s.years.find((y) => y.id === copyFromYearId);
      for (const key of GROUP_KEYS) {
        const found = source?.prizes.find((p) => p.group === key);
        year.prizes.push({ group: key, amount: found?.amount ?? 0 });
      }
      const sourceSections = s.sections.filter((sec) => sec.yearId === copyFromYearId);
      for (const sec of sourceSections) {
        s.sections.push({
          id: newId(),
          yearId: year.id,
          name: sec.name,
          type: sec.type,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      for (const key of GROUP_KEYS) year.prizes.push({ group: key, amount: 0 });
      s.sections.push({
        id: newId(),
        yearId: year.id,
        name: 'ستاد',
        type: 'INDIVIDUAL',
        createdAt: new Date().toISOString(),
      });
    }
    markDirty();
    return jsonRes({ year: { id: year.id, name: year.name, isActive: year.isActive } }, 201);
  }

  const yearIdMatch = path.match(/^\/api\/years\/([^/]+)$/);
  if (yearIdMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!(await authed(s))) return unauthorized();
    const id = decodeURIComponent(yearIdMatch[1]);
    const year = s.years.find((y) => y.id === id);
    if (!year) return errRes('سال یافت نشد', 404);

    if (method === 'DELETE') {
      if (s.years.length <= 1) return errRes('حداقل یک سال باید در برنامه باقی بماند');
      const sectionIds = s.sections.filter((sec) => sec.yearId === id).map((sec) => sec.id);
      s.students = s.students.filter((st) => st.yearId !== id);
      s.groupRecords = s.groupRecords.filter((g) => g.yearId !== id);
      s.sections = s.sections.filter((sec) => sec.yearId !== id);
      s.years = s.years.filter((y) => y.id !== id);
      if (year.isActive) {
        const next = [...s.years].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (next) next.isActive = true;
      }
      markDirty();
      return jsonRes({ ok: true });
    }

    if (typeof json.name === 'string' && json.name.trim()) {
      const name = json.name.trim();
      if (s.years.some((y) => y.name === name && y.id !== id)) return errRes('سالی با این نام وجود دارد');
      year.name = name;
    }
    if (json.isActive === true && !year.isActive) {
      for (const y of s.years) y.isActive = false;
      year.isActive = true;
    }
    markDirty();
    return jsonRes({ year: { id: year.id, name: year.name, isActive: year.isActive } });
  }

  const prizesMatch = path.match(/^\/api\/years\/([^/]+)\/prizes$/);
  if (prizesMatch && method === 'PUT') {
    if (!(await authed(s))) return unauthorized();
    const id = decodeURIComponent(prizesMatch[1]);
    const year = s.years.find((y) => y.id === id);
    if (!year) return errRes('سال یافت نشد', 404);
    const amounts = (json.amounts ?? {}) as Record<string, unknown>;
    for (const key of GROUP_KEYS) {
      const amount = Math.max(0, readInt(amounts[key], -1));
      if (amount < 0) continue;
      const existing = year.prizes.find((p) => p.group === key);
      if (existing) existing.amount = amount;
      else year.prizes.push({ group: key, amount });
    }
    markDirty();
    return jsonRes({
      prizes: Object.fromEntries(
        GROUP_KEYS.map((key) => [key, year.prizes.find((p) => p.group === key)?.amount ?? 0])
      ) as Record<GroupKey, number>,
    });
  }

  /* ── بخش‌ها ── */
  if (path === '/api/sections' && method === 'POST') {
    if (!(await authed(s))) return unauthorized();
    const yearId = cleanStr(json.yearId);
    const name = cleanStr(json.name);
    const type = json.type === 'GROUP' ? 'GROUP' : json.type === 'INDIVIDUAL' ? 'INDIVIDUAL' : '';
    if (!yearId) return errRes('سال مشخص نیست');
    if (!name) return errRes('نام بخش را وارد کنید');
    if (!type) return errRes('نوع بخش را انتخاب کنید');
    if (!s.years.some((y) => y.id === yearId)) return errRes('سال یافت نشد', 404);
    const nameNorm = normalizeFa(name);
    if (s.sections.some((sec) => sec.yearId === yearId && normalizeFa(sec.name) === nameNorm)) {
      return errRes('بخشی با این نام از قبل وجود دارد');
    }
    const section = {
      id: newId(),
      yearId,
      name,
      type: type as 'INDIVIDUAL' | 'GROUP',
      createdAt: new Date().toISOString(),
    };
    s.sections.push(section);
    markDirty();
    return jsonRes({ section: { id: section.id, name: section.name, type: section.type } }, 201);
  }

  const sectionIdMatch = path.match(/^\/api\/sections\/([^/]+)$/);
  if (sectionIdMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!(await authed(s))) return unauthorized();
    const id = decodeURIComponent(sectionIdMatch[1]);
    const section = s.sections.find((sec) => sec.id === id);
    if (!section) return errRes('بخش یافت نشد', 404);

    if (method === 'DELETE') {
      const remaining = s.sections.filter((sec) => sec.yearId === section.yearId && sec.id !== id).length;
      if (remaining === 0) return errRes('حداقل یک بخش باید در سال باقی بماند');
      // داده‌ها با Cascade حذف می‌شوند (مطابق نسخه سرور)
      s.students = s.students.filter((st) => st.sectionId !== id);
      s.groupRecords = s.groupRecords.filter((g) => g.sectionId !== id);
      s.sections = s.sections.filter((sec) => sec.id !== id);
      markDirty();
      return jsonRes({ ok: true });
    }

    if (typeof json.name === 'string' && json.name.trim()) {
      const nameNorm = normalizeFa(json.name.trim());
      if (
        s.sections.some(
          (sec) => sec.yearId === section.yearId && sec.id !== id && normalizeFa(sec.name) === nameNorm
        )
      ) {
        return errRes('بخشی با این نام وجود دارد');
      }
      section.name = json.name.trim();
    }
    if (json.type === 'INDIVIDUAL' || json.type === 'GROUP') {
      if (json.type !== section.type) {
        const studentCount = s.students.filter((st) => st.sectionId === id).length;
        const groupCount = s.groupRecords.filter((g) => g.sectionId === id).length;
        if (studentCount + groupCount > 0) {
          return errRes('برای تغییر نوع بخش، ابتدا داده‌های ثبت‌شده آن را حذف کنید');
        }
        section.type = json.type;
      }
    }
    markDirty();
    return jsonRes({ section: { id: section.id, name: section.name, type: section.type } });
  }

  /* ── رمز عبور ── */
  if (path === '/api/settings/password' && method === 'PUT') {
    if (!(await authed(s))) return unauthorized();
    const current = cleanStr(json.currentPassword);
    const next = cleanStr(json.newPassword);
    if (s.settings.passwordHash !== (await hashPassword(current))) {
      return errRes('رمز فعلی صحیح نیست');
    }
    if (next.length < 4) return errRes('رمز جدید باید حداقل 4 کاراکتر باشد');
    s.settings.passwordHash = await hashPassword(next);
    replaceState(s);
    try {
      localStorage.setItem(SESSION_KEY, await sessionTokenFor(s.settings.passwordHash));
    } catch {
      /* ignore */
    }
    return jsonRes({ ok: true });
  }

  /* ── پشتیبان‌گیری ── */
  if (path === '/api/backup' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const yearsAsc = [...s.years].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const yearPayloads = yearsAsc.map((y) => {
      const sections = s.sections
        .filter((sec) => sec.yearId === y.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        name: y.name,
        isActive: y.isActive,
        prizes: Object.fromEntries(
          GROUP_KEYS.map((key) => [key, y.prizes.find((p) => p.group === key)?.amount ?? 0])
        ),
        sections: sections.map((sec) => ({ name: sec.name, type: sec.type })),
        students: sections.flatMap((sec) =>
          s.students
            .filter((st) => st.sectionId === sec.id)
            .map((st) => ({
              sectionName: sec.name,
              fullName: st.fullName,
              gender: st.gender,
              grade: st.grade,
              gpaRaw: st.gpaRaw,
              gpaValue: st.gpaValue,
              isException: st.isException,
              parentName: st.parentName,
              parentRank: st.parentRank,
              parentUnit: st.parentUnit,
              createdAt: st.createdAt,
            }))
        ),
        groups: [
          ...sections.flatMap((sec) =>
            s.groupRecords
              .filter((g) => g.sectionId === sec.id)
              .map((g) => ({ sectionName: sec.name, title: g.title, counts: JSON.parse(g.counts || '{}') }))
          ),
          ...s.groupRecords
            .filter((g) => g.yearId === y.id && g.sectionId === null)
            .map((g) => ({ sectionName: null, title: g.title, counts: JSON.parse(g.counts || '{}') })),
        ],
      };
    });
    const payload = {
      app: 'student-excellence-registry',
      version: 1,
      exportedAt: new Date().toISOString(),
      years: yearPayloads,
    };
    const filename = `student-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return fileRes(JSON.stringify(payload, null, 2), 'application/json; charset=utf-8', filename);
  }

  if (path === '/api/backup' && method === 'POST') {
    if (!(await authed(s))) return unauthorized();
    const data = json.data as { years?: Array<Record<string, unknown>> } | undefined;
    const years = data?.years;
    if (!Array.isArray(years) || years.length === 0) {
      return errRes('فایل پشتیبان معتبر نیست (فهرست سال‌ها یافت نشد)');
    }
    const names = new Set<string>();
    for (const y of years) {
      const name = cleanStr(y.name);
      if (!name) return errRes('در فایل پشتیبان، سالی بدون نام وجود دارد');
      if (names.has(name)) return errRes(`نام سال «${name}» در فایل تکراری است`);
      names.add(name);
    }

    let restoredStudents = 0;
    let restoredGroups = 0;
    const next: LocalState = {
      settings: { ...s.settings },
      years: [],
      sections: [],
      students: [],
      groupRecords: [],
    };

    for (const y of years) {
      const yearId = newId();
      next.years.push({
        id: yearId,
        name: cleanStr(y.name),
        isActive: y.isActive === true,
        createdAt: new Date().toISOString(),
        prizes: GROUP_KEYS.map((key) => {
          const prizes = (y.prizes ?? {}) as Record<string, unknown>;
          return { group: key, amount: Math.max(0, readInt(prizes[key], 0)) };
        }),
      });

      const sectionMap = new Map<string, string>();
      for (const sec of (y.sections ?? []) as Array<{ name?: string; type?: string }>) {
        const name = cleanStr(sec.name);
        if (!name) continue;
        const secId = newId();
        next.sections.push({
          id: secId,
          yearId,
          name,
          type: sec.type === 'GROUP' ? 'GROUP' : 'INDIVIDUAL',
          createdAt: new Date().toISOString(),
        });
        sectionMap.set(name, secId);
      }

      for (const st of (y.students ?? []) as Array<Record<string, unknown>>) {
        const sectionId = st.sectionName ? sectionMap.get(String(st.sectionName)) : undefined;
        if (!sectionId) continue;
        const fullName = cleanStr(st.fullName);
        if (!fullName) continue;
        const gradeRaw = st.grade === null || st.grade === undefined ? null : Number(st.grade);
        next.students.push({
          id: newId(),
          yearId,
          sectionId,
          fullName,
          nameNorm: normalizeFa(fullName),
          gender: st.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
          grade: gradeRaw !== null && Number.isInteger(gradeRaw) && gradeRaw >= 1 && gradeRaw <= 12 ? gradeRaw : null,
          gpaRaw: cleanStr(st.gpaRaw),
          gpaValue: typeof st.gpaValue === 'number' && Number.isFinite(st.gpaValue) ? st.gpaValue : null,
          isException: st.isException === true,
          parentName: cleanStr(st.parentName),
          parentRank: cleanStr(st.parentRank),
          parentUnit: cleanStr(st.parentUnit),
          createdAt: typeof st.createdAt === 'string' ? st.createdAt : new Date().toISOString(),
        });
        restoredStudents += 1;
      }

      for (const g of (y.groups ?? []) as Array<{ title?: string; sectionName?: string | null; counts?: unknown }>) {
        const title = cleanStr(g.title);
        if (!title) continue;
        const sectionId = g.sectionName ? sectionMap.get(g.sectionName) ?? null : null;
        next.groupRecords.push({
          id: newId(),
          yearId,
          sectionId,
          title,
          titleNorm: normalizeFa(title),
          counts: serializeCounts((g.counts ?? {}) as Partial<GroupCounts>),
          createdAt: new Date().toISOString(),
        });
        restoredGroups += 1;
      }
    }

    if (!next.years.some((y) => y.isActive)) {
      const first = [...next.years].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (first) first.isActive = true;
    }
    replaceState(next);
    return jsonRes({ ok: true, restoredStudents, restoredGroups });
  }

  /* ── خروجی اکسل ── */
  if (path === '/api/export/excel' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    const type = u.searchParams.get('type') ?? 'students';
    const yearId = u.searchParams.get('yearId') ?? '';
    if (!yearId) return errRes('سال مشخص نیست');
    const year = s.years.find((y) => y.id === yearId);
    if (!year) return errRes('سال یافت نشد', 404);
    const rates = rateMapOf(year.prizes);

    const X = await getExcelJS();
    const wb = new X.Workbook();
    wb.creator = 'سامانه ثبت دانش‌آموزان ممتاز';

    if (type === 'provinces') {
      const sectionParam = u.searchParams.get('sectionId');
      const sectionId = sectionParam && sectionParam !== '' ? sectionParam : null;
      const section = sectionId ? s.sections.find((sec) => sec.id === sectionId) ?? null : null;
      const records = s.groupRecords
        .filter((g) => g.yearId === year.id && g.sectionId === sectionId)
        .sort((a, b) => a.title.localeCompare(b.title, 'fa'));
      buildProvincesSheet(wb, {
        year: { id: year.id, name: year.name },
        rates,
        sectionName: section?.name ?? null,
        records,
      });
    } else {
      const sectionId = u.searchParams.get('sectionId') ?? '';
      const groupBy = u.searchParams.get('groupBy') ?? 'parent';
      const section = s.sections.find((sec) => sec.id === sectionId);
      if (!section || section.yearId !== year.id) return errRes('بخش یافت نشد', 404);
      const students = s.students
        .filter((st) => st.sectionId === section.id)
        .map((st) => studentToLike(st));
      const ctx = {
        year: { id: year.id, name: year.name },
        section: { id: section.id, name: section.name },
        rates,
        students,
      };
      if (groupBy === 'parent') buildParentSummarySheet(wb, ctx);
      else if (groupBy === 'rankUnit') buildRankUnitSheet(wb, ctx);
      else buildStudentsSheet(wb, { ...ctx, groupBy });
    }

    const buf = await wb.xlsx.writeBuffer();
    const today = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
    return fileRes(
      buf as ArrayBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `export-${today}.xlsx`
    );
  }

  /* ── اطلاعات محل داده ── */
  if (path === '/api/data-info' && method === 'GET') {
    if (!(await authed(s))) return unauthorized();
    let savedAt: number | null = null;
    try {
      savedAt = Number(localStorage.getItem('momtaz-app-saved-at')) || null;
    } catch {
      savedAt = null;
    }
    return jsonRes({
      storageKind: 'browser',
      dataDir: 'حافظه مرورگر همین دستگاه (IndexedDB)',
      dbPath: 'IndexedDB → momtaz-app',
      backupsDir: '—',
      backups: [],
      migratedFrom: null,
      backedUpThisRun: false,
      lastSavedAt: savedAt,
    });
  }

  return errRes(`مسیر ${method} ${path} در نسخه مرورگری پیاده‌سازی نشده است`, 404);
}
