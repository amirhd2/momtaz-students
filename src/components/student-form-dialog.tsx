'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AutocompleteInput } from '@/components/autocomplete-input';
import { Check, Loader2, AlertTriangle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  validateGpa,
  parseGradeInput,
  GRADE_OPTIONS,
  groupOfGrade,
} from '@/lib/gpa';
import { gradeLabel, formatToman } from '@/lib/persian';
import { toast } from 'sonner';
import type { StudentRecord, PrizeRates } from '@/lib/types';

interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yearId: string;
  sectionId: string;
  sectionName: string;
  editing: StudentRecord | null;
  suggestions: { parentName: string[]; parentRank: string[]; parentUnit: string[]; gpaRaw: string[] };
  prizes: PrizeRates;
  onSaved: () => void;
}

const GPA_WORD_SUGGESTIONS = ['خیلی خوب', 'خوب', 'نسبتا خوب', 'متوسط', 'قابل قبول'];

export function StudentFormDialog({
  open,
  onOpenChange,
  yearId,
  sectionId,
  sectionName,
  editing,
  suggestions,
  prizes,
  onSaved,
}: StudentFormDialogProps) {
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'FEMALE' | 'MALE'>('FEMALE');
  const [gradeText, setGradeText] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [gpaRaw, setGpaRaw] = useState('');
  const [gpaAutoSet, setGpaAutoSet] = useState(false);
  const [gpaException, setGpaException] = useState(false);
  const [gpaShakeKey, setGpaShakeKey] = useState(0);
  const [parentName, setParentName] = useState('');
  const [parentRank, setParentRank] = useState('');
  const [parentUnit, setParentUnit] = useState('');
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // مقداردهی اولیه در حالت ویرایش
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setFullName(editing.fullName);
      setGender(editing.gender);
      setGrade(editing.grade);
      setGradeText(gradeLabel(editing.grade));
      setGpaRaw(editing.gpaRaw);
      setGpaException(editing.isException);
      setParentName(editing.parentName);
      setParentRank(editing.parentRank);
      setParentUnit(editing.parentUnit);
    } else {
      setFullName('');
      setGender('FEMALE');
      setGrade(null);
      setGradeText('');
      setGpaRaw('');
      setGpaException(false);
      setParentName('');
      setParentRank('');
      setParentUnit('');
    }
    setDuplicate(null);
    setNameError(null);
    setGradeError(null);
    setGpaAutoSet(false);
  }, [open, editing]);

  // اعتبارسنجی معدل
  const gpaValidation = useMemo(
    () => (gpaRaw.trim() ? validateGpa(grade, gpaRaw) : null),
    [grade, gpaRaw]
  );
  const gpaInvalid = gpaValidation !== null && !gpaValidation.valid && !gpaException;
  const gpaExceptionActive = gpaValidation !== null && !gpaValidation.valid && gpaException;

  // پیش‌فرض خودکار «خیلی خوب» برای مقاطع اول تا ششم
  const handleGradeChange = (newGrade: number | null, label: string) => {
    setGrade(newGrade);
    setGradeText(label);
    setGradeError(null);
    if (newGrade !== null && newGrade >= 1 && newGrade <= 6) {
      const current = validateGpa(newGrade, gpaRaw || 'خیلی خوب');
      if (!gpaRaw.trim() || gpaAutoSet) {
        setGpaRaw('خیلی خوب');
        setGpaAutoSet(true);
        setGpaException(false);
      } else if (!current.valid && !gpaException) {
        // معدل حروفی قبلی برای مقطع جدید قابل قبول نیست
      }
    }
  };

  // کنترل تکراری بودن نام (با تاخیر)
  useEffect(() => {
    if (!open) return;
    if (dupTimer.current) clearTimeout(dupTimer.current);
    const name = fullName.trim();
    if (!name) {
      setDuplicate(null);
      setNameError(null);
      return;
    }
    if (editing && name === editing.fullName) {
      setDuplicate(null);
      setNameError(null);
      return;
    }
    dupTimer.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await apiFetch<{ duplicate: boolean; existingName: string | null }>(
          `/api/students/check?yearId=${encodeURIComponent(yearId)}&sectionId=${encodeURIComponent(sectionId)}&name=${encodeURIComponent(name)}&excludeId=${editing?.id ?? ''}`
        );
        if (res.duplicate && res.existingName) {
          setDuplicate(res.existingName);
        } else {
          setDuplicate(null);
        }
      } catch {
        // خطای شبکه: کنترل سمت سرور در زمان ذخیره انجام می‌شود
      } finally {
        setChecking(false);
      }
    }, 450);
    return () => {
      if (dupTimer.current) clearTimeout(dupTimer.current);
    };
  }, [fullName, open, editing, yearId, sectionId]);

  const resetGpaExceptionOnEdit = (newRaw: string) => {
    setGpaRaw(newRaw);
    setGpaException(false);
    setGpaAutoSet(false);
  };

  const gradeParse = gradeText.trim() ? parseGradeInput(gradeText) : null;
  const gradeInvalid = gradeText.trim() !== '' && (gradeParse === null || !gradeParse.ok);

  const submit = async () => {
    let hasError = false;

    if (!fullName.trim()) {
      setNameError('نام و نام خانوادگی الزامی است');
      hasError = true;
    } else if (duplicate) {
      setNameError(`«${duplicate}» قبلاً در این بخش ثبت شده است`);
      hasError = true;
    }

    if (gradeText.trim() === '' || gradeInvalid) {
      setGradeError(gradeText.trim() === '' ? 'مقطع تحصیلی را انتخاب کنید' : 'مقطع باید از فهرست انتخاب شود');
      hasError = true;
    }

    if (!gpaRaw.trim()) {
      setGpaShakeKey((k) => k + 1);
      hasError = true;
    } else if (gpaInvalid) {
      setGpaShakeKey((k) => k + 1);
      hasError = true;
    }

    if (hasError) return;

    setSaving(true);
    try {
      const payload = {
        yearId,
        sectionId,
        fullName: fullName.trim(),
        gender,
        grade,
        gpaRaw,
        isException: gpaExceptionActive || (gpaValidation !== null && !gpaValidation.valid && gpaException),
        parentName: parentName.trim(),
        parentRank: parentRank.trim(),
        parentUnit: parentUnit.trim(),
      };
      if (editing) {
        await apiFetch(`/api/students/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast.success('اطلاعات دانش‌آموز به‌روزرسانی شد');
      } else {
        await apiFetch('/api/students', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('دانش‌آموز جدید ثبت شد');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message.includes('ثبت شده')) {
          setNameError(err.message);
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('خطا در ذخیره اطلاعات');
      }
    } finally {
      setSaving(false);
    }
  };

  const gpaSuggestions = useMemo(() => {
    return [...GPA_WORD_SUGGESTIONS, ...suggestions.gpaRaw.filter((s) => !GPA_WORD_SUGGESTIONS.includes(s))];
  }, [suggestions.gpaRaw]);

  const group = groupOfGrade(grade);
  const prizeAmount = prizes[group.key] ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle>{editing ? 'ویرایش اطلاعات دانش‌آموز' : `ثبت دانش‌آموز جدید — ${sectionName}`}</DialogTitle>
          <DialogDescription>
            فیلدهای والد شاغل، طبقه، واحد و معدل با اتوکامپلت مقادیر قبلی تکمیل می‌شوند.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* نام و جنسیت */}
          <div className="grid gap-2">
            <Label htmlFor="student-name">
              نام و نام خانوادگی دانش‌آموز <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  id="student-name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setNameError(null);
                  }}
                  placeholder="مثال: علی محمدی"
                  aria-invalid={Boolean(nameError) || undefined}
                  className={nameError || duplicate ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {nameError && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {nameError}
                  </p>
                )}
                {!nameError && duplicate && (
                  <p className="text-xs text-destructive mt-1">«{duplicate}» قبلاً در این بخش ثبت شده است</p>
                )}
                {!nameError && !duplicate && checking && fullName.trim() && (
                  <p className="text-xs text-muted-foreground mt-1">در حال بررسی تکراری نبودن...</p>
                )}
              </div>
              <RadioGroup
                value={gender}
                onValueChange={(v) => setGender(v as 'FEMALE' | 'MALE')}
                className="flex gap-2 pt-1"
              >
                <div className="flex items-center gap-1 border rounded-md px-2 h-9 has-[[data-state=checked]]:bg-primary has-[[data-state=checked]]:text-primary-foreground">
                  <RadioGroupItem value="FEMALE" id="gender-f" className="order-2" />
                  <Label htmlFor="gender-f" className="cursor-pointer text-sm font-normal">دختر</Label>
                </div>
                <div className="flex items-center gap-1 border rounded-md px-2 h-9 has-[[data-state=checked]]:bg-primary has-[[data-state=checked]]:text-primary-foreground">
                  <RadioGroupItem value="MALE" id="gender-m" className="order-2" />
                  <Label htmlFor="gender-m" className="cursor-pointer text-sm font-normal">پسر</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* مقطع تحصیلی */}
          <div className="grid gap-2">
            <Label htmlFor="student-grade">
              مقطع تحصیلی <span className="text-destructive">*</span>
            </Label>
            <AutocompleteInput
              id="student-grade"
              value={gradeText}
              onChange={(v) => {
                setGradeText(v);
                const parsed = v.trim() ? parseGradeInput(v) : null;
                if (v.trim() === '') {
                  setGrade(null);
                  setGradeError(null);
                } else if (parsed && parsed.ok) {
                  setGrade(parsed.grade);
                  setGradeError(null);
                } else {
                  setGradeError('مقطع باید از فهرست انتخاب شود');
                }
              }}
              onSelectSuggestion={(item) => {
                const opt = GRADE_OPTIONS.find((o) => o.label === item);
                if (opt) handleGradeChange(opt.grade, opt.label);
              }}
              suggestions={GRADE_OPTIONS.map((o) => o.label)}
              maxItems={GRADE_OPTIONS.length}
              listClassName="max-h-72"
              filterFn={(item, q) => {
                const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
                if (norm(item).includes(norm(q))) return true;
                const parsed = parseGradeInput(q);
                if (parsed && parsed.ok) {
                  const target = GRADE_OPTIONS.find((o) => o.grade === parsed.grade);
                  return target?.label === item;
                }
                return false;
              }}
              placeholder="انتخاب یا تایپ مقطع (مثال: هفتم یا 7)"
              invalid={gradeInvalid || Boolean(gradeError)}
            />
            {gradeError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {gradeError}
              </p>
            )}
          </div>

          {/* معدل */}
          <div className="grid gap-2">
            <Label htmlFor="student-gpa">
              معدل <span className="text-destructive">*</span>
              <span className="text-xs text-muted-foreground font-normal mr-2">
                (قانون مقطع {group.label}:{' '}
                {group.minGpa === null ? `فقط «${group.requiredWord}»` : `حداقل ${group.minGpa}`})
              </span>
            </Label>
            <div key={gpaShakeKey} className={gpaShakeKey > 0 && gpaInvalid ? 'animate-shake' : ''}>
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <AutocompleteInput
                    id="student-gpa"
                    value={gpaRaw}
                    onChange={(v) => resetGpaExceptionOnEdit(v)}
                    suggestions={gpaSuggestions}
                    showAll
                    placeholder="عدد (مثال: 19.75 یا ۱۹/۷۵) یا عبارت (خیلی خوب)"
                    invalid={gpaInvalid || gpaExceptionActive}
                  />
                </div>
                {gpaValidation && !gpaValidation.valid && !gpaException && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1 border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700 shrink-0"
                    onClick={() => setGpaException(true)}
                    title="پذیرش به عنوان استثنا"
                  >
                    <Check className="w-4 h-4" />
                    استثنا
                  </Button>
                )}
              </div>
            </div>
            {gpaInvalid && gpaValidation?.message && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {gpaValidation.message}
              </p>
            )}
            {gpaExceptionActive && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> به عنوان استثنا پذیرفته می‌شود و در لیست با رنگ متفاوت نمایش داده می‌شود.
              </p>
            )}
            {gpaValidation?.valid && prizeAmount > 0 && (
              <p className="text-xs text-muted-foreground">مبلغ جایزه این مقطع: {formatToman(prizeAmount)}</p>
            )}
          </div>

          {/* والد شاغل */}
          <div className="grid gap-2">
            <Label htmlFor="student-parent">نام والد شاغل در سازمان</Label>
            <AutocompleteInput
              id="student-parent"
              value={parentName}
              onChange={setParentName}
              suggestions={suggestions.parentName}
              placeholder="مثال: علی محمدی"
            />
          </div>

          {/* طبقه و واحد */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="student-rank">طبقه</Label>
              <AutocompleteInput
                id="student-rank"
                value={parentRank}
                onChange={setParentRank}
                suggestions={suggestions.parentRank}
                placeholder="طبقه سازمانی"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="student-unit">واحد</Label>
              <AutocompleteInput
                id="student-unit"
                value={parentUnit}
                onChange={setParentUnit}
                suggestions={suggestions.parentUnit}
                placeholder="واحد سازمانی"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={saving || checking || Boolean(duplicate)}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'ذخیره تغییرات' : 'ثبت دانش‌آموز'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
