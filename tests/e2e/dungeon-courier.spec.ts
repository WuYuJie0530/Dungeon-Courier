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
  await page.click("#overlayRestartButton");
  const nextState = await page.evaluate(() => window.__GAME_TEST_API__.getState());
  expect(nextState.status).toBe("playing");
  expect(nextState.level).toBe(wonState.level + 1);
  expect(nextState.seed).not.toBe(wonState.seed);
  await expect(page.locator("#levelHud")).toContainText(`第 ${nextState.level} 关`);
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
