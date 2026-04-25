# Dungeon Courier 地牢信使

Dungeon Courier 是一个使用 TypeScript 和 HTML5 Canvas 实现的 2D roguelite 闯关小游戏。玩家扮演地牢信使，需要在每一关收集全部信件、躲避追踪者和巡逻者，并在 90 秒内抵达出口。

## 运行

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址。使用 `WASD` 或方向键移动，`Shift` 加方向键冲刺，`P` 暂停/继续，`R` 或页面按钮重新开始当前关。

## 玩法

- 战役总共 5 关，难度从简单到困难逐步提升。
- 第一关更适合上手，后续关卡会增加敌人压力、侦测范围和移动频率。
- 每关会自动生成一张确定性地牢地图，普通玩家界面不提供手动地图种子切换。
- 收集当前关所有信件后，出口才会开启。
- 到达开启的出口会完成当前关，点击“进入下一关”继续派送。
- 完成第 5 关后会弹出最终庆祝结算页，显示通关时间、收集信件、剩余生命、冲刺评价和任务评级。
- 失败后可以点击“重新开始本关”重试，通关后也可以从第一关重新挑战完整战役。

## 测试与构建

```bash
npm test
npm run test:e2e
npm run build
```

单元测试覆盖确定性地图生成、房间连通、出口可达、碰撞、胜负、计时器、暂停、结束状态冻结、冲刺冷却、敌人 AI、重开、下一关流程和五关战役终局。Playwright 测试会加载真实浏览器页面，并通过测试 API 验证移动、胜利、失败、下一关、最终通关弹窗、暂停、冲刺冷却和移动端 Canvas 尺寸。

## 浏览器测试 API

```ts
window.__GAME_TEST_API__ = {
  getState,
  setSeed,
  restart,
  restartCampaign,
  step,
  movePlayer,
  dash,
  nextLevel,
  getMap,
  getEntities
}
```

调用测试 API 后，页面会进入确定性测试模式：`requestAnimationFrame` 仍会渲染，但游戏时间只会在显式调用 `step(frames)` 时推进。

## 已知限制

- 地图由关卡 seed、房间锚点和确定性走廊生成。生成时会校验房间数量、连通性、实体合法位置和出口可达性。
- 游戏逻辑是格子制，便于稳定碰撞和自动化测试。Canvas 会随 CSS 缩放，窗口尺寸变化不会影响碰撞。
- 敌人 AI 保持轻量：追踪者在侦测范围内使用 BFS，巡逻者遇阻转向，不包含复杂战术协作。
