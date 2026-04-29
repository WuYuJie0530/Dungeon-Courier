import { expect, test, type Page } from "@playwright/test";
import type { Direction, GameStateSnapshot, GameTestApi, GridPoint, MapData } from "../../src/types";

interface BrowserHelpers {
  firstOpenDirection(map: MapData, point: GridPoint): Direction;
  findPath(map: MapData, start: GridPoint, goal: GridPoint): GridPoint[];
  followPath(api: GameTestApi, path: GridPoint[]): void;
}

declare global {
  interface Window {
    __GAME_TEST_API__: GameTestApi;
    __TEST_HELPERS__: BrowserHelpers;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__GAME_TEST_API__));
  await page.addScriptTag({ content: browserHelperScript });
  await page.click("#startGameButton");
});

test("browser API exposes deterministic seed control", async ({ page }) => {
  const result = await page.evaluate(() => {
    const first = window.__GAME_TEST_API__.restart("browser-fixed");
    const firstMap = window.__GAME_TEST_API__.getMap();
    const second = window.__GAME_TEST_API__.restart("browser-fixed");
    const secondMap = window.__GAME_TEST_API__.getMap();
    return {
      first,
      second,
      same: JSON.stringify(firstMap) === JSON.stringify(secondMap),
    };
  });

  expect(result.same).toBe(true);
  expect(result.first.status).toBe("playing");
  expect(result.second.collectedLetters).toBe(0);
});

test("start page shows a fresh campaign state before play begins", async ({ page }) => {
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__GAME_TEST_API__));
  await page.addScriptTag({ content: browserHelperScript });

  await expect(page.locator("#startOverlay")).toBeVisible();
  await expect(page.locator("#startGameButton")).toContainText("开始游戏");
  await expect(page.locator("#startProgressText")).toContainText("从第 1 关开始派送");
});

test("player collision stays stable through API movement and dash", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    api.restart("browser-collision");
    for (let i = 0; i < 90; i += 1) {
      api.movePlayer("left");
      api.movePlayer("up");
      api.dash("left");
    }
    const map = api.getMap();
    const state = api.getState();
    return {
      x: state.player.x,
      y: state.player.y,
      floor: map.tiles[state.player.y]?.[state.player.x] === 1,
      lives: state.lives,
    };
  });

  expect(result.x).toBeGreaterThanOrEqual(0);
  expect(result.y).toBeGreaterThanOrEqual(0);
  expect(result.floor).toBe(true);
  expect(result.lives).toBeGreaterThan(0);
});

test("scripted browser route collects all letters and wins", async ({ page }) => {
  const state = await runScriptedWin(page, "browser-win");
  expect(state.status).toBe("won");
  expect(state.collectedLetters).toBe(state.totalLetters);
  await expect(page.locator("#resultTitle")).toContainText("关卡完成");
});

test("winning a level unlocks the next level flow", async ({ page }) => {
  const wonState = await runScriptedWin(page, "browser-level-flow");
  expect(wonState.status).toBe("won");
  await expect(page.locator("#resultSubtitle")).toContainText(`第 ${wonState.level + 1} 关已解锁`);
  await expect(page.locator("#overlayRestartButton")).toContainText(`进入第 ${wonState.level + 1} 关`);
  await expect(page.locator("#campaignRestartButton")).toBeHidden();
  await page.click("#overlayRestartButton");
  const nextState = await page.evaluate(() => window.__GAME_TEST_API__.getState());
  expect(nextState.status).toBe("playing");
  expect(nextState.level).toBe(wonState.level + 1);
  expect(nextState.seed).not.toBe(wonState.seed);
  await expect(page.locator("#levelHud")).toContainText(`第 ${nextState.level} 关`);
});

