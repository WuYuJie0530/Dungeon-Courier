import { MAX_LEVEL, type GameStateSnapshot } from "./types";

export const PROGRESS_STORAGE_KEY = "dungeon-courier-progress";

export type ResultGrade = "S+" | "S" | "A" | "B" | "F";

export interface LevelRecord {
  grade: ResultGrade;
  timeRemaining: number;
  lives: number;
  collectedLetters: number;
  completedAt: number;
}

export interface ProgressData {
  unlockedLevel: number;
  records: Partial<Record<number, LevelRecord>>;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const DEFAULT_PROGRESS: ProgressData = {
  unlockedLevel: 1,
  records: {},
};

const GRADE_RANK: Record<ResultGrade, number> = {
  F: 0,
  B: 1,
  A: 2,
  S: 3,
  "S+": 4,
};

export function defaultProgress(): ProgressData {
  return cloneProgress(DEFAULT_PROGRESS);
}

export function loadProgress(storage: StorageLike | undefined = browserStorage()): ProgressData {
  if (!storage) {
    return defaultProgress();
  }

  try {
    return parseProgress(storage.getItem(PROGRESS_STORAGE_KEY));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: ProgressData, storage: StorageLike | undefined = browserStorage()): void {
  if (!storage) {
    return;
  }
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(sanitizeProgress(progress)));
}

export function updateProgressWithResult(progress: ProgressData, state: GameStateSnapshot, now = Date.now()): ProgressData {
  if (state.status !== "won" && state.status !== "completed") {
    return sanitizeProgress(progress);
  }

  const level = clampLevel(state.level);
  const nextUnlocked = state.status === "completed" ? MAX_LEVEL : Math.min(MAX_LEVEL, level + 1);
  const record = recordFromState(state, now);
  const currentRecord = progress.records[level];
  const records = { ...sanitizeProgress(progress).records };
  if (!currentRecord || isBetterRecord(record, currentRecord)) {
    records[level] = record;
  }

  return sanitizeProgress({
    unlockedLevel: Math.max(progress.unlockedLevel, nextUnlocked),
    records,
  });
}

export function gradeFromState(state: GameStateSnapshot): ResultGrade {
  if (state.status === "lost") {
    return "F";
  }
  if (state.status === "completed") {
    return "S+";
  }
  if (state.lives >= 3 && state.timeRemaining >= 45) {
    return "S";
  }
  if (state.lives >= 2) {
    return "A";
  }
  return "B";
}

export function isBetterRecord(candidate: LevelRecord, current: LevelRecord): boolean {
  const gradeDelta = GRADE_RANK[candidate.grade] - GRADE_RANK[current.grade];
  if (gradeDelta !== 0) {
    return gradeDelta > 0;
  }
  if (candidate.timeRemaining !== current.timeRemaining) {
    return candidate.timeRemaining > current.timeRemaining;
  }
  if (candidate.lives !== current.lives) {
    return candidate.lives > current.lives;
  }
  return candidate.collectedLetters > current.collectedLetters;
}

export function parseProgress(raw: string | null): ProgressData {
  if (!raw) {
    return defaultProgress();
  }
  const value = JSON.parse(raw) as unknown;
  return sanitizeProgress(value);
}

export function sanitizeProgress(value: unknown): ProgressData {
  if (!value || typeof value !== "object") {
    return defaultProgress();
  }

  const source = value as { unlockedLevel?: unknown; records?: unknown };
  const unlockedLevel = sanitizeUnlockedLevel(source.unlockedLevel);
  const records: Partial<Record<number, LevelRecord>> = {};
  if (source.records && typeof source.records === "object") {
    for (const [key, rawRecord] of Object.entries(source.records)) {
      const level = Number(key);
      const record = sanitizeRecord(rawRecord);
      if (Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL && record) {
        records[level] = record;
      }
    }
  }

  return {
    unlockedLevel,
    records,
  };
}

function recordFromState(state: GameStateSnapshot, now: number): LevelRecord {
  return {
    grade: gradeFromState(state),
    timeRemaining: state.timeRemaining,
    lives: state.lives,
    collectedLetters: state.collectedLetters,
    completedAt: now,
  };
}

function sanitizeRecord(value: unknown): LevelRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Partial<LevelRecord>;
  if (!isGrade(source.grade)) {
    return null;
  }
  return {
    grade: source.grade,
    timeRemaining: finiteNumber(source.timeRemaining, 0),
    lives: finiteNumber(source.lives, 0),
    collectedLetters: finiteNumber(source.collectedLetters, 0),
    completedAt: finiteNumber(source.completedAt, 0),
  };
}

function sanitizeUnlockedLevel(value: unknown): number {
  return clampLevel(Math.floor(finiteNumber(value, 1)));
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Number.isFinite(level) ? level : 1));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isGrade(value: unknown): value is ResultGrade {
  return value === "S+" || value === "S" || value === "A" || value === "B" || value === "F";
}

function cloneProgress(progress: ProgressData): ProgressData {
  return {
    unlockedLevel: progress.unlockedLevel,
    records: { ...progress.records },
  };
}

function browserStorage(): StorageLike | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}
