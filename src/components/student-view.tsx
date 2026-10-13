'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { StatsBox } from '@/components/stats-box';
import { StudentFormDialog } from '@/components/student-form-dialog';
import { ImportStudentsDialog } from '@/components/import-students-dialog';
import {
  Plus,
  Search,
  Download,
  FileDown,
  ArrowUpDown,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Loader2,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { apiFetch, ApiError, downloadFile } from '@/lib/api-client';
import { useResource } from '@/lib/resource-cache';
import { parseCounts, countsTotal, type GroupCounts } from '@/lib/counts';
import { gradeLabel, GENDERS, formatGpaDisplay, formatNumberFa } from '@/lib/persian';
import { groupOfGrade, GRADE_GROUPS } from '@/lib/gpa';
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
import type { StudentRecord, PrizeRates, GroupRecordData } from '@/lib/types';
import { normalizeFa } from '@/lib/persian';

type SortField = 'fullName' | 'grade' | 'parentName' | 'parentRank' | 'parentUnit' | 'gpa';
type GroupBy = 'parent' | 'rankUnit' | 'student';

interface SuggestionsData {
  parentName: string[];
  parentRank: string[];
  parentUnit: string[];
  gpaRaw: string[];
}

const EMPTY_STUDENTS: StudentRecord[] = [];
const EMPTY_SUGGESTIONS: SuggestionsData = { parentName: [], parentRank: [], parentUnit: [], gpaRaw: [] };
// رندر تدریجی جدول: در هر مرحله ۲۰۰ ردیف — با ~۱۵۰۰ رکورد DOM از ~۱۵هزار سلول به ~۲هزار می‌رسد
const PAGE_SIZE = 200;

interface StudentViewProps {
  yearId: string;
  yearName: string;
  sectionId: string;
  sectionName: string;
  prizes: PrizeRates;
  onDataChanged?: () => void;
}

export function StudentView({ yearId, yearName, sectionId, sectionName, prizes, onDataChanged }: StudentViewProps) {
  // ─── لیست دانش‌آموزان با کش (الگوی SWR): بازگشت به بخش قبلی آنی است ───
  const fetchStudents = useCallback(
    () =>
      apiFetch<{ students: StudentRecord[] }>(
        `/api/students?yearId=${encodeURIComponent(yearId)}&sectionId=${encodeURIComponent(sectionId)}`
      ),
    [yearId, sectionId]
  );
  const {
    data: studentsData,
    loading,
    refresh: refreshStudents,
  } = useResource<{ students: StudentRecord[] }>(`students:${yearId}:${sectionId}`, fetchStudents);
  const students = studentsData?.students ?? EMPTY_STUDENTS;

  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'FEMALE' | 'MALE'>('all');
  const [exceptionOnly, setExceptionOnly] = useState(false);
  const [sort, setSort] = useState<{ field: SortField; dir: 1 | -1 }>({ field: 'grade', dir: 1 });
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRecord | null>(null);
  const [deleting, setDeleting] = useState<StudentRecord | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // ─── پیشنهادهای اتوکامپلت: یک درخواست برای هر ۴ فیلد (به‌جای ۴ درخواست) + کش ───
  const fetchSuggestions = useCallback(async (): Promise<SuggestionsData> => {
    const res = await apiFetch<Partial<SuggestionsData>>(
      `/api/autocomplete?yearId=${encodeURIComponent(yearId)}&sectionId=${encodeURIComponent(sectionId)}&fields=all`
    );
    return {
      parentName: res.parentName ?? [],
      parentRank: res.parentRank ?? [],
      parentUnit: res.parentUnit ?? [],
      gpaRaw: res.gpaRaw ?? [],
    };
  }, [yearId, sectionId]);
  const { data: suggestionsData, refresh: refreshSuggestions } = useResource<SuggestionsData>(
    `suggestions:${yearId}:${sectionId}`,
    fetchSuggestions
  );
  const suggestions = suggestionsData ?? EMPTY_SUGGESTIONS;

  // محاسبه آمار
  const counts: GroupCounts = useMemo(() => {
    const out: GroupCounts = parseCounts(null);
    for (const st of students) {
      const key = groupOfGrade(st.grade).key;
      out[key].f += st.gender === 'FEMALE' ? 1 : 0;
      out[key].m += st.gender === 'MALE' ? 1 : 0;
    }
    return out;
  }, [students]);

  // فیلتر و جستجو
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase();
    return students.filter((st) => {
      if (genderFilter !== 'all' && st.gender !== genderFilter) return false;
      if (exceptionOnly && !st.isException) return false;
      if (!q) return true;
      const hay = norm(
        [st.fullName, st.parentName, st.parentRank, st.parentUnit, gradeLabel(st.grade)].join(' ')
      );
      return hay.includes(norm(q));
    });
  }, [students, search, genderFilter, exceptionOnly]);

  // مرتب‌سازی
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sort.field) {
        case 'grade':
          cmp = (a.grade ?? 13) - (b.grade ?? 13);
          break;
        case 'gpa':
          cmp = (a.gpaValue ?? -1) - (b.gpaValue ?? -1) || a.gpaRaw.localeCompare(b.gpaRaw, 'fa');
          break;
        default:
          cmp = (a[sort.field] as string).localeCompare((b[sort.field] as string) || '', 'fa');
      }
      return cmp * sort.dir;
    });
    return arr;
  }, [filtered, sort]);

  const toggleSort = (field: SortField) => {
    setSort((s) => (s.field === field ? { field, dir: s.dir === 1 ? -1 : 1 } : { field, dir: 1 }));
  };

  // ─── رندر تدریجی: فقط ۲۰۰ ردیف اول — با رسیدن به انتهای جدول بقیه لود می‌شود ───
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sectionId]);
  const visibleRows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
  const remainingRows = sorted.length - visibleRows.length;
  const sentinelRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || remainingRows <= 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [remainingRows]);

  const studentAmount = (st: StudentRecord) => prizes[groupOfGrade(st.grade).key] ?? 0;

  const handleSaved = () => {
    refreshStudents();
    refreshSuggestions();
    onDataChanged?.();
  };

  /** نام‌های نرمال‌شده موجود برای تشخیص تکراری در ورود گروهی */
  const existingNorms = useMemo(
    () => new Set(students.map((s) => normalizeFa(s.fullName))),
    [students]
  );

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiFetch(`/api/students/${deleting.id}`, { method: 'DELETE' });
      toast.success('رکورد حذف شد');
      setDeleting(null);
      handleSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در حذف');
    } finally {
      setDeletingBusy(false);
    }
  };

  const groupByLabel: Record<GroupBy, string> = {
    parent: 'والد شاغل (خلاصه پرداخت)',
    rankUnit: 'طبقه و واحد',
    student: 'نام دانش‌آموز',
  };

  // خروجی اکسل
  const exportExcel = (groupBy: GroupBy) => {
    downloadFile(
      `/api/export/excel?type=students&yearId=${encodeURIComponent(yearId)}&sectionId=${encodeURIComponent(sectionId)}&groupBy=${groupBy}`
    );
  };

  // خروجی PDF از داده‌های فیلترشده فعلی
  const exportPdf = async (groupBy: GroupBy) => {
    setPdfBusy(true);
    try {
      const rows = [...sorted];
      const makeRow = (st: StudentRecord, serial: number) =>
        `<tr style="background:${st.isException ? '#fef3c7' : '#ffffff'}">` +
        reportCell(String(serial), { center: true }) +
        reportCell(escapeHtml(st.fullName), { center: false }) +
        reportCell(GENDERS[st.gender]) +
        reportCell(gradeLabel(st.grade)) +
        reportCell(escapeHtml(formatGpaDisplay(st.gpaRaw, st.gpaValue))) +
        reportCell(escapeHtml(st.parentName || '—'), { center: false }) +
        reportCell(escapeHtml(st.parentRank || '—')) +
        reportCell(escapeHtml(st.parentUnit || '—'), { center: false }) +
        reportCell(formatNumberFa(studentAmount(st))) +
        (st.isException ? reportCell('استثنا', { bold: true, color: '#b45309' }) : reportCell('')) +
        '</tr>';

      const finish = async (title: string, subtitleLines: string[], tableHtml: string, filename: string) => {
        const el = buildOffscreenReport(reportShell(title, subtitleLines, tableHtml));
        await exportElementToPdf(el, filename);
        disposeOffscreenReport(el);
        toast.success('فایل PDF آماده شد');
      };

      if (groupBy === 'parent') {
        // خلاصه پرداخت به ازای هر والد شاغل — مخصوص واحد مالی
        // هویت والد = نام + واحد + طبقه (نرمال‌شده) تا والدین هم‌نام اشتباهی یکی نشوند
        const groups = new Map<string, { name: string; unit: string; rank: string; list: StudentRecord[] }>();
        for (const st of rows) {
          const key = [normalizeFa(st.parentName), normalizeFa(st.parentUnit), normalizeFa(st.parentRank)].join('|');
          let g = groups.get(key);
          if (!g) {
            g = { name: st.parentName.trim() || '—', unit: st.parentUnit.trim(), rank: st.parentRank.trim(), list: [] };
            groups.set(key, g);
          }
          g.list.push(st);
        }
        const parents = Array.from(groups.values()).sort(
          (a, b) => a.name.localeCompare(b.name, 'fa') || a.unit.localeCompare(b.unit, 'fa') || a.rank.localeCompare(b.rank, 'fa')
        );

        let body = '';
        let grand = 0;
        let grandChildren = 0;
        parents.forEach((p, i) => {
          const kids = [...p.list].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || a.fullName.localeCompare(b.fullName, 'fa'));
          const gradesText = kids.map((st) => gradeLabel(st.grade)).join('، ');
          const total = p.list.reduce((s, st) => s + studentAmount(st), 0);
          grand += total;
          grandChildren += p.list.length;
          body +=
            `<tr style="background:${i % 2 === 1 ? '#f2f6fb' : '#ffffff'}">` +
            reportCell(String(i + 1)) +
            reportCell(escapeHtml(p.name), { center: false, bold: true }) +
            reportCell(escapeHtml(p.unit || '—'), { center: false }) +
            reportCell(escapeHtml(p.rank || '—')) +
            reportCell(formatNumberFa(p.list.length), { bold: true }) +
            reportCell(escapeHtml(gradesText), { center: false }) +
            reportCell(formatNumberFa(total), { bold: true }) +
            '</tr>';
        });

        body +=
          `<tr><td colspan="4" style="background:#1f3a5f;color:#fff;font-weight:700;border:1px solid #16304f;padding:5px 6px;text-align:center;">جمع کل</td>` +
          `<td style="background:#1f3a5f;color:#fff;font-weight:700;border:1px solid #16304f;padding:5px 6px;text-align:center;">${formatNumberFa(grandChildren)}</td>` +
          `<td style="background:#1f3a5f;border:1px solid #16304f;"></td>` +
          `<td style="background:#1f3a5f;color:#fff;font-weight:700;border:1px solid #16304f;padding:5px 6px;text-align:center;">${formatNumberFa(grand)}</td></tr>`;

        const headers = ['ردیف', 'والد شاغل در سازمان', 'واحد سازمانی', 'طبقه', 'تعداد فرزندان', 'مقاطع فرزندان', 'مبلغ کل (تومان)'];
        await finish(
          `خلاصه پرداخت والدین شاغل — بخش ${sectionName}`,
          [
            `سال تحصیلی ${yearName}`,
            `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`,
            `تعداد والدین: ${formatNumberFa(parents.length)} — تعداد فرزندان: ${formatNumberFa(rows.length)}`,
          ],
          reportTable(headers, body),
          `parent-payment-summary-${new Date().toISOString().slice(0, 10)}.pdf`
        );
        return;
      }

      let body = '';
      let serial = 0;
      let grand = 0;

      if (groupBy === 'student') {
        rows.sort((a, b) => a.fullName.localeCompare(b.fullName, 'fa'));
        for (const st of rows) {
          serial += 1;
          grand += studentAmount(st);
          body += makeRow(st, serial);
        }
      } else {
        // گروه‌بندی دوسطحی: اول طبقه، بعد واحدهای همان طبقه
        const byRank = new Map<string, Map<string, StudentRecord[]>>();
        for (const st of rows) {
          const rk = st.parentRank.trim() || '—';
          const un = st.parentUnit.trim() || '—';
          if (!byRank.has(rk)) byRank.set(rk, new Map());
          const units = byRank.get(rk)!;
          if (!units.has(un)) units.set(un, []);
          units.get(un)!.push(st);
        }
        const sectionRow = (text: string, bg: string, fg = '#1a1a2e') =>
          `<tr><td colspan="10" style="background:${bg};font-weight:700;border:1px solid #c9d4e3;padding:4px 6px;text-align:center;color:${fg}">${escapeHtml(text)}</td></tr>`;
        const amountRow = (label: string, amount: number, bg: string) =>
          `<tr><td colspan="8" style="background:${bg};font-weight:700;border:1px solid #c9d4e3;padding:4px 6px;text-align:center;">${escapeHtml(label)}</td>` +
          `<td style="background:${bg};font-weight:700;border:1px solid #c9d4e3;padding:4px 6px;text-align:center;">${formatNumberFa(amount)}</td>` +
          `<td style="background:${bg};border:1px solid #c9d4e3;"></td></tr>`;

        const ranksSorted = Array.from(byRank.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fa'));
        for (const [rank, units] of ranksSorted) {
          body += sectionRow(`طبقه: ${rank}`, '#dce6f1');
          let rankTotal = 0;
          const unitsSorted = Array.from(units.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fa'));
          for (const [unit, list] of unitsSorted) {
            list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'fa'));
            const unitTotal = list.reduce((s, st) => s + studentAmount(st), 0);
            rankTotal += unitTotal;
            body += amountRow(`واحد: ${unit} — تعداد: ${formatNumberFa(list.length)} نفر`, unitTotal, '#eef3f9');
            for (const st of list) {
              serial += 1;
              body += makeRow(st, serial);
            }
          }
          body += amountRow(`جمع طبقه: ${rank}`, rankTotal, '#dce6f1');
        }
        grand = rows.reduce((s, st) => s + studentAmount(st), 0);
      }

      body += `<tr><td colspan="8" style="background:#1f3a5f;color:#fff;font-weight:700;border:1px solid #16304f;padding:5px 6px;text-align:center;">جمع کل</td>` +
        `<td style="background:#1f3a5f;color:#fff;font-weight:700;border:1px solid #16304f;padding:5px 6px;text-align:center;">${formatNumberFa(grand)}</td>` +
        `<td style="background:#1f3a5f;border:1px solid #16304f;"></td></tr>`;

      const headers = ['ردیف', 'نام و نام خانوادگی', 'جنسیت', 'مقطع', 'معدل', 'والد شاغل در سازمان', 'طبقه', 'واحد', 'مبلغ جایزه (تومان)', 'وضعیت'];
      await finish(
        `خروجی دانش‌آموزان ممتاز — بخش ${sectionName}`,
        [
          `سال تحصیلی ${yearName}`,
          `گروه‌بندی بر اساس: ${groupByLabel[groupBy]}`,
          `تاریخ: ${new Date().toLocaleDateString('fa-IR')}`,
          `تعداد رکوردها: ${formatNumberFa(rows.length)}`,
        ],
        reportTable(headers, body),
        `students-${groupBy}-${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } catch (err) {
      console.error(err);
      toast.error('خطا در تولید PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const sortIcon = (field: SortField) =>
    sort.field === field ? (
      <ArrowUpDown className={`w-3 h-3 mr-1 ${sort.dir === 1 ? 'text-primary' : 'text-primary rotate-180'}`} />
    ) : (
      <ArrowUpDown className="w-3 h-3 mr-1 opacity-30" />
    );

  return (
    <div className="space-y-4">
      <StatsBox counts={counts} rates={prizes} title={`آمار کلی بخش ${sectionName}`} />

      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در نام دانش‌آموز، والد، طبقه، واحد..."
            className="pr-9"
            aria-label="جستجو"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={genderFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => setGenderFilter('all')}
          >
            همه
          </Button>
          <Button
            variant={genderFilter === 'FEMALE' ? 'default' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => setGenderFilter('FEMALE')}
          >
            دختر
          </Button>
          <Button
            variant={genderFilter === 'MALE' ? 'default' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => setGenderFilter('MALE')}
          >
            پسر
          </Button>
          <Button
            variant={exceptionOnly ? 'secondary' : 'outline'}
            size="sm"
            className={`h-9 gap-1 ${exceptionOnly ? 'bg-amber-100 text-amber-800 hover:bg-amber-100' : ''}`}
            onClick={() => setExceptionOnly((v) => !v)}
          >
            <ShieldAlert className="w-4 h-4" />
            استثناها
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
            ورود از اکسل
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                خروجی اکسل
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>گروه‌بندی خروجی بر اساس</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportExcel('parent')}>
                <FileSpreadsheet className="w-4 h-4 ml-2" /> والد شاغل (خلاصه پرداخت)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportExcel('rankUnit')}>
                <FileSpreadsheet className="w-4 h-4 ml-2" /> طبقه و واحد
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportExcel('student')}>
                <FileSpreadsheet className="w-4 h-4 ml-2" /> نام دانش‌آموز
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" disabled={pdfBusy}>
              {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              خروجی PDF
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>گروه‌بندی خروجی بر اساس</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportPdf('parent')}>والد شاغل (خلاصه پرداخت)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportPdf('rankUnit')}>طبقه و واحد</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportPdf('student')}>نام دانش‌آموز</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-md border">
        <div className="max-h-[480px] overflow-y-auto overflow-x-auto custom-scroll">
          {/* overflow-visible: کانتینر داخلی جدول نباید اسکرول‌کانتینر شود وگرنه sticky هدر از کار می‌افتد */}
          <Table containerClassName="overflow-visible">
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead className="text-center w-10">#</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('fullName')}>
                  نام و نام خانوادگی {sortIcon('fullName')}
                </TableHead>
                <TableHead className="text-center">جنسیت</TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('grade')}>
                  مقطع {sortIcon('grade')}
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('gpa')}>
                  معدل {sortIcon('gpa')}
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('parentName')}
                >
                  والد شاغل {sortIcon('parentName')}
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('parentRank')}>
                  طبقه {sortIcon('parentRank')}
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('parentUnit')}>
                  واحد {sortIcon('parentUnit')}
                </TableHead>
                <TableHead className="text-center">مبلغ جایزه</TableHead>
                <TableHead className="text-center">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    در حال بارگذاری...
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                    {students.length === 0
                      ? 'هنوز دانش‌آموزی ثبت نشده است — با دکمه + پایین صفحه اولین رکورد را اضافه کنید'
                      : 'موردی مطابق جستجو یافت نشد'}
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((st, i) => (
                  <TableRow key={st.id} className={st.isException ? 'bg-amber-50 hover:bg-amber-100/70' : ''}>
                    <TableCell className="text-center text-muted-foreground text-xs">{formatNumberFa(i + 1)}</TableCell>
                    <TableCell className="font-medium">
                      {st.fullName}
                      {st.isException && (
                        <Badge variant="outline" className="mr-2 border-amber-500 text-amber-700 text-[10px]">
                          استثنا
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{GENDERS[st.gender]}</TableCell>
                    <TableCell className="text-center">{gradeLabel(st.grade)}</TableCell>
                    <TableCell className="text-center">{formatGpaDisplay(st.gpaRaw, st.gpaValue)}</TableCell>
                    <TableCell>{st.parentName || '—'}</TableCell>
                    <TableCell className="text-center">{st.parentRank || '—'}</TableCell>
                    <TableCell>{st.parentUnit || '—'}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {formatNumberFa(studentAmount(st))}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditing(st);
                            setFormOpen(true);
                          }}
                          aria-label={`ویرایش ${st.fullName}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(st)}
                          aria-label={`حذف ${st.fullName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {remainingRows > 0 && (
                <TableRow ref={sentinelRef} className="border-0">
                  <TableCell colSpan={10} className="text-center py-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin inline-block align-middle ml-1" />
                    نمایش {formatNumberFa(remainingRows < PAGE_SIZE ? remainingRows : PAGE_SIZE)} رکورد بعدی از {formatNumberFa(sorted.length)} رکورد …
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* دکمه شناور افزودن */}
      <button
        type="button"
        onClick={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 hover:scale-105 transition-all"
        aria-label="افزودن دانش‌آموز جدید"
      >
        <Plus className="w-7 h-7" />
      </button>

      <StudentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        yearId={yearId}
        sectionId={sectionId}
        sectionName={sectionName}
        editing={editing}
        suggestions={suggestions}
        prizes={prizes}
        onSaved={handleSaved}
      />

      <ImportStudentsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        yearId={yearId}
        sectionId={sectionId}
        sectionName={sectionName}
        existingNorms={existingNorms}
        onImported={handleSaved}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف رکورد</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف «{deleting?.fullName}» مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deletingBusy}
            >
              {deletingBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
