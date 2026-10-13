'use client';

import { useEffect } from 'react';

/**
 * ثبت سرویس‌ورکر آفلاین کامل — فقط در نسخه استاتیک (مرورگری) فعال می‌شود.
 * در نسخه سروری هیچ sw.js وجود ندارد و ثبت بی‌صدا رد می‌شود؛ رفتار سرور دست‌نخورده است.
 *
 * سازوکار: در اولین بازدیدِ آنلاین، سرویس‌ورکر «تمام فایل‌های بیلد» را precache می‌کند؛
 * پس از آن برنامه حتی با قطعی طولانی اینترنت (ریفرش، اجرای مجدد، نصب PWA) کامل بالا می‌آید.
 * با انتشار نسخه جدید، سرویس‌ورکر جدید در پس‌زمینه نصب و یک بار صفحه رفرش می‌شود.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DATA_MODE !== 'local') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const swUrl = `${process.env.NEXT_PUBLIC_SUBPATH ?? ''}/sw.js`;

    // پس از فعال‌شدن سرویس‌ورکر جدید (انتشار نسخه جدید) یک بار رفرش کن
    const reloadedKey = 'momtaz-sw-reloaded';
    const onControllerChange = () => {
      if (sessionStorage.getItem(reloadedKey) === '1') return;
      sessionStorage.setItem(reloadedKey, '1');
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker.register(swUrl).catch(() => {
      // نسخه سروری sw.js ندارد — بی‌صدا رد شود
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
