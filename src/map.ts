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
  type MapTheme,
  type PortalPairSpawn,
  type Room,
  type SpikeTrapSpawn,
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
    theme: "classic",
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
    spikeTrapSpawns: [],
    hourglassSpawns: [],
    portalPairs: [],
  };

  validateGeneratedMap(map);
  return map;
}

export function generateTutorialDungeon(seed = "courier-level-001"): MapData {
  const tiles = createWallGrid();
  const rooms: Room[] = [
    { id: 0, x: 2, y: 3, w: 8, h: 5, center: { x: 6, y: 5 } },
    { id: 1, x: 12, y: 3, w: 8, h: 5, center: { x: 16, y: 5 } },
    { id: 2, x: 24, y: 3, w: 9, h: 5, center: { x: 28, y: 5 } },
    { id: 3, x: 12, y: 11, w: 8, h: 6, center: { x: 16, y: 14 } },
    { id: 4, x: 24, y: 11, w: 9, h: 6, center: { x: 28, y: 14 } },
    { id: 5, x: 11, y: 19, w: 10, h: 5, center: { x: 16, y: 21 } },
    { id: 6, x: 25, y: 19, w: 9, h: 5, center: { x: 29, y: 21 } },
  ];

  for (const room of rooms) {
    digRoom(tiles, room);
  }

  digHorizontal(tiles, 6, 28, 5);
  digVertical(tiles, 16, 14, 5);
  digHorizontal(tiles, 16, 28, 14);
  digVertical(tiles, 5, 14, 28);
  digVertical(tiles, 14, 21, 16);
  digHorizontal(tiles, 16, 29, 21);
  digVertical(tiles, 14, 21, 29);

  const map: MapData = {
    seed,
    theme: "tutorial",
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tileSize: TILE_SIZE,
    tiles,
    rooms,
    spawn: { x: 5, y: 5 },
    exit: { x: 18, y: 5 },
    letterSpawns: [
      { x: 8, y: 5 },
      { x: 16, y: 14 },
      { x: 30, y: 14 },
    ],
    charmSpawns: [{ x: 22, y: 14 }],
    enemySpawns: [
      { id: "chaser-tutorial", kind: "chaser", x: 30, y: 20, direction: "up" },
      { id: "patroller-tutorial", kind: "patroller", x: 31, y: 13, direction: "left" },
    ],
    spikeTrapSpawns: [],
    hourglassSpawns: [],
    portalPairs: [],
  };

  validateGeneratedMap(map);
  return map;
}

export function generateThemeDungeon(level: number, seed = `courier-level-${String(level).padStart(3, "0")}`): MapData {
  switch (Math.floor(level)) {
    case 2:
      return generateArchiveDungeon(seed);
    case 3:
      return generateCanalDungeon(seed);
    case 4:
      return generateWatchtowerDungeon(seed);
    case 5:
      return generateCoreDungeon(seed);
    default:
      return generateDungeon(seed);
  }
}

function generateArchiveDungeon(seed: string): MapData {
  const rooms: Room[] = [
    { id: 0, x: 2, y: 11, w: 5, h: 5, center: { x: 4, y: 13 } },
    { id: 1, x: 8, y: 12, w: 24, h: 3, center: { x: 20, y: 13 } },
    { id: 2, x: 12, y: 5, w: 7, h: 5, center: { x: 15, y: 7 } },
    { id: 3, x: 12, y: 18, w: 7, h: 5, center: { x: 15, y: 20 } },
    { id: 4, x: 24, y: 5, w: 7, h: 5, center: { x: 27, y: 7 } },
    { id: 5, x: 24, y: 18, w: 7, h: 5, center: { x: 27, y: 20 } },
    { id: 6, x: 33, y: 10, w: 5, h: 7, center: { x: 35, y: 13 } },
  ];
  return buildFixedDungeon({
    seed,
    theme: "archive",
    rooms,
    corridors: [
      [{ x: 4, y: 13 }, { x: 35, y: 13 }],
      [{ x: 15, y: 7 }, { x: 15, y: 20 }],
      [{ x: 27, y: 7 }, { x: 27, y: 20 }],
    ],
    spawn: { x: 4, y: 13 },
    exit: { x: 35, y: 13 },
    letterSpawns: [
      { x: 15, y: 7 },
      { x: 15, y: 20 },
      { x: 27, y: 20 },
    ],
    charmSpawns: [{ x: 8, y: 13 }],
    enemySpawns: [
      { id: "archive-patroller-1", kind: "patroller", x: 20, y: 12, direction: "right" },
      { id: "archive-chaser-1", kind: "chaser", x: 27, y: 7, direction: "left" },
      { id: "archive-patroller-2", kind: "patroller", x: 34, y: 15, direction: "up" },
    ],
    spikeTrapSpawns: [
      { id: "archive-spike-1", x: 11, y: 12, phaseOffsetFrames: 0 },
      { id: "archive-spike-2", x: 22, y: 14, phaseOffsetFrames: 40 },
      { id: "archive-spike-3", x: 30, y: 12, phaseOffsetFrames: 80 },
    ],
    hourglassSpawns: [],
    portalPairs: [],
  });
}

