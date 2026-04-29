import { AudioManager } from "./audio";
import { GameEngine } from "./game";
import { gradeFromState, loadProgress, saveProgress, updateProgressWithResult, type ProgressData } from "./progress";
import { Renderer } from "./render";
import { installTestApi } from "./testApi";
import {
  CHARM_SHIELD_FRAMES,
  DASH_COOLDOWN_FRAMES,
  MAX_LEVEL,
  PLAYER_START_LIVES,
  type Direction,
  type GameStateSnapshot,
} from "./types";
import "./style.css";

const engine = new GameEngine();
let progressData: ProgressData = loadProgress();
engine.setUnlockedLevel(progressData.unlockedLevel);
const audio = new AudioManager();
const appShell = requiredElement<HTMLDivElement>("app");
const startOverlay = requiredElement<HTMLDivElement>("startOverlay");
const startGameButton = requiredElement<HTMLButtonElement>("startGameButton");
const startHelpButton = requiredElement<HTMLButtonElement>("startHelpButton");
const startLevelSelectButton = requiredElement<HTMLButtonElement>("startLevelSelectButton");
const startHelpPanel = requiredElement<HTMLDivElement>("startHelpPanel");
const startHelpClose = requiredElement<HTMLButtonElement>("startHelpClose");
const canvas = requiredElement<HTMLCanvasElement>("gameCanvas");
const renderer = new Renderer(canvas);
const pauseButton = requiredElement<HTMLButtonElement>("pauseButton");
const soundButton = requiredElement<HTMLButtonElement>("soundButton");
const soundPanel = requiredElement<HTMLDivElement>("soundPanel");
const muteButton = requiredElement<HTMLButtonElement>("muteButton");
const sfxVolumeInput = requiredElement<HTMLInputElement>("sfxVolumeInput");
const sfxVolumeValue = requiredElement<HTMLOutputElement>("sfxVolumeValue");
const musicVolumeInput = requiredElement<HTMLInputElement>("musicVolumeInput");
const musicVolumeValue = requiredElement<HTMLOutputElement>("musicVolumeValue");
const touchControls = requiredElement<HTMLElement>("touchControls");
const touchDashButton = requiredElement<HTMLButtonElement>("touchDashButton");
const touchPauseButton = requiredElement<HTMLButtonElement>("touchPauseButton");
const overlayRestartButton = requiredElement<HTMLButtonElement>("overlayRestartButton");
const overlayRetryButton = requiredElement<HTMLButtonElement>("overlayRetryButton");
const resultLevelSelectButton = requiredElement<HTMLButtonElement>("resultLevelSelectButton");
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
  shield: requiredElement<HTMLSpanElement>("shieldHud"),
  pause: requiredElement<HTMLSpanElement>("pauseHud"),
  level: requiredElement<HTMLElement>("levelHud"),
  difficulty: requiredElement<HTMLElement>("difficultyHud"),
  objective: requiredElement<HTMLElement>("objectiveText"),
  chasers: requiredElement<HTMLElement>("chaserCount"),
  patrollers: requiredElement<HTMLElement>("patrollerCount"),
  charms: requiredElement<HTMLElement>("charmCount"),
};

let deterministicTestMode = false;
let gameStarted = false;
let levelSelectRenderKey = "";
let lastAudioState: GameStateSnapshot | null = null;
const touchHoldTimers = new Map<Direction, number>();

function renderNow(): void {
  const state = engine.getState();
  persistProgressResult(lastAudioState, state);
  if (gameStarted) {
    playStateAudio(lastAudioState, state);
  }
  lastAudioState = state;
  audio.updateMusic(state.status);
  renderer.render(engine.getMap(), state);
  updateHud(state);
}

audio.load();
updateSoundButton();
updateVolumePanel();

window.addEventListener(
  "pointerdown",
  () => {
    unlockMusic();
  },
  { passive: true },
);

installTestApi(
  engine,
  () => {
    deterministicTestMode = true;
  },
  renderNow,
);

startGameButton.addEventListener("click", () => {
  beginGame();
});

startHelpButton.addEventListener("click", () => {
  unlockMusic();
  audio.play("click");
  setStartHelpOpen(startHelpPanel.hidden);
});

startHelpClose.addEventListener("click", () => {
  unlockMusic();
  audio.play("click");
  setStartHelpOpen(false);
});