test("level progress selector only enables unlocked levels", async ({ page }) => {
  await page.click("#levelSelectButton");
  await expect(page.locator("#levelSelectOverlay")).toBeVisible();
  await expect(page.locator('.level-choice[data-level="1"]')).toBeEnabled();
  await expect(page.locator('.level-choice[data-level="1"]')).toContainText("推荐继续");
  await expect(page.locator('.level-choice[data-level="1"] small')).toContainText("待挑战");
  await expect(page.locator('.level-choice[data-level="2"]')).toBeDisabled();
  await expect(page.locator('.level-choice[data-level="2"] small')).toContainText("未解锁");
  await page.click("#levelSelectClose");

  const wonState = await runScriptedWin(page, "browser-level-select");
  expect(wonState.unlockedLevel).toBe(2);

  await expect(page.locator("#resultLevelSelectButton")).toContainText("关卡进度");
  await page.click("#resultLevelSelectButton");
  await expect(page.locator("#levelSelectOverlay")).toBeVisible();
  await expect(page.locator("#levelSelectSummary")).toContainText("最佳记录 1 / 5");
  await expect(page.locator('.level-choice[data-level="1"] small')).toContainText("最佳");
  await expect(page.locator('.level-choice[data-level="1"] small')).toContainText("用时");
  await expect(page.locator('.level-choice[data-level="2"]')).toContainText("推荐继续");
  await expect(page.locator('.level-choice[data-level="2"] small')).toContainText("待挑战");
  await page.click("#levelSelectClose");

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__GAME_TEST_API__));
  await page.addScriptTag({ content: browserHelperScript });
  await expect(page.locator("#startGameButton")).toContainText("继续游戏");
  await expect(page.locator("#startProgressText")).toContainText("继续第 2 关");
  await page.click("#startGameButton");
  await expect.poll(() => page.evaluate(() => window.__GAME_TEST_API__.getState().level)).toBe(2);

  await page.click("#levelSelectButton");
  await expect(page.locator("#levelSelectSummary")).toContainText("2 / 5");
  await expect(page.locator("#levelSelectSummary")).toContainText("最佳记录 1 / 5");
  await expect(page.locator('.level-choice[data-level="1"] small')).toContainText("最佳");
  await expect(page.locator('.level-choice[data-level="1"] small')).toContainText("用时");
  await expect(page.locator('.level-choice[data-level="2"]')).toBeEnabled();
  await expect(page.locator('.level-choice[data-level="2"]')).toContainText("推荐继续");
  await expect(page.locator('.level-choice[data-level="2"] small')).toContainText("待挑战");
  await expect(page.locator('.level-choice[data-level="3"]')).toBeDisabled();
  await expect(page.locator('.level-choice[data-level="3"] small')).toContainText("未解锁");
  await page.click('.level-choice[data-level="2"]');

  const selectedState = await page.evaluate(() => window.__GAME_TEST_API__.getState());
  expect(selectedState.level).toBe(2);
  expect(selectedState.status).toBe("playing");

  await page.click("#levelSelectButton");
  await page.click('.level-choice[data-level="1"]');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__GAME_TEST_API__));
  await page.addScriptTag({ content: browserHelperScript });
  await page.click("#startGameButton");
  await expect.poll(() => page.evaluate(() => window.__GAME_TEST_API__.getState().level)).toBe(1);

  await page.click("#levelSelectButton");
  await page.click("#resetProgressButton");
  await expect(page.locator("#resetProgressOverlay")).toBeVisible();
  await expect(page.locator("#resetProgressOverlay")).toContainText("将清空已解锁关卡和所有最佳记录");
  await page.click("#cancelResetProgressButton");
  await expect(page.locator("#resetProgressOverlay")).toBeHidden();
  await expect(page.locator('.level-choice[data-level="2"]')).toBeEnabled();

  await page.click("#resetProgressButton");
  await page.click("#confirmResetProgressButton");
  await expect(page.locator("#resetProgressOverlay")).toBeHidden();
  await expect(page.locator("#levelSelectSummary")).toContainText("已解锁 1 / 5");
  await expect(page.locator("#levelSelectSummary")).toContainText("最佳记录 0 / 5");
  await expect(page.locator('.level-choice[data-level="1"]')).toContainText("推荐继续");
  await expect(page.locator('.level-choice[data-level="1"] small')).toContainText("待挑战");
  await expect(page.locator('.level-choice[data-level="2"]')).toBeDisabled();

  const resetProgress = await page.evaluate(() => JSON.parse(localStorage.getItem("dungeon-courier-progress") ?? "{}"));
  expect(resetProgress).toEqual({ unlockedLevel: 1, lastPlayedLevel: 1, records: {} });

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__GAME_TEST_API__));
  await page.addScriptTag({ content: browserHelperScript });
  await expect(page.locator("#startGameButton")).toContainText("开始游戏");
  await expect(page.locator("#startProgressText")).toContainText("从第 1 关开始派送");
  await page.click("#startGameButton");
  await expect.poll(() => page.evaluate(() => window.__GAME_TEST_API__.getState().level)).toBe(1);
});

