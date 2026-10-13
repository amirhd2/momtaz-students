'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatsBox } from '@/components/stats-box';
import { AutocompleteInput } from '@/components/autocomplete-input';
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  FileDown,
  Loader2,
  FileSpreadsheet,
  Clock,
  ArrowDownAZ,
  Search,
  X,
} from 'lucide-react';
import { apiFetch, ApiError, downloadFile } from '@/lib/api-client';
import { useResource } from '@/lib/resource-cache';
import { cn } from '@/lib/utils';
import { ProvinceSelect } from '@/components/province-select';
import {
  emptyCounts,
  parseCounts,
  sumCounts,
  countsTotal,
  countsAmount,
  GROUP_KEYS,
  type GroupCounts,
  type GenderCount,
} from '@/lib/counts';
import { GRADE_GROUPS, type GroupKey } from '@/lib/gpa';
import { formatNumberFa, normalizeFa, toLatinDigits } from '@/lib/persian';
import {
  exportElementToPdf,
  buildOffscreenReport,
  disposeOffscreenReport,
  reportShell,
  reportTable,
  reportCell,
  escapeHtml,
} from '@/lib/pdf-export';
import { toast } from 'sonner';
import type { GroupRecordData, PrizeRates } from '@/lib/types';

const EMPTY_RECORDS: GroupRecordData[] = [];

interface GroupViewProps {
  yearId: string;
  yearName: string;
  /** null = صفحه استان‌ها */
  sectionId: string | null;
  /** نام بخش (برای بخش‌های گروهی) */
  sectionName?: string;
  prizes: PrizeRates;
  isProvinces: boolean;
}

