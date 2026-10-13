'use client';

// ─── لایه کش منابع سمت کلاینت — الگوی stale-while-revalidate ───
// داده‌ای که یک‌بار لود شده در حافظه + sessionStorage می‌ماند؛
// بازگشت به همان بخش «آنی» نمایش داده می‌شود و به‌روزرسانی در پس‌زمینه انجام می‌گیرد.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface CacheEntry<T> {
  data: T;
  at: number;
}

const memory = new Map<string, CacheEntry<unknown>>();
const SS_PREFIX = 'sa:cache:';
const SESSION_TTL = 12 * 60 * 60 * 1000; // ۱۲ ساعت — داده بین بازکردن مجدد تب هم آنی بماند
const MAX_SS_VALUE = 2 * 1024 * 1024; // حداکثر ۲ مگابایت برای هر ردیف کش در sessionStorage

function readSession<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.at > SESSION_TTL) {
      sessionStorage.removeItem(SS_PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, entry: CacheEntry<T>): void {
  try {
    const raw = JSON.stringify(entry);
    if (raw.length > MAX_SS_VALUE) return;
    sessionStorage.setItem(SS_PREFIX + key, raw);
  } catch {
    // حافظه پر یا غیرقابل دسترسی — بی‌اهمیت
  }
}

function getEntry<T>(key: string): CacheEntry<T> | null {
  const mem = memory.get(key) as CacheEntry<T> | undefined;
  if (mem) return mem;
  const ss = readSession<T>(key);
  if (ss) {
    memory.set(key, ss);
    return ss;
  }
  return null;
}

function setEntry<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, at: Date.now() };
  memory.set(key, entry);
  writeSession(key, entry);
}

/** حذف همه کش‌ها (خروج از حساب / انقضای نشست) */
export function clearResourceCache(): void {
  memory.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SS_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    // بی‌اهمیت
  }
}

/**
 * هوک منبع کش‌شده:
 * - اگر کش معتبر باشد همان لحظه برگردانده می‌شود (loading=false از ابتدا)
 * - در پس‌زمینه یک‌بار به‌روزرسانی بی‌صدا انجام می‌شود (بدون فلش لودینگ)
 * - refresh(): به‌روزرسانی بی‌صدا بعد از ثبت/ویرایش/حذف
 */
export function useResource<T>(key: string, fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(() => getEntry<T>(key)?.data ?? null);
  // اگر کش داشته باشیم لودینگ نیست — نمایش آنی
  const [loading, setLoading] = useState(() => !getEntry<T>(key));
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const revalidate = useCallback(
    async (silent: boolean) => {
      if (silent) setLoading(false);
      else setLoading(true);
      try {
        const fresh = await fetcherRef.current();
        if (!mounted.current) return;
        setEntry(key, fresh);
        setData(fresh);
      } catch {
        // خطا: داده کش‌شده باقی می‌ماند؛ مدیریت 401 در apiFetch انجام شده است
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [key]
  );

  // وقتی key عوض می‌شود، از کش جدید آنی نشان بده و بعد رفرش کن
  useEffect(() => {
    const cached = getEntry<T>(key);
    setData(cached?.data ?? null);
    setLoading(!cached);
    revalidate(!cached ? false : true);
  }, [key, revalidate]);

  return { data, loading, refresh: () => revalidate(true) };
}
