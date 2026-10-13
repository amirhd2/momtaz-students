'use client';

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Wallet } from 'lucide-react';
import { GRADE_GROUPS, type GroupKey } from '@/lib/gpa';
import { formatNumberFa } from '@/lib/persian';
import type { GroupCounts } from '@/lib/counts';

interface StatsBoxProps {
  counts: GroupCounts;
  /** مبلغ جایزه هر گروه برای نمایش ستون اختیاری */
  rates?: Record<GroupKey, number>;
  title?: string;
}

/** باکس آماری: نوار مبلغ کل/تعداد کل + جدول دختر/پسر به تفکیک 5 مقطع */
export function StatsBox({ counts, rates, title = 'آمار کلی' }: StatsBoxProps) {
  const rows = GRADE_GROUPS.map((g) => {
    const c = counts[g.key];
    return { key: g.key, label: g.label, f: c.f, m: c.m, total: c.f + c.m };
  });
  const totalF = rows.reduce((s, r) => s + r.f, 0);
  const totalM = rows.reduce((s, r) => s + r.m, 0);
  const grand = totalF + totalM;

  const grandAmount = rates
    ? GRADE_GROUPS.reduce((s, g) => s + (counts[g.key].f + counts[g.key].m) * (rates[g.key] ?? 0), 0)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* نوار خلاصه: مبلغ کل (راست) + تعداد کل دانش‌آموزان (انتهای سمت چپ) */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
          {grandAmount !== null && (
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <span className="text-xs sm:text-sm text-muted-foreground">مبلغ کل جوایز:</span>
              <span className="text-base sm:text-lg font-bold text-primary tabular-nums">
                {formatNumberFa(grandAmount)}
              </span>
              <span className="text-xs text-muted-foreground">تومان</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs sm:text-sm text-muted-foreground">تعداد کل دانش‌آموزان:</span>
            <span className="text-base sm:text-lg font-bold text-primary tabular-nums">
              {formatNumberFa(grand)}
            </span>
            <span className="text-xs text-muted-foreground">نفر</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5">
                <TableHead className="text-right w-[38%]">مقطع تحصیلی</TableHead>
                <TableHead className="text-center">تعداد دختر</TableHead>
                <TableHead className="text-center">تعداد پسر</TableHead>
                <TableHead className="text-center">جمع</TableHead>
                {rates && <TableHead className="text-center">مبلغ جایزه هر نفر</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-center tabular-nums">{formatNumberFa(r.f)}</TableCell>
                  <TableCell className="text-center tabular-nums">{formatNumberFa(r.m)}</TableCell>
                  <TableCell className="text-center font-semibold tabular-nums">{formatNumberFa(r.total)}</TableCell>
                  {rates && (
                    <TableCell className="text-center text-muted-foreground text-xs">
                      {formatNumberFa(rates[r.key] ?? 0)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-primary text-primary-foreground hover:bg-primary">
                <TableCell className="font-bold">تعداد کل دانش‌آموزان</TableCell>
                <TableCell className="text-center font-bold tabular-nums">{formatNumberFa(totalF)}</TableCell>
                <TableCell className="text-center font-bold tabular-nums">{formatNumberFa(totalM)}</TableCell>
                <TableCell className="text-center font-bold tabular-nums">{formatNumberFa(grand)}</TableCell>
                {rates && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
