/** Trading workspace mounted through native sidebar and overlay slots. */
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IndicatorRegistry } from '@dshtrading/indicators'
import type { Instrument, MarketId } from './types.ts'
import { validateCustomIndicatorAsync } from '@dshtrading/indicators'
import { createObservable, createSelectionStore, createWatchlistGroupsStore, createWatchlistStore } from './store.ts'
import { createChartStateStore } from './chart-state.ts'
import { indicators, markCustomIndicator, unmarkCustomIndicator } from './indicator-registry.ts'
import { stageViews } from './stage-views.ts'
import { createTradingBridgeService } from './api.ts'
import { fillComposerWithQuote, guardComposerTarget, type FillComposerFn, type ConversationDraftFace } from './fill-composer.ts'
import { OrderCard, WatchlistChipCard } from './toolview.tsx'
import { TradingEntry, TradingWorkspace } from './TradingWorkspace.tsx'
import { deleteCustomIndicator, fetchCustomIndicators, subscribeTradingEvents } from './api.ts'
import { wireHostWatchlistSync } from './host-watchlist-sync.ts'
import { wireHostChartSync } from './host-chart-sync.ts'
import './tokens.css'
import { en, zh } from './locales.ts'
/** 本面板/字符串翻译的 locale namespace。 */
const NS = 'dshtrading.market'

/** Native services required by the optional workspace and composer handoff. */
export const inject = ['slots', 'locale', 'sessions', 'uiWorkspace']

/** SessionId 是 branded 类型而 dsh-session 非本包依赖（直接 import 解析不到）；
 *  从已引入的 ISessions 面派生同一 brand，inject 面字符串 id 在边界断言一次。 */
type SessionIdParam = Parameters<ISessions['open']>[0]

/** Native navigation used when a handoff needs a current session. */
interface WorkspaceNavigation {
  startSession(workspaceId?: string): void
}