test("final fifth level shows campaign celebration instead of another level", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    const helpers = window.__TEST_HELPERS__;
    api.restartCampaign();
    while (api.getState().level < api.getState().maxLevel) {
      api.nextLevel();
    }

    const map = api.getMap();
    for (const letter of map.letterSpawns) {
      helpers.followPath(api, helpers.findPath(map, api.getState().player, letter));
    }
    helpers.followPath(api, helpers.findPath(map, api.getState().player, map.exit));
    const completed = api.getState();
    api.nextLevel();
    const afterNext = api.getState();
    return { completed, afterNext };
  });

  expect(result.completed.level).toBe(result.completed.maxLevel);
  expect(result.completed.status).toBe("completed");
  expect(result.completed.campaignCompleted).toBe(true);
  expect(result.afterNext.level).toBe(result.completed.maxLevel);
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("dungeon-courier-progress") ?? "{}"));
  expect(progress.records["5"].grade).toBe("S+");
  expect(progress.lastPlayedLevel).toBe(5);
  await expect(page.locator("#resultTitle")).toContainText("任务完成");
  await expect(page.locator("#overlayRestartButton")).toContainText("重新挑战五关");
  await expect(page.locator("#campaignRestartButton")).toBeHidden();
  await page.click("#levelSelectButton");
  await expect(page.locator("#levelSelectOverlay")).toBeVisible();
  await expect(page.locator('.level-choice[data-level="5"]')).toContainText("推荐继续");
  await expect(page.locator('.level-choice[data-level="5"] small')).toContainText("最佳 S+");
  await expect(page.locator('.level-choice[data-level="5"] small')).toContainText("用时");
  await page.click("#levelSelectClose");
  await page.click("#overlayRestartButton");
  const state = await page.evaluate(() => window.__GAME_TEST_API__.getState());
  expect(state.level).toBe(1);
  expect(state.status).toBe("playing");
});

test("early levels ramp difficulty instead of starting at full pressure", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    api.restart("level-ramp-one");
    const levelOne = api.getState();
    api.nextLevel();
    const levelTwo = api.getState();
    api.nextLevel();
    const levelThree = api.getState();
    return { levelOne, levelTwo, levelThree };
  });

  expect(result.levelOne.difficultyName).toBe("入门");
  expect(result.levelOne.enemies).toHaveLength(2);
  expect(result.levelTwo.enemies.length).toBeGreaterThan(result.levelOne.enemies.length);
  expect(result.levelThree.difficultyRank).toBeGreaterThan(result.levelOne.difficultyRank);
  await expect(page.locator("#difficultyHud")).toContainText(result.levelThree.difficultyName);
});

