import { TILE_SIZE, type Direction, type Enemy, type GameStateSnapshot, type GridPoint, type MapData } from "./types";

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is unavailable.");
    }
    this.ctx = ctx;
  }

  render(map: MapData, state: GameStateSnapshot): void {
    this.ensureCanvasSize(map);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawMap(map);
    this.drawDecorations(map);
    this.drawExit(state);
    this.drawLetters(state);
    this.drawEnemyVision(state.enemies);
    this.drawEnemies(state.enemies);
    this.drawPlayer(state);
    this.drawStatusVeil(state);
  }

  private ensureCanvasSize(map: MapData): void {
    const width = map.width * TILE_SIZE;
    const height = map.height * TILE_SIZE;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private drawMap(map: MapData): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, "#0b0c0d");
    gradient.addColorStop(1, "#030405");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        if (map.tiles[y][x] === 1) {
          this.drawFloorTile(map, x, y);
        }
      }
    }

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        if (map.tiles[y][x] === 0) {
          this.drawWallTile(map, x, y);
        }
      }
    }
  }

  private drawFloorTile(map: MapData, x: number, y: number): void {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const hash = hashCell(map.seed, x, y);
    const shade = 30 + (hash % 12);
    this.ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 4})`;
    this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    this.ctx.strokeStyle = "rgba(121, 114, 100, 0.24)";
    this.ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.36)";
    this.ctx.beginPath();
    this.ctx.moveTo(px + 1, py + TILE_SIZE - 1);
    this.ctx.lineTo(px + TILE_SIZE - 1, py + TILE_SIZE - 1);
    this.ctx.stroke();

    if (hash % 9 === 0) {
      this.ctx.strokeStyle = "rgba(5, 6, 7, 0.48)";
      this.ctx.beginPath();
      this.ctx.moveTo(px + 5, py + 7);
      this.ctx.lineTo(px + 12, py + 10);
      this.ctx.lineTo(px + 18, py + 8);
      this.ctx.stroke();
    }
  }

  private drawWallTile(map: MapData, x: number, y: number): void {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const nearFloor = hasAdjacentFloor(map, x, y);
    if (!nearFloor) {
      this.ctx.fillStyle = "#050607";
      this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      this.ctx.strokeStyle = "rgba(20, 24, 28, 0.35)";
      this.ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      return;
    }

    const hash = hashCell(map.seed, x, y);
    const shade = 58 + (hash % 22);
    this.ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade - 3})`;
    this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    this.ctx.fillStyle = `rgba(255, 239, 204, ${0.1 + (hash % 5) / 50})`;
    this.ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, 5);
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.33)";
    this.ctx.fillRect(px + 2, py + TILE_SIZE - 6, TILE_SIZE - 4, 4);
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    this.ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

    if (hash % 5 === 0) {
      this.ctx.strokeStyle = "rgba(13, 15, 16, 0.55)";
      this.ctx.beginPath();
      this.ctx.moveTo(px + 5, py + 5);
      this.ctx.lineTo(px + 10, py + 12);
      this.ctx.lineTo(px + 8, py + 20);
      this.ctx.stroke();
    }
  }

  private drawDecorations(map: MapData): void {
    for (let y = 1; y < map.height - 1; y += 1) {
      for (let x = 1; x < map.width - 1; x += 1) {
        if (map.tiles[y][x] !== 1) {
          continue;
        }
        const hash = hashCell(map.seed, x, y);
        if (hash % 163 === 0) {
          this.drawBarrel(x, y);
        } else if (hash % 181 === 0) {
          this.drawCrate(x, y);
        } else if (hash % 211 === 0) {
          this.drawRubble(x, y);
        } else if (hash % 257 === 0) {
          this.drawCobweb(x, y);
        } else if (hash % 337 === 0 && touchesWall(map, x, y)) {
          this.drawTorch(x, y);
        }
      }
    }
  }

  private drawTorch(x: number, y: number): void {
    const cx = x * TILE_SIZE + TILE_SIZE / 2;
    const cy = y * TILE_SIZE + TILE_SIZE / 2;
    const glow = this.ctx.createRadialGradient(cx, cy, 2, cx, cy, 35);
    glow.addColorStop(0, "rgba(255, 188, 55, 0.7)");
    glow.addColorStop(1, "rgba(255, 126, 28, 0)");
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(cx - 36, cy - 36, 72, 72);
    this.ctx.fillStyle = "#6b3818";
    this.ctx.fillRect(cx - 2, cy + 3, 4, 10);
    this.ctx.fillStyle = "#ffb833";
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy - 10);
    this.ctx.quadraticCurveTo(cx + 7, cy - 1, cx, cy + 6);
    this.ctx.quadraticCurveTo(cx - 7, cy - 1, cx, cy - 10);
    this.ctx.fill();
  }

  private drawBarrel(x: number, y: number): void {
    const px = x * TILE_SIZE + 5;
    const py = y * TILE_SIZE + 4;
    this.ctx.fillStyle = "#7b4d25";
    this.ctx.fillRect(px, py + 3, 14, 15);
    this.ctx.fillStyle = "#9d6a32";
    this.ctx.fillRect(px + 2, py, 10, 20);
    this.ctx.strokeStyle = "#2c1b0d";
    this.ctx.strokeRect(px + 2.5, py + 0.5, 9, 19);
    this.ctx.beginPath();
    this.ctx.moveTo(px + 2, py + 7);
    this.ctx.lineTo(px + 12, py + 7);
    this.ctx.moveTo(px + 2, py + 14);
    this.ctx.lineTo(px + 12, py + 14);
    this.ctx.stroke();
  }

  private drawCrate(x: number, y: number): void {
    const px = x * TILE_SIZE + 4;
    const py = y * TILE_SIZE + 5;
    this.ctx.fillStyle = "#6d4522";
    this.ctx.fillRect(px, py, 16, 15);
    this.ctx.strokeStyle = "#2b1a0c";
    this.ctx.strokeRect(px + 0.5, py + 0.5, 15, 14);
    this.ctx.beginPath();
    this.ctx.moveTo(px + 2, py + 2);
    this.ctx.lineTo(px + 14, py + 13);
    this.ctx.moveTo(px + 14, py + 2);
    this.ctx.lineTo(px + 2, py + 13);
    this.ctx.stroke();
  }

  private drawRubble(x: number, y: number): void {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    this.ctx.fillStyle = "#565553";
    this.ctx.fillRect(px + 5, py + 14, 6, 4);
    this.ctx.fillRect(px + 13, py + 8, 4, 6);
    this.ctx.fillRect(px + 16, py + 16, 4, 3);
  }

  private drawCobweb(x: number, y: number): void {
    const px = x * TILE_SIZE + 3;
    const py = y * TILE_SIZE + 3;
    this.ctx.strokeStyle = "rgba(210, 210, 195, 0.28)";
    this.ctx.beginPath();
    this.ctx.moveTo(px, py);
    this.ctx.lineTo(px + 16, py + 18);
    this.ctx.moveTo(px + 18, py);
    this.ctx.lineTo(px, py + 18);
    this.ctx.moveTo(px + 9, py);
    this.ctx.lineTo(px + 9, py + 18);
    this.ctx.moveTo(px, py + 9);
    this.ctx.lineTo(px + 18, py + 9);
    this.ctx.stroke();
  }

  private drawExit(state: GameStateSnapshot): void {
    const cx = state.exit.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = state.exit.y * TILE_SIZE + TILE_SIZE / 2;
    const glow = this.ctx.createRadialGradient(cx, cy, 5, cx, cy, state.exit.open ? 58 : 30);
    glow.addColorStop(0, state.exit.open ? "rgba(255, 205, 76, 0.78)" : "rgba(122, 72, 28, 0.38)");
    glow.addColorStop(1, "rgba(255, 175, 40, 0)");
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(cx - 60, cy - 60, 120, 120);

    this.ctx.fillStyle = "#4d2a16";
    this.ctx.beginPath();
    this.ctx.moveTo(cx - 11, cy + 11);
    this.ctx.lineTo(cx - 11, cy - 3);
    this.ctx.quadraticCurveTo(cx, cy - 17, cx + 11, cy - 3);
    this.ctx.lineTo(cx + 11, cy + 11);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = state.exit.open ? "#ffc94e" : "#8c6a44";
    this.ctx.stroke();
    this.ctx.lineWidth = 1;
    this.ctx.fillStyle = state.exit.open ? "#fff0a3" : "#15110d";
    this.ctx.fillRect(cx - 2, cy - 1, 4, 7);
  }

  private drawLetters(state: GameStateSnapshot): void {
    for (const letter of state.letters) {
      if (letter.collected) {
        continue;
      }
      const cx = letter.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = letter.y * TILE_SIZE + TILE_SIZE / 2;
      const glow = this.ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
      glow.addColorStop(0, "rgba(255, 226, 103, 0.68)");
      glow.addColorStop(1, "rgba(255, 201, 76, 0)");
      this.ctx.fillStyle = glow;
      this.ctx.fillRect(cx - 32, cy - 32, 64, 64);
      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.rotate(-0.22);
      this.ctx.fillStyle = "#ffe178";
      this.ctx.fillRect(-10, -7, 20, 14);
      this.ctx.strokeStyle = "#8a5314";
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(-10, -7, 20, 14);
      this.ctx.beginPath();
      this.ctx.moveTo(-10, -7);
      this.ctx.lineTo(0, 1);
      this.ctx.lineTo(10, -7);
      this.ctx.moveTo(-10, 7);
      this.ctx.lineTo(-2, 0);
      this.ctx.moveTo(10, 7);
      this.ctx.lineTo(2, 0);
      this.ctx.stroke();
      this.ctx.restore();
      this.ctx.lineWidth = 1;
    }
  }

  private drawEnemyVision(enemies: Enemy[]): void {
    for (const enemy of enemies) {
      if (enemy.kind !== "chaser") {
        continue;
      }
      const center = tileCenter(enemy);
      this.ctx.save();
      this.ctx.translate(center.x, center.y);
      this.ctx.rotate(directionAngle(enemy.direction));
      this.ctx.fillStyle = "rgba(221, 55, 42, 0.18)";
      this.ctx.strokeStyle = "rgba(221, 55, 42, 0.38)";
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(72, -38);
      this.ctx.lineTo(72, 38);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  private drawEnemies(enemies: Enemy[]): void {
    for (const enemy of enemies) {
      const center = tileCenter(enemy);
      this.ctx.save();
      this.ctx.translate(center.x, center.y);
      if (enemy.kind === "chaser") {
        this.drawChaser();
      } else {
        this.drawPatroller(enemy.direction);
      }
      this.ctx.restore();
    }
  }

  private drawChaser(): void {
    this.ctx.fillStyle = "#8f211f";
    this.ctx.beginPath();
    this.ctx.arc(0, 1, 10, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#ffcc54";
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#1e0908";
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = "#ee4b3b";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(0, 1, 11, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  private drawPatroller(direction: Direction): void {
    this.ctx.rotate(directionAngle(direction));
    this.ctx.fillStyle = "#121316";
    this.ctx.beginPath();
    this.ctx.arc(0, -1, 10, Math.PI, 0);
    this.ctx.lineTo(8, 10);
    this.ctx.lineTo(-8, 10);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.strokeStyle = "#d43b30";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.strokeStyle = "#d7d0c3";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(5, 4);
    this.ctx.lineTo(13, 12);
    this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  private drawPlayer(state: GameStateSnapshot): void {
    const center = tileCenter(state.player);
    const flicker = state.player.invulnerableFrames > 0 && state.frame % 10 < 5;
    this.ctx.save();
    this.ctx.translate(center.x, center.y);
    this.ctx.rotate(directionAngle(state.player.lastDirection));
    this.ctx.fillStyle = "rgba(40, 211, 202, 0.26)";
    this.ctx.beginPath();
    this.ctx.ellipse(-10, 11, 10, 4, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = flicker ? "#b8fff5" : "#22c8c7";
    this.ctx.beginPath();
    this.ctx.arc(0, -2, 9, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#0c5360";
    this.ctx.beginPath();
    this.ctx.arc(0, -7, 8, Math.PI, 0);
    this.ctx.fill();
    this.ctx.fillStyle = "#6b4324";
    this.ctx.fillRect(-7, 3, 10, 9);
    this.ctx.fillStyle = "#2f1d12";
    this.ctx.fillRect(2, 4, 7, 8);
    this.ctx.restore();
  }

  private drawStatusVeil(state: GameStateSnapshot): void {
    if (state.status === "playing") {
      return;
    }

    this.ctx.fillStyle = "rgba(4, 5, 6, 0.54)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#fff2d1";
    this.ctx.font = "900 42px Microsoft YaHei UI, system-ui, sans-serif";
    this.ctx.textAlign = "center";
    const label = state.status === "paused" ? "已暂停" : state.status === "won" ? "派送完成" : "信使倒下";
    this.ctx.fillText(label, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.font = "700 18px Microsoft YaHei UI, system-ui, sans-serif";
    this.ctx.fillStyle = "#d8ccb7";
    const hint = state.status === "paused" ? "按 P 继续" : "点击重新开始";
    this.ctx.fillText(hint, this.canvas.width / 2, this.canvas.height / 2 + 34);
    this.ctx.textAlign = "start";
  }
}

function tileCenter(point: GridPoint): GridPoint {
  return {
    x: point.x * TILE_SIZE + TILE_SIZE / 2,
    y: point.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

function directionAngle(direction: Direction): number {
  switch (direction) {
    case "right":
      return 0;
    case "down":
      return Math.PI / 2;
    case "left":
      return Math.PI;
    default:
      return -Math.PI / 2;
  }
}

function hasAdjacentFloor(map: MapData, x: number, y: number): boolean {
  return (
    map.tiles[y - 1]?.[x] === 1 ||
    map.tiles[y + 1]?.[x] === 1 ||
    map.tiles[y]?.[x - 1] === 1 ||
    map.tiles[y]?.[x + 1] === 1
  );
}

function touchesWall(map: MapData, x: number, y: number): boolean {
  return (
    map.tiles[y - 1]?.[x] === 0 ||
    map.tiles[y + 1]?.[x] === 0 ||
    map.tiles[y]?.[x - 1] === 0 ||
    map.tiles[y]?.[x + 1] === 0
  );
}

function hashCell(seed: string, x: number, y: number): number {
  let hash = 2166136261;
  const text = `${seed}:${x}:${y}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
