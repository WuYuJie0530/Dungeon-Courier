import { GameEngine } from "./game";
import { Renderer } from "./render";
import { installTestApi } from "./testApi";
import { DASH_COOLDOWN_FRAMES, PLAYER_START_LIVES, TIME_LIMIT_SECONDS, type Direction, type GameStateSnapshot } from "./types";
import "./style.css";

const engine = new GameEngine("courier-001");
const canvas = requiredElement<HTMLCanvasElement>("gameCanvas");
const renderer = new Renderer(canvas);
const seedInput = requiredElement<HTMLInputElement>("seedInput");
const pauseButton = requiredElement<HTMLButtonElement>("pauseButton");
const restartButton = requiredElement<HTMLButtonElement>("restartButton");
const overlayRestartButton = requiredElement<HTMLButtonElement>("overlayRestartButton");
const resultOverlay = requiredElement<HTMLDivElement>("resultOverlay");
const resultTitle = requiredElement<HTMLParagraphElement>("resultTitle");
const hud = {
  lives: requiredElement<HTMLSpanElement>("livesHud"),
  timer: requiredElement<HTMLSpanElement>("timerHud"),
  letters: requiredElement<HTMLSpanElement>("lettersHud"),
  dash: requiredElement<HTMLSpanElement>("dashHud"),
  pause: requiredElement<HTMLSpanElement>("pauseHud"),
  seed: requiredElement<HTMLElement>("seedHud"),
  objective: requiredElement<HTMLElement>("objectiveText"),
  chasers: requiredElement<HTMLElement>("chaserCount"),
  patrollers: requiredElement<HTMLElement>("patrollerCount"),
};

let deterministicTestMode = false;

function renderNow(): void {
  const state = engine.getState();
  renderer.render(engine.getMap(), state);
  updateHud(state);
}

installTestApi(
  engine,
  () => {
    deterministicTestMode = true;
  },
  renderNow,
);

restartButton.addEventListener("click", () => {
  engine.restart(seedInput.value.trim() || "courier-001");
  renderNow();
});

overlayRestartButton.addEventListener("click", () => {
  engine.restart(seedInput.value.trim() || engine.getState().seed);
  renderNow();
});

pauseButton.addEventListener("click", () => {
  engine.togglePause();
  renderNow();
});

window.addEventListener("keydown", (event) => {
  const direction = directionFromKey(event.key);
  if (direction) {
    event.preventDefault();
    if (event.shiftKey) {
      engine.dash(direction);
    } else {
      engine.movePlayer(direction);
    }
    renderNow();
    return;
  }

  if (event.key === " " || event.key === "Shift") {
    event.preventDefault();
    engine.dash(engine.getState().player.lastDirection);
    renderNow();
    return;
  }

  if (event.key.toLowerCase() === "p") {
    engine.togglePause();
    renderNow();
    return;
  }

  if (event.key.toLowerCase() === "r") {
    engine.restart(seedInput.value.trim() || engine.getState().seed);
    renderNow();
  }
});

let lastTime = performance.now();
let frameAccumulator = 0;

function loop(now: number): void {
  const elapsed = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;

  if (!deterministicTestMode) {
    frameAccumulator += elapsed * 60;
    const frames = Math.floor(frameAccumulator);
    if (frames > 0) {
      frameAccumulator -= frames;
      engine.step(frames);
    }
  }

  renderNow();
  requestAnimationFrame(loop);
}

renderNow();
requestAnimationFrame(loop);

function updateHud(state: GameStateSnapshot): void {
  const chasers = state.enemies.filter((enemy) => enemy.kind === "chaser").length;
  const patrollers = state.enemies.length - chasers;
  hud.lives.replaceChildren(...createLifePips(state.lives));
  hud.timer.textContent = `${formatClock(state.timeRemaining)} / ${formatClock(TIME_LIMIT_SECONDS)}`;
  hud.letters.textContent = `${pad2(state.collectedLetters)} / ${pad2(state.totalLetters)}`;
  hud.dash.replaceChildren(...createDashMeter(state.dashCooldownFrames));
  hud.pause.textContent = statusLabel(state.status);
  hud.seed.textContent = state.seed;
  hud.chasers.textContent = String(chasers);
  hud.patrollers.textContent = String(patrollers);
  hud.objective.textContent =
    state.status === "won"
      ? "全部信件已送达，出口路线完成。"
      : state.status === "lost"
        ? "这次派送失败了。重新开始再试一次。"
        : state.exit.open
          ? "出口已经开启，立刻撤离。"
          : "收集所有信件，然后抵达出口。";
  pauseButton.classList.toggle("is-playing", state.status === "paused");
  resultOverlay.hidden = state.status !== "won" && state.status !== "lost";
  resultTitle.textContent = state.status === "won" ? "派送完成" : "信使倒下";
}

function createLifePips(lives: number): HTMLElement[] {
  return Array.from({ length: PLAYER_START_LIVES }, (_, index) => {
    const pip = document.createElement("span");
    pip.className = index < lives ? "life-pip" : "life-pip empty";
    pip.setAttribute("aria-label", index < lives ? "剩余生命" : "失去生命");
    return pip;
  });
}

function createDashMeter(cooldownFrames: number): HTMLElement[] {
  const readyRatio = cooldownFrames === 0 ? 1 : 1 - cooldownFrames / DASH_COOLDOWN_FRAMES;
  const readyCells = Math.max(0, Math.min(5, Math.floor(readyRatio * 5)));
  const cells = Array.from({ length: 5 }, (_, index) => {
    const cell = document.createElement("span");
    cell.className = index < readyCells ? "dash-cell ready" : "dash-cell";
    return cell;
  });
  const text = document.createElement("span");
  text.className = "dash-text";
  text.textContent = cooldownFrames === 0 ? "就绪" : `${(cooldownFrames / 60).toFixed(1)}秒`;
  return [...cells, text];
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${pad2(minutes)}:${pad2(rest)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function statusLabel(status: GameStateSnapshot["status"]): string {
  switch (status) {
    case "paused":
      return "已暂停";
    case "won":
      return "已完成";
    case "lost":
      return "失败";
    default:
      return "进行中";
  }
}

function directionFromKey(key: string): Direction | null {
  switch (key.toLowerCase()) {
    case "w":
    case "arrowup":
      return "up";
    case "s":
    case "arrowdown":
      return "down";
    case "a":
    case "arrowleft":
      return "left";
    case "d":
    case "arrowright":
      return "right";
    default:
      return null;
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}.`);
  }
  return element as T;
}
