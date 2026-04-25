import {
  DIR_VECTORS,
  DIRECTIONS,
  findPath,
  isDirection,
  isFloor,
  keyOf,
  manhattan,
  nextPoint,
  rotateClockwise,
  samePoint,
} from "./collision";
import { generateDungeon } from "./map";
import {
  DASH_COOLDOWN_FRAMES,
  DASH_DISTANCE_TILES,
  FPS,
  PLAYER_START_LIVES,
  TIME_LIMIT_SECONDS,
  type Direction,
  type Enemy,
  type EntitySnapshot,
  type Exit,
  type GameStateSnapshot,
  type GameStatus,
  type Letter,
  type MapData,
  type Player,
} from "./types";

export class GameEngine {
  private level: number;
  private seed: string;
  private nextSeed: string;
  private map: MapData;
  private player: Player;
  private enemies: Enemy[];
  private letters: Letter[];
  private exit: Exit;
  private frame: number;
  private status: GameStatus;
  private collectedLetters: number;

  constructor(seed = levelSeed(1)) {
    this.level = 1;
    this.seed = seed;
    this.nextSeed = seed;
    this.map = generateDungeon(seed);
    this.player = this.createPlayer();
    this.enemies = [];
    this.letters = [];
    this.exit = { ...this.map.exit, open: false };
    this.frame = 0;
    this.status = "playing";
    this.collectedLetters = 0;
    this.restart(seed);
  }

  setSeed(seed: string): void {
    this.nextSeed = String(seed);
  }

  restart(seed = this.nextSeed): GameStateSnapshot {
    this.seed = String(seed);
    this.nextSeed = this.seed;
    this.map = generateDungeon(this.seed);
    this.player = this.createPlayer();
    this.letters = this.map.letterSpawns.map((point, index) => ({
      id: `letter-${index}`,
      x: point.x,
      y: point.y,
      collected: false,
    }));
    this.enemies = this.map.enemySpawns.map((spawn) => ({
      id: spawn.id,
      kind: spawn.kind,
      x: spawn.x,
      y: spawn.y,
      direction: spawn.direction,
      alertRange: spawn.kind === "chaser" ? 6 : 0,
      moveEveryFrames: spawn.kind === "chaser" ? 14 : 18,
      lastPathLength: null,
    }));
    this.exit = { ...this.map.exit, open: false };
    this.frame = 0;
    this.status = "playing";
    this.collectedLetters = 0;
    return this.getState();
  }

  restartLevel(): GameStateSnapshot {
    this.nextSeed = this.seed;
    return this.restart(this.seed);
  }

  nextLevel(): GameStateSnapshot {
    this.level += 1;
    this.nextSeed = levelSeed(this.level);
    return this.restart(this.nextSeed);
  }

  pause(): GameStateSnapshot {
    if (this.status === "playing") {
      this.status = "paused";
    }
    return this.getState();
  }

  resume(): GameStateSnapshot {
    if (this.status === "paused") {
      this.status = "playing";
    }
    return this.getState();
  }

  togglePause(): GameStateSnapshot {
    return this.status === "paused" ? this.resume() : this.pause();
  }

  step(frames: number): GameStateSnapshot {
    const wholeFrames = Math.max(0, Math.floor(frames));
    for (let i = 0; i < wholeFrames; i += 1) {
      if (this.status !== "playing") {
        break;
      }
      this.stepOneFrame();
    }
    return this.getState();
  }

  movePlayer(direction: Direction): GameStateSnapshot {
    if (this.status !== "playing" || !isDirection(direction)) {
      return this.getState();
    }

    this.player.lastDirection = direction;
    const target = nextPoint(this.player, direction);
    if (isFloor(this.map, target.x, target.y)) {
      this.player.x = target.x;
      this.player.y = target.y;
      this.collectLettersAtPlayer();
      this.checkExit();
      this.checkEnemyCollision();
    }
    return this.getState();
  }

  dash(direction: Direction): GameStateSnapshot {
    if (this.status !== "playing" || !isDirection(direction) || this.player.dashCooldownFrames > 0) {
      return this.getState();
    }

    this.player.lastDirection = direction;
    let moved = false;
    for (let i = 0; i < DASH_DISTANCE_TILES; i += 1) {
      const target = nextPoint(this.player, direction);
      if (!isFloor(this.map, target.x, target.y)) {
        break;
      }
      this.player.x = target.x;
      this.player.y = target.y;
      moved = true;
      this.collectLettersAtPlayer();
      this.checkExit();
      this.checkEnemyCollision();
      if (this.status !== "playing") {
        break;
      }
    }

    if (moved) {
      this.player.dashCooldownFrames = DASH_COOLDOWN_FRAMES;
    }
    return this.getState();
  }

