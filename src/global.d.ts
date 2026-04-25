import type { GameTestApi } from "./types";

declare global {
  interface Window {
    __GAME_TEST_API__: GameTestApi;
  }
}

export {};
