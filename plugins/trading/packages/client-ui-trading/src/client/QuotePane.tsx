/** Container-owned quote workspace; native application geometry remains unchanged. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { MiddleStage } from './MiddleStage.tsx'
import type { FillComposerFn } from './fill-composer.ts'
import type { Observable, SelectionState } from './store.ts'
import type { ChartState } from './chart-state.ts'
import css from './quote-pane.module.css'

export interface QuotePaneInjected {
  hooks: {
    selection: Observable<SelectionState>
    chart: Observable<ChartState>
  }
  toggleIndicator: (id: string) => void
  setIndicatorParams: (id: string, params: Record<string, number>, scopeKey?: string) => void
  /** 按标的可见性（symbol visibility；scopeKey = `${market}:${symbol}`，缺省忽略）。 */
  setIndicatorVisible: (id: string, visible: boolean, scopeKey?: string) => void
  /** 全局移除：卸载所有标的上的该指标实例。 */
  removeIndicator: (id: string) => void
  /** 删除自定义指标（issue #30）：桥 DELETE → 注销注册表 + 移除激活实例。 */
  deleteIndicator: (id: string) => Promise<boolean>
  /** 行情上下文 → 会话输入框（只填入不发送；shell 注入）。 */
  fillComposer?: FillComposerFn
}

export type QuotePaneProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<'dshtrading.market'>
  & InjectFace<QuotePaneInjected>

/** Render registered trading views inside the workspace content area. */
export function QuotePane(props: QuotePaneProps) {
  return (
    <div className={css.pane} data-dshtrading-quote-pane="">
      <MiddleStage {...props} />
    </div>
  )
}