function generateCanalDungeon(seed: string): MapData {
  const rooms: Room[] = [
    { id: 0, x: 3, y: 10, w: 6, h: 6, center: { x: 6, y: 13 } },
    { id: 1, x: 12, y: 4, w: 8, h: 5, center: { x: 16, y: 6 } },
    { id: 2, x: 25, y: 4, w: 8, h: 5, center: { x: 29, y: 6 } },
    { id: 3, x: 12, y: 17, w: 8, h: 5, center: { x: 16, y: 19 } },
    { id: 4, x: 25, y: 17, w: 8, h: 5, center: { x: 29, y: 19 } },
    { id: 5, x: 34, y: 10, w: 4, h: 6, center: { x: 36, y: 13 } },
  ];
  return buildFixedDungeon({
    seed,
    theme: "canal",
    rooms,
    corridors: [
      [{ x: 6, y: 13 }, { x: 36, y: 13 }],
      [{ x: 16, y: 6 }, { x: 29, y: 6 }],
      [{ x: 16, y: 19 }, { x: 29, y: 19 }],
      [{ x: 16, y: 6 }, { x: 16, y: 19 }],
      [{ x: 29, y: 6 }, { x: 29, y: 19 }],
      [{ x: 6, y: 13 }, { x: 16, y: 6 }],
      [{ x: 29, y: 19 }, { x: 36, y: 13 }],
    ],
    spawn: { x: 6, y: 13 },
    exit: { x: 36, y: 13 },
    letterSpawns: [
      { x: 16, y: 6 },
      { x: 29, y: 19 },
      { x: 29, y: 6 },
    ],
    charmSpawns: [{ x: 16, y: 19 }],
    enemySpawns: [
      { id: "canal-chaser-1", kind: "chaser", x: 31, y: 6, direction: "left" },
      { id: "canal-patroller-1", kind: "patroller", x: 22, y: 13, direction: "right" },
      { id: "canal-chaser-2", kind: "chaser", x: 29, y: 18, direction: "up" },
      { id: "canal-patroller-2", kind: "patroller", x: 13, y: 19, direction: "right" },
    ],
    spikeTrapSpawns: [],
    hourglassSpawns: [{ x: 22, y: 6 }],
    portalPairs: [],
  });
}

function generateWatchtowerDungeon(seed: string): MapData {
  const rooms: Room[] = [
    { id: 0, x: 2, y: 3, w: 6, h: 6, center: { x: 5, y: 6 } },
    { id: 1, x: 12, y: 3, w: 8, h: 5, center: { x: 16, y: 5 } },
    { id: 2, x: 25, y: 3, w: 8, h: 5, center: { x: 29, y: 5 } },
    { id: 3, x: 8, y: 12, w: 8, h: 5, center: { x: 12, y: 14 } },
    { id: 4, x: 22, y: 12, w: 8, h: 5, center: { x: 26, y: 14 } },
    { id: 5, x: 32, y: 18, w: 6, h: 5, center: { x: 35, y: 20 } },
  ];
  return buildFixedDungeon({
    seed,
    theme: "watchtower",
    rooms,
    corridors: [
      [{ x: 5, y: 6 }, { x: 29, y: 5 }],
      [{ x: 16, y: 5 }, { x: 12, y: 14 }],
      [{ x: 12, y: 14 }, { x: 26, y: 14 }],
      [{ x: 26, y: 14 }, { x: 35, y: 20 }],
      [{ x: 29, y: 5 }, { x: 26, y: 14 }],
    ],
    spawn: { x: 5, y: 6 },
    exit: { x: 35, y: 20 },
    letterSpawns: [
      { x: 16, y: 5 },
      { x: 12, y: 14 },
      { x: 29, y: 5 },
    ],
    charmSpawns: [{ x: 26, y: 14 }],
    enemySpawns: [
      { id: "watch-sentinel-1", kind: "sentinel", x: 19, y: 5, direction: "left" },
      { id: "watch-patroller-1", kind: "patroller", x: 14, y: 14, direction: "right" },
      { id: "watch-sentinel-2", kind: "sentinel", x: 26, y: 16, direction: "up" },
      { id: "watch-chaser-1", kind: "chaser", x: 35, y: 19, direction: "left" },
    ],
    spikeTrapSpawns: [],
    hourglassSpawns: [],
    portalPairs: [],
  });
}

