'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoginScreen } from '@/components/login-screen';
import { StudentView } from '@/components/student-view';
import { GroupView } from '@/components/group-view';
import { SettingsView } from '@/components/settings-view';
import { apiFetch, ApiError } from '@/lib/api-client';
import { clearResourceCache } from '@/lib/resource-cache';
import { GraduationCap, LogOut, Settings, Landmark, Users, Loader2, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { BootstrapData, YearInfo } from '@/lib/types';

type View =
  | { kind: 'section'; sectionId: string }
  | { kind: 'provinces' }
  | { kind: 'settings' };

export function AppRoot() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [boot, setBoot] = useState<BootstrapData | null>(null);
  const [view, setView] = useState<View>({ kind: 'section', sectionId: '' });
  const [loadingBoot, setLoadingBoot] = useState(false);
  // برنامه کاملاً لوکال است — فقط برای اطلاع کاربر وضعیت اینترنت نشان داده می‌شود
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // مقدار اولیه با تأخیر (بعد از هیدریشن) — رخدادهای online/offline فوری اعمال می‌شوند
    const t = setTimeout(() => setOnline(navigator.onLine), 0);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const loadBootstrap = useCallback(async (opts?: { silent?: boolean }) => {
    // بی‌صدا: فقط داده تازه می‌آید و هیچ اسپینر/اورلی نشان داده نمی‌شود
    if (!opts?.silent) setLoadingBoot(true);
    try {
      const data = await apiFetch<BootstrapData>('/api/bootstrap');
      setAuthed(true);
      setBoot(data);
      return data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false);
      }
      return null;
    } finally {
      setLoadingBoot(false);
    }
  }, []);

  // بررسی نشست اولیه — مستقیماً bootstrap (اگر نشست نبود 401 → صفحه ورود)
  // به‌جای واترفال قبلی auth/me → bootstrap، یک درخواست کافی است
  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // شنود رویداد انقضای نشست
  useEffect(() => {
    const onUnauthorized = () => {
      setAuthed(false);
      setBoot(null);
      clearResourceCache();
      toast.error('نشست شما منقضی شد؛ دوباره وارد شوید');
    };
    window.addEventListener('sa:unauthorized', onUnauthorized);
    return () => window.removeEventListener('sa:unauthorized', onUnauthorized);
  }, []);

  // تنظیم ویو پیش‌فرض پس از دریافت داده
  useEffect(() => {
    if (!boot) return;
    const activeYear = boot.years.find((y) => y.id === boot.activeYearId);
    if (!activeYear) return;
    setView((v) => {
      // اگر بخش فعلی در سال جدید وجود دارد، حفظ شود
      if (v.kind === 'section' && activeYear.sections.some((s) => s.id === v.sectionId)) return v;
      if (v.kind === 'section' && v.sectionId === '' && activeYear.sections.length > 0) {
        const firstIndividual = activeYear.sections.find((s) => s.type === 'INDIVIDUAL') ?? activeYear.sections[0];
        return { kind: 'section', sectionId: firstIndividual.id };
      }
      return v;
    });
  }, [boot]);

  const handleLoginSuccess = async () => {
    setAuthed(true);
    const data = await loadBootstrap();
    if (data) {
      const activeYear = data.years.find((y) => y.id === data.activeYearId);
      const first = activeYear?.sections.find((s) => s.type === 'INDIVIDUAL') ?? activeYear?.sections[0];
      setView(first ? { kind: 'section', sectionId: first.id } : { kind: 'settings' });
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // بی‌اهمیت
    }
    clearResourceCache();
    setAuthed(false);
    setBoot(null);
  };

  const activateYear = async (year: YearInfo) => {
    try {
      await apiFetch(`/api/years/${year.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
      toast.success(`سال «${year.name}» فعال شد`);
      const data = await loadBootstrap();
      if (data) {
        const activeYear = data.years.find((y) => y.id === data.activeYearId);
        if (activeYear && !activeYear.sections.some((s) => view.kind === 'section' && s.id === view.sectionId)) {
          const first = activeYear.sections.find((s) => s.type === 'INDIVIDUAL') ?? activeYear.sections[0];
          setView(first ? { kind: 'section', sectionId: first.id } : { kind: 'settings' });
        }
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در تغییر سال');
    }
  };

  // رفرش بی‌صدای bootstrap بعد از هر ثبت/ویرایش/حذف — بدون اورلی تمام‌صفحه
  const handleDataChanged = useCallback(() => {
    loadBootstrap({ silent: true });
  }, [loadBootstrap]);

  if (authed === null) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    );
  }

  if (!authed) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  const activeYear = boot?.years.find((y) => y.id === boot.activeYearId) ?? null;
  const prizes = boot?.prizes ?? null;
  const currentSection = activeYear?.sections.find((s) => view.kind === 'section' && s.id === view.sectionId) ?? null;

  if (!boot || !activeYear || !prizes) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* هدر */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-30 shadow-md pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-7 h-7" />
            <div>
              <h1 className="font-bold text-sm sm:text-base leading-tight">سامانه ثبت دانش‌آموزان ممتاز همکاران</h1>
              <p className="text-[11px] opacity-80">سال تحصیلی {activeYear.name}</p>
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 flex-wrap">
            {!online && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-amber-400/20 border border-amber-300/40 text-amber-100 text-[11px] px-2 py-1"
                title="این برنامه کاملاً لوکال است و بدون اینترنت هم کامل کار می‌کند"
              >
                <WifiOff className="w-3.5 h-3.5" />
                حالت آفلاین
              </span>
            )}
            <select
              value={activeYear.id}
              onChange={(e) => {
                const y = boot.years.find((yy) => yy.id === e.target.value);
                if (y) activateYear(y);
              }}
              className="h-8 rounded-md bg-primary-foreground/10 border border-primary-foreground/30 text-primary-foreground text-xs px-2 focus-visible:outline-none cursor-pointer [&>option]:text-foreground"
              aria-label="انتخاب سال فعال"
            >
              {boot.years.map((y) => (
                <option key={y.id} value={y.id}>
                  سال {y.name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 ${view.kind === 'settings' ? 'bg-primary-foreground/20' : ''}`}
              onClick={() => setView({ kind: 'settings' })}
              aria-label="تنظیمات"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15"
              onClick={logout}
              aria-label="خروج"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ناوبری بخش‌ها */}
        <nav className="bg-background border-b" aria-label="ناوبری بخش‌ها">
          <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto custom-scroll">
            {activeYear.sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setView({ kind: 'section', sectionId: s.id })}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                  view.kind === 'section' && view.sectionId === s.id
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Users className="w-4 h-4" />
                {s.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setView({ kind: 'provinces' })}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                view.kind === 'provinces'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Landmark className="w-4 h-4" />
              استان‌ها
            </button>
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5">
        {loadingBoot && (
          <div className="fixed inset-0 bg-background/60 z-50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {view.kind === 'section' && currentSection && (
          currentSection.type === 'INDIVIDUAL' ? (
            <StudentView
              key={currentSection.id}
              yearId={activeYear.id}
              yearName={activeYear.name}
              sectionId={currentSection.id}
              sectionName={currentSection.name}
              prizes={prizes}
              onDataChanged={handleDataChanged}
            />
          ) : (
            <GroupView
              key={currentSection.id}
              yearId={activeYear.id}
              yearName={activeYear.name}
              sectionId={currentSection.id}
              sectionName={currentSection.name}
              prizes={prizes}
              isProvinces={false}
            />
          )
        )}

        {view.kind === 'provinces' && (
          <GroupView
            key={`provinces-${activeYear.id}`}
            yearId={activeYear.id}
            yearName={activeYear.name}
            sectionId={null}
            prizes={prizes}
            isProvinces
          />
        )}

        {view.kind === 'settings' && (
          <SettingsView
            years={boot.years}
            activeYearId={activeYear.id}
            prizes={prizes}
            onRefresh={() => {
              loadBootstrap({ silent: true });
            }}
          />
        )}
      </main>

      <footer className="mt-auto border-t bg-background">
        <div className="max-w-6xl mx-auto px-4 py-3 text-center text-xs text-muted-foreground">
          سامانه ثبت دانش‌آموزان ممتاز همکاران — داده‌ها روی سرور داخلی ذخیره می‌شود
        </div>
      </footer>
    </div>
  );
}
