/*
 * سرویس‌ورکر آفلاین کامل «سامانه ثبت دانش‌آموزان ممتاز»
 * ------------------------------------------------------
 * سناریوی هدف: کاربر فقط یک بار با اینترنت برنامه را باز می‌کند؛
 * سرویس‌ورکر در همان بار اول «تمام فایل‌های بیلد» را precache می‌کند؛
 * پس از آن حتی با ماه‌ها قطعی اینترنت، برنامه کامل بارگذاری و اجرا می‌شود.
 *
 * این فایل یک «قالب» است — اسکریپت scripts/gen-sw.mjs پس از build استاتیک،
 * دو مقدارِ کد (شناسه بیلد و فهرست فایل‌های خروجی) را با مقادیر واقعی جایگزین
 * و خروجی نهایی را در out/sw.js می‌نویسد:
 *   - شناسه بیلد → SHA کامیت یا timestamp (برای نسخه‌گذاری کش)
 *   - فهرست فایل‌ها → آرایه JSON همه فایل‌های خروجی (نسبت به ریشه برنامه)
 */

const VERSION = '__BUILD_VERSION__';
const PRECACHE_URLS = __PRECACHE_URLS__;
const CACHE_NAME = `momtaz-offline-${VERSION}`;

// ریشه برنامه از scope سرویس‌ورکر به دست می‌آید (مستقل از زیرمسیر انتشار)
// ⚠️ self.registration فقط داخل هندلرها در دسترس است — هرگز سطح بالای اسکریپت نخوانید
const baseHref = () => new URL('./', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const urls = ['', ...PRECACHE_URLS].map((u) => new URL(u, baseHref()).href);
      try {
        // نصب اتمیک: یا همه فایل‌ها یا هیچ‌کدام
        await cache.addAll(urls);
      } catch (_) {
        // اگر یکی از فایل‌ها مشکل داشت، بقیه را بهترین‌تلاش ذخیره کن تا اپ آفلاین بماند
        await Promise.allSettled(urls.map((u) => cache.add(u)));
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // حذف کش نسخه‌های قبلی — نسخه جدید همیشه کامل تازه precache شده است
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('momtaz-offline-') && n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // فقط GET هم‌مبنا — بقیه به مرورگر واگذار می‌شود
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ناوبری صفحه (باز/رفرش اپ): از سند شروعِ کش‌شده پاسخ بده — کل اپ یک صفحه است
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const startDoc =
          (await cache.match(self.registration.scope)) ||
          (await cache.match(new URL('index.html', baseHref()).href));
        if (startDoc) return startDoc;
        try {
          const fresh = await fetch(req);
          cache.put(self.registration.scope, fresh.clone());
          return fresh;
        } catch (_) {
          return (
            (await cache.match(req)) ||
            new Response('آفلاین هستید و نسخه‌ای از برنامه ذخیره نشده است.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })()
    );
    return;
  }

  // بقیه درخواست‌های هم‌مبنا (JS/CSS/فونت/آیکون/...): اول کش، بعد شبکه
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        // فقط پاسخ‌های سالم را کش کن
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return new Response('', { status: 504 });
      }
    })()
  );
});
