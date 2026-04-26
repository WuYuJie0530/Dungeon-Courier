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
  CHARM_SHIELD_FRAMES,
  DASH_COOLDOWN_FRAMES,
  DASH_DISTANCE_TILES,
  FPS,
  MAX_LEVEL,
  PLAYER_START_LIVES,
  TIME_LIMIT_SECONDS,
  type Charm,
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
  private unlockedLevel: number;
  private seed: string;
  private nextSeed: string;
  private map: MapData;
  private player: Player;
  private enemies: Enemy[];
  private letters: Letter[];
  private charms: Charm[];
  private exit: Exit;
  private frame: number;
  private status: GameStatus;
  private collectedLetters: number;

  constructor(seed = levelSeed(1)) {
    this.level = 1;
    this.unlockedLevel = 1;
    this.seed = seed;
    this.nextSeed = seed;
    this.map = generateDungeon(seed);
    this.player = this.createPlayer();
    this.enemies = [];
    this.letters = [];
    this.charms = [];
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
    this.charms = this.map.charmSpawns.map((point, index) => ({
      id: `charm-${index}`,
      x: point.x,
      y: point.y,
      collected: false,
    }));
    const difficulty = getDifficultyProfile(this.level);
    this.enemies = this.map.enemySpawns.slice(0, difficulty.enemyCount).map((spawn) => ({
      id: spawn.id,
      kind: spawn.kind,
      x: spawn.x,
      y: spawn.y,
      direction: spawn.direction,
      alertRange: spawn.kind === "chaser" ? difficulty.chaserAlertRange : 0,
      moveEveryFrames: spawn.kind === "chaser" ? difficulty.chaserMoveEveryFrames : difficulty.patrollerMoveEveryFrames,
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
    if (this.level >= MAX_LEVEL) {
      return this.getState();
    }
    this.level += 1;
    this.unlockedLevel = Math.max(this.unlockedLevel, this.level);
    this.nextSeed = levelSeed(this.level);
    return this.restart(this.nextSeed);
  }

  selectLevel(level: number): GameStateSnapshot {
    const targetLevel = Math.floor(level);
    if (targetLevel < 1 || targetLevel > this.unlockedLevel || targetLevel > MAX_LEVEL) {
      return this.getState();
    }
    this.level = targetLevel;
    this.nextSeed = levelSeed(this.level);
    return this.restart(this.nextSeed);
  }

  restartCampaign(): GameStateSnapshot {
    this.level = 1;
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
      this.collectCharmsAtPlayer();
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
      this.collectCharmsAtPlayer();
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
    const difficulty = getDifficultyProfile(this.level);
    return cloneJson({
      ...this.getEntities(),
      seed: this.seed,
      level: this.level,
      maxLevel: MAX_LEVEL,
      unlockedLevel: this.unlockedLevel,
      nextLevelSeed: levelSeed(this.level + 1),
      campaignCompleted: this.status === "completed",
      difficultyName: difficulty.name,
      difficultyRank: difficulty.rank,
      frame: this.frame,
      timeRemaining: roundTime(this.getTimeRemaining()),
      lives: this.player.lives,
      status: this.status,
      collectedLetters: this.collectedLetters,
      totalLetters: this.letters.length,
      collectedCharms: this.charms.filter((charm) => charm.collected).length,
      totalCharms: this.charms.length,
      dashCooldownFrames: this.player.dashCooldownFrames,
      dashReady: this.player.dashCooldownFrames === 0,
      shieldFrames: this.player.shieldFrames,
      shieldActive: this.player.shieldFrames > 0,
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
      charms: this.charms,
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
      shieldFrames: 0,
      lastDirection: "down",
    };
  }

  private stepOneFrame(): void {
    this.frame += 1;
    this.player.dashCooldownFrames = Math.max(0, this.player.dashCooldownFrames - 1);
    this.player.invulnerableFrames = Math.max(0, this.player.invulnerableFrames - 1);
    this.player.shieldFrames = Math.max(0, this.player.shieldFrames - 1);

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

  private collectCharmsAtPlayer(): void {
    for (const charm of this.charms) {
      if (!charm.collected && samePoint(charm, this.player)) {
        charm.collected = true;
        this.player.shieldFrames = Math.max(this.player.shieldFrames, CHARM_SHIELD_FRAMES);
      }
    }
  }

  private checkExit(): void {
    if (samePoint(this.player, this.exit) && this.exit.open) {
      this.status = this.level >= MAX_LEVEL ? "completed" : "won";
      this.unlockedLevel = Math.max(this.unlockedLevel, Math.min(MAX_LEVEL, this.level + 1));
    }
  }

  private checkEnemyCollision(): void {
    if (this.status !== "playing" || this.player.invulnerableFrames > 0 || this.player.shieldFrames > 0) {
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
  const normalizedLevel = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return `courier-level-${String(normalizedLevel).padStart(3, "0")}`;
}

interface DifficultyProfile {
  name: string;
  rank: number;
  enemyCount: number;
  chaserAlertRange: number;
  chaserMoveEveryFrames: number;
  patrollerMoveEveryFrames: number;
}

export function getDifficultyProfile(level: number): DifficultyProfile {
  const normalizedLevel = Math.max(1, Math.floor(level));
  if (normalizedLevel === 1) {
    return {
      name: "入门",
      rank: 1,
      enemyCount: 2,
      chaserAlertRange: 4,
      chaserMoveEveryFrames: 26,
      patrollerMoveEveryFrames: 32,
    };
  }
  if (normalizedLevel === 2) {
    return {
      name: "普通",
      rank: 2,
      enemyCount: 3,
      chaserAlertRange: 5,
      chaserMoveEveryFrames: 22,
      patrollerMoveEveryFrames: 28,
    };
  }
  if (normalizedLevel === 3) {
    return {
      name: "紧张",
      rank: 3,
      enemyCount: 4,
      chaserAlertRange: 6,
      chaserMoveEveryFrames: 18,
      patrollerMoveEveryFrames: 24,
    };
  }
  if (normalizedLevel === 4) {
    return {
      name: "困难",
      rank: 4,
      enemyCount: 4,
      chaserAlertRange: 7,
      chaserMoveEveryFrames: 16,
      patrollerMoveEveryFrames: 20,
    };
  }

  return {
    name: "终局",
    rank: 5,
    enemyCount: 4,
    chaserAlertRange: 8,
    chaserMoveEveryFrames: 14,
    patrollerMoveEveryFrames: 18,
  };
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
    ...snapshot.charms.filter((charm) => !charm.collected).map(keyOf),
    keyOf(snapshot.exit),
  ]);
}
