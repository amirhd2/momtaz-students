'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  /** فیلتر سفارشی پیشنهادها */
  filterFn?: (item: string, query: string) => boolean;
  /** نمایش همیشگی همه پیشنهادها (بدون فیلتر) */
  showAll?: boolean;
  /** فراخوانی هنگام انتخاب یک پیشنهاد */
  onSelectSuggestion?: (item: string) => void;
  /** حداکثر تعداد پیشنهاد قابل نمایش — ۰ یعنی همه (پیش‌فرض ۸) */
  maxItems?: number;
  /** کلاس اختیاری برای فهرست شناور (مثلاً ارتفاع بیشتر) */
  listClassName?: string;
}

/** ورودی با اتوکامپلت بر اساس مقادیر قبلاً ثبت‌شده */
export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  id,
  invalid,
  disabled,
  className,
  autoFocus,
  ariaLabel,
  filterFn,
  showAll,
  onSelectSuggestion,
  maxItems,
  listClassName,
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const limit = maxItems === 0 ? undefined : (maxItems ?? 8);
  const filtered = useMemo(() => {
    if (showAll) return suggestions.filter((s) => s !== value).slice(0, limit);
    const q = value.trim().toLowerCase();
    const match = (s: string) =>
      s !== value && (filterFn ? filterFn(s, value) : s.toLowerCase().includes(q) || includesFa(s, q));
    const list = q ? suggestions.filter(match) : suggestions;
    return list.slice(0, limit);
  }, [value, suggestions, filterFn, showAll, limit]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const select = (item: string) => {
    onChange(item);
    onSelectSuggestion?.(item);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && open && highlight >= 0 && filtered[highlight]) {
      e.preventDefault();
      select(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={invalid ? 'border-destructive focus-visible:ring-destructive' : ''}
      />
      {open && filtered.length > 0 && (
        <ul
          className={cn(
            'absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-52 overflow-y-auto overscroll-contain touch-pan-y custom-scroll',
            listClassName
          )}
          role="listbox"
          // جلوگیری از تداخل قفل اسکرول Radix با اسکرول لمسی فهرست
          onTouchMove={(e) => e.stopPropagation()}
        >
          {filtered.map((item, i) => (
            <li key={item}>
              <button
                type="button"
                className={`w-full text-right px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                  i === highlight ? 'bg-accent text-accent-foreground' : ''
                }`}
                onClick={() => select(item)}
                onMouseEnter={() => setHighlight(i)}
                role="option"
                aria-selected={i === highlight}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** تطبیق نرم فارسی (ی/ي، ک/ك) */
function includesFa(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(haystack).includes(norm(needle));
}
