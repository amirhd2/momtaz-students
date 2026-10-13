'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CalendarPlus,
  Pencil,
  Trash2,
  Download,
  Upload,
  Loader2,
  Save,
  Star,
  LayoutGrid,
  ShieldCheck,
  CheckCircle2,
  HardDrive,
  Copy,
  DatabaseBackup,
} from 'lucide-react';
import { apiFetch, ApiError, downloadFile } from '@/lib/api-client';
import { GRADE_GROUPS, type GroupKey } from '@/lib/gpa';
import { formatNumberFa, toLatinDigits, toPersianDigits } from '@/lib/persian';
import { toast } from 'sonner';
import type { PrizeRates, YearInfo, SectionInfo, SectionType } from '@/lib/types';

interface SettingsViewProps {
  years: YearInfo[];
  activeYearId: string;
  prizes: PrizeRates;
  onRefresh: () => Promise<void> | void;
}

export function SettingsView({ years, activeYearId, prizes, onRefresh }: SettingsViewProps) {
  const activeYear = years.find((y) => y.id === activeYearId) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>تنظیمات برنامه</CardTitle>
        <CardDescription>
          مدیریت سال‌های تحصیلی، مبالغ جوایز، بخش‌ها و پشتیبان‌گیری — تغییرات روی سال فعال اعمال می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="years" dir="rtl">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="years" className="gap-1">
              <CalendarPlus className="w-4 h-4" /> سال و جوایز
            </TabsTrigger>
            <TabsTrigger value="sections" className="gap-1">
              <LayoutGrid className="w-4 h-4" /> مدیریت بخش‌ها
            </TabsTrigger>
            <TabsTrigger value="backup" className="gap-1">
              <Download className="w-4 h-4" /> پشتیبان‌گیری
            </TabsTrigger>
            <TabsTrigger value="password" className="gap-1">
              <ShieldCheck className="w-4 h-4" /> تغییر رمز
            </TabsTrigger>
          </TabsList>

          <TabsContent value="years">
            <YearsTab years={years} activeYearId={activeYearId} activeYearName={activeYear?.name ?? ''} prizes={prizes} onRefresh={onRefresh} />
          </TabsContent>

          <TabsContent value="sections">
            <SectionsTab activeYear={activeYear} onRefresh={onRefresh} />
          </TabsContent>

          <TabsContent value="backup">
            <BackupTab onRefresh={onRefresh} />
          </TabsContent>

          <TabsContent value="password">
            <PasswordTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* ---------- تب سال و جوایز ---------- */
function YearsTab({
  years,
  activeYearId,
  activeYearName,
  prizes,
  onRefresh,
}: {
  years: YearInfo[];
  activeYearId: string;
  activeYearName: string;
  prizes: PrizeRates;
  onRefresh: () => Promise<void> | void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [copyFrom, setCopyFrom] = useState<string>(activeYearId);
  const [renaming, setRenaming] = useState<YearInfo | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<YearInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const [amounts, setAmounts] = useState<PrizeRates>(prizes);
  const [savingPrizes, setSavingPrizes] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    setAmounts(prizes);
  }, [prizes]);

  const setAmount = (key: GroupKey, raw: string) => {
    const num = parseInt(toLatinDigits(raw).replace(/[^\d]/g, ''), 10);
    setAmounts((a) => ({ ...a, [key]: Number.isFinite(num) && num >= 0 ? num : 0 }));
  };

  const savePrizes = async () => {
    setSavingPrizes(true);
    try {
      await apiFetch(`/api/years/${activeYearId}/prizes`, {
        method: 'PUT',
        body: JSON.stringify({ amounts }),
      });
      toast.success('مبالغ جوایز ذخیره شد');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در ذخیره مبالغ');
    } finally {
      setSavingPrizes(false);
    }
  };

  const createYear = async () => {
    if (!newName.trim()) {
      toast.error('نام سال را وارد کنید');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/years', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), copyFromYearId: copyFrom || undefined }),
      });
      toast.success(`سال «${newName.trim()}» ساخته شد (مبالغ و بخش‌ها کپی شد)`);
      setCreateOpen(false);
      setNewName('');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در ساخت سال');
    } finally {
      setBusy(false);
    }
  };

  const activateYear = async (year: YearInfo) => {
    try {
      await apiFetch(`/api/years/${year.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
      toast.success(`سال «${year.name}» فعال شد`);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا');
    }
  };

  const renameYear = async () => {
    if (!renaming || !renameText.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/years/${renaming.id}`, { method: 'PATCH', body: JSON.stringify({ name: renameText.trim() }) });
      toast.success('نام سال تغییر کرد');
      setRenaming(null);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در تغییر نام');
    } finally {
      setBusy(false);
    }
  };

  const deleteYear = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/years/${deleting.id}`, { method: 'DELETE' });
      toast.success(`سال «${deleting.name}» و تمام داده‌های آن حذف شد`);
      setDeleting(null);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در حذف سال');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          سال فعال: <Badge className="bg-primary">{activeYearName}</Badge> — همه ثبت‌ها در سال فعال انجام می‌شود.
        </p>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="w-4 h-4" />
          ساخت سال جدید
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>سال تحصیلی</TableHead>
              <TableHead className="text-center">تعداد بخش‌ها</TableHead>
              <TableHead className="text-center">وضعیت</TableHead>
              <TableHead className="text-center">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {years.map((y) => (
              <TableRow key={y.id}>
                <TableCell className="font-medium">{y.name}</TableCell>
                <TableCell className="text-center">{toPersianDigits(y.sections.length)}</TableCell>
                <TableCell className="text-center">
                  {y.isActive ? (
                    <Badge className="gap-1 bg-emerald-600">
                      <CheckCircle2 className="w-3 h-3" /> فعال
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => activateYear(y)}>
                      فعال‌سازی
                    </Button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`تغییر نام سال ${y.name}`}
                      onClick={() => {
                        setRenaming(y);
                        setRenameText(y.name);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`حذف سال ${y.name}`}
                      disabled={y.isActive}
                      onClick={() => setDeleting(y)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">مبالغ جوایز هر مقطع (تومان) — سال {activeYearName}</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          این مبالغ در ساخت سال جدید به آن سال منتقل می‌شوند و در خروجی‌ها و محاسبه مبلغ کل هر والد/استان استفاده می‌شوند.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GRADE_GROUPS.map((g) => (
            <div key={g.key} className="space-y-1">
              <Label htmlFor={`prize-${g.key}`} className="text-sm">
                {g.label}
              </Label>
              <div className="relative">
                <Input
                  id={`prize-${g.key}`}
                  inputMode="numeric"
                  value={amounts[g.key] === 0 ? '' : formatNumberFa(amounts[g.key])}
                  onChange={(e) => setAmount(g.key, e.target.value)}
                  placeholder="0"
                  className="pl-14"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">تومان</span>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" className="gap-1" onClick={savePrizes} disabled={savingPrizes}>
          {savingPrizes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          ذخیره مبالغ
        </Button>
      </div>

      {/* گفتگوی ساخت سال */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ساخت سال تحصیلی جدید</DialogTitle>
            <DialogDescription>
              مبالغ جوایز و ساختار بخش‌ها از سال انتخابی کپی می‌شود. لیست دانش‌آموزان خالی شروع می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="new-year-name">نام سال (مثال: 1405-1406)</Label>
              <Input
                id="new-year-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="1405-1406"
              />
            </div>
            <div className="grid gap-2">
              <Label>کپی تنظیمات از سال</Label>
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              انصراف
            </Button>
            <Button onClick={createYear} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              ساخت سال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* گفتگوی تغییر نام سال */}
      <Dialog open={Boolean(renaming)} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تغییر نام سال</DialogTitle>
          </DialogHeader>
          <Input value={renameText} onChange={(e) => setRenameText(e.target.value)} className="mt-2" />
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setRenaming(null)} disabled={busy}>
              انصراف
            </Button>
            <Button onClick={renameYear} disabled={busy || !renameText.trim()}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف سال تحصیلی</AlertDialogTitle>
            <AlertDialogDescription>
              با حذف سال «{deleting?.name}» تمام دانش‌آموزان، رکوردها و بخش‌های آن نیز حذف می‌شود و قابل بازگشت نیست.
              توصیه می‌شود ابتدا فایل پشتیبان تهیه کنید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteYear();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              حذف سال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- تب مدیریت بخش‌ها ---------- */
function SectionsTab({ activeYear, onRefresh }: { activeYear: YearInfo | null; onRefresh: () => Promise<void> | void }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<SectionType>('INDIVIDUAL');
  const [editing, setEditing] = useState<SectionInfo | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<SectionType>('INDIVIDUAL');
  const [deleting, setDeleting] = useState<SectionInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const createSection = async () => {
    if (!activeYear) return;
    if (!name.trim()) {
      toast.error('نام بخش را وارد کنید');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/sections', {
        method: 'POST',
        body: JSON.stringify({ yearId: activeYear.id, name: name.trim(), type }),
      });
      toast.success(`بخش «${name.trim()}» اضافه شد`);
      setCreateOpen(false);
      setName('');
      setType('INDIVIDUAL');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در افزودن بخش');
    } finally {
      setBusy(false);
    }
  };

  const updateSection = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await apiFetch(`/api/sections/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim(), type: editType }),
      });
      toast.success('بخش به‌روزرسانی شد');
      setEditing(null);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در ویرایش بخش');
    } finally {
      setBusy(false);
    }
  };

  const deleteSection = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/sections/${deleting.id}`, { method: 'DELETE' });
      toast.success(`بخش «${deleting.name}» حذف شد`);
      setDeleting(null);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در حذف بخش');
    } finally {
      setBusy(false);
    }
  };

  if (!activeYear) return <p className="text-sm text-muted-foreground">سال فعالی وجود ندارد.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          بخش‌های سال <Badge variant="outline">{activeYear.name}</Badge> — هر بخش محتوای مستقل خود را دارد.
        </p>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <LayoutGrid className="w-4 h-4" />
          افزودن بخش جدید
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>نام بخش</TableHead>
              <TableHead className="text-center">نوع</TableHead>
              <TableHead className="text-center">داده‌های ثبت‌شده</TableHead>
              <TableHead className="text-center">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeYear.sections.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={s.type === 'INDIVIDUAL' ? 'default' : 'secondary'}>
                    {s.type === 'INDIVIDUAL' ? 'تکی (مثل ستاد)' : 'گروهی (مثل استان‌ها)'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {s.type === 'INDIVIDUAL' ? `${formatNumberFa(s.studentCount ?? 0)} دانش‌آموز` : `${formatNumberFa(s.groupCount ?? 0)} رکورد`}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`ویرایش بخش ${s.name}`}
                      onClick={() => {
                        setEditing(s);
                        setEditName(s.name);
                        setEditType(s.type);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`حذف بخش ${s.name}`}
                      onClick={() => setDeleting(s)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {activeYear.sections.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  بخشی وجود ندارد — با دکمه «افزودن بخش جدید» ایجاد کنید
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* گفتگوی افزودن بخش */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>افزودن بخش جدید</DialogTitle>
            <DialogDescription>نوع بخش را انتخاب کنید؛ ساختار محتوای آن بر همین اساس ساخته می‌شود.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="section-name">نام بخش</Label>
              <Input id="section-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: کمیسیون" />
            </div>
            <div className="grid gap-2">
              <Label>نوع بخش</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as SectionType)} className="gap-2">
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value="INDIVIDUAL" id="type-ind" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">تکی (مثل ستاد)</div>
                    <div className="text-xs text-muted-foreground">ثبت تکی دانش‌آموز با فرم کامل و قوانین معدل</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value="GROUP" id="type-group" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">گروهی (مثل استان‌ها)</div>
                    <div className="text-xs text-muted-foreground">ثبت آمار جمعی دختر/پسر به تفکیک مقطع</div>
                  </div>
                </label>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              انصراف
            </Button>
            <Button onClick={createSection} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              افزودن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* گفتگوی ویرایش بخش */}
      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ویرایش بخش «{editing?.name}»</DialogTitle>
            <DialogDescription>اگر داده ثبت شده باشد، تغییر نوع بخش ممکن نیست.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-section-name">نام بخش</Label>
              <Input id="edit-section-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>نوع بخش</Label>
              <div className="flex items-center gap-3">
                <Switch
                  checked={editType === 'GROUP'}
                  onCheckedChange={(v) => setEditType(v ? 'GROUP' : 'INDIVIDUAL')}
                  aria-label="نوع بخش"
                />
                <span className="text-sm">{editType === 'GROUP' ? 'گروهی (مثل استان‌ها)' : 'تکی (مثل ستاد)'}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              انصراف
            </Button>
            <Button onClick={updateSection} disabled={busy || !editName.trim()}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف بخش</AlertDialogTitle>
            <AlertDialogDescription>
              با حذف بخش «{deleting?.name}» تمام داده‌های ثبت‌شده در آن نیز حذف می‌شود و قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteSection();
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

/* ---------- تب پشتیبان‌گیری ---------- */
interface DataInfoResponse {
  storageKind: 'persistent' | 'legacy-dev' | 'browser';
  dataDir: string;
  dbPath: string;
  backupsDir: string;
  backups: { name: string; size: number; mtime: number }[];
  migratedFrom: string | null;
  backedUpThisRun: boolean;
  lastSavedAt?: number | null;
}

/** کارت «محل نگهداری داده‌ها» — اطمینان از اینکه داده‌ها امانت‌اند و آپدیت برنامه آنها را پاک نمی‌کند */
function DataLocationCard() {
  const [info, setInfo] = useState<DataInfoResponse | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<DataInfoResponse>('/api/data-info')
      .then((res) => {
        if (alive) setInfo(res);
      })
      .catch(() => {
        /* نمایش این کارت حیاتی نیست — بی‌صدا رد شود */
      });
    return () => {
      alive = false;
    };
  }, []);

  const copyPath = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.dbPath);
      toast.success('مسیر کپی شد');
    } catch {
      toast.error('کپی ناموفق بود');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
    }
    return `${formatNumberFa(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
  };

  const formatDate = (ms: number) => {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(ms));
    } catch {
      return '';
    }
  };

  const isBrowser = info?.storageKind === 'browser';

  return (
    <div className="rounded-md border p-4 space-y-3 bg-emerald-50/40 border-emerald-200">
      <h3 className="font-semibold text-sm flex items-center gap-1.5">
        <HardDrive className="w-4 h-4 text-emerald-700" />
        {isBrowser ? 'محل نگهداری داده‌ها در نسخه مرورگری' : 'محل نگهداری داده‌ها روی این سیستم'}
      </h3>
      {!info ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          در حال خواندن اطلاعات…
        </p>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">فایل داده:</span>
            <code
              dir="ltr"
              className="flex-1 text-[11px] leading-5 bg-white/80 border rounded px-2 py-1 break-all text-start font-mono"
            >
              {info.dbPath}
            </code>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={copyPath} aria-label="کپی مسیر">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          <ul className="text-xs text-muted-foreground leading-6 list-disc ps-5 space-y-0.5">
            {isBrowser ? (
              <>
                <li>
                  داده‌ها در <b className="text-foreground">حافظه مرورگر همین دستگاه</b> (IndexedDB) ذخیره می‌شود؛
                  نصب یا به‌روزرسانی نسخه جدید برنامه و حتی قطع اینترنت هرگز داده‌های شما را پاک نمی‌کند.
                </li>
                <li>
                  این نسخه <b className="text-foreground">سرور مرکزی ندارد</b> — داده‌های هر دستگاه جدا نگه داشته می‌شود؛
                  برای انتقال داده به دستگاه دیگر از «دانلود فایل پشتیبان» و «بازیابی» استفاده کنید.
                </li>
                <li>برای اطمینان بیشتر، به‌صورت دوره‌ای از دکمه «دانلود فایل پشتیبان» خروجی بگیرید.</li>
              </>
            ) : (
              <>
                <li>
                  داده‌ها <b className="text-foreground">خارج از پوشه برنامه</b> ذخیره می‌شوند؛ نصب یا به‌روزرسانی نسخه جدید
                  برنامه هرگز داده‌های شما را پاک نمی‌کند.
                </li>
                <li>
                  در هر اجرای برنامه یک <b className="text-foreground">پشتیبان خودکار</b> در پوشه <span dir="ltr" className="font-mono">backups</span> کنار
                  فایل داده گرفته می‌شود و ۷ نسخه آخر نگهداری می‌شود.
                </li>
                <li>برای اطمینان بیشتر، به‌صورت دوره‌ای از دکمه «دانلود فایل پشتیبان» استفاده کنید.</li>
              </>
            )}
          </ul>
          {info.backups.length > 0 && (
            <div className="pt-1 space-y-1.5">
              <div className="text-xs font-medium flex items-center gap-1.5 text-emerald-800">
                <DatabaseBackup className="w-3.5 h-3.5" />
                پشتیبان‌های خودکار ({toPersianDigits(info.backups.length)} نسخه اخیر)
              </div>
              <div className="rounded border bg-white/70 divide-y max-h-32 overflow-y-auto custom-scroll">
                {info.backups.map((b) => (
                  <div key={b.name} className="flex items-center justify-between px-2.5 py-1.5 text-[11px] gap-2">
                    <span dir="ltr" className="font-mono text-muted-foreground truncate">{b.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatSize(b.size)} · {formatDate(b.mtime)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {info.migratedFrom && (
            <p className="text-[11px] text-emerald-800 bg-emerald-100/60 border border-emerald-200 rounded px-2 py-1.5 leading-5">
              ✓ داده‌های نسخه قبلی برنامه از پوشه قدیمی به این محل منتقل شد و سالم است.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BackupTab({ onRefresh }: { onRefresh: () => Promise<void> | void }) {
  const [restoring, setRestoring] = useState(false);
  const [pendingData, setPendingData] = useState<{ years: number; students: number; data: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadBackup = () => {
    downloadFile('/api/backup');
    toast.success('فایل پشتیبان در حال دانلود است');
  };

  const onFileSelected = async (file: File) => {
    setRestoring(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { years?: unknown[]; app?: string };
      if (!Array.isArray(data.years) || data.years.length === 0) {
        toast.error('فایل انتخاب شده یک پشتیبان معتبر نیست');
        return;
      }
      let students = 0;
      for (const y of data.years as Array<{ students?: unknown[] }>) {
        students += Array.isArray(y.students) ? y.students.length : 0;
      }
      setPendingData({ years: data.years.length, students, data });
    } catch {
      toast.error('خواندن فایل ناموفق بود — فایل JSON معتبر انتخاب کنید');
    } finally {
      setRestoring(false);
    }
  };

  const confirmRestore = async () => {
    if (!pendingData) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ restoredStudents: number; restoredGroups: number }>('/api/backup', {
        method: 'POST',
        body: JSON.stringify({ data: pendingData.data }),
      });
      toast.success(
        `بازیابی انجام شد: ${toPersianDigits(res.restoredStudents)} دانش‌آموز و ${toPersianDigits(res.restoredGroups)} رکورد گروهی بازیابی شد`
      );
      setPendingData(null);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در بازیابی');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <DataLocationCard />

      <div className="rounded-md border p-4 space-y-3">
        <h3 className="font-semibold text-sm">تهیه فایل پشتیبان</h3>
        <p className="text-xs text-muted-foreground leading-6">
          کل داده‌های برنامه (همه سال‌ها، بخش‌ها، دانش‌آموزان، رکوردهای استان‌ها و مبالغ جوایز) در یک فایل JSON ذخیره می‌شود.
          توصیه می‌شود به‌صورت دوره‌ای (مثلاً پایان هر ماه) نسخه پشتیبان تهیه و در محل امن نگهداری کنید.
        </p>
        <Button size="sm" className="gap-1" onClick={downloadBackup}>
          <Download className="w-4 h-4" />
          دانلود فایل پشتیبان (JSON)
        </Button>
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <h3 className="font-semibold text-sm">بازیابی از فایل پشتیبان</h3>
        <p className="text-xs text-muted-foreground leading-6">
          هنگام بازیابی، تمام داده‌های فعلی برنامه با محتوای فایل پشتیبان جایگزین می‌شود. این عمل را با احتیاط انجام دهید.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelected(f);
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="outline" className="gap-1" onClick={() => fileRef.current?.click()} disabled={restoring}>
          {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          انتخاب فایل پشتیبان
        </Button>
      </div>

      <AlertDialog open={Boolean(pendingData)} onOpenChange={(v) => !v && setPendingData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تایید بازیابی اطلاعات</AlertDialogTitle>
            <AlertDialogDescription>
              فایل شامل {toPersianDigits(pendingData?.years ?? 0)} سال و {toPersianDigits(pendingData?.students ?? 0)} دانش‌آموز است.
              همه داده‌های فعلی حذف و با این فایل جایگزین می‌شود. آیا مطمئن هستید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRestore();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              بازیابی و جایگزینی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- تب تغییر رمز ---------- */
function PasswordTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!current || !next) {
      toast.error('همه فیلدها را پر کنید');
      return;
    }
    if (next !== confirm) {
      toast.error('رمز جدید و تکرار آن یکسان نیست');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/settings/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast.success('رمز مدیریت تغییر کرد');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در تغییر رمز');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="pw-current">رمز فعلی</Label>
        <Input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pw-new">رمز جدید (حداقل 4 کاراکتر)</Label>
        <Input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pw-confirm">تکرار رمز جدید</Label>
        <Input id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <Button onClick={submit} disabled={busy} className="gap-1">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        تغییر رمز
      </Button>
    </div>
  );
}
