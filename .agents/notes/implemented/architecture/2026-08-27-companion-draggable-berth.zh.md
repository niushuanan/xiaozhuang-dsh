# Agent Note：桌面精灵的输入框泊位改为可拖拽的持久化比例

Status: implemented

[English](2026-08-27-companion-draggable-berth.md) | 中文

## 问题

桌面精灵被硬编码钉在输入框右缘（`x = composer.right − width − 14`），`data-side="right"` 是字面量。store 里还留着输入框改版前自由拖放时代的 `position`/`home`/`setPosition`/`resetPosition`，但没有任何组件在读；`habitats.ts`（语义归属解析 + 吸附距离）连同它们一起是死代码。用户完全无法移动她，"她坐在哪"也没有可持久化的表示。

## 决策

水平泊位收敛为一个持久化数字：`composerOffsetRatio ∈ [0, 1]` —— 她左缘在输入框卡片可用宽度（卡片宽减去左右各 6px/14px 内边距再减精灵宽）中的比例。缺省即 1（历史右泊位），老用户看到的界面不变。

- **几何收敛在 `composer-anchor.ts`** 的三个纯函数（`composerXForRatio`、`composerRatioForX`、`composerYForTop`），带 clamp 与窄卡行为；`measureComposerAnchor` 改为消费它们，于是全部既有观测路径（MutationObserver/ResizeObserver/scroll/落定计时器）现在都从持久化比例重推锚点——输入框移动或变宽后她回到同一相对位置，这正是既有传送契约的语义。
- **拖动是 window 级指针手势**，从精灵上发起，5px 水平阈值分界：阈值以内，既有点击/点击穿透语义原样运行；越过后 `renderedPosition` 跟随指针（保留抓取偏移）、取消传送，pointerup 时经 store 提交 `setComposerOffsetRatio(ratio)`，吞掉合成点击与挂起的点击穿透，并 bump 布局修订让锚点 effect 重测到同一位置（拖后无动画）。`pointercancel` 释放且不提交。
- **左侧圆键是换到另一侧的快捷入口**：比例大于 0.5 中位线时显示向左箭头并提交 0.1；比例小于或等于中位线时显示向右箭头并提交 0.9。该控件在持久化目标比例前调用既有两阶段材质消散，让人物和两枚圆键在当前泊位消失并在目标位置重组，而不是横穿输入框。
- **死重量移除**：`position`/`home` 字段、`setPosition`/`setHome`/`resetPosition` action、`CompanionHabitat` 类型与 `habitats.ts`。持久化记录里的退役键在读取时被忽略（localStorage 是私有、前契约数据）。
- 精灵明示能力（`cursor: grab`；`touch-action: none` 防触屏拖动滚动背后页面）并上报状态（`data-dragging`；`data-side` 改由实时比例推导）。

## 后果

- "把她在输入条上放到我想要的位置"靠构造成立而非坐标回放——持久化的事实是相对量，输入框是唯一参照系。
- 精灵的单击、双击、右键、听写快捷键与穿透到输入框的手势保持原行为；5px 抖动不会误启动拖动，拖动也绝不可能在松手时变成点击。
- 已知取舍：纵向位置仍由设计固定（她始终坐在输入框上沿）。自由二维放置需要第二个持久化轴与无输入框页面的落点故事，留待真正需要时再做。

## 备选方案

- **绝对视口坐标（旧 `position` 字段）** —— 被拒：输入框每次移动都需要回放启发式，最大化/还原或分屏切换都会把她丢在卡片之外。
- **设置页左/中/右三个命名泊位** —— 被拒：当场的换边控件用一次点击解决常见遮挡，直接拖动仍覆盖精确位置，无需再增加设置概念。
- **沿输入框横向滑动** —— 被拒：复用既有材质消散可以保持人物与控件的视觉一体，也不会横跨用户正在编辑的草稿。