test("exit is locked before every letter is collected", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    const helpers = window.__TEST_HELPERS__;
    api.restart("browser-locked-exit");
    const map = api.getMap();
    helpers.followPath(api, helpers.findPath(map, api.getState().player, map.exit));
    return api.getState();
  });

  expect(result.status).toBe("playing");
  expect(result.exit.open).toBe(false);
});

test("failure state uses the red mission failure results screen", async ({ page }) => {
  await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    api.restart("browser-failure-screen");
    api.step(90 * 60 + 4);
  });

  await expect(page.locator("#resultOverlay")).toBeVisible();
  await expect(page.locator("#app")).toHaveClass(/is-failed-state/);
  await expect(page.locator("#resultOverlay")).toHaveClass(/level-failed/);
  await expect(page.locator("#resultTitle")).toContainText("任务失败");
  await expect(page.locator("#resultSubtitle")).toContainText("行动失败");
  await expect(page.locator("#resultGrade")).toContainText("F");
  await expect(page.locator("#overlayRetryButton")).toContainText("再次挑战");
  await expect(page.locator("#resultLevelSelectButton")).toContainText("关卡进度");
  await expect(page.locator("#overlayRestartButton")).toBeHidden();
  await page.click("#resultLevelSelectButton");
  await expect(page.locator("#levelSelectOverlay")).toBeVisible();
  await expect(page.locator("#levelSelectSummary")).toContainText("1 / 5");
  await expect(page.locator("#restartButton")).toHaveCount(0);
});

test("pause button freezes step-driven simulation", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST_API__.restart("browser-pause"));
  await page.click("#pauseButton");
  const result = await page.evaluate(() => {
    const before = window.__GAME_TEST_API__.getEntities();
    window.__GAME_TEST_API__.step(240);
    return {
      before,
      after: window.__GAME_TEST_API__.getEntities(),
      state: window.__GAME_TEST_API__.getState(),
    };
  });

  expect(result.after).toEqual(result.before);
  expect(result.state.status).toBe("paused");
});

test("dash cooldown prevents immediate repeated dash", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    const helpers = window.__TEST_HELPERS__;
    api.restart("browser-dash");
    const map = api.getMap();
    const start = api.getState().player;
    const direction = helpers.firstOpenDirection(map, start);
    api.dash(direction);
    const afterFirst = api.getState();
    api.dash(direction);
    const afterSecond = api.getState();
    return { afterFirst, afterSecond };
  });

  expect(result.afterFirst.dashCooldownFrames).toBeGreaterThan(0);
  expect(result.afterSecond.player).toEqual(result.afterFirst.player);
});

test("courier charm activates the shield HUD and blocks the next collision", async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    const helpers = window.__TEST_HELPERS__;
    api.restart("browser-charm-shield");
    const map = api.getMap();
    helpers.followPath(api, helpers.findPath(map, api.getState().player, map.charmSpawns[0]));
    const protectedState = api.getState();
    helpers.followPath(api, helpers.findPath(map, api.getState().player, protectedState.enemies[0]));
    return {
      protectedState,
      afterCollision: api.getState(),
    };
  });

  expect(result.protectedState.shieldActive).toBe(true);
  expect(result.afterCollision.lives).toBe(result.protectedState.lives);
  await expect(page.locator("#shieldHud")).toContainText("秒");
  await expect(page.locator("#charmCount")).toContainText("1 / 1");
});

test("legend uses two visible columns and adapts the narrow pane order", async ({ page }) => {
  const columns = page.locator(".legend-column");
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(0)).toContainText("信件");
  await expect(columns.nth(0)).toContainText("墙体");
  await expect(columns.nth(1)).toContainText("追踪者");
  await expect(columns.nth(1)).toContainText("玩家");
  await expect(page.locator("#legendNextButton")).toHaveCount(0);

  await page.setViewportSize({ width: 980, height: 760 });
  const order = await page.evaluate(() => {
    const canvasTop = document.querySelector(".canvas-panel")!.getBoundingClientRect().top;
    const leftTop = document.querySelector(".left-rail")!.getBoundingClientRect().top;
    const rightTop = document.querySelector(".right-rail")!.getBoundingClientRect().top;
    return { canvasTop, leftTop, rightTop };
  });

  expect(order.canvasTop).toBeLessThan(order.rightTop);
  expect(order.rightTop).toBeLessThan(order.leftTop);
});

