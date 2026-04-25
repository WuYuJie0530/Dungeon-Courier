import type { Direction, GridPoint, MapData } from "./types";

export const DIR_VECTORS: Record<Direction, GridPoint> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];

export function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

export function keyOf(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

export function inBounds(map: Pick<MapData, "width" | "height">, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isFloor(map: MapData, x: number, y: number): boolean {
  return inBounds(map, x, y) && map.tiles[y]?.[x] === 1;
}

export function isWall(map: MapData, x: number, y: number): boolean {
  return !isFloor(map, x, y);
}

export function nextPoint(point: GridPoint, direction: Direction): GridPoint {
  const vector = DIR_VECTORS[direction];
  return { x: point.x + vector.x, y: point.y + vector.y };
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function rotateClockwise(direction: Direction): Direction {
  const index = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(index + 1) % DIRECTIONS.length];
}

export function findPath(map: MapData, start: GridPoint, goal: GridPoint): GridPoint[] | null {
  if (!isFloor(map, start.x, start.y) || !isFloor(map, goal.x, goal.y)) {
    return null;
  }

  const queue: GridPoint[] = [start];
  let cursor = 0;
  const visited = new Set<string>([keyOf(start)]);
  const previous = new Map<string, string>();

  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;

    if (samePoint(current, goal)) {
      return reconstructPath(previous, start, goal);
    }

    for (const direction of DIRECTIONS) {
      const candidate = nextPoint(current, direction);
      const candidateKey = keyOf(candidate);
      if (!visited.has(candidateKey) && isFloor(map, candidate.x, candidate.y)) {
        visited.add(candidateKey);
        previous.set(candidateKey, keyOf(current));
        queue.push(candidate);
      }
    }
  }

  return null;
}

function reconstructPath(previous: Map<string, string>, start: GridPoint, goal: GridPoint): GridPoint[] {
  const path: GridPoint[] = [goal];
  let currentKey = keyOf(goal);
  const startKey = keyOf(start);

  while (currentKey !== startKey) {
    const previousKey = previous.get(currentKey);
    if (!previousKey) {
      return [start];
    }
    const [x, y] = previousKey.split(",").map(Number);
    path.push({ x, y });
    currentKey = previousKey;
  }

  return path.reverse();
}
