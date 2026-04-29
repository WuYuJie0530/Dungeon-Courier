import { describe, expect, it } from "vitest";
import {
  defaultProgress,
  loadProgress,
  parseProgress,
  PROGRESS_STORAGE_KEY,
  updateProgressWithResult,
  type LevelRecord,
} from "../src/progress";
import type { GameStateSnapshot } from "../src/types";

describe("local progress persistence", () => {
  it("uses a safe default when storage is empty or invalid", () => {
    expect(defaultProgress()).toEqual({ unlockedLevel: 1, records: {} });
    expect(parseProgress(null)).toEqual({ unlockedLevel: 1, records: {} });
    expect(loadProgress(memoryStorage({ [PROGRESS_STORAGE_KEY]: "{bad json" }))).toEqual({ unlockedLevel: 1, records: {} });
  });

  it("sanitizes out-of-range progress and malformed records", () => {
    expect(
      parseProgress(
        JSON.stringify({
          unlockedLevel: 99,
          records: {
            1: { grade: "S", timeRemaining: 60, lives: 3, collectedLetters: 3, completedAt: 100 },
            8: { grade: "S", timeRemaining: 80, lives: 3, collectedLetters: 3, completedAt: 100 },
            2: { grade: "SS", timeRemaining: 80, lives: 3, collectedLetters: 3, completedAt: 100 },
          },
        }),
      ),
    ).toEqual({
      unlockedLevel: 5,
      records: {
        1: { grade: "S", timeRemaining: 60, lives: 3, collectedLetters: 3, completedAt: 100 },
      },
    });
  });

  it("keeps the best record by grade, then time, then lives", () => {
    const initial = {
      unlockedLevel: 1,
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
      { unlockedLevel: 1, records: { 1: record("A", 40, 2) } },
      state({ level: 1, lives: 3, timeRemaining: 40 }),
      500,
    );
    expect(betterLives.records[1]).toMatchObject({ grade: "A", timeRemaining: 40, lives: 3 });
  });

  it("unlocks the next level and records final campaign completion", () => {
    const afterLevel = updateProgressWithResult(defaultProgress(), state({ level: 1, status: "won" }), 1000);
    expect(afterLevel.unlockedLevel).toBe(2);
    expect(afterLevel.records[1]).toMatchObject({ grade: "S", completedAt: 1000 });

    const afterCampaign = updateProgressWithResult(afterLevel, state({ level: 5, status: "completed" }), 2000);
    expect(afterCampaign.unlockedLevel).toBe(5);
    expect(afterCampaign.records[5]).toMatchObject({ grade: "S+", completedAt: 2000 });
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
    collectedLetters: 3,
    totalLetters: 3,
    collectedCharms: 0,
    totalCharms: 1,
    dashCooldownFrames: 0,
    dashReady: true,
    shieldFrames: 0,
    shieldActive: false,
    player: { x: 0, y: 0, lives: 3, dashCooldownFrames: 0, invulnerableFrames: 0, shieldFrames: 0, lastDirection: "right" },
    enemies: [],
    letters: [],
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
