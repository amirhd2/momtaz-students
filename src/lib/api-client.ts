// کلاینت fetch با مدیریت خطای 401
// در بیلد استاتیک (NEXT_PUBLIC_DATA_MODE=local) درخواست‌ها به روتر مرورگری می‌روند
// و داده‌ها در IndexedDB همان دستگاه ذخیره می‌شود — بدون سرور.
import { localHandle } from './local-api';

const LOCAL_MODE = process.env.NEXT_PUBLIC_DATA_MODE === 'local';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = LOCAL_MODE
    ? await localHandle(url, init)
    : await fetch(url, {
        ...init,
        headers: {
          // فقط برای بدنه متنی JSON هدر ست می‌شود؛ FormData باید مرز خودش را ست کند
          ...(typeof init?.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers ?? {}),
        },
      });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      // نشست منقضی شده — بارگذاری مجدد صفحه برای نمایش فرم ورود
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sa:unauthorized'));
      }
    }
    throw new ApiError((data as { error?: string }).error ?? 'خطای غیرمنتظره در ارتباط با سرور', res.status);
  }

  return data as T;
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

/** دانلود فایل — در نسخه مرورگری خروجی‌ها سمت کلاینت ساخته و به‌صورت Blob دانلود می‌شوند */
export async function downloadFile(url: string): Promise<void> {
  if (LOCAL_MODE) {
    const res = await localHandle(url, undefined);
    if (!res.ok) throw new Error('دانلود ناموفق بود');
    const blob = await res.blob();
    const name = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? 'download';
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
