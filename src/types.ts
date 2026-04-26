export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 26;
export const TILE_SIZE = 24;
export const FPS = 60;
export const TIME_LIMIT_SECONDS = 90;
export const PLAYER_START_LIVES = 3;
export const DASH_COOLDOWN_FRAMES = 90;
export const DASH_DISTANCE_TILES = 3;
export const CHARM_SHIELD_FRAMES = 300;
export const MAX_LEVEL = 5;

export type Direction = "up" | "down" | "left" | "right";
export type GameStatus = "playing" | "paused" | "won" | "lost" | "completed";
export type EnemyKind = "chaser" | "patroller";
export type Tile = 0 | 1;

export interface GridPoint {
  x: number;
  y: number;
}

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  center: GridPoint;
}

export interface EnemySpawn extends GridPoint {
  id: string;
  kind: EnemyKind;
  direction: Direction;
}

export interface MapData {
  seed: string;
  width: number;
  height: number;
  tileSize: number;
  tiles: Tile[][];
  rooms: Room[];
  spawn: GridPoint;
  exit: GridPoint;
  letterSpawns: GridPoint[];
  charmSpawns: GridPoint[];
  enemySpawns: EnemySpawn[];
}

export interface Player extends GridPoint {
  lives: number;
  dashCooldownFrames: number;
  invulnerableFrames: number;
  shieldFrames: number;
  lastDirection: Direction;
}

export interface Enemy extends GridPoint {
  id: string;
  kind: EnemyKind;
  direction: Direction;
  alertRange: number;
  moveEveryFrames: number;
  lastPathLength: number | null;
}

export interface Letter extends GridPoint {
  id: string;
  collected: boolean;
}

export interface Charm extends GridPoint {
  id: string;
  collected: boolean;
}

export interface Exit extends GridPoint {
  open: boolean;
}

export interface EntitySnapshot {
  player: Player;
  enemies: Enemy[];
  letters: Letter[];
  charms: Charm[];
  exit: Exit;
}

export interface GameStateSnapshot extends EntitySnapshot {
  seed: string;
  level: number;
  maxLevel: number;
  unlockedLevel: number;
  nextLevelSeed: string;
  campaignCompleted: boolean;
  difficultyName: string;
  difficultyRank: number;
  frame: number;
  timeRemaining: number;
  lives: number;
  status: GameStatus;
  collectedLetters: number;
  totalLetters: number;
  collectedCharms: number;
  totalCharms: number;
  dashCooldownFrames: number;
  dashReady: boolean;
  shieldFrames: number;
  shieldActive: boolean;
}

export interface GameTestApi {
  getState(): GameStateSnapshot;
  setSeed(seed: string): void;
  restart(seed?: string): GameStateSnapshot;
  step(frames: number): GameStateSnapshot;
  movePlayer(direction: Direction): GameStateSnapshot;
  dash(direction: Direction): GameStateSnapshot;
  nextLevel(): GameStateSnapshot;
  selectLevel(level: number): GameStateSnapshot;
  restartCampaign(): GameStateSnapshot;
  getMap(): MapData;
  getEntities(): EntitySnapshot;
  pause(): GameStateSnapshot;
  resume(): GameStateSnapshot;
}
