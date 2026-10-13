// ذخیره‌سازی داده‌های نسخه مرورگری (استاتیک) — IndexedDB با پشتیبان localStorage
// کل وضعیت برنامه به‌صورت یک سند JSON نگه داشته می‌شود؛ هر تغییر با تأخیر کوتاه ذخیره می‌شود.
export interface LocalStudent {
  id: string;
  yearId: string;
  sectionId: string;
  fullName: string;
  nameNorm: string;
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

export interface LocalGroupRecord {
  id: string;
  yearId: string;
  sectionId: string | null;
  title: string;
  titleNorm: string;
  counts: string;
  createdAt: string;
}

export interface LocalSection {
  id: string;
  yearId: string;
  name: string;
  type: 'INDIVIDUAL' | 'GROUP';
  createdAt: string;
}

export interface LocalYear {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  prizes: Array<{ group: string; amount: number }>;
}

export interface LocalState {
  settings: { passwordHash: string };
  years: LocalYear[];
  sections: LocalSection[];
  students: LocalStudent[];
  groupRecords: LocalGroupRecord[];
}

const IDB_NAME = 'momtaz-app';
const IDB_STORE = 'kv';
const IDB_KEY = 'state';
const LS_KEY = 'momtaz-app-state';

let state: LocalState | null = null;
let loadPromise: Promise<LocalState> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** sha256 هگز — معادل نسخه سرور (node:crypto) با WebCrypto مرورگر */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hashPassword(password: string): Promise<string> {
  return sha256Hex(`student-app::${password}`);
}

export function sessionTokenFor(passwordHash: string): Promise<string> {
  return sha256Hex(`session::${passwordHash}`);
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seedState(passwordHash: string): LocalState {
  // مطابق ensureSeed نسخه سرور: سال 1404-1405 فعال + بخش ستاد + مبالغ نمونه
  const now = new Date().toISOString();
  const yearId = newId();
  return {
    settings: { passwordHash },
    years: [
      {
        id: yearId,
        name: '1404-1405',
        isActive: true,
        createdAt: now,
        prizes: [
          { group: 'G1_3', amount: 1000000 },
          { group: 'G4_6', amount: 1000000 },
          { group: 'G7_9', amount: 1500000 },
          { group: 'G10_12', amount: 2000000 },
          { group: 'UNI', amount: 2500000 },
        ],
      },
    ],
    sections: [{ id: newId(), yearId, name: 'ستاد', type: 'INDIVIDUAL', createdAt: now }],
    students: [],
    groupRecords: [],
  };
}

function idbOpen(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(value: string): Promise<void> {
  return new Promise((resolve) => {
    idbOpen().then((db) => {
      if (!db) return resolve();
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

function idbGet(): Promise<string | null> {
  return new Promise((resolve) => {
    idbOpen().then((db) => {
      if (!db) return resolve(null);
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

/** ذخیره فوری — بعد از هر جهش مهم (خروج از صفحه، بازیابی پشتیبان و…) */
export async function flushSave(): Promise<void> {
  if (!state) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const json = JSON.stringify(state);
  await idbPut(json);
  try {
    localStorage.setItem(LS_KEY, json); // نسخه پشتیبان ثانویه
    localStorage.setItem('momtaz-app-saved-at', String(Date.now()));
  } catch {
    /* سهمیه localStorage پر باشد — IndexedDB کافی است */
  }
}

/** ذخیره با تأخیر کوتاه برای تجمیع تغییرات پشت‌سرهم */
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave();
  }, 250);
}

async function loadState(): Promise<LocalState> {
  const raw = (await idbGet()) ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as LocalState;
      if (parsed && parsed.settings && Array.isArray(parsed.years)) {
        // مرتب‌سازی‌های پایه حفظ می‌شود؛ درج‌های بعدی به انتها اضافه می‌شود
        return parsed;
      }
    } catch {
      /* فایل خراب — seed می‌شود */
    }
  }
  const fresh = seedState(await hashPassword('1234'));
  state = fresh;
  await flushSave();
  return fresh;
}

/** وضعیت برنامه (بارگذاری یک‌باره از IndexedDB) */
export function getState(): Promise<LocalState> {
  if (state) return Promise.resolve(state);
  if (!loadPromise) {
    loadPromise = loadState().then((s) => {
      state = s;
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          void flushSave();
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') void flushSave();
        });
      }
      return s;
    });
  }
  return loadPromise;
}

/** دسترسی همگام بعد از getState (فقط داخل هندلرها) */
export function currentState(): LocalState {
  if (!state) throw new Error('local state not loaded');
  return state;
}

export function markDirty(): void {
  scheduleSave();
}

/** جایگزینی کامل وضعیت (بازیابی پشتیبان) */
export function replaceState(next: LocalState): void {
  state = next;
  void flushSave();
}