/** ویو رکوردهای آماری گروهی: استان‌ها و بخش‌های گروهی */
export function GroupView({ yearId, yearName, sectionId, sectionName, prizes, isProvinces }: GroupViewProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GroupRecordData | null>(null);
  const [deleting, setDeleting] = useState<GroupRecordData | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [counts, setCounts] = useState<GroupCounts>(emptyCounts());
  const [existingTitles, setExistingTitles] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'recent' | 'alpha'>('recent');
  // جستجوی زنده استان — فیلتر فوری جدول بدون اسکرول دستی بین ۳۱ استان
  const [provinceQuery, setProvinceQuery] = useState('');

  const label = isProvinces ? 'استان' : sectionName ?? 'گروه';

  // ─── رکوردها با کش (الگوی SWR): بازگشت به صفحه استان‌ها آنی است ───
  const fetchRecords = useCallback(
    () =>
      apiFetch<{ records: GroupRecordData[] }>(
        `/api/group-records?yearId=${encodeURIComponent(yearId)}&sectionId=${encodeURIComponent(sectionId ?? '')}`
      ),
    [yearId, sectionId]
  );
  const {
    data: recordsData,
    loading,
    refresh: refreshRecords,
  } = useResource<{ records: GroupRecordData[] }>(`groups:${yearId}:${sectionId ?? ''}`, fetchRecords);
  const records = recordsData?.records ?? EMPTY_RECORDS;

  useEffect(() => {
    setExistingTitles(records.map((r) => r.title).sort((a, b) => a.localeCompare(b, 'fa')));
  }, [records]);

  const parsedRecords = useMemo(
    () => records.map((r) => ({ record: r, counts: parseCounts(r.counts) })),
    [records]
  );

  /** نمایش جدول با سورت انتخابی: جدیدترین یا الفبایی */
  const displayRecords = useMemo(() => {
    const arr = [...parsedRecords];
    if (sortMode === 'alpha') {
      arr.sort((a, b) => a.record.title.localeCompare(b.record.title, 'fa'));
    } else {
      arr.sort((a, b) => (b.record.createdAt ?? '').localeCompare(a.record.createdAt ?? ''));
    }
    return arr;
  }, [parsedRecords, sortMode]);

  /** فیلتر جستجوی استان (نرمال‌سازی حروف عربی/فارسی و نیم‌فاصله) */
  const filteredRecords = useMemo(() => {
    if (!isProvinces) return displayRecords;
    const q = normalizeFa(provinceQuery).trim();
    if (!q) return displayRecords;
    return displayRecords.filter(({ record }) => normalizeFa(record.title).includes(q));
  }, [displayRecords, provinceQuery, isProvinces]);

  /** استان‌های دارای رکورد (نرمال‌شده) برای نشانگر منوی انتخاب استان */
  const takenNormTitles = useMemo(
    () => new Set(records.map((r) => normalizeFa(r.title))),
    [records]
  );

  const aggregate: GroupCounts = useMemo(
    () => sumCounts(parsedRecords.map((p) => p.counts)),
    [parsedRecords]
  );

  const openCreate = () => {
    setEditing(null);
    setTitleText('');
    setCounts(emptyCounts());
    setFormOpen(true);
  };

  const openEdit = (rec: GroupRecordData) => {
    setEditing(rec);
    setTitleText(rec.title);
    setCounts(parseCounts(rec.counts));
    setFormOpen(true);
  };

  const duplicateTitle = useMemo(() => {
    const t = normalizeFa(titleText).trim();
    if (!t) return null;
    return records.some((r) => normalizeFa(r.title) === t && r.id !== editing?.id);
  }, [titleText, records, editing]);

  const formTotal = countsTotal(counts);
  const formAmount = countsAmount(counts, prizes);

  const submit = async () => {
    if (!titleText.trim()) {
      toast.error(isProvinces ? 'استان را انتخاب کنید' : 'عنوان را وارد کنید');
      return;
    }
    if (duplicateTitle) {
      toast.error('برای این عنوان قبلاً رکورد ثبت شده است');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        yearId,
        sectionId: sectionId ?? undefined,
        title: titleText.trim(),
        counts,
      };
      if (editing) {
        await apiFetch(`/api/group-records/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.success('رکورد به‌روزرسانی شد');
      } else {
        await apiFetch('/api/group-records', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('رکورد جدید ثبت شد');
      }
      setFormOpen(false);
      refreshRecords();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/group-records/${deleting.id}`, { method: 'DELETE' });
      toast.success('رکورد حذف شد');
      setDeleting(null);
      refreshRecords();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در حذف');
    } finally {
      setBusy(false);
    }
  };

  const setCount = (key: GroupKey, field: 'f' | 'm', value: string) => {
    const num = parseInt(toLatinDigits(value), 10);
    setCounts((c) => ({
      ...c,
      [key]: { ...c[key], [field]: Number.isFinite(num) && num >= 0 ? Math.min(num, 999999) : 0 },
    }));
  };

  // خروجی اکسل (استان‌ها) — برای بخش‌های گروهی هم ساختار مشابه
  const exportExcel = () => {
    const params = new URLSearchParams({ type: 'provinces', yearId });
    if (sectionId) params.set('sectionId', sectionId);
    downloadFile(`/api/export/excel?${params.toString()}`);
  };

  // خروجی PDF
  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      let body = '';
      let grandStudents = 0;
      let grandAmount = 0;
      const groupTotals: Record<string, { f: number; m: number }> = {};

      const sorted = [...parsedRecords].sort((a, b) => a.record.title.localeCompare(b.record.title, 'fa'));
      for (const { record, counts: c } of sorted) {
        let total = 0;
        let amount = 0;
        let cells = '';
        for (const g of GRADE_GROUPS) {
          const f = c[g.key].f;
          const m = c[g.key].m;
          const n = f + m;
          total += n;
          amount += n * (prizes[g.key] ?? 0);
          const prev = groupTotals[g.key] ?? { f: 0, m: 0 };
          groupTotals[g.key] = { f: prev.f + f, m: prev.m + m };
          cells += reportCell(formatNumberFa(f)) + reportCell(formatNumberFa(m));
        }
        grandStudents += total;
        grandAmount += amount;
        body += `<tr>${reportCell(escapeHtml(record.title), { center: false, bold: true })}${cells}` +
          reportCell(formatNumberFa(total), { bold: true }) +
          reportCell(formatNumberFa(amount), { bold: true }) +
          '</tr>';
      }

      let totalCells = '';
      for (const g of GRADE_GROUPS) {
        const t = groupTotals[g.key] ?? { f: 0, m: 0 };
        totalCells += reportCell(formatNumberFa(t.f), { bold: true }) + reportCell(formatNumberFa(t.m), { bold: true });
      }
      body += `<tr>${reportCell('جمع کل', { bold: true })}${totalCells}` +
        reportCell(formatNumberFa(grandStudents), { bold: true }) +
        reportCell(formatNumberFa(grandAmount), { bold: true }) +
        '</tr>';

      // سربرگ دوردیفه: عنوان هر مقطع روی دو ستون دختر/پسر
      const th = (t: string, attrs = '', extraStyle = '') =>
        `<th ${attrs} style="background: #1f3a5f; color: #ffffff; border: 1px solid #16304f; padding: 5px 3px; font-weight: 700; text-align: center; ${extraStyle}">${escapeHtml(t)}</th>`;
      const thead =
        `<tr>${th(label, 'rowspan="2"')}` +
        GRADE_GROUPS.map((g) => th(g.label, 'colspan="2"')).join('') +
        th('جمع دانش‌آموزان', 'rowspan="2"') +
        th('مبلغ کل (تومان)', 'rowspan="2"') +
        `</tr><tr>` +
        GRADE_GROUPS.map(() => th('دختر') + th('پسر')).join('') +
        `</tr>`;

      const headers = [label, ...GRADE_GROUPS.map((g) => g.label), 'جمع دانش‌آموزان', 'مبلغ کل (تومان)'];
      const html = reportShell(
        `خروجی ${label === 'استان' ? 'استان‌ها' : `بخش ${sectionName}`}`,
        [`سال تحصیلی ${yearName}`, `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`, `تعداد ${label === 'استان' ? 'استان' : 'گروه'}: ${formatNumberFa(records.length)}`],
        reportTable(headers, body, thead)
      );
      const el = buildOffscreenReport(html);
      await exportElementToPdf(el, `group-export-${new Date().toISOString().slice(0, 10)}.pdf`);
      disposeOffscreenReport(el);
      toast.success('فایل PDF آماده شد');
    } catch (err) {
      console.error(err);
      toast.error('خطا در تولید PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <StatsBox counts={aggregate} rates={prizes} title={`آمار تجمعی ${label === 'استان' ? 'استان‌های ثبت‌شده' : `بخش ${sectionName}`}`} />

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={exportExcel}>
            <Download className="w-4 h-4" />
            خروجی اکسل
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportPdf} disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            خروجی PDF
          </Button>
          {isProvinces && (
            <div className="flex items-center gap-2 order-last w-full sm:order-none sm:w-auto">
              <div className="relative w-full sm:w-56">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={provinceQuery}
                  onChange={(e) => setProvinceQuery(e.target.value)}
                  placeholder="جستجوی استان…"
                  aria-label="جستجوی استان"
                  className="h-9 pr-8 pl-8 text-sm bg-background"
                />
                {provinceQuery && (
                  <button
                    type="button"
                    onClick={() => setProvinceQuery('')}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="پاک کردن جستجو"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {provinceQuery.trim() !== '' && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {filteredRecords.length === 0 ? 'یافت نشد' : `${formatNumberFa(filteredRecords.length)} استان`}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">ترتیب نمایش:</span>
          {/* دکمه انتخاب‌شده با همان سرمه‌ای پررنگ هدر (bg-primary) پر می‌شود تا انتخاب کاملاً واضح باشد */}
          <div className="flex items-center rounded-md border bg-muted/40 p-0.5 gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 gap-1.5 px-2.5 text-xs transition-colors',
                sortMode === 'recent'
                  ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
              )}
              onClick={() => setSortMode('recent')}
              aria-pressed={sortMode === 'recent'}
            >
              <Clock className="w-3.5 h-3.5" />
              جدیدترین
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 gap-1.5 px-2.5 text-xs transition-colors',
                sortMode === 'alpha'
                  ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
              )}
              onClick={() => setSortMode('alpha')}
              aria-pressed={sortMode === 'alpha'}
            >
              <ArrowDownAZ className="w-3.5 h-3.5" />
              الفبایی
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <div className="max-h-[440px] overflow-y-auto custom-scroll overflow-x-auto">
          {/* overflow-visible: کانتینر داخلی جدول نباید اسکرول‌کانتینر شود وگرنه sticky هدر از کار می‌افتد */}
          <Table containerClassName="overflow-visible">
            <TableHeader className="sticky top-0 z-10 shadow-sm">
              <TableRow className="bg-background hover:bg-background">
                <TableHead rowSpan={2} className="min-w-[120px] align-middle text-start">
                  {label}
                </TableHead>
                {GRADE_GROUPS.map((g) => (
                  <TableHead key={g.key} colSpan={2} className="text-center border-r">
                    {g.label}
                  </TableHead>
                ))}
                <TableHead rowSpan={2} className="text-center align-middle">جمع دانش‌آموزان</TableHead>
                <TableHead rowSpan={2} className="text-center align-middle">مبلغ کل (تومان)</TableHead>
                <TableHead rowSpan={2} className="text-center align-middle">عملیات</TableHead>
              </TableRow>
              <TableRow className="bg-background hover:bg-background">
                {GRADE_GROUPS.map((g) => (
                  <Fragment key={g.key}>
                    <TableHead className="text-center min-w-[44px] border-r bg-pink-50 text-pink-800">
                      دختر
                    </TableHead>
                    <TableHead className="text-center min-w-[44px] bg-sky-50 text-sky-800">پسر</TableHead>
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    در حال بارگذاری...
                  </TableCell>
                </TableRow>
              ) : parsedRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-10 text-muted-foreground">
                    هنوز رکوردی ثبت نشده است — با دکمه + پایین صفحه {isProvinces ? 'استان' : 'گروه'} جدید اضافه کنید
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-10 text-muted-foreground">
                    {isProvinces ? 'استانی' : 'گروهی'} مطابق «{provinceQuery}» یافت نشد
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map(({ record, counts: c }) => {
                  const total = countsTotal(c);
                  const amount = countsAmount(c, prizes);
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.title}</TableCell>
                      {GRADE_GROUPS.map((g) => (
                        <Fragment key={g.key}>
                          <TableCell className="text-center tabular-nums border-r">
                            {formatNumberFa(c[g.key].f)}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {formatNumberFa(c[g.key].m)}
                          </TableCell>
                        </Fragment>
                      ))}
                      <TableCell className="text-center font-semibold tabular-nums">{formatNumberFa(total)}</TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">{formatNumberFa(amount)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(record)} aria-label={`ویرایش ${record.title}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(record)}
                            aria-label={`حذف ${record.title}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* دکمه شناور افزودن */}
      <button
        type="button"
        onClick={openCreate}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 hover:scale-105 transition-all"
        aria-label={`افزودن ${label} جدید`}
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* فرم ثبت/ویرایش آماری */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto custom-scroll">
          <DialogHeader>
            <DialogTitle>
              {editing ? `ویرایش رکورد ${editing.title}` : isProvinces ? 'ثبت آمار استان جدید' : `ثبت گروه جدید — ${sectionName}`}
            </DialogTitle>
            <DialogDescription>
              تعداد دختر و پسر هر مقطع را وارد کنید؛ جمع کل و مبالغ به‌صورت خودکار محاسبه می‌شوند.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{label} {isProvinces ? '' : '(عنوان)'}</Label>
              {isProvinces ? (
                <ProvinceSelect
                  value={titleText}
                  onChange={setTitleText}
                  takenNormTitles={takenNormTitles}
                  allowedNormTitle={editing ? normalizeFa(editing.title) : null}
                />
              ) : (
                <AutocompleteInput
                  value={titleText}
                  onChange={setTitleText}
                  suggestions={existingTitles}
                  placeholder="مثال: کمیسیون آموزش"
                />
              )}
              {duplicateTitle && <p className="text-xs text-destructive">برای این {label} قبلاً رکورد ثبت شده است</p>}
            </div>

            <div className="grid gap-2">
              <Label>تعداد به تفکیک مقطع</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {GRADE_GROUPS.map((g) => (
                  <div key={g.key} className="rounded-lg border p-3 space-y-2 bg-slate-50/50">
                    <div className="text-sm font-semibold text-primary">{g.label}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">دختر</label>
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={counts[g.key].f === 0 ? '' : String(counts[g.key].f)}
                          onChange={(e) => setCount(g.key, 'f', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">پسر</label>
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={counts[g.key].m === 0 ? '' : String(counts[g.key].m)}
                          onChange={(e) => setCount(g.key, 'm', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      مبلغ این مقطع: {formatNumberFa((counts[g.key].f + counts[g.key].m) * (prizes[g.key] ?? 0))} تومان
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 border p-3 flex flex-wrap gap-6 justify-center">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">جمع کل دانش‌آموزان</div>
                <div className="text-xl font-bold text-primary">{formatNumberFa(formTotal)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">مبلغ کل جوایز</div>
                <div className="text-xl font-bold text-primary">{formatNumberFa(formAmount)}</div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>
              انصراف
            </Button>
            <Button onClick={submit} disabled={busy || !titleText.trim() || Boolean(duplicateTitle)}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'ذخیره تغییرات' : 'ثبت رکورد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف رکورد</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف رکورد «{deleting?.title}» مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
