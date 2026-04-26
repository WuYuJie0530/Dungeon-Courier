import { findPath, isFloor, keyOf, manhattan } from "./collision";
import { SeededRandom } from "./rng";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
  type Direction,
  type EnemyKind,
  type EnemySpawn,
  type GridPoint,
  type MapData,
  type Room,
  type Tile,
} from "./types";

interface RoomAnchor {
  x: number;
  y: number;
  maxW: number;
  maxH: number;
}

const ROOM_ANCHORS: RoomAnchor[] = [
  { x: 2, y: 2, maxW: 9, maxH: 6 },
  { x: 15, y: 2, maxW: 9, maxH: 6 },
  { x: 28, y: 2, maxW: 9, maxH: 6 },
  { x: 3, y: 11, maxW: 10, maxH: 7 },
  { x: 16, y: 11, maxW: 10, maxH: 7 },
  { x: 29, y: 11, maxW: 8, maxH: 7 },
  { x: 8, y: 19, maxW: 10, maxH: 5 },
  { x: 23, y: 19, maxW: 11, maxH: 5 },
];

const SPAWN_DIRECTIONS: Direction[] = ["up", "right", "down", "left"];

export function generateDungeon(seed: string): MapData {
  const rng = new SeededRandom(seed);
  const tiles = createWallGrid();
  const roomCount = rng.int(5, ROOM_ANCHORS.length);
  const anchors = rng.shuffle(ROOM_ANCHORS).slice(0, roomCount);
  const rooms = anchors.map((anchor, index) => createRoom(anchor, index, rng));

  for (const room of rooms) {
    digRoom(tiles, room);
  }

  for (let i = 1; i < rooms.length; i += 1) {
    digCorridor(tiles, rooms[i - 1].center, rooms[i].center, rng.next() < 0.5);
  }

  const spawn = { ...rooms[0].center };
  const exitRoom = rooms.reduce((best, room) =>
    manhattan(room.center, spawn) > manhattan(best.center, spawn) ? room : best,
  );
  const exit = { ...exitRoom.center };
  const occupied = new Set<string>([keyOf(spawn), keyOf(exit)]);
  const letterSpawns = placeLetters(rooms, tiles, spawn, exit, occupied);
  const charmSpawns = placeCharms(rooms, tiles, spawn, exit, occupied);
  const enemySpawns = placeEnemies(rooms, tiles, spawn, occupied, rng);

  const map: MapData = {
    seed,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tileSize: TILE_SIZE,
    tiles,
    rooms,
    spawn,
    exit,
    letterSpawns,
    charmSpawns,
    enemySpawns,
  };

  validateGeneratedMap(map);
  return map;
}

function createWallGrid(): Tile[][] {
  return Array.from({ length: MAP_HEIGHT }, () => Array.from({ length: MAP_WIDTH }, () => 0 as Tile));
}

function createRoom(anchor: RoomAnchor, id: number, rng: SeededRandom): Room {
  const w = rng.int(5, anchor.maxW);
  const h = rng.int(4, anchor.maxH);
  const x = rng.int(anchor.x, anchor.x + anchor.maxW - w);
  const y = rng.int(anchor.y, anchor.y + anchor.maxH - h);
  return {
    id,
    x,
    y,
    w,
    h,
    center: {
      x: x + Math.floor(w / 2),
      y: y + Math.floor(h / 2),
    },
  };
}

function digRoom(tiles: Tile[][], room: Room): void {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      tiles[y][x] = 1;
    }
  }
}

function digCorridor(tiles: Tile[][], start: GridPoint, end: GridPoint, horizontalFirst: boolean): void {
  if (horizontalFirst) {
    digHorizontal(tiles, start.x, end.x, start.y);
    digVertical(tiles, start.y, end.y, end.x);
  } else {
    digVertical(tiles, start.y, end.y, start.x);
    digHorizontal(tiles, start.x, end.x, end.y);
  }
}

function digHorizontal(tiles: Tile[][], fromX: number, toX: number, y: number): void {
  const start = Math.min(fromX, toX);
  const end = Math.max(fromX, toX);
  for (let x = start; x <= end; x += 1) {
    tiles[y][x] = 1;
  }
}

function digVertical(tiles: Tile[][], fromY: number, toY: number, x: number): void {
  const start = Math.min(fromY, toY);
  const end = Math.max(fromY, toY);
  for (let y = start; y <= end; y += 1) {
    tiles[y][x] = 1;
  }
}

function placeLetters(
  rooms: Room[],
  tiles: Tile[][],
  spawn: GridPoint,
  exit: GridPoint,
  occupied: Set<string>,
): GridPoint[] {
  const candidateRooms = rooms
    .filter((room) => !sameGrid(room.center, spawn) && !sameGrid(room.center, exit))
    .sort((a, b) => manhattan(b.center, spawn) - manhattan(a.center, spawn));
  const letters: GridPoint[] = [];

  for (let i = 0; letters.length < 3 && i < candidateRooms.length * 3; i += 1) {
    const room = candidateRooms[i % candidateRooms.length];
    const point = firstOpenRoomPoint(room, tiles, occupied);
    if (point) {
      occupied.add(keyOf(point));
      letters.push(point);
    }
  }

  if (letters.length < 3) {
    throw new Error(`Unable to place three letters for generated dungeon.`);
  }

  return letters;
}