test("mobile canvas viewport remains playable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    const helpers = window.__TEST_HELPERS__;
    api.restart("browser-mobile");
    const map = api.getMap();
    const direction = helpers.firstOpenDirection(map, api.getState().player);
    api.movePlayer(direction);
    const state = api.getState();
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    return {
      floor: map.tiles[state.player.y]?.[state.player.x] === 1,
      canvasWidth: rect.width,
      viewportWidth: window.innerWidth,
    };
  });

  expect(result.floor).toBe(true);
  expect(result.canvasWidth).toBeLessThanOrEqual(result.viewportWidth);
});

test("mobile touch controls move, dash, and pause the game", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#touchControls")).toBeVisible();

  const direction = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    const helpers = window.__TEST_HELPERS__;
    api.restart("browser-touch-controls");
    return helpers.firstOpenDirection(api.getMap(), api.getState().player);
  });
  const beforeMove = await page.evaluate(() => window.__GAME_TEST_API__.getState().player);
  await page.locator(`[data-touch-direction="${direction}"]`).click();
  const afterMove = await page.evaluate(() => window.__GAME_TEST_API__.getState().player);
  expect(afterMove).not.toEqual(beforeMove);

  await page.locator("#touchDashButton").click();
  const afterDash = await page.evaluate(() => window.__GAME_TEST_API__.getState());
  expect(afterDash.dashCooldownFrames).toBeGreaterThan(0);

  await page.locator("#touchPauseButton").click();
  await expect.poll(() => page.evaluate(() => window.__GAME_TEST_API__.getState().status)).toBe("paused");
  await page.locator("#touchPauseButton").click();
  await expect.poll(() => page.evaluate(() => window.__GAME_TEST_API__.getState().status)).toBe("playing");
});

test("control instructions switch from keyboard to touch on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".controls-panel .keyboard-control-row").first()).toBeVisible();
  await expect(page.locator(".controls-panel .touch-control-row").first()).toBeHidden();
  await expect(page.locator(".controls-panel")).toContainText("W A S D");
  await expect(page.locator(".controls-panel")).toContainText("Shift");

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__GAME_TEST_API__));
  await page.addScriptTag({ content: browserHelperScript });
  await page.click("#startHelpButton");
  await expect(page.locator("#startHelpPanel .keyboard-control-row").first()).toBeVisible();
  await expect(page.locator("#startHelpPanel .touch-control-row").first()).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#startHelpPanel .keyboard-control-row").first()).toBeHidden();
  await expect(page.locator("#startHelpPanel .touch-control-row").first()).toBeVisible();
  await expect(page.locator("#startHelpPanel")).toContainText("方向键");
  await expect(page.locator("#startHelpPanel")).toContainText("按当前朝向冲刺");
  await expect(page.locator("#startHelpPanel")).toContainText("暂停 / 继续");

  await page.click("#startGameButton");
  await expect(page.locator(".controls-panel .keyboard-control-row").first()).toBeHidden();
  await expect(page.locator(".controls-panel .touch-control-row").first()).toBeVisible();
  await expect(page.locator(".controls-panel")).toContainText("方向键");
  await expect(page.locator(".controls-panel")).toContainText("按当前朝向冲刺");
});

