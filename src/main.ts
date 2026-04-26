import { GameEngine } from "./game";
import { Renderer } from "./render";
import { installTestApi } from "./testApi";
import {
  DASH_COOLDOWN_FRAMES,
  MAX_LEVEL,
  PLAYER_START_LIVES,
  TIME_LIMIT_SECONDS,
  type Direction,
  type GameStateSnapshot,
} from "./types";
import "./style.css";

const engine = new GameEngine();
const appShell = requiredElement<HTMLDivElement>("app");
const canvas = requiredElement<HTMLCanvasElement>("gameCanvas");
const renderer = new Renderer(canvas);
const pauseButton = requiredElement<HTMLButtonElement>("pauseButton");
const restartButton = requiredElement<HTMLButtonElement>("restartButton");
const overlayRestartButton = requiredElement<HTMLButtonElement>("overlayRestartButton");
const overlayRetryButton = requiredElement<HTMLButtonElement>("overlayRetryButton");
const campaignRestartButton = requiredElement<HTMLButtonElement>("campaignRestartButton");
const levelSelectButton = requiredElement<HTMLButtonElement>("levelSelectButton");
const levelSelectOverlay = requiredElement<HTMLDivElement>("levelSelectOverlay");
const levelSelectGrid = requiredElement<HTMLDivElement>("levelSelectGrid");
const levelSelectSummary = requiredElement<HTMLElement>("levelSelectSummary");
const levelSelectClose = requiredElement<HTMLButtonElement>("levelSelectClose");
const resultOverlay = requiredElement<HTMLDivElement>("resultOverlay");
const resultTitle = requiredElement<HTMLParagraphElement>("resultTitle");
const resultSubtitle = requiredElement<HTMLParagraphElement>("resultSubtitle");
const resultLevel = requiredElement<HTMLElement>("resultLevel");
const resultTime = requiredElement<HTMLElement>("resultTime");
const resultLetters = requiredElement<HTMLElement>("resultLetters");
const resultLives = requiredElement<HTMLElement>("resultLives");
const resultGrade = requiredElement<HTMLElement>("resultGrade");
const resultPraise = requiredElement<HTMLElement>("resultPraise");
const hud = {
  lives: requiredElement<HTMLSpanElement>("livesHud"),
  timer: requiredElement<HTMLSpanElement>("timerHud"),
  letters: requiredElement<HTMLSpanElement>("lettersHud"),
  dash: requiredElement<HTMLSpanElement>("dashHud"),
  pause: requiredElement<HTMLSpanElement>("pauseHud"),
  level: requiredElement<HTMLElement>("levelHud"),
  difficulty: requiredElement<HTMLElement>("difficultyHud"),
  objective: requiredElement<HTMLElement>("objectiveText"),
  chasers: requiredElement<HTMLElement>("chaserCount"),
  patrollers: requiredElement<HTMLElement>("patrollerCount"),
};

let deterministicTestMode = false;
let levelSelectRenderKey = "";

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
  engine.restartLevel();
  renderNow();
});

overlayRestartButton.addEventListener("click", () => {
  const status = engine.getState().status;
  if (status === "won") {
    engine.nextLevel();
  } else if (status === "completed") {
    engine.restartCampaign();
  } else {
    engine.restartLevel();
  }
  renderNow();
});

overlayRetryButton.addEventListener("click", () => {
  engine.restartLevel();
  renderNow();
});

campaignRestartButton.addEventListener("click", () => {
  engine.restartCampaign();
  renderNow();
});

levelSelectButton.addEventListener("click", () => {
  openLevelSelect();
});

levelSelectClose.addEventListener("click", () => {
  closeLevelSelect();
});

