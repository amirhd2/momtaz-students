// ─────────────────────────────────────────────────────────────────────────────
// تست E2E «امانت‌داری داده‌ها» — شبیه‌سازی واقعی نصب/آپدیت برنامه روی نسخه production
//
// سناریوی A (مشکل کاربر):
//   نسخه ۱ با دیتای کاربر نصب شده (دیتابیس داخل پوشه برنامه) → کاربر داده ثبت می‌کند
//   → نسخه ۱ کامل حذف و نسخه ۲ نصب می‌شود → داده‌ها باید سر جایشان بمانند
//
// سناریوی B: نصب کاملاً تازه بدون هیچ دیتابیسی → اسکیما + داده اولیه خودکار ساخته شود
//
// نکته: پوشه داده پایدار تست عمداً فاصله در نام دارد («Data Dir») تا مسیرهای
// ویندوزی با فاصله هم تست شوند.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const WORK = path.join(ROOT, 'tool-results', 'data-preserve-test');

let failed = false;
const check = (cond, msg) => {
  console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failed = true;
};
const step = (msg) => console.log(`\n── ${msg}`);

const rmRf = (p) => fs.rmSync(p, { recursive: true, force: true });
/** کپی درختی پوشه standalone — سیم‌لینک‌ها (مثل کلاینت prisma) حفظ می‌شوند */
const copyDir = (src, dest) => {
  fs.cpSync(src, dest, { recursive: true, verbatimSymlinks: false });
};

/** خنثی‌کردن .env باندل‌شده — شبیه کامپیوتر کاربر که مسیر build در آن وجود ندارد */
function neutralizeBakedEnv(appDir) {
  for (const name of ['.env', '.env.production']) {
    const p = path.join(appDir, name);
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, 'utf8');
    content = content.replace(
      /DATABASE_URL=.*/g,
      'DATABASE_URL=file:./this-path-does-not-exist-on-user-machine.db'
    );
    fs.writeFileSync(p, content);
  }
}

function startServer(appDir, port, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join(appDir, 'server.js')], {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        // محیط تست نباید به سناریوها نشت کند — هر سناریو خودش صریحاً تعیین می‌کند
        DATABASE_URL: '',
        DATA_DIR: '',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (out += d));
    const deadline = Date.now() + 90_000;
    const poll = async () => {
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' });
          if (res.status === 200 || res.status === 307 || res.status === 302) {
            resolve({ proc, logs: () => out });
            return;
          }
        } catch {
          /* هنوز بالا نیامده */
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      reject(new Error(`server on :${port} did not start\n${out.slice(-2000)}`));
    };
    proc.on('exit', (code) => reject(new Error(`server exited early (${code})\n${out.slice(-2000)}`)));
    poll();
  });
}

const stopServer = (proc) =>
  new Promise((r) => {
    proc.kill('SIGTERM');
    setTimeout(r, 700);
  });

async function login(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: '1234' }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

async function api(port, cookie, pathname, opts = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...opts,
    headers: { 'content-type': 'application/json', cookie, ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`API ${pathname} failed: ${res.status}: ${await res.text()}`);
  return res.json();
}

const MARKER_NAME = 'کاربر آزمون امانت داده';

async function stadStats(port, cookie) {
  const boot = await api(port, cookie, '/api/bootstrap');
  const stad = boot.years
    .find((y) => y.isActive)
    ?.sections.find((s) => s.name === 'ستاد');
  const list = await api(
    port,
    cookie,
    `/api/students?yearId=${encodeURIComponent(boot.activeYearId)}&sectionId=${encodeURIComponent(stad.id)}`
  );
  return { yearId: boot.activeYearId, sectionId: stad.id, students: list.students ?? list, boot };
}

