import type { GameEngine } from "./game";
import { isDirection } from "./collision";
import type { GameStateSnapshot, GameTestApi } from "./types";

export function installTestApi(engine: GameEngine, enterTestMode: () => void, afterMutation: () => void): void {
  const withState = (action: () => GameStateSnapshot): GameStateSnapshot => {
    enterTestMode();
    const state = action();
    afterMutation();
    return state;
  };

  window.__GAME_TEST_API__ = {
    getState: () => withState(() => engine.getState()),
    setSeed: (seed: string) => {
      enterTestMode();
      engine.setSeed(String(seed));
      afterMutation();
    },
    setUnlockedLevel: (level: number) => withState(() => engine.setUnlockedLevel(level)),
    restart: (seed?: string) => withState(() => engine.restart(seed)),
    step: (frames: number) => withState(() => engine.step(frames)),
    movePlayer: (direction) =>
      withState(() => (isDirection(direction) ? engine.movePlayer(direction) : engine.getState())),
    dash: (direction) => withState(() => (isDirection(direction) ? engine.dash(direction) : engine.getState())),
    nextLevel: () => withState(() => engine.nextLevel()),
    selectLevel: (level) => withState(() => engine.selectLevel(level)),
    restartCampaign: () => withState(() => engine.restartCampaign()),
    getMap: () => {
      enterTestMode();
      return engine.getMap();
    },
    getEntities: () => {
      enterTestMode();
      return engine.getEntities();
    },
    pause: () => withState(() => engine.pause()),
    resume: () => withState(() => engine.resume()),
  };
}