test("mobile touch hold repeats movement and start overlay blocks touch input", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const direction = await page.evaluate(() => {
    const api = window.__GAME_TEST_API__;
    const helpers = window.__TEST_HELPERS__;
    api.restart("browser-touch-hold");
    return helpers.firstOpenDirection(api.getMap(), api.getState().player);
  });
  const beforeHold = await page.evaluate(() => window.__GAME_TEST_API__.getState().player);
  const button = page.locator(`[data-touch-direction="${direction}"]`);
  await button.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", bubbles: true });
  await page.waitForTimeout(360);
  await button.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", bubbles: true });
  const afterHold = await page.evaluate(() => window.__GAME_TEST_API__.getState().player);
  expect(Math.abs(afterHold.x - beforeHold.x) + Math.abs(afterHold.y - beforeHold.y)).toBeGreaterThanOrEqual(1);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__GAME_TEST_API__));
  await page.addScriptTag({ content: browserHelperScript });
  const beforeStart = await page.evaluate(() => window.__GAME_TEST_API__.getState().player);
  await page.locator('[data-touch-direction="right"]').dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", bubbles: true });
  const afterStartTouch = await page.evaluate(() => window.__GAME_TEST_API__.getState().player);
  expect(afterStartTouch).toEqual(beforeStart);
});

test("desktop hides mobile touch controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("#touchControls")).toBeHidden();
});

async function runScriptedWin(page: Page, seed: string): Promise<GameStateSnapshot> {
  return page.evaluate((routeSeed) => {
    const api = window.__GAME_TEST_API__;
    const helpers = window.__TEST_HELPERS__;
    api.restart(routeSeed);
    const map = api.getMap();
    for (const letter of map.letterSpawns) {
      helpers.followPath(api, helpers.findPath(map, api.getState().player, letter));
    }
    helpers.followPath(api, helpers.findPath(map, api.getState().player, map.exit));
    return api.getState();
  }, seed);
}

const browserHelperScript = `
window.__TEST_HELPERS__ = (() => {
  const directions = ["up", "right", "down", "left"];
  const vectors = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };

  function keyOf(point) {
    return point.x + "," + point.y;
  }

  function nextPoint(point, direction) {
    return {
      x: point.x + vectors[direction].x,
      y: point.y + vectors[direction].y,
    };
  }

  function directionBetween(from, to) {
    for (const direction of directions) {
      const next = nextPoint(from, direction);
      if (next.x === to.x && next.y === to.y) {
        return direction;
      }
    }
    throw new Error("Points are not adjacent");
  }

  function reconstructPath(previous, start, goal) {
    const path = [goal];
    let currentKey = keyOf(goal);
    const startKey = keyOf(start);
    while (currentKey !== startKey) {
      const prior = previous.get(currentKey);
      if (!prior) {
        throw new Error("Broken path reconstruction");
      }
      const [x, y] = prior.split(",").map(Number);
      path.push({ x, y });
      currentKey = prior;
    }
    return path.reverse();
  }

  function findPath(map, start, goal) {
    const queue = [start];
    const visited = new Set([keyOf(start)]);
    const previous = new Map();
    let cursor = 0;

    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      if (current.x === goal.x && current.y === goal.y) {
        return reconstructPath(previous, start, goal);
      }
      for (const direction of directions) {
        const next = nextPoint(current, direction);
        const nextKey = keyOf(next);
        if (!visited.has(nextKey) && map.tiles[next.y]?.[next.x] === 1) {
          visited.add(nextKey);
          previous.set(nextKey, keyOf(current));
          queue.push(next);
        }
      }
    }
    throw new Error("No route from " + keyOf(start) + " to " + keyOf(goal));
  }

  function followPath(api, path) {
    for (let i = 1; i < path.length; i += 1) {
      api.movePlayer(directionBetween(path[i - 1], path[i]));
    }
  }

  function firstOpenDirection(map, point) {
    const direction = directions.find((candidate) => {
      const next = nextPoint(point, candidate);
      return map.tiles[next.y]?.[next.x] === 1;
    });
    if (!direction) {
      throw new Error("No open direction from " + keyOf(point));
    }
    return direction;
  }

  return { firstOpenDirection, findPath, followPath };
})();
`;