try {
  step('آماده‌سازی محیط تست');
  rmRf(WORK);
  fs.mkdirSync(WORK, { recursive: true });
  if (!fs.existsSync(path.join(STANDALONE, 'server.js'))) {
    throw new Error('standalone build یافت نشد — ابتدا next build اجرا کنید');
  }

  // ── سناریوی A ──
  step('A-1: نصب نسخه ۱ (شبیه‌سازی نصب فعلی کاربر — دیتابیس داخل پوشه برنامه)');
  const v1App = path.join(WORK, 'v1', 'app');
  copyDir(STANDALONE, v1App);
  // دیتابیس قدیمیِ کاربر داخل پوشه برنامه — با داده واقعی پروژه (۱ دانش‌آموز + ۳۱ استان)
  const legacyDir = path.join(v1App, 'db');
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'db', 'custom.db'), path.join(legacyDir, 'custom.db'));
  for (const ext of ['-wal', '-shm']) {
    if (fs.existsSync(path.join(ROOT, 'db', `custom.db${ext}`))) {
      fs.copyFileSync(path.join(ROOT, 'db', `custom.db${ext}`), path.join(legacyDir, `custom.db${ext}`));
    }
  }
  const dataDir = path.join(WORK, 'Data Dir'); // فاصله در مسیر — عمدی
  console.log(`  پوشه داده پایدار: ${dataDir}`);

  step('A-2: اجرای نسخه ۱ و ثبت داده توسط کاربر');
  const persistent = dataDir;
  const s1 = await startServer(v1App, 3210, {
    DATA_DIR: persistent,
    DATABASE_URL: `file:${path.join(legacyDir, 'custom.db').replace(/\\/g, '/')}`,
  });
  let info, markerOk = false, countV1 = 0;
  try {
    const cookie1 = await login(3210);
    info = await api(3210, cookie1, '/api/data-info');
    check(info.storageKind === 'persistent', `حالت ذخیره persistent است (${info.storageKind})`);
    check(
      info.dbPath === path.join(persistent, 'data.db'),
      `فایل داده در پوشه پایدار است: ${info.dbPath}`
    );
    check(
      info.migratedFrom === path.join(legacyDir, 'custom.db'),
      `دیتابیس قدیمی خودکار منتقل شد: ${info.migratedFrom}`
    );

    const st1 = await stadStats(3210, cookie1);
    countV1 = st1.students.length;
    console.log(`  تعداد دانش‌آموزان ستاد پس از مهاجرت: ${countV1}`);
    check(countV1 >= 1, 'داده‌های قبلی کاربر بعد از مهاجرت موجود است');

    // ثبت دانش‌آموز نشان (داده‌ای که نباید در آپدیت گم شود)
    await api(3210, cookie1, '/api/students', {
      method: 'POST',
      body: JSON.stringify({
        yearId: st1.yearId,
        sectionId: st1.sectionId,
        fullName: MARKER_NAME,
        gender: 'MALE',
        grade: 5,
        gpaRaw: 'خیلی خوب',
        parentName: 'والد نشان',
        parentRank: 'طبقه نشان',
        parentUnit: 'واحد نشان',
      }),
    });
    const st1b = await stadStats(3210, cookie1);
    countV1 = st1b.students.length;
    markerOk = st1b.students.some((s) => s.fullName === MARKER_NAME);
    check(markerOk, `دانش‌آموز نشان ثبت شد (کل: ${countV1})`);

    const backupsDir = path.join(persistent, 'backups');
    const backupFiles = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : [];
    check(backupFiles.length >= 1, `پشتیبان خودکار گرفته شد (${backupFiles.length} فایل)`);
  } finally {
    await stopServer(s1.proc);
  }

  step('A-3: حذف کامل نسخه ۱ و نصب نسخه ۲ (شبیه‌سازی آپدیت برنامه)');
  rmRf(path.join(WORK, 'v1')); // پوشه برنامه قدیمی + دیتابیس قدیمی داخلش کاملاً حذف می‌شود
  if (fs.existsSync(path.join(legacyDir, 'custom.db'))) {
    check(false, 'پوشه نسخه قدیمی حذف نشد!');
  } else {
    check(true, 'پوشه نسخه قدیمی (به‌همراه دیتابیس داخلش) کامل حذف شد');
  }

  const v2App = path.join(WORK, 'v2', 'app');
  copyDir(STANDALONE, v2App);
  neutralizeBakedEnv(v2App); // مسیر build در کامپیوتر کاربر وجود ندارد
  check(!fs.existsSync(path.join(v2App, 'db', 'custom.db')), 'نسخه جدید هیچ دیتابیسِ کاربری ندارد');

  step('A-4: اجرای نسخه ۲ — داده‌ها باید سر جایشان باشند');
  const s2 = await startServer(v2App, 3211, { DATA_DIR: persistent });
  try {
    const cookie2 = await login(3211);
    const info2 = await api(3211, cookie2, '/api/data-info');
    check(info2.storageKind === 'persistent', 'حالت ذخیره نسخه ۲ هم persistent است');
    check(
      info2.dbPath === path.join(persistent, 'data.db'),
      `نسخه ۲ از همان فایل داده استفاده می‌کند: ${info2.dbPath}`
    );
    check(info2.migratedFrom === null, 'مهاجرت دوباره انجام نشد (داده از محل پایدار خوانده شد)');

    const st2 = await stadStats(3211, cookie2);
    check(st2.students.length === countV1, `تعداد دانش‌آموزان حفظ شد (${st2.students.length} = ${countV1})`);
    check(
      st2.students.some((s) => s.fullName === MARKER_NAME),
      'دانش‌آموز نشان بعد از «آپدیت» هنوز موجود است — داده‌ها امانت ماندند ✓'
    );

    const backupsAfter = fs.existsSync(path.join(persistent, 'backups'))
      ? fs.readdirSync(path.join(persistent, 'backups')).filter((f) => f.endsWith('.db'))
      : [];
    check(backupsAfter.length >= 2, `پشتیبان خودکار هر اجرا گرفته شد (${backupsAfter.length} نسخه)`);
  } finally {
    await stopServer(s2.proc);
  }

  // ── سناریوی B ──
  step('B: نصب کاملاً تازه (بدون هیچ دیتابیس قبلی) — اسکیما و داده اولیه خودکار ساخته شود');
  const freshDir = path.join(WORK, 'FreshInstall');
  const v3App = path.join(WORK, 'v3', 'app');
  copyDir(STANDALONE, v3App);
  neutralizeBakedEnv(v3App);
  const s3 = await startServer(v3App, 3212, { DATA_DIR: freshDir });
  try {
    const cookie3 = await login(3212);
    const info3 = await api(3212, cookie3, '/api/data-info');
    check(info3.storageKind === 'persistent', `نصب تازه: persistent (${info3.dbPath})`);
    const st3 = await stadStats(3212, cookie3);
    check(st3.yearId && st3.sectionId, 'داده اولیه (سال + ستاد) خودکار ساخته شد');
    check(st3.students.length === 0, `نصب تازه خالی است (${st3.students.length} دانش‌آموز)`);
    // ثبت در نصب تازه هم باید کار کند
    await api(3212, cookie3, '/api/students', {
      method: 'POST',
      body: JSON.stringify({
        yearId: st3.yearId,
        sectionId: st3.sectionId,
        fullName: 'آزمون نصب تازه',
        gender: 'FEMALE',
        grade: 3,
        gpaRaw: 'خیلی خوب',
        parentName: 'پدر',
        parentRank: 'طبقه ۱',
        parentUnit: 'واحد ۱',
      }),
    });
    const st3b = await stadStats(3212, cookie3);
    check(st3b.students.length === 1, 'ثبت دانش‌آموز در نصب تازه کار می‌کند');
  } finally {
    await stopServer(s3.proc);
  }
} catch (err) {
  console.error('\n💥 خطای تست:', err.message);
  failed = true;
}

console.log(failed ? '\n❌ برخی تست‌ها رد شدند' : '\n✅ همه تست‌ها پاس شد — داده‌ها در آپدیت امانت می‌مانند');
process.exit(failed ? 1 : 0);
