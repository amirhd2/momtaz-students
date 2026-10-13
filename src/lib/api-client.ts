// کلاینت fetch با مدیریت خطای 401
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
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

export function downloadFile(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
