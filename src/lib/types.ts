// انواع داده مشترک کلاینت
import type { GroupKey } from './gpa';

export type SectionType = 'INDIVIDUAL' | 'GROUP';

export interface SectionInfo {
  id: string;
  name: string;
  type: SectionType;
  studentCount?: number;
  groupCount?: number;
}

export interface YearInfo {
  id: string;
  name: string;
  isActive: boolean;
  sections: SectionInfo[];
}

export interface YearSummary {
  id: string;
  name: string;
  isActive: boolean;
  studentCount?: number;
  groupCount?: number;
}

export interface StudentRecord {
  id: string;
  yearId: string;
  sectionId: string;
  fullName: string;
  gender: 'FEMALE' | 'MALE';
  grade: number | null;
  gpaRaw: string;
  gpaValue: number | null;
  isException: boolean;
  parentName: string;
  parentRank: string;
  parentUnit: string;
  createdAt: string;
}

export interface GroupRecordData {
  id: string;
  yearId: string;
  sectionId: string | null;
  title: string;
  counts: string;
  createdAt: string;
}

export interface BootstrapData {
  years: YearInfo[];
  activeYearId: string | null;
  prizes: Record<GroupKey, number> | null;
}

export type PrizeRates = Record<GroupKey, number>;

export interface AppError {
  error: string;
}
