/**
 * Native trading order approval gate. Simulated orders delegate to the host's
 * remaining policies; live order and cancellation requests require approval.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'

/**
 * Cordis 插件名 = patch 行 id（TEMPLATES §8）。base 是共享行唯一拥有者，
 * 行 id 用 `dsh-trading-base-gate` 市场无关命名空间，绝不与市场行冲突。
 */
export const name = 'dsh-trading-base-gate'

export interface Config {
  /** 统一审批闸门开关；false 时完全不挂监听器（仅测试/显式降级用）。 */
  enabled: boolean
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true),
})

/**
 * 下单/撤单工具名模式（跨市场统一词汇：`<market>_<action>_order`，如
 * `crypto_place_order`）。工具名是模型面向词汇，用短市场前缀（crypto/us/cn/hk）；
 * `dsh-trading-` 前缀只属于插件名/patch 行 id，不进工具名（与 crypto_get_ticker
 * 等只读工具一致）。锚定首尾 + 市场段枚举，避免误拦同名他方工具。
 */
export const ORDER_GATE_PATTERN = /^(?:crypto|us|cn|hk)_(?:place|cancel)_order$/

export function isOrderGateTool(toolName: string): boolean {
  return ORDER_GATE_PATTERN.test(toolName)
}

/** 只读取 dryRun 标志，args 形状不信任（工具自校验 schema，闸门只做保守判断）。 */
interface GateArgs {
  dryRun?: unknown
}

/**
 * 纯判定：这次工具调用是否需要用户审批。
 *
 * - 非下单/撤单工具 → undefined（不拦截）；
 * - 下单/撤单且 `dryRun === true` → undefined（模拟单无需审批）；
 * - 其余（dryRun 缺省/false/形状异常）→ `{kind:'ask'}`。
 *   缺省也 ask 是故意的保守面：工具 schema 的 dryRun 默认 true 在工具层生效，
 *   闸门层只认显式 `true`；宁可在交互形态多问一次，不在实盘形态漏拦一次。
 *
 * 返回 undefined 时调用方必须 `next()` 继续 waterfall —— 本监听器永不直接
 * 返回 allow，避免越过宿主其他策略层。
 */
export function decideOrderGate(toolName: string, args: unknown): PreToolDecision | undefined {
  if (!isOrderGateTool(toolName)) return undefined
  const dryRun = (args as GateArgs | null | undefined)?.dryRun
  if (dryRun === true) return undefined
  return {
    kind: 'ask',
    reason:
      `${toolName} was requested without dryRun=true. Confirm this live order or cancellation before it can proceed.`,
  }
}

/**
 * waterfall 监听器工厂（独立导出便于单测直接驱动 next() 契约，
 * 官方参照：packages/hooks/hooks-codex 的 pre-execute 桥）。
 */
export function createGateListener(): (
  this: unknown,
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>,
) => Promise<PreToolDecision> {
  return async (exec, next) => {
    const decision = decideOrderGate(exec.name, exec.arguments)
    return decision ?? next()
  }
}

/** Register the order approval gate without writing or migrating user data. */
export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return
  ctx.on('tools/pre-execute', createGateListener())
}