startLevelSelectButton.addEventListener("click", () => {
  unlockMusic();
  audio.play("click");
  openLevelSelect();
});

overlayRestartButton.addEventListener("click", () => {
  audio.enableMusic();
  audio.play("click");
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
  audio.enableMusic();
  audio.play("click");
  engine.restartLevel();
  renderNow();
});

resultLevelSelectButton.addEventListener("click", () => {
  audio.enableMusic();
  audio.play("click");
  openLevelSelect();
});

campaignRestartButton.addEventListener("click", () => {
  audio.enableMusic();
  audio.play("click");
  engine.restartCampaign();
  renderNow();
});

levelSelectButton.addEventListener("click", () => {
  audio.enableMusic();
  audio.play("click");
  openLevelSelect();
});

levelSelectClose.addEventListener("click", () => {
  audio.enableMusic();
  audio.play("click");
  closeLevelSelect();
});

levelSelectOverlay.addEventListener("click", (event) => {
  if (event.target === levelSelectOverlay) {
    closeLevelSelect();
  }
});

pauseButton.addEventListener("click", () => {
  audio.enableMusic();
  audio.play("click");
  engine.togglePause();
  renderNow();
});

soundButton.addEventListener("click", () => {
  audio.enableMusic();
  audio.play("click");
  setSoundPanelOpen(soundPanel.hidden);
});

muteButton.addEventListener("click", () => {
  audio.enableMusic();
  const muted = audio.toggleMuted();
  updateVolumePanel();
  if (!muted) {
    audio.play("click");
    audio.updateMusic(engine.getState().status);
  }
});

sfxVolumeInput.addEventListener("input", () => {
  audio.setSfxVolume(Number(sfxVolumeInput.value) / 100);
  updateVolumePanel();
});

sfxVolumeInput.addEventListener("change", () => {
  audio.enableMusic();
  audio.play("click");
});

musicVolumeInput.addEventListener("input", () => {
  audio.setMusicVolume(Number(musicVolumeInput.value) / 100);
  updateVolumePanel();
  audio.updateMusic(engine.getState().status);
});

for (const button of touchControls.querySelectorAll<HTMLButtonElement>("[data-touch-direction]")) {
  const direction = directionFromKey(button.dataset.touchDirection ?? "");
  if (direction) {
    bindHoldButton(button, direction);
  }
}

touchDashButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  dashByTouch();
});

touchPauseButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  pauseByTouch();
});

window.addEventListener("keydown", (event) => {
  unlockMusic();
  if (!gameStarted) {
    if (event.key === "Escape") {
      if (!levelSelectOverlay.hidden) {
        closeLevelSelect();
      } else if (!startHelpPanel.hidden) {
        setStartHelpOpen(false);
      }
    }
    return;
  }

  audio.enableMusic();
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
    audio.play("click");
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

  if (!deterministicTestMode && gameStarted) {
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

function playStateAudio(previous: GameStateSnapshot | null, current: GameStateSnapshot): void {
  if (!previous) {
    return;
  }

  if (current.collectedLetters > previous.collectedLetters) {
    audio.play("pickup");
  }
  if (!previous.exit.open && current.exit.open) {
    audio.play("unlock");
  }
  if (current.lives < previous.lives) {
    audio.play("hit");
  }
  if (previous.dashCooldownFrames === 0 && current.dashCooldownFrames > 0) {
    audio.play("dash");
  }
  if (previous.status !== current.status) {
    if (previous.status === "playing" && (current.status === "won" || current.status === "completed")) {
      audio.play("win");
    } else if (previous.status === "playing" && current.status === "lost") {
      audio.play("lose");
    }
  }
}

function bindHoldButton(button: HTMLButtonElement, direction: Direction): void {
  const stop = () => stopTouchHold(direction);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    moveByTouch(direction);
    stopTouchHold(direction);
    touchHoldTimers.set(direction, window.setInterval(() => moveByTouch(direction), 150));
  });
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);
  button.addEventListener("lostpointercapture", stop);
}

function moveByTouch(direction: Direction): void {
  unlockMusic();
  if (!gameStarted) {
    return;
  }
  engine.movePlayer(direction);
  renderNow();
}

function dashByTouch(): void {
  unlockMusic();
  if (!gameStarted) {
    return;
  }
  engine.dash(engine.getState().player.lastDirection);
  renderNow();
}