levelSelectOverlay.addEventListener("click", (event) => {
  if (event.target === levelSelectOverlay) {
    closeLevelSelect();
  }
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
    engine.restartLevel();
    renderNow();
    return;
  }

  if (event.key === "Escape" && !levelSelectOverlay.hidden) {
    closeLevelSelect();
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
  hud.level.textContent = `第 ${state.level} 关`;
  hud.difficulty.textContent = state.difficultyName;
  hud.chasers.textContent = String(chasers);
  hud.patrollers.textContent = String(patrollers);
  appShell.classList.toggle("is-failed-state", state.status === "lost");
  hud.objective.textContent =
    state.status === "completed"
      ? "五关任务全部完成，地牢邮路已打通。"
      : state.status === "won"
        ? `第 ${state.level} 关完成。进入下一关继续派送。`
      : state.status === "lost"
        ? "本关失败。复盘路线，重新突破。"
        : state.exit.open
          ? "出口已经开启，立刻撤离。"
          : "收集所有信件，然后抵达出口。";
  pauseButton.classList.toggle("is-playing", state.status === "paused");
  levelSelectButton.setAttribute("aria-expanded", String(!levelSelectOverlay.hidden));
  if (!levelSelectOverlay.hidden) {
    renderLevelSelect(state);
  }
  resultOverlay.hidden = state.status !== "won" && state.status !== "lost" && state.status !== "completed";
  updateResultOverlay(state);
}

function openLevelSelect(): void {
  levelSelectOverlay.hidden = false;
  levelSelectButton.setAttribute("aria-expanded", "true");
  renderLevelSelect(engine.getState());
}

function closeLevelSelect(): void {
  levelSelectOverlay.hidden = true;
  levelSelectButton.setAttribute("aria-expanded", "false");
}

function renderLevelSelect(state: GameStateSnapshot): void {
  const renderKey = `${state.level}:${state.unlockedLevel}:${state.maxLevel}`;
  if (renderKey === levelSelectRenderKey && levelSelectGrid.children.length > 0) {
    return;
  }
  levelSelectRenderKey = renderKey;
  levelSelectSummary.textContent = `已解锁 ${state.unlockedLevel} / ${state.maxLevel}`;
  levelSelectGrid.replaceChildren(
    ...Array.from({ length: state.maxLevel }, (_, index) => {
      const level = index + 1;
      const unlocked = level <= state.unlockedLevel;
      const current = level === state.level;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-choice";
      button.disabled = !unlocked;
      button.dataset.level = String(level);
      button.setAttribute("aria-current", current ? "true" : "false");

      const title = document.createElement("span");
      title.textContent = `第 ${level} 关`;
      const detail = document.createElement("small");
      detail.textContent = current ? "当前关卡" : unlocked ? "已解锁" : "未解锁";
      button.replaceChildren(title, detail);

      if (unlocked) {
        button.addEventListener("click", () => {
          engine.selectLevel(level);
          closeLevelSelect();
          renderNow();
        });
      }
      return button;
    }),
  );
}

function updateResultOverlay(state: GameStateSnapshot): void {
  const wonLevel = state.status === "won";
  const completedCampaign = state.status === "completed";
  const failedLevel = state.status === "lost";
  const grade = completedCampaign ? "S+" : state.lives >= 3 && state.timeRemaining >= 45 ? "S" : state.lives >= 2 ? "A" : "B";

  resultOverlay.classList.toggle("campaign-complete", completedCampaign);
  resultOverlay.classList.toggle("level-failed", failedLevel);
  resultTitle.textContent = completedCampaign ? "任务完成" : wonLevel ? "关卡完成" : "任务失败";
  resultSubtitle.textContent = completedCampaign
    ? "信件已全部送达，成功脱出！"
    : wonLevel
      ? `第 ${state.level} 关完成，下一关难度将提升。`
      : "行动失败，潜入暴露，目标未达成。";
  resultLevel.textContent = `${Math.min(state.level, MAX_LEVEL)} / ${MAX_LEVEL}`;
  resultTime.textContent = formatClock(state.timeRemaining);
  resultLetters.textContent = `${pad2(state.collectedLetters)} / ${pad2(state.totalLetters)}`;
  resultLives.textContent = String(state.lives);
  resultGrade.textContent = failedLevel ? "F" : grade;
  resultPraise.textContent = completedCampaign
    ? "完美潜入，表现出色！"
    : wonLevel
      ? "路线清晰，继续保持。"
      : "别急，失败乃潜行之常态。复盘路线，再次尝试突破。";
  overlayRetryButton.textContent = failedLevel ? "再次挑战" : "重玩本关";
  overlayRestartButton.textContent = completedCampaign ? "重新挑战五关" : wonLevel ? "进入下一关" : "重新开始本关";
  campaignRestartButton.hidden = failedLevel;
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
      return "关卡完成";
    case "completed":
      return "任务完成";
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
