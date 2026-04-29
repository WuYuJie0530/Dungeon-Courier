import { describe, expect, it } from "vitest";
import {
  defaultProgress,
  hasSavedProgress,
  loadProgress,
  parseProgress,
  PROGRESS_STORAGE_KEY,
  resetProgress,
  updateLastPlayedLevel,
  updateProgressWithResult,
  type LevelRecord,
} from "../src/progress";
import type { GameStateSnapshot } from "../src/types";

describe("local progress persistence", () => {
  it("uses a safe default when storage is empty or invalid", () => {
    expect(defaultProgress()).toEqual({ unlockedLevel: 1, lastPlayedLevel: 1, records: {} });
    expect(parseProgress(null)).toEqual({ unlockedLevel: 1, lastPlayedLevel: 1, records: {} });
    expect(loadProgress(memoryStorage({ [PROGRESS_STORAGE_KEY]: "{bad json" }))).toEqual({
      unlockedLevel: 1,
      lastPlayedLevel: 1,
      records: {},
    });
  });

  it("sanitizes out-of-range progress and malformed records", () => {
    expect(
      parseProgress(
        JSON.stringify({
          unlockedLevel: 99,
          lastPlayedLevel: 99,
          records: {
            1: { grade: "S", timeRemaining: 60, lives: 3, collectedLetters: 3, completedAt: 100 },
            8: { grade: "S", timeRemaining: 80, lives: 3, collectedLetters: 3, completedAt: 100 },
            2: { grade: "SS", timeRemaining: 80, lives: 3, collectedLetters: 3, completedAt: 100 },
          },
        }),
      ),
    ).toEqual({
      unlockedLevel: 5,
      lastPlayedLevel: 5,
      records: {
        1: { grade: "S", timeRemaining: 60, lives: 3, collectedLetters: 3, completedAt: 100 },
      },
    });
  });

  it("keeps the best record by grade, then time, then lives", () => {
    const initial = {
      unlockedLevel: 1,
      lastPlayedLevel: 1,
      records: {
        1: record("A", 80, 3),
      },
    };

    const worse = updateProgressWithResult(initial, state({ level: 1, lives: 1, timeRemaining: 89 }), 200);
    expect(worse.records[1]).toEqual(record("A", 80, 3));

    const betterGrade = updateProgressWithResult(initial, state({ level: 1, lives: 3, timeRemaining: 45 }), 300);
    expect(betterGrade.records[1]).toMatchObject({ grade: "S", timeRemaining: 45, lives: 3 });

    const betterTime = updateProgressWithResult(initial, state({ level: 1, lives: 2, timeRemaining: 81 }), 400);
    expect(betterTime.records[1]).toMatchObject({ grade: "A", timeRemaining: 81, lives: 2 });

    const betterLives = updateProgressWithResult(
      { unlockedLevel: 1, lastPlayedLevel: 1, records: { 1: record("A", 40, 2) } },
      state({ level: 1, lives: 3, timeRemaining: 40 }),
      500,
    );
    expect(betterLives.records[1]).toMatchObject({ grade: "A", timeRemaining: 40, lives: 3 });
  });

  it("unlocks the next level and records final campaign completion", () => {
    const afterLevel = updateProgressWithResult(defaultProgress(), state({ level: 1, status: "won" }), 1000);
    expect(afterLevel.unlockedLevel).toBe(2);
    expect(afterLevel.lastPlayedLevel).toBe(2);
    expect(afterLevel.records[1]).toMatchObject({ grade: "S", completedAt: 1000 });

    const afterCampaign = updateProgressWithResult(afterLevel, state({ level: 5, status: "completed" }), 2000);
    expect(afterCampaign.unlockedLevel).toBe(5);
    expect(afterCampaign.lastPlayedLevel).toBe(5);
    expect(afterCampaign.records[5]).toMatchObject({ grade: "S+", completedAt: 2000 });
  });

  it("uses unlocked progress as the fallback for old saves without last played level", () => {
    expect(parseProgress(JSON.stringify({ unlockedLevel: 3, records: {} }))).toEqual({
      unlockedLevel: 3,
      lastPlayedLevel: 3,
      records: {},
    });
  });

  it("keeps last played level inside the unlocked range", () => {
    expect(parseProgress(JSON.stringify({ unlockedLevel: 3, lastPlayedLevel: 8, records: {} })).lastPlayedLevel).toBe(3);
    expect(parseProgress(JSON.stringify({ unlockedLevel: 3, lastPlayedLevel: 0, records: {} })).lastPlayedLevel).toBe(1);

    const progress = {
      unlockedLevel: 4,
      lastPlayedLevel: 2,
      records: {
        1: record("S", 80, 3),
      },
    };
    const updated = updateLastPlayedLevel(progress, 3);
    expect(updated.lastPlayedLevel).toBe(3);
    expect(updated.unlockedLevel).toBe(4);
    expect(updated.records[1]).toEqual(progress.records[1]);
  });

  it("detects whether a save has real progress", () => {
    expect(hasSavedProgress(defaultProgress())).toBe(false);
    expect(hasSavedProgress({ unlockedLevel: 2, lastPlayedLevel: 2, records: {} })).toBe(true);
    expect(hasSavedProgress({ unlockedLevel: 1, lastPlayedLevel: 1, records: { 1: record("A", 70, 2) } })).toBe(true);
  });

  it("resets saved progress without keeping unlocks or records", () => {
    const storage = memoryStorage({
      [PROGRESS_STORAGE_KEY]: JSON.stringify({
        unlockedLevel: 4,
        lastPlayedLevel: 3,
        records: { 1: record("S", 80, 3) },
      }),
    });

    expect(resetProgress(storage)).toEqual(defaultProgress());
    expect(loadProgress(storage)).toEqual(defaultProgress());
  });
});

function record(grade: LevelRecord["grade"], timeRemaining: number, lives: number): LevelRecord {
  return {
    grade,
    timeRemaining,
    lives,
    collectedLetters: 3,
    completedAt: 100,
  };
}

function state(overrides: Partial<GameStateSnapshot>): GameStateSnapshot {
  return {
    seed: "test",
    level: 1,
    maxLevel: 5,
    unlockedLevel: 1,
    nextLevelSeed: "next",
    campaignCompleted: false,
    difficultyName: "入门",
    difficultyRank: 1,
    frame: 0,
    timeRemaining: 60,
    lives: 3,
    status: "won",
    spikeTraps: [],
    collectedLetters: 3,
    totalLetters: 3,
    hourglasses: [],
    collectedCharms: 0,
    totalCharms: 1,
    dashCooldownFrames: 0,
    dashReady: true,
    shieldFrames: 0,
    shieldActive: false,
    player: { x: 0, y: 0, lives: 3, dashCooldownFrames: 0, invulnerableFrames: 0, shieldFrames: 0, lastDirection: "right" },
    enemies: [],
    letters: [],
    portals: [],
    charms: [],
    exit: { x: 0, y: 0, open: true },
    ...overrides,
  };
}

function memoryStorage(values: Record<string, string>) {
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}
