import { DIRECTIONS, findPath, nextPoint } from "../src/collision";
import type { Direction, GameStateSnapshot, GridPoint, MapData } from "../src/types";
import { GameEngine } from "../src/game";

export function walkPath(engine: GameEngine, path: GridPoint[]): GameStateSnapshot {
  let state = engine.getState();
  for (let i = 1; i < path.length; i += 1) {
    const direction = directionBetween(path[i - 1], path[i]);
    if (!direction) {
      throw new Error(`Path contains non-adjacent points.`);
    }
    state = engine.movePlayer(direction);
  }
  return state;
}

export function routeTo(engine: GameEngine, target: GridPoint): GameStateSnapshot {
  const state = engine.getState();
  const path = findPath(engine.getMap(), state.player, target);
  if (!path) {
    throw new Error(`No route from player to ${target.x},${target.y}.`);
  }
  return walkPath(engine, path);
}

export function directionBetween(from: GridPoint, to: GridPoint): Direction | null {
  for (const direction of DIRECTIONS) {
    const next = nextPoint(from, direction);
    if (next.x === to.x && next.y === to.y) {
      return direction;
    }
  }
  return null;
}

export function findOpenDirection(map: MapData, point: GridPoint): Direction {
  const direction = DIRECTIONS.find((candidate) => {
    const next = nextPoint(point, candidate);
    return map.tiles[next.y]?.[next.x] === 1;
  });
  if (!direction) {
    throw new Error(`No open direction from ${point.x},${point.y}.`);
  }
  return direction;
}

export function mapSignature(map: MapData): string {
  return JSON.stringify({
    tiles: map.tiles,
    rooms: map.rooms,
    spawn: map.spawn,
    exit: map.exit,
    letters: map.letterSpawns,
    enemies: map.enemySpawns,
  });
}
