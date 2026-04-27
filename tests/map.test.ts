import { describe, expect, it } from "vitest";
import { findPath, isFloor } from "../src/collision";
import { generateDungeon, generateTutorialDungeon } from "../src/map";
import { mapSignature } from "./helpers";

describe("deterministic dungeon generation", () => {
  it("generates identical maps for identical seeds", () => {
    expect(mapSignature(generateDungeon("fixed-seed"))).toBe(mapSignature(generateDungeon("fixed-seed")));
  });

  it("generates different layouts for different seeds", () => {
    expect(mapSignature(generateDungeon("alpha-seed"))).not.toBe(mapSignature(generateDungeon("beta-seed")));
  });

  it("creates at least five connected rooms with reachable exits across many seeds", () => {
    for (let i = 0; i < 100; i += 1) {
      const map = generateDungeon(`coverage-${i}`);
      expect(map.rooms.length).toBeGreaterThanOrEqual(5);
      expect(findPath(map, map.spawn, map.exit)).not.toBeNull();
      for (const room of map.rooms) {
        expect(findPath(map, map.spawn, room.center), `room ${room.id} for seed ${map.seed}`).not.toBeNull();
      }
    }
  });

  it("places gameplay entities on legal floor tiles", () => {
    const map = generateDungeon("placement-check");
    const points = [map.spawn, map.exit, ...map.letterSpawns, ...map.charmSpawns, ...map.enemySpawns];
    for (const point of points) {
      expect(isFloor(map, point.x, point.y)).toBe(true);
    }
    expect(map.letterSpawns.length).toBeGreaterThanOrEqual(3);
    expect(map.charmSpawns).toHaveLength(1);
    expect(map.enemySpawns.some((enemy) => enemy.kind === "chaser")).toBe(true);
    expect(map.enemySpawns.some((enemy) => enemy.kind === "patroller")).toBe(true);
  });

  it("creates a legal fixed tutorial dungeon", () => {
    const map = generateTutorialDungeon();
    const points = [map.spawn, map.exit, ...map.letterSpawns, ...map.charmSpawns, ...map.enemySpawns];

    expect(map.rooms.length).toBeGreaterThanOrEqual(5);
    expect(map.letterSpawns).toHaveLength(3);
    expect(map.charmSpawns).toHaveLength(1);
    expect(map.enemySpawns.some((enemy) => enemy.kind === "chaser")).toBe(true);
    expect(map.enemySpawns.some((enemy) => enemy.kind === "patroller")).toBe(true);
    expect(findPath(map, map.spawn, map.exit)).not.toBeNull();
    for (const point of points) {
      expect(isFloor(map, point.x, point.y)).toBe(true);
      expect(findPath(map, map.spawn, point)).not.toBeNull();
    }
    expect(mapSignature(map)).toBe(mapSignature(generateTutorialDungeon()));
  });
});
