'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Check, ChevronsUpDown, MapPin, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IRAN_PROVINCES } from '@/lib/provinces';
import { normalizeFa } from '@/lib/persian';

interface ProvinceSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** عناوین نرمال‌شده‌ی رکوردهای ثبت‌شده (برای تشخیص استان‌های دارای داده) */
  takenNormTitles: Set<string>;
  /** عنوان نرمال‌شده‌ی رکورد در حال ویرایش — خودش مجاز به انتخاب مجدد است */
  allowedNormTitle?: string | null;
  disabled?: boolean;
}

/**
 * منوی شناور انتخاب استان:
 * - قابلیت جستجو و تایپ نام استان برای فیلتر کردن فهرست
 * - استان‌های دارای رکورد ثبت‌شده با نقطه سبز + بج «ثبت‌شده» مشخص می‌شوند
 * - اسکرول لمسی فهرست مستقل از قفل اسکرول لایه‌های Radix کار می‌کند
 */
export function ProvinceSelect({ value, onChange, takenNormTitles, allowedNormTitle, disabled }: ProvinceSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalizeFa(query).trim();
    if (!q) return IRAN_PROVINCES;
    return IRAN_PROVINCES.filter((p) => normalizeFa(p).includes(q));
  }, [query]);

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) {
      // بازنشانی جستجو هنگام بسته شدن منو
      setQuery('');
      setHighlight(0);
    }
  };

  const pick = (p: string) => {
    onChange(p);
    handleOpenChange(false);
  };

  const isTaken = (p: string) => {
    const norm = normalizeFa(p);
    return takenNormTitles.has(norm) && norm !== (allowedNormTitle ?? '');
  };

  // فوکوس خودکار جعبه جستجو فقط روی دستگاه‌های دارای ماوس (در موبایل کیبورد باز نشود)
  useEffect(() => {
    if (open && searchRef.current && !window.matchMedia('(pointer: coarse)').matches) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filtered[highlight];
      const target = current && !isTaken(current) ? current : filtered.find((p) => !isTaken(p));
      if (target) pick(target);
    }
  };

  // اسکرول ردیف انتخاب‌شده با کیبورد به دید کاربر
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-highlight="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open, filtered]);

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label="انتخاب استان"
            disabled={disabled}
            className={cn(
              'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <span className={cn('flex items-center gap-2 truncate', !value && 'text-muted-foreground')}>
              {value && <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" />}
              {value || 'انتخاب استان...'}
            </span>
            <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          dir="rtl"
          className="w-[min(20rem,calc(100vw-2rem))] p-0"
          onOpenAutoFocus={(e) => {
            if (!window.matchMedia('(pointer: coarse)').matches) {
              e.preventDefault();
            }
          }}
        >
          {/* جعبه جستجو */}
          <div className="relative border-b p-2">
            <Search className="absolute right-4.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="تایپ کنید تا نام استان فیلتر شود..."
              aria-label="جستجوی استان"
              inputMode="search"
              autoComplete="off"
              className="h-9 pr-9 pl-8 text-sm"
            />
            {query && (
              <button
                type="button"
                aria-label="پاک کردن جستجو"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* راهنمای رنگ‌ها */}
          <div className="flex items-center justify-between gap-3 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              دارای داده
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
              بدون داده
            </span>
          </div>

          {/* فهرست استان‌ها */}
          <div
            ref={listRef}
            role="listbox"
            aria-label="فهرست استان‌ها"
            className="max-h-72 overflow-y-auto overscroll-contain touch-pan-y custom-scroll py-1"
            // جلوگیری از تداخل قفل اسکرول Radix با اسکرول لمسی فهرست
            onTouchMove={(e) => e.stopPropagation()}
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                استانی با این عنوان یافت نشد
              </p>
            ) : (
              filtered.map((p, i) => {
                const taken = isTaken(p);
                const selected = value === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={taken}
                    data-highlight={!taken && i === highlight}
                    onClick={() => pick(p)}
                    onMouseEnter={() => !taken && setHighlight(i)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors',
                      taken
                        ? 'cursor-not-allowed bg-emerald-50 text-emerald-800'
                        : 'hover:bg-accent hover:text-accent-foreground',
                      !taken && i === highlight && 'bg-accent text-accent-foreground',
                      selected && 'font-semibold text-primary'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-block h-2 w-2 shrink-0 rounded-full',
                          taken ? 'bg-emerald-500' : 'bg-slate-300'
                        )}
                      />
                      {p}
                    </span>
                    {selected ? (
                      <Check className="w-4 h-4 shrink-0" />
                    ) : taken ? (
                      <Badge className="shrink-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-transparent text-[10px] px-1.5 py-0">
                        ثبت‌شده
                      </Badge>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            نام استان را تایپ کنید یا از فهرست انتخاب کنید
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
