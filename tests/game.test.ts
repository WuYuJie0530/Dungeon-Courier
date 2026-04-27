import { describe, expect, it } from "vitest";
import { DIRECTIONS, findPath, isFloor, manhattan, nextPoint } from "../src/collision";
import { CHARM_SHIELD_FRAMES, DASH_COOLDOWN_FRAMES, FPS, MAX_LEVEL, TIME_LIMIT_SECONDS } from "../src/types";
import { GameEngine } from "../src/game";
import { generateTutorialDungeon } from "../src/map";
import { findOpenDirection, mapSignature, routeTo } from "./helpers";

describe("Dungeon Courier engine", () => {
  it("uses a fixed tutorial layout for the first campaign level", () => {
    const engine = new GameEngine();
    const map = engine.getMap();
    const state = engine.getState();

    expect(mapSignature(map)).toBe(mapSignature(generateTutorialDungeon()));
    expect(map.letterSpawns).toEqual([
      { x: 8, y: 5 },
      { x: 16, y: 14 },
      { x: 30, y: 14 },
    ]);
    expect(map.charmSpawns).toEqual([{ x: 22, y: 14 }]);
    expect(state.enemies).toHaveLength(2);
    expect(state.enemies.some((enemy) => enemy.kind === "chaser")).toBe(true);
    expect(state.enemies.some((enemy) => enemy.kind === "patroller")).toBe(true);

    const firstLetterPath = findPath(map, state.player, map.letterSpawns[0]);
    expect(firstLetterPath).not.toBeNull();
    expect(firstLetterPath!.length).toBeLessThanOrEqual(4);
    expect(state.enemies.every((enemy) => manhattan(enemy, state.player) > 8)).toBe(true);

    engine.nextLevel();
    expect(mapSignature(engine.getMap())).not.toBe(mapSignature(generateTutorialDungeon()));
  });

  it("keeps the player out of walls and map boundaries", () => {
    const engine = new GameEngine("walls");
    for (let i = 0; i < 80; i += 1) {
      engine.movePlayer("left");
      engine.movePlayer("up");
    }
    const state = engine.getState();
    const map = engine.getMap();
    expect(state.player.x).toBeGreaterThanOrEqual(0);
    expect(state.player.y).toBeGreaterThanOrEqual(0);
    expect(isFloor(map, state.player.x, state.player.y)).toBe(true);
  });

  it("collects letters and opens the exit only after all letters are collected", () => {
    const engine = new GameEngine("letters");
    const map = engine.getMap();
    routeTo(engine, map.letterSpawns[0]);
    let state = engine.getState();
    expect(state.collectedLetters).toBe(1);
    expect(state.exit.open).toBe(false);

    for (const letter of map.letterSpawns.slice(1)) {
      routeTo(engine, letter);
    }
    state = engine.getState();
    expect(state.collectedLetters).toBe(state.totalLetters);
    expect(state.exit.open).toBe(true);
  });

  it("does not win at the exit before all letters are collected", () => {
    const engine = new GameEngine("early-exit");
    routeTo(engine, engine.getMap().exit);
    expect(engine.getState().status).toBe("playing");
  });

  it("wins after collecting every letter and reaching the exit", () => {
    const engine = new GameEngine("victory-route");
    const map = engine.getMap();
    for (const letter of map.letterSpawns) {
      routeTo(engine, letter);
    }
    routeTo(engine, map.exit);
    expect(engine.getState().status).toBe("won");
  });

  it("fails when time runs out", () => {
    const engine = new GameEngine("timer");
    engine.step(TIME_LIMIT_SECONDS * FPS);
    const state = engine.getState();
    expect(state.status).toBe("lost");
    expect(state.timeRemaining).toBe(0);
  });

  it("fails when lives reach zero through enemy collisions", () => {
    const engine = new GameEngine("life-loss");
    const chaser = engine.getState().enemies.find((enemy) => enemy.kind === "chaser");
    expect(chaser).toBeDefined();
    routeTo(engine, chaser!);
    engine.step(61);
    engine.step(61);
    expect(engine.getState().status).toBe("lost");
    expect(engine.getState().lives).toBe(0);
  });

  it("does not change entities while paused", () => {
    const engine = new GameEngine("pause");
    engine.pause();
    const before = engine.getEntities();
    engine.step(300);
    expect(engine.getEntities()).toEqual(before);
    expect(engine.getState().status).toBe("paused");
  });

  it("does not change game state after game over", () => {
    const engine = new GameEngine("immutable-end");
    engine.step(TIME_LIMIT_SECONDS * FPS);
    const before = engine.getState();
    engine.step(300);
    engine.movePlayer("right");
    engine.dash("down");
    expect(engine.getState()).toEqual(before);
  });

  it("applies dash cooldown and blocks repeated dash abuse", () => {
    const engine = new GameEngine("dash");
    const start = engine.getState().player;
    const direction = findOpenDirection(engine.getMap(), start);
    engine.dash(direction);
    const afterFirst = engine.getState();
    expect(afterFirst.dashCooldownFrames).toBe(DASH_COOLDOWN_FRAMES);
    engine.dash(direction);
    const afterSecond = engine.getState();
    expect(afterSecond.player).toEqual(afterFirst.player);
    engine.step(DASH_COOLDOWN_FRAMES);
    expect(engine.getState().dashReady).toBe(true);
  });

  it("collects a courier charm that blocks enemy damage while active", () => {
    const engine = new GameEngine("charm-shield");
    const map = engine.getMap();
    expect(map.charmSpawns).toHaveLength(1);

    routeTo(engine, map.charmSpawns[0]);
    const protectedState = engine.getState();
    expect(protectedState.collectedCharms).toBe(1);
    expect(protectedState.shieldActive).toBe(true);
    expect(protectedState.shieldFrames).toBe(CHARM_SHIELD_FRAMES);

    const enemy = protectedState.enemies[0];
    routeTo(engine, enemy);
    const afterHit = engine.getState();
    expect(afterHit.lives).toBe(protectedState.lives);
    expect(afterHit.status).toBe("playing");
  });

  it("has chasers pursue within detection range without crossing walls", () => {
    const engine = new GameEngine("chaser-ai");
    const chaser = engine.getState().enemies.find((enemy) => enemy.kind === "chaser");
    expect(chaser).toBeDefined();
    const path = findPath(engine.getMap(), engine.getState().player, chaser!);
    expect(path).not.toBeNull();
    if (path && path.length > 5) {
      routeTo(engine, path[path.length - 5]);
    }

    const before = engine.getState().enemies.find((enemy) => enemy.id === chaser!.id)!;
    const beforeDistance = Math.abs(before.x - engine.getState().player.x) + Math.abs(before.y - engine.getState().player.y);
    engine.step(before.moveEveryFrames);
    const after = engine.getState().enemies.find((enemy) => enemy.id === chaser!.id)!;
    const afterDistance = Math.abs(after.x - engine.getState().player.x) + Math.abs(after.y - engine.getState().player.y);
    expect(afterDistance).toBeLessThanOrEqual(beforeDistance);
    expect(isFloor(engine.getMap(), after.x, after.y)).toBe(true);
  });

  it("has patrollers patrol and turn when blocked", () => {
    const engine = new GameEngine("patrol-ai");
    const patroller = engine.getState().enemies.find((enemy) => enemy.kind === "patroller");
    expect(patroller).toBeDefined();
    let directionChanged = false;
    let lastDirection = patroller!.direction;

    for (let i = 0; i < 500; i += 1) {
      engine.step(1);
      const current = engine.getState().enemies.find((enemy) => enemy.id === patroller!.id)!;
      expect(isFloor(engine.getMap(), current.x, current.y)).toBe(true);
      if (current.direction !== lastDirection) {
        directionChanged = true;
        break;
      }
      lastDirection = current.direction;
    }

    expect(directionChanged).toBe(true);
  });

  it("restarts with a clean state", () => {
    const engine = new GameEngine("restart-a");
    const openDirection = DIRECTIONS.find((direction) => {
      const point = nextPoint(engine.getState().player, direction);
      return isFloor(engine.getMap(), point.x, point.y);
    });
    expect(openDirection).toBeDefined();
    engine.movePlayer(openDirection!);
    engine.step(120);
    engine.restart("restart-b");
    const state = engine.getState();
    expect(state.seed).toBe("restart-b");
    expect(state.frame).toBe(0);
    expect(state.status).toBe("playing");
    expect(state.collectedLetters).toBe(0);
    expect(state.lives).toBe(3);
    expect(state.player).toMatchObject(engine.getMap().spawn);
  });

  it("advances to a clean next level with a new generated seed", () => {
    const engine = new GameEngine();
    const first = engine.getState();
    const next = engine.nextLevel();
    expect(next.level).toBe(first.level + 1);
    expect(next.seed).not.toBe(first.seed);
    expect(next.status).toBe("playing");
    expect(next.frame).toBe(0);
    expect(next.collectedLetters).toBe(0);
    expect(next.player).toMatchObject(engine.getMap().spawn);
  });

  it("scales difficulty from early tutorial pressure to later danger", () => {
    const engine = new GameEngine();
    const levelOne = engine.getState();
    engine.nextLevel();
    const levelTwo = engine.getState();
    engine.nextLevel();
    const levelThree = engine.getState();

    expect(levelOne.difficultyName).toBe("入门");
    expect(levelOne.enemies.length).toBe(2);
    expect(levelOne.enemies.some((enemy) => enemy.kind === "chaser")).toBe(true);
    expect(levelOne.enemies.some((enemy) => enemy.kind === "patroller")).toBe(true);

    expect(levelTwo.enemies.length).toBeGreaterThan(levelOne.enemies.length);
    expect(levelThree.enemies.length).toBeGreaterThanOrEqual(levelTwo.enemies.length);
    expect(levelThree.difficultyRank).toBeGreaterThan(levelOne.difficultyRank);

    const levelOneChaser = levelOne.enemies.find((enemy) => enemy.kind === "chaser")!;
    const levelThreeChaser = levelThree.enemies.find((enemy) => enemy.kind === "chaser")!;
    expect(levelThreeChaser.alertRange).toBeGreaterThan(levelOneChaser.alertRange);
    expect(levelThreeChaser.moveEveryFrames).toBeLessThan(levelOneChaser.moveEveryFrames);
  });

  it("ends the campaign after five completed levels", () => {
    const engine = new GameEngine();
    while (engine.getState().level < MAX_LEVEL) {
      engine.nextLevel();
    }

    const map = engine.getMap();
    for (const letter of map.letterSpawns) {
      routeTo(engine, letter);
    }
    routeTo(engine, map.exit);

    const completed = engine.getState();
    expect(completed.level).toBe(MAX_LEVEL);
    expect(completed.status).toBe("completed");
    expect(completed.campaignCompleted).toBe(true);

    const afterNext = engine.nextLevel();
    expect(afterNext.level).toBe(MAX_LEVEL);
    expect(afterNext.status).toBe("completed");
  });

  it("only allows selecting unlocked levels", () => {
    const engine = new GameEngine();
    expect(engine.getState().unlockedLevel).toBe(1);

    const locked = engine.selectLevel(3);
    expect(locked.level).toBe(1);

    const firstMap = engine.getMap();
    for (const letter of firstMap.letterSpawns) {
      routeTo(engine, letter);
    }
    routeTo(engine, firstMap.exit);
    expect(engine.getState().unlockedLevel).toBe(2);

    const selected = engine.selectLevel(2);
    expect(selected.level).toBe(2);
    expect(selected.status).toBe("playing");

    const stillLocked = engine.selectLevel(4);
    expect(stillLocked.level).toBe(2);
  });
});