  getState(): GameStateSnapshot {
    return cloneJson({
      ...this.getEntities(),
      seed: this.seed,
      level: this.level,
      nextLevelSeed: levelSeed(this.level + 1),
      frame: this.frame,
      timeRemaining: roundTime(this.getTimeRemaining()),
      lives: this.player.lives,
      status: this.status,
      collectedLetters: this.collectedLetters,
      totalLetters: this.letters.length,
      dashCooldownFrames: this.player.dashCooldownFrames,
      dashReady: this.player.dashCooldownFrames === 0,
    });
  }

  getMap(): MapData {
    return cloneJson(this.map);
  }

  getEntities(): EntitySnapshot {
    return cloneJson({
      player: this.player,
      enemies: this.enemies,
      letters: this.letters,
      exit: this.exit,
    });
  }

  private createPlayer(): Player {
    return {
      x: this.map.spawn.x,
      y: this.map.spawn.y,
      lives: PLAYER_START_LIVES,
      dashCooldownFrames: 0,
      invulnerableFrames: 0,
      lastDirection: "down",
    };
  }

  private stepOneFrame(): void {
    this.frame += 1;
    this.player.dashCooldownFrames = Math.max(0, this.player.dashCooldownFrames - 1);
    this.player.invulnerableFrames = Math.max(0, this.player.invulnerableFrames - 1);

    this.updateEnemies();
    this.checkEnemyCollision();

    if (this.frame >= TIME_LIMIT_SECONDS * FPS && this.status === "playing") {
      this.status = "lost";
    }
  }

  private updateEnemies(): void {
    for (const enemy of this.enemies) {
      if (this.status !== "playing" || this.frame % enemy.moveEveryFrames !== 0) {
        continue;
      }
      if (enemy.kind === "chaser") {
        this.updateChaser(enemy);
      } else {
        this.updatePatroller(enemy);
      }
    }
  }

  private updateChaser(enemy: Enemy): void {
    if (manhattan(enemy, this.player) > enemy.alertRange) {
      enemy.lastPathLength = null;
      return;
    }

    const path = findPath(this.map, enemy, this.player);
    enemy.lastPathLength = path ? path.length : null;
    if (path && path.length > 1) {
      const next = path[1];
      if (isFloor(this.map, next.x, next.y)) {
        enemy.x = next.x;
        enemy.y = next.y;
        enemy.direction = directionBetween(enemy, next) ?? enemy.direction;
      }
    }
  }

  private updatePatroller(enemy: Enemy): void {
    let target = nextPoint(enemy, enemy.direction);
    if (!isFloor(this.map, target.x, target.y)) {
      for (let i = 0; i < DIRECTIONS.length; i += 1) {
        enemy.direction = rotateClockwise(enemy.direction);
        target = nextPoint(enemy, enemy.direction);
        if (isFloor(this.map, target.x, target.y)) {
          break;
        }
      }
    }
    if (isFloor(this.map, target.x, target.y)) {
      enemy.x = target.x;
      enemy.y = target.y;
    }
  }

  private collectLettersAtPlayer(): void {
    for (const letter of this.letters) {
      if (!letter.collected && samePoint(letter, this.player)) {
        letter.collected = true;
        this.collectedLetters += 1;
      }
    }
    this.exit.open = this.collectedLetters === this.letters.length;
  }

  private checkExit(): void {
    if (samePoint(this.player, this.exit) && this.exit.open) {
      this.status = "won";
    }
  }

  private checkEnemyCollision(): void {
    if (this.status !== "playing" || this.player.invulnerableFrames > 0) {
      return;
    }
    const hit = this.enemies.some((enemy) => samePoint(enemy, this.player));
    if (!hit) {
      return;
    }

    this.player.lives = Math.max(0, this.player.lives - 1);
    this.player.invulnerableFrames = 60;
    if (this.player.lives === 0) {
      this.status = "lost";
    }
  }

  private getTimeRemaining(): number {
    return Math.max(0, TIME_LIMIT_SECONDS - this.frame / FPS);
  }
}

export function levelSeed(level: number): string {
  return `courier-level-${String(Math.max(1, Math.floor(level))).padStart(3, "0")}`;
}

function directionBetween(from: { x: number; y: number }, to: { x: number; y: number }): Direction | null {
  for (const direction of DIRECTIONS) {
    const vector = DIR_VECTORS[direction];
    if (from.x + vector.x === to.x && from.y + vector.y === to.y) {
      return direction;
    }
  }
  return null;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function hasOnlyFloorPositions(map: MapData, points: { x: number; y: number }[]): boolean {
  return points.every((point) => isFloor(map, point.x, point.y));
}

export function entityKeySet(snapshot: EntitySnapshot): Set<string> {
  return new Set([
    keyOf(snapshot.player),
    ...snapshot.enemies.map(keyOf),
    ...snapshot.letters.filter((letter) => !letter.collected).map(keyOf),
    keyOf(snapshot.exit),
  ]);
}
