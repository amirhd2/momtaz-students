// کمک‌تابع‌های شمارش گروهی (JSON) برای رکوردهای استان/گروهی
import type { GroupKey } from './gpa';

export interface GenderCount {
  f: number;
  m: number;
}

export type GroupCounts = Record<GroupKey, GenderCount>;

export const GROUP_KEYS: GroupKey[] = ['G1_3', 'G4_6', 'G7_9', 'G10_12', 'UNI'];

export function emptyCounts(): GroupCounts {
  return {
    G1_3: { f: 0, m: 0 },
    G4_6: { f: 0, m: 0 },
    G7_9: { f: 0, m: 0 },
    G10_12: { f: 0, m: 0 },
    UNI: { f: 0, m: 0 },
  };
}

export function parseCounts(json: string | null | undefined): GroupCounts {
  const base = emptyCounts();
  if (!json) return base;
  try {
    const parsed = JSON.parse(json) as Partial<GroupCounts>;
    for (const key of GROUP_KEYS) {
      const item = parsed[key];
      if (item && typeof item === 'object') {
        base[key] = { f: Math.max(0, Number(item.f) || 0), m: Math.max(0, Number(item.m) || 0) };
      }
    }
  } catch {
    // خروجی پیش‌فرض
  }
  return base;
}

export function serializeCounts(counts: Partial<GroupCounts> | undefined | null): string {
  const clean = emptyCounts();
  const src = counts ?? {};
  for (const key of GROUP_KEYS) {
    clean[key] = {
      f: Math.max(0, Math.round(Number(src[key]?.f) || 0)),
      m: Math.max(0, Math.round(Number(src[key]?.m) || 0)),
    };
  }
  return JSON.stringify(clean);
}

export function countsTotal(counts: GroupCounts): number {
  return GROUP_KEYS.reduce((sum, key) => sum + counts[key].f + counts[key].m, 0);
}

/** جمع چند رکورد شمارشی */
export function sumCounts(list: GroupCounts[]): GroupCounts {
  const out = emptyCounts();
  for (const item of list) {
    for (const key of GROUP_KEYS) {
      out[key].f += item[key].f;
      out[key].m += item[key].m;
    }
  }
  return out;
}

/** مبلغ کل بر اساس نرخ‌های سال */
export function countsAmount(counts: GroupCounts, rates: Record<GroupKey, number>): number {
  return GROUP_KEYS.reduce((sum, key) => sum + (counts[key].f + counts[key].m) * (rates[key] ?? 0), 0);
}
