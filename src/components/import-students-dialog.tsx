'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  Wand2,
  Info,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  buildImportRows,
  rowImportable,
  type ParsedImportRow,
} from '@/lib/excel-import';
import { GENDERS } from '@/lib/persian';

interface ImportStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yearId: string;
  sectionId: string;
  sectionName: string;
  /** نام‌های نرمال‌شده ثبت‌شده فعلی بخش برای تشخیص تکراری */
  existingNorms: Set<string>;
  /** پس از ثبت موفق برای به‌روزرسانی لیست */
  onImported: () => void;
}

type Step = 'intro' | 'preview' | 'result';

interface ImportResult {
  inserted: number;
  skipped: Array<{ name: string; reason: string }>;
}

/** دیالوگ ورود گروهی دانش‌آموزان از فایل اکسل با پیش‌نمایش و ویرایش جنسیت */
export function ImportStudentsDialog({
  open,
  onOpenChange,
  yearId,
  sectionId,
  sectionName,
  existingNorms,
  onImported,
}: ImportStudentsDialogProps) {
  const [step, setStep] = useState<Step>('intro');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('intro');
    setRows([]);
    setResult(null);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = '/api/students/template';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const parseFile = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch('/api/students/import-parse', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sa:unauthorized'));
        }
        throw new ApiError(data.error ?? 'خطا در خواندن فایل', res.status);
      }
      const parsed = buildImportRows(data.rows ?? [], existingNorms);
      setRows(parsed);
      setStep('preview');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در خواندن فایل');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const setRow = (idx: number, patch: Partial<ParsedImportRow>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const setGender = (idx: number, value: string) => {
    setRow(idx, {
      gender: value === '' ? null : (value as 'MALE' | 'FEMALE'),
      genderSource: value === '' ? 'unknown' : 'manual',
    });
  };

  const summary = useMemo(() => {
    const ready = rows.filter(rowImportable);
    const needGender = rows.filter(
      (r) => r.include && r.errors.length === 0 && !r.duplicate && r.gender === null
    ).length;
    const exceptions = ready.filter((r) => r.gpaViolation).length;
    return {
      total: rows.length,
      ready: ready.length,
      needGender,
      exceptions,
      errors: rows.filter((r) => r.errors.length > 0).length,
      duplicates: rows.filter((r) => r.duplicate).length,
    };
  }, [rows]);

  const submit = async () => {
    const payload = rows
      .filter(rowImportable)
      .map((r) => ({
        fullName: r.fullName,
        gender: r.gender,
        grade: r.grade,
        gpaRaw: r.gpaRaw,
        isException: r.gpaViolation,
        parentName: r.parentName,
        parentRank: r.parentRank,
        parentUnit: r.parentUnit,
      }));
    if (payload.length === 0) return;
    setBusy(true);
    try {
      const res = await apiFetch<ImportResult>('/api/students/import', {
        method: 'POST',
        body: JSON.stringify({ yearId, sectionId, rows: payload }),
      });
      setResult(res);
      setStep('result');
      onImported();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در ثبت گروهی');
    } finally {
      setBusy(false);
    }
  };

  const genderBadge = (r: ParsedImportRow) => {
    if (r.gender === null) return null;
    const label = GENDERS[r.gender];
    if (r.genderSource === 'column') {
      return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
          {label}
          <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-sky-100 text-sky-700 border-transparent">
            از فایل
          </Badge>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
        {label}
        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-emerald-100 text-emerald-700 border-transparent">
          <Wand2 className="w-2.5 h-2.5" />
          خودکار
        </Badge>
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle>ورود گروهی دانش‌آموز از فایل اکسل — بخش {sectionName}</DialogTitle>
          <DialogDescription>
            فایل نمونه را دانلود کنید، مطابق قالب پر کنید و بارگذاری کنید؛ قبل از ثبت، پیش‌نمایش کامل با کنترل خطاها نمایش داده می‌شود.
          </DialogDescription>
        </DialogHeader>

        {step === 'intro' && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" className="gap-2" onClick={downloadTemplate}>
                <Download className="w-4 h-4" />
                دانلود فایل نمونه
              </Button>
              <Button className="gap-2 relative" disabled={busy}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={onFileChange}
                  aria-label="انتخاب فایل اکسل"
                />
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                بارگذاری فایل پرشده
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <p>
                  ترتیب ستون‌های فایل: <b className="text-foreground">نام و نام خانوادگی دانش‌آموز، مقطع تحصیلی، معدل، نام والد شاغل در سازمان، طبقه، واحد</b> و ستون هفتم <b className="text-foreground">جنسیت (اختیاری)</b>.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Wand2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                <p>
                  <b className="text-foreground">تشخیص خودکار جنسیت:</b> اگر ستون جنسیت را خالی بگذارید، برنامه جنسیت را از نام کوچک (دیکشنری نام‌های فارسی) تشخیص می‌دهد. نام‌هایی که قابل تشخیص نباشند یا دوجنسیتی باشند، در پیش‌نمایش با رنگ زرد مشخص می‌شوند تا خودتان دختر/پسر را انتخاب کنید.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                <p>
                  معدل پایین‌تر از حد قانون هر مقطع، به‌عنوان <b className="text-foreground">استثنا</b> با رنگ کهربایی ثبت می‌شود و در لیست علامت‌دار خواهد بود.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-transparent">
                آماده: {summary.ready.toLocaleString('fa-IR')}
              </Badge>
              {summary.exceptions > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-transparent">
                  استثنا: {summary.exceptions.toLocaleString('fa-IR')}
                </Badge>
              )}
              {summary.needGender > 0 && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-900 border-transparent">
                  جنسیت نامشخص: {summary.needGender.toLocaleString('fa-IR')}
                </Badge>
              )}
              {summary.duplicates > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-800 border-transparent">
                  تکراری: {summary.duplicates.toLocaleString('fa-IR')}
                </Badge>
              )}
              {summary.errors > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-800 border-transparent">
                  خطا: {summary.errors.toLocaleString('fa-IR')}
                </Badge>
              )}
              <span className="ms-auto" />
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5" />
                فایل نمونه
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs relative"
                disabled={busy}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={onFileChange}
                  aria-label="انتخاب فایل دیگر"
                />
                <FileSpreadsheet className="w-3.5 h-3.5" />
                فایل دیگر
              </Button>
            </div>

            <div
              className="rounded-md border max-h-[46vh] overflow-auto overscroll-contain touch-pan-y custom-scroll"
              onTouchMove={(e) => e.stopPropagation()}
            >
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-8 text-center">
                      <span className="sr-only">درج</span>
                    </TableHead>
                    <TableHead className="w-10 text-center">ردیف</TableHead>
                    <TableHead className="min-w-[130px]">نام دانش‌آموز</TableHead>
                    <TableHead className="text-center">مقطع</TableHead>
                    <TableHead className="text-center">معدل</TableHead>
                    <TableHead>والد</TableHead>
                    <TableHead className="text-center">طبقه</TableHead>
                    <TableHead>واحد</TableHead>
                    <TableHead className="min-w-[110px]">جنسیت</TableHead>
                    <TableHead className="min-w-[130px]">وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => {
                    const blocked = r.errors.length > 0 || r.duplicate;
                    const rowError = r.errors[0];
                    return (
                      <TableRow
                        key={r.fileRow}
                        className={
                          rowError || r.duplicate
                            ? 'bg-red-50/70'
                            : r.gender === null
                              ? 'bg-yellow-50/70'
                              : r.gpaViolation
                                ? 'bg-amber-50/70'
                                : ''
                        }
                      >
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={!blocked && r.include}
                            disabled={blocked}
                            onChange={(e) => setRow(idx, { include: e.target.checked })}
                            className="accent-[hsl(222,47%,25%)]"
                            aria-label={`درج ردیف ${r.fileRow}`}
                          />
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                          {r.fileRow.toLocaleString('fa-IR')}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.fullName || <span className="text-destructive">—</span>}
                          {r.duplicateWith && (
                            <div className="text-[10px] text-destructive">هم‌نام با «{r.duplicateWith}» در همین فایل</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs whitespace-nowrap">{r.gradeDisplay || '—'}</TableCell>
                        <TableCell className="text-center text-xs tabular-nums">{r.gpaRaw || '—'}</TableCell>
                        <TableCell className="text-xs">{r.parentName || '—'}</TableCell>
                        <TableCell className="text-center text-xs">{r.parentRank || '—'}</TableCell>
                        <TableCell className="text-xs">{r.parentUnit || '—'}</TableCell>
                        <TableCell>
                          {r.gender === null ? (
                            <select
                              value=""
                              onChange={(e) => setGender(idx, e.target.value)}
                              className="h-7 rounded-md border border-amber-300 bg-yellow-50 text-xs px-1.5 w-full"
                              aria-label={`جنسیت ردیف ${r.fileRow}`}
                            >
                              <option value="" disabled>
                                انتخاب کنید...
                              </option>
                              <option value="FEMALE">دختر</option>
                              <option value="MALE">پسر</option>
                            </select>
                          ) : (
                            genderBadge(r)
                          )}
                          {r.genderColumnInvalid && (
                            <div className="text-[10px] text-muted-foreground">متن ستون جنسیت نامفهوم بود</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {rowError ? (
                            <span className="inline-flex items-center gap-1 text-xs text-destructive">
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                              {rowError}
                            </span>
                          ) : r.duplicate ? (
                            <span className="inline-flex items-center gap-1 text-xs text-destructive">
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                              نام تکراری
                            </span>
                          ) : r.gpaViolation ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-amber-700"
                              title={r.raw[2] ? `معدل واردشده: ${r.raw[2]}` : undefined}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              ثبت با استثنا
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              آماده
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div className="text-sm">
                <b>{result.inserted.toLocaleString('fa-IR')} دانش‌آموز</b> با موفقیت ثبت شد.
              </div>
            </div>
            {result.skipped.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  {result.skipped.length.toLocaleString('fa-IR')} ردیف ثبت نشد:
                </div>
                <ul className="text-xs text-amber-900 space-y-1 max-h-40 overflow-y-auto custom-scroll list-disc ps-5">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      <b>{s.name}</b> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('intro')} disabled={busy}>
                بازگشت
              </Button>
              <Button
                onClick={submit}
                disabled={busy || summary.ready === 0 || summary.needGender > 0}
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                ثبت {summary.ready.toLocaleString('fa-IR')} دانش‌آموز
              </Button>
            </>
          )}
          {(step === 'intro' || step === 'result') && (
            <Button variant={step === 'result' ? 'default' : 'outline'} onClick={() => handleOpenChange(false)}>
              {step === 'result' ? 'بستن' : 'انصراف'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