function pauseByTouch(): void {
  unlockMusic();
  if (!gameStarted) {
    return;
  }
  engine.togglePause();
  audio.play("click");
  renderNow();
}

function stopTouchHold(direction: Direction): void {
  const timer = touchHoldTimers.get(direction);
  if (timer !== undefined) {
    window.clearInterval(timer);
    touchHoldTimers.delete(direction);
  }
}

function updateSoundButton(): void {
  const muted = audio.isMuted();
  soundButton.textContent = muted ? "🔇 Muted" : "🔊 Sound";
  soundButton.setAttribute("aria-pressed", String(muted));
}

function setSoundPanelOpen(open: boolean): void {
  soundPanel.hidden = !open;
  soundButton.setAttribute("aria-expanded", String(open));
  updateVolumePanel();
}

function updateVolumePanel(): void {
  const settings = audio.getSettings();
  const sfxPercent = Math.round(settings.sfxVolume * 100);
  const musicPercent = Math.round(settings.musicVolume * 100);

  updateSoundButton();
  muteButton.textContent = settings.muted ? "🔇 Muted" : "🔊 Sound";
  muteButton.setAttribute("aria-pressed", String(settings.muted));
  sfxVolumeInput.value = String(sfxPercent);
  musicVolumeInput.value = String(musicPercent);
  sfxVolumeValue.textContent = `${sfxPercent}%`;
  musicVolumeValue.textContent = `${musicPercent}%`;
}

function beginGame(playFeedback = true): void {
  gameStarted = true;
  startOverlay.hidden = true;
  setStartHelpOpen(false);
  unlockMusic();
  if (playFeedback) {
    audio.play("click");
  }
  renderNow();
}

function unlockMusic(): void {
  audio.enableMusic();
  audio.updateMusic(engine.getState().status);
}

function setStartHelpOpen(open: boolean): void {
  startHelpPanel.hidden = !open;
  startHelpButton.setAttribute("aria-expanded", String(open));
}

function updateHud(state: GameStateSnapshot): void {
  const chasers = state.enemies.filter((enemy) => enemy.kind === "chaser").length;
  const patrollers = state.enemies.length - chasers;
  hud.lives.replaceChildren(...createLifePips(state.lives));
  hud.timer.textContent = formatClock(state.timeRemaining);
  hud.letters.textContent = `${pad2(state.collectedLetters)} / ${pad2(state.totalLetters)}`;
  hud.dash.replaceChildren(...createDashMeter(state.dashCooldownFrames));
  hud.shield.replaceChildren(...createShieldMeter(state.shieldFrames, state.totalCharms - state.collectedCharms));
  hud.pause.textContent = statusLabel(state.status);
  hud.level.textContent = `第 ${state.level} 关`;
  hud.difficulty.textContent = state.difficultyName;
  hud.chasers.textContent = String(chasers);
  hud.patrollers.textContent = String(patrollers);
  hud.charms.textContent = `${state.collectedCharms} / ${state.totalCharms}`;
  appShell.classList.toggle("is-failed-state", state.status === "lost");
  appShell.classList.toggle("is-success-state", state.status === "won" || state.status === "completed");
  hud.objective.textContent = objectiveText(state);
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
  startLevelSelectButton.setAttribute("aria-expanded", "true");
  renderLevelSelect(engine.getState());
}

function closeLevelSelect(): void {
  levelSelectOverlay.hidden = true;
  levelSelectButton.setAttribute("aria-expanded", "false");
  startLevelSelectButton.setAttribute("aria-expanded", "false");
}