function placeCharms(
  rooms: Room[],
  tiles: Tile[][],
  spawn: GridPoint,
  exit: GridPoint,
  occupied: Set<string>,
): GridPoint[] {
  const candidateRooms = [...rooms]
    .filter((room) => !sameGrid(room.center, spawn) && !sameGrid(room.center, exit))
    .sort((a, b) => manhattan(a.center, spawn) - manhattan(b.center, spawn));

  for (const room of candidateRooms) {
    const point = roomCenterFallback(room, tiles, occupied) ?? firstOpenRoomPoint(room, tiles, occupied);
    if (point) {
      occupied.add(keyOf(point));
      return [point];
    }
  }

  throw new Error(`Unable to place courier charm for generated dungeon.`);
}

function placeEnemies(
  rooms: Room[],
  tiles: Tile[][],
  spawn: GridPoint,
  occupied: Set<string>,
  rng: SeededRandom,
): EnemySpawn[] {
  const byDistance = [...rooms]
    .filter((room) => !sameGrid(room.center, spawn))
    .sort((a, b) => manhattan(b.center, spawn) - manhattan(a.center, spawn));
  const kinds: EnemyKind[] = ["chaser", "patroller", "chaser", "patroller"];
  const enemies: EnemySpawn[] = [];

  for (let i = 0; i < kinds.length; i += 1) {
    const room = byDistance[i % byDistance.length];
    const point = cornerOpenRoomPoint(room, tiles, occupied) ?? firstOpenRoomPoint(room, tiles, occupied);
    if (!point) {
      continue;
    }
    occupied.add(keyOf(point));
    enemies.push({
      id: `${kinds[i]}-${i}`,
      kind: kinds[i],
      x: point.x,
      y: point.y,
      direction: SPAWN_DIRECTIONS[rng.int(0, SPAWN_DIRECTIONS.length - 1)],
    });
  }

  return enemies;
}

function firstOpenRoomPoint(room: Room, tiles: Tile[][], occupied: Set<string>): GridPoint | null {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      const point = { x, y };
      if (tiles[y][x] === 1 && !occupied.has(keyOf(point))) {
        return point;
      }
    }
  }
  return null;
}

function roomCenterFallback(room: Room, tiles: Tile[][], occupied: Set<string>): GridPoint | null {
  const candidates: GridPoint[] = [
    room.center,
    { x: room.center.x - 1, y: room.center.y },
    { x: room.center.x + 1, y: room.center.y },
    { x: room.center.x, y: room.center.y - 1 },
    { x: room.center.x, y: room.center.y + 1 },
  ];
  return candidates.find((point) => tiles[point.y]?.[point.x] === 1 && !occupied.has(keyOf(point))) ?? null;
}

function cornerOpenRoomPoint(room: Room, tiles: Tile[][], occupied: Set<string>): GridPoint | null {
  const candidates: GridPoint[] = [
    { x: room.x + 1, y: room.y + 1 },
    { x: room.x + room.w - 2, y: room.y + 1 },
    { x: room.x + room.w - 2, y: room.y + room.h - 2 },
    { x: room.x + 1, y: room.y + room.h - 2 },
  ];
  return candidates.find((point) => tiles[point.y]?.[point.x] === 1 && !occupied.has(keyOf(point))) ?? null;
}

function validateGeneratedMap(map: MapData): void {
  if (map.rooms.length < 5) {
    throw new Error(`Dungeon generated too few rooms for seed ${map.seed}.`);
  }
  if (!isFloor(map, map.spawn.x, map.spawn.y) || !isFloor(map, map.exit.x, map.exit.y)) {
    throw new Error(`Dungeon generated illegal spawn or exit for seed ${map.seed}.`);
  }
  if (!findPath(map, map.spawn, map.exit)) {
    throw new Error(`Dungeon exit is unreachable for seed ${map.seed}.`);
  }
  for (const room of map.rooms) {
    if (!findPath(map, map.spawn, room.center)) {
      throw new Error(`Dungeon room ${room.id} is disconnected for seed ${map.seed}.`);
    }
  }
  for (const letter of map.letterSpawns) {
    if (!isFloor(map, letter.x, letter.y)) {
      throw new Error(`Dungeon generated illegal letter for seed ${map.seed}.`);
    }
  }
  for (const charm of map.charmSpawns) {
    if (!isFloor(map, charm.x, charm.y)) {
      throw new Error(`Dungeon generated illegal charm for seed ${map.seed}.`);
    }
  }
  for (const enemy of map.enemySpawns) {
    if (!isFloor(map, enemy.x, enemy.y)) {
      throw new Error(`Dungeon generated illegal enemy for seed ${map.seed}.`);
    }
  }
}

function sameGrid(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