/** 注册 slot + locale 字典。 */
export function apply(ctx: ClientContext): void {
  // bind 的 t 由 slot 的 locale: NS 声明经框架注入组件；本文件不直接消费。
  ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-trading-market: dictionaries')

  const selection = createSelectionStore()
  const watchlists = createWatchlistStore()
  const watchlistGroups = createWatchlistGroupsStore()
  const chart = createChartStateStore(indicators)
  const sessions = ctx.sessions as unknown as ISessions
  const workspaceOpen = createObservable(false)
  const closeTrading = (): void => { workspaceOpen.set(false) }

  // Resolve navigation on click because client service application is asynchronous.
  const startNewSession = (): void => {
    ;(ctx.get('uiWorkspace') as unknown as WorkspaceNavigation | undefined)?.startSession()
  }

  // 行情 → 会话输入框（「发给 Agent」按钮）：只把上下文 + 截图**填入 composer
  // 不提交**（owner 裁决：用户还要补自己的 prompt）。conversation 根服务在点击
  // 时惰性解析（同 uiWorkspace 纪律：apply 时序不保证）；编排细节见 fill-composer.ts。
  const fillComposer: FillComposerFn = async (text, image) => {
    // exactOptionalPropertyTypes：conversation 缺席时必须整个键缺位，不能显式 undefined。
    const conversation = ctx.get('conversation', false) as ConversationDraftFace | undefined
    await fillComposerWithQuote({
      sessions,
      ...(conversation !== undefined ? { conversation } : {}),
      startSession: startNewSession,
    }, text, image)
    closeTrading()
  }
  fillComposer.captureTarget = () => guardComposerTarget(sessions, fillComposer)
  ctx.effect(() => ctx.slots.onEntryError((slot, _entry, error) => {
    console.error(`[dsh-trading] slot entry crashed: ${slot}`, error)
  }), 'trading slot errors')

  // 中栏视图开放注册面（issue #34 / P5）：provide tradingStageViews —— 策略/
  // 知识/第三方视图包经 ctx.inject(['tradingStageViews'], …) register 定义即新增
  // 中栏 tab；插件未安装时名册只有 quote，行情视图独立正常工作（可选依赖语义）。
  // provide 由插件 fiber 持有（tradingIndicators 同款），插件卸载服务随之注销。
  ctx.reflect.provide('tradingStageViews', stageViews)

  // 视图包的桥依赖面：provide tradingBridge（K线/策略/知识卡 fetch + SSE 订阅
  // 共享单例）。视图包不 import shell 内部模块，只经服务 inject。
  ctx.reflect.provide('tradingBridge', createTradingBridgeService())

  // quote 视图是 registry 的内建种子条目（stage-views.ts 工厂内写入）——tab 条
  // 从名册统一渲染，MiddleStage 对 quote 走 QuoteStage 直引面。

  // 对话内富卡片（issue #34 / P5 §5.5）：下单三态卡（4 市场 keyed 各一把 +
  // 生成器注册）与自选 chip 卡。策略/知识卡的注册在各自视图包（归属随视图）。
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const market of ['crypto', 'us', 'cn', 'hk'] as const) {
      yield ctx.slots.register({
        name: 'tool.call.toolview',
        key: `${market}_place_order`,
        locale: NS,
      }, OrderCard as never)
    }
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'watchlist_add', locale: NS }, WatchlistChipCard as never)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'watchlist_select', locale: NS }, WatchlistChipCard as never)
  })

  // 指标插件桥（可选依赖）：client-ui-indicators 在 client 上下文提供
  // tradingIndicators 服务（IndicatorRegistry，含预置）；插件未安装时
  // 回调不触发，行情视图零指标正常工作。definition 是纯数据+纯函数，
  // 合并进本地注册表即可用；register 通知订阅者（选择器名册重渲染）。
  ctx.inject(['tradingIndicators'] as never, (scope) => {
    const service = (scope as unknown as { tradingIndicators: IndicatorRegistry }).tradingIndicators
    for (const definition of service.list()) indicators.register(definition)
  })

  // Issue #19 + #30：异步拉取并注册已持久化的自定义指标；SSE 'indicators' 失效
  // 信号到达时重拉（register 同名覆盖幂等），indicator_author 入库无需刷新即上榜。
  const loadCustomIndicators = async (): Promise<void> => {
    try {
      const customList = await fetchCustomIndicators()
      for (const item of customList) {
        // issue #31：浏览器端校验走 Worker 超时熔断（validateCustomIndicatorAsync），
        // 补 new Function 裸执行「恶意/死循环源码卡死主线程」的既知缺口。
        const result = await validateCustomIndicatorAsync(item)
        if (result.ok) {
          indicators.register(result.definition)
          markCustomIndicator(result.definition.id)
        }
      }
    } catch (e) {
      console.warn('[dsh-trading] failed to fetch custom indicators:', e)
    }
  }
  void loadCustomIndicators()

  // SSE 失效信号订阅（issue #30）：EventSource 单例在 api.ts（多视图共享一条
  // 连接）；EventSource 不可用或桥 503 → 一次性 fetch 的现状兜底（不劣于现状）。
  ctx.effect(() => subscribeTradingEvents({
    indicators: () => { void loadCustomIndicators() },
  }), 'trading indicators subscription')

  // 自选股 host SSOT 同步（issue #32）：启动同步 + 一次性迁移 + 变更 host-first
  // 接管（add/remove/select 写 host 成功后才更新本地）+ SSE 双通道刷新。
  // 分组扩展（issue #82）：groups 的 create/rename/delete/assignMember 同步被
  // 接管为 host-first；注册表启动拉取 + SSE 'watchlists' 一并重拉。
  ctx.effect(() => wireHostWatchlistSync({ watchlists, selection, groups: watchlistGroups }), 'trading watchlist synchronization')

  // 图表激活名册 host SSOT 同步（issue #63）：agent 经 indicator_activate/
  // deactivate 写 host → SSE 'chart' → 图表即时点亮；GUI 挂载/摘除/调参同样
  // host-first（桥不可用时本地镜像维持现状，不劣于升级前）。
  ctx.effect(() => wireHostChartSync({ chart }), 'trading chart synchronization')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dshtrading-entry',
    order: 40,
    locale: NS,
    inject: () => ({
      hooks: { open: workspaceOpen },
      openTrading: () => { workspaceOpen.set(true) },
    }),
  }, TradingEntry))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dshtrading-workspace',
    order: 50,
    locale: NS,
    inject: () => ({
      hooks: { open: workspaceOpen, selection, chart, watchlists, groups: watchlistGroups },
      closeTrading,
      openSession: (sessionId: string) => {
        sessions.open(sessionId as SessionIdParam)
        closeTrading()
      },
      addInstrument: (market: MarketId, instrument: Instrument) => { watchlists.add(market, instrument) },
      removeInstrument: (market: MarketId, symbol: string) => { watchlists.remove(market, symbol) },
      selectInstrument: (instrument: Instrument) => { selection.select(instrument) },
      createGroup: (name: string) => watchlistGroups.create(name),
      renameGroup: (id: string, name: string) => watchlistGroups.rename(id, name),
      deleteGroup: (id: string) => watchlistGroups.delete(id),
      assignGroupMember: (id: string, market: string, symbol: string, member: boolean, name?: string) =>
        watchlistGroups.assignMember(id, market, symbol, member, name),
      setActiveGroup: (id: string | null) => { watchlistGroups.setActiveGroup(id) },
      toggleIndicator: (id: string) => { chart.togglePreset(id) },
      setIndicatorParams: (id: string, params: Record<string, number>, scopeKey?: string) => { chart.setParams(id, params, scopeKey) },
      setIndicatorVisible: (id: string, visible: boolean, scopeKey?: string) => {
        const split = scopeKey !== undefined ? scopeKey.indexOf(':') : -1
        if (scopeKey === undefined || split <= 0) return
        chart.setSymbolVisibility(id, scopeKey.slice(0, split), scopeKey.slice(split + 1), visible)
      },
      removeIndicator: (id: string) => { if (chart.isActive(id)) chart.togglePreset(id) },
      deleteIndicator: async (id: string) => {
        const ok = await deleteCustomIndicator(id)
        if (ok) {
          indicators.unregister(id)
          unmarkCustomIndicator(id)
          chart.removeInstance(id)
        }
        return ok
      },
      fillComposer,
    }),
  }, TradingWorkspace))
}