function generateCoreDungeon(seed: string): MapData {
  const rooms: Room[] = [
    { id: 0, x: 17, y: 10, w: 7, h: 6, center: { x: 20, y: 13 } },
    { id: 1, x: 3, y: 10, w: 7, h: 6, center: { x: 6, y: 13 } },
    { id: 2, x: 30, y: 10, w: 7, h: 6, center: { x: 33, y: 13 } },
    { id: 3, x: 17, y: 3, w: 7, h: 5, center: { x: 20, y: 5 } },
    { id: 4, x: 17, y: 19, w: 7, h: 5, center: { x: 20, y: 21 } },
    { id: 5, x: 3, y: 3, w: 6, h: 5, center: { x: 6, y: 5 } },
    { id: 6, x: 31, y: 19, w: 6, h: 5, center: { x: 34, y: 21 } },
  ];
  return buildFixedDungeon({
    seed,
    theme: "core",
    rooms,
    corridors: [
      [{ x: 6, y: 13 }, { x: 33, y: 13 }],
      [{ x: 20, y: 5 }, { x: 20, y: 21 }],
      [{ x: 6, y: 5 }, { x: 20, y: 5 }],
      [{ x: 20, y: 21 }, { x: 34, y: 21 }],
      [{ x: 33, y: 13 }, { x: 34, y: 21 }],
    ],
    spawn: { x: 20, y: 13 },
    exit: { x: 34, y: 21 },
    letterSpawns: [
      { x: 6, y: 5 },
      { x: 33, y: 13 },
      { x: 20, y: 21 },
    ],
    charmSpawns: [{ x: 6, y: 13 }],
    enemySpawns: [
      { id: "core-sentinel-1", kind: "sentinel", x: 20, y: 8, direction: "right" },
      { id: "core-chaser-1", kind: "chaser", x: 6, y: 5, direction: "right" },
      { id: "core-patroller-1", kind: "patroller", x: 27, y: 13, direction: "left" },
      { id: "core-sentinel-2", kind: "sentinel", x: 34, y: 20, direction: "up" },
    ],
    spikeTrapSpawns: [
      { id: "core-spike-1", x: 18, y: 13, phaseOffsetFrames: 20 },
      { id: "core-spike-2", x: 22, y: 13, phaseOffsetFrames: 80 },
    ],
    hourglassSpawns: [{ x: 20, y: 5 }],
    portalPairs: [{ id: "core-portal-1", a: { x: 6, y: 14 }, b: { x: 34, y: 22 } }],
  });
}

interface FixedDungeonConfig {
  seed: string;
  theme: MapTheme;
  rooms: Room[];
  corridors: Array<[GridPoint, GridPoint]>;
  spawn: GridPoint;
  exit: GridPoint;
  letterSpawns: GridPoint[];
  charmSpawns: GridPoint[];
  enemySpawns: EnemySpawn[];
  spikeTrapSpawns: SpikeTrapSpawn[];
  hourglassSpawns: GridPoint[];
  portalPairs: PortalPairSpawn[];
}

function buildFixedDungeon(config: FixedDungeonConfig): MapData {
  const tiles = createWallGrid();
  for (const room of config.rooms) {
    digRoom(tiles, room);
  }
  for (const [start, end] of config.corridors) {
    digCorridor(tiles, start, end, true);
  }

  const map: MapData = {
    seed: config.seed,
    theme: config.theme,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tileSize: TILE_SIZE,
    tiles,
    rooms: config.rooms,
    spawn: config.spawn,
    exit: config.exit,
    letterSpawns: config.letterSpawns,
    charmSpawns: config.charmSpawns,
    enemySpawns: config.enemySpawns,
    spikeTrapSpawns: config.spikeTrapSpawns,
    hourglassSpawns: config.hourglassSpawns,
    portalPairs: config.portalPairs,
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
  for (const spike of map.spikeTrapSpawns) {
    if (!isFloor(map, spike.x, spike.y)) {
      throw new Error(`Dungeon generated illegal spike trap for seed ${map.seed}.`);
    }
  }
  for (const hourglass of map.hourglassSpawns) {
    if (!isFloor(map, hourglass.x, hourglass.y) || !findPath(map, map.spawn, hourglass)) {
      throw new Error(`Dungeon generated unreachable hourglass for seed ${map.seed}.`);
    }
  }
  for (const portalPair of map.portalPairs) {
    if (!isFloor(map, portalPair.a.x, portalPair.a.y) || !isFloor(map, portalPair.b.x, portalPair.b.y)) {
      throw new Error(`Dungeon generated illegal portal pair for seed ${map.seed}.`);
    }
  }
}

function sameGrid(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