function renderLevelSelect(state: GameStateSnapshot): void {
  const savedRecords = progressData.records;
  const recordCount = Object.keys(savedRecords).length;
  const renderKey = `${state.level}:${state.unlockedLevel}:${state.maxLevel}:${progressData.unlockedLevel}:${JSON.stringify(savedRecords)}`;
  if (renderKey === levelSelectRenderKey && levelSelectGrid.children.length > 0) {
    return;
  }
  levelSelectRenderKey = renderKey;
  levelSelectSummary.textContent = `已解锁 ${state.unlockedLevel} / ${state.maxLevel} · 最佳记录 ${recordCount} / ${state.maxLevel}`;
  levelSelectGrid.replaceChildren(
    ...Array.from({ length: state.maxLevel }, (_, index) => {
      const level = index + 1;
      const unlocked = level <= state.unlockedLevel;
      const current = level === state.level;
      const record = savedRecords[level];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-choice";
      button.disabled = !unlocked;
      button.dataset.level = String(level);
      button.setAttribute("aria-current", current ? "true" : "false");

      const title = document.createElement("span");
      title.textContent = `第 ${level} 关`;
      const detail = document.createElement("small");
      detail.textContent = record ? `最佳 ${record.grade} · ${formatClock(record.timeRemaining)}` : current ? "当前关卡" : unlocked ? "已解锁" : "未解锁";
      button.replaceChildren(title, detail);

      if (unlocked) {
        button.addEventListener("click", () => {
          audio.enableMusic();
          audio.play("click");
          engine.selectLevel(level);
          closeLevelSelect();
          if (!gameStarted) {
            beginGame(false);
          }
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
  const nextLevel = Math.min(state.level + 1, MAX_LEVEL);
  const grade = gradeFromState(state);

  resultOverlay.classList.toggle("level-complete", wonLevel);
  resultOverlay.classList.toggle("campaign-complete", completedCampaign);
  resultOverlay.classList.toggle("level-failed", failedLevel);
  resultTitle.textContent = completedCampaign ? "任务完成" : wonLevel ? "关卡完成" : "任务失败";
  resultSubtitle.textContent = completedCampaign
    ? "信件已全部送达，成功脱出！"
    : wonLevel
      ? `第 ${state.level} 关完成，第 ${nextLevel} 关已解锁。`
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
  overlayRestartButton.textContent = completedCampaign ? "重新挑战五关" : wonLevel ? `进入第 ${nextLevel} 关` : "重新开始本关";
  resultLevelSelectButton.hidden = completedCampaign;
  overlayRestartButton.hidden = failedLevel;
  campaignRestartButton.hidden = true;
}

function persistProgressResult(previous: GameStateSnapshot | null, current: GameStateSnapshot): void {
  if (!previous || previous.status !== "playing" || (current.status !== "won" && current.status !== "completed")) {
    return;
  }
  progressData = updateProgressWithResult(progressData, current);
  saveProgress(progressData);
  engine.setUnlockedLevel(progressData.unlockedLevel);
  levelSelectRenderKey = "";
}

function objectiveText(state: GameStateSnapshot): string {
  if (state.status === "completed") {
    return "五关任务全部完成，地牢邮路已打通。";
  }
  if (state.status === "won") {
    return `第 ${state.level} 关完成。进入下一关继续派送。`;
  }
  if (state.status === "lost") {
    return "本关失败。复盘路线，重新突破。";
  }
  if (state.level === 1) {
    if (state.exit.open) {
      return "信件已收齐，前往出口完成派送。";
    }
    if (state.collectedLetters === 0) {
      return "先收集附近的第一封信。";
    }
    if (state.collectedLetters === 1) {
      return "出口还未开启，继续寻找剩余信件。";
    }
    return "最后一封信在危险区附近，必要时使用护符或冲刺。";
  }
  if (state.shieldActive) {
    return "护符屏障生效，利用窗口穿过危险区域。";
  }
  if (state.exit.open) {
    return "出口已经开启，立刻撤离。";
  }
  return "收集所有信件，然后抵达出口。";
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

function createShieldMeter(shieldFrames: number, remainingCharms: number): HTMLElement[] {
  const shieldRatio = shieldFrames === 0 ? 0 : shieldFrames / CHARM_SHIELD_FRAMES;
  const activeCells = Math.max(0, Math.min(5, Math.ceil(shieldRatio * 5)));
  const cells = Array.from({ length: 5 }, (_, index) => {
    const cell = document.createElement("span");
    cell.className = index < activeCells ? "shield-cell active" : "shield-cell";
    return cell;
  });
  const text = document.createElement("span");
  text.className = "shield-text";
  text.textContent = shieldFrames > 0 ? `${(shieldFrames / 60).toFixed(1)}秒` : remainingCharms > 0 ? "待拾取" : "已用完";
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
    case "up":
    case "w":
    case "arrowup":
      return "up";
    case "down":
    case "s":
    case "arrowdown":
      return "down";
    case "left":
    case "a":
    case "arrowleft":
      return "left";
    case "right":
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
