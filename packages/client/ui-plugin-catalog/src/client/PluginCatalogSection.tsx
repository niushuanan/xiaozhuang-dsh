import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  ComputerUseIcon,
  FishLogo,
  IconAgentPresetOutline16,
  IconBranchOutline16,
  IconChatOutline16,
  IconDataOutline16,
  IconMemoryOutline16,
  IconPlusOutline16,
  IconQuoteOutline16,
  IconQueueOutline14,
  IconQuestionOutline14,
  IconSearchOutline16,
  IconSkillOutline16,
  IconTeamworkOutline16,
  IconUsageTrendOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './PluginCatalogSection.module.css'

export interface PluginStatus {
  readonly id: string
  readonly enabled: boolean
  readonly phase: 'active' | 'disabled' | 'failed' | 'transitioning'
  readonly missing: readonly string[]
}

export interface PluginStatusSnapshot {
  readonly plugins: readonly PluginStatus[]
  readonly updatedAt: string
}

export interface PluginArchive {
  readonly blob: Blob
  readonly filename: string
}

export interface PluginCatalogInjected {
  readonly loadStatus: () => Promise<PluginStatusSnapshot>
  readonly togglePlugin: (id: string, enabled: boolean) => Promise<PluginStatusSnapshot>
  readonly exportPlugins: (ids: readonly string[]) => Promise<PluginArchive>
  readonly saveArchive: (archive: PluginArchive) => void
}

interface CatalogPlugin {
  readonly id: string
  readonly category: 'work' | 'conversation' | 'insights'
  readonly name: string
  readonly description: string
  readonly meta?: string
  readonly icon: ComponentType<{ readonly className?: string; readonly 'aria-hidden'?: boolean }>
}

function ImageVisionIcon(): JSX.Element {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="2.25" width="13" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.35" />
    <circle cx="5" cy="5.75" r="1" fill="currentColor" />
    <path d="M3.25 11l2.8-2.8 1.9 1.9 1.65-1.65 3.15 3.15" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function SplitPaneIcon(): JSX.Element {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.75" y="2.25" width="5.25" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9" y="2.25" width="5.25" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
}

function SessionPulseIcon(): JSX.Element {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M1.75 8h2.4L5.5 4.9l2.15 6.2L9.3 7l1.2 1h3.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function ExportIcon(): JSX.Element {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 1.75v7.5m0 0 2.5-2.5M8 9.25l-2.5-2.5M3 10v2.25c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

const CATEGORIES = [
  { id: 'work', name: '工作能力' },
  { id: 'conversation', name: '对话体验' },
  { id: 'insights', name: '数据与用量' },
] as const

export const PLUGINS: readonly CatalogPlugin[] = [
  { id: 'computer-use', category: 'work', name: 'Computer Use', description: '控制桌面应用与浏览器，完成真实界面操作。', meta: '桌面 · 浏览器', icon: ComputerUseIcon },
  { id: 'teamwork', category: 'work', name: 'Teamwork', description: '先规划再并行派发成员，由主智能体统一协调与汇总。', meta: '最多 5 个成员', icon: IconTeamworkOutline16 },
  { id: 'parallel-development', category: 'work', name: '并发 worktree 协作', description: '任务适合拆分时，自动创建多个 worktree 并行推进，复核后合回当前分支。', icon: IconBranchOutline16 },
  { id: 'vision', category: 'work', name: '图片理解', description: '让纯文本模型也能读取会话中的图片与截图。', meta: '拖放 · 粘贴 · 原生附件', icon: ImageVisionIcon },
  { id: 'product-companion', category: 'conversation', name: '鲸少女', description: '常驻输入框上方，跟随 Agent 状态陪伴、提醒并展示当前进度。', meta: '双皮肤 · 状态跟随', icon: FishLogo },
  { id: 'plain-chat', category: 'conversation', name: '纯聊天', description: '不选文件夹、不使用工具，打开即可和模型聊天。', meta: '独立历史 · 无执行权限', icon: IconChatOutline16 },
  { id: 'multi-window', category: 'conversation', name: '多对话分屏', description: '把多个对话并排放在当前页面，每块都有独立历史与输入框。', meta: '最多 4 个对话', icon: SplitPaneIcon },
  { id: 'selection-actions', category: 'conversation', name: '选中操作', description: '在 DSH 回答里划词，直接引用、记忆或打开侧边聊天。', meta: '引用 · 记忆 · 侧边聊天', icon: IconQuoteOutline16 },
  { id: 'memory-system', category: 'conversation', name: '记忆体系', description: '用户主动记忆和 AI 主动记忆两份全局可编辑文档。', meta: '跨对话 · 可编辑', icon: IconMemoryOutline16 },
  { id: 'composer-add-menu', category: 'conversation', name: '命令、插件与技能', description: '从输入框添加文件、文件夹，或插入命令、插件与 Skill。', meta: '命令 · 插件 · Skill', icon: IconPlusOutline16 },
  { id: 'skill-manager', category: 'conversation', name: 'Skill 管理', description: '查看全部 Skill 及其文件，并让 AI 自适应导入新能力。', meta: '文件预览 · AI 导入', icon: IconSkillOutline16 },
  { id: 'fluent-output', category: 'conversation', name: '流畅输出', description: '让文字、Markdown 与工具结果连续呈现，并平稳跟随生成位置。', meta: '自适应节奏 · 尊重手动滚动', icon: IconQueueOutline14 },
  { id: 'session-modes', category: 'conversation', name: 'Agent 预设', description: '无需新建对话，随时切换标准、创造与 PTC 等模式。', meta: '从下一轮生效 · 当前任务不中断', icon: IconAgentPresetOutline16 },
  { id: 'model-usage', category: 'insights', name: '模型用量', description: '集中查看 DeepSeek、KIMI、GLM 与 GPT 的当前额度。', meta: '每 5 分钟更新', icon: IconDataOutline16 },
  { id: 'runtime-pulse', category: 'insights', name: '会话运行详情', description: '重新组织输入框下方的会话运行数据；点击查看完整耗时与 Token 明细。', meta: '窄屏自适应 · 点击展开', icon: SessionPulseIcon },
  { id: 'token-overview', category: 'insights', name: 'Token 总览', description: '统一查看整台电脑的 AI 处理量、缓存、调用与预估成本。', meta: '每 10 分钟更新', icon: IconUsageTrendOutline16 },
]

interface PluginRowProps {
  readonly plugin: CatalogPlugin
  readonly state: PluginStatus | undefined
  readonly busy: boolean
  readonly selecting: boolean
  readonly selected: boolean
  readonly onSelect: (id: string, selected: boolean) => void
  readonly onToggle: (id: string, enabled: boolean) => void
}

function PluginRow({ plugin, state, busy, selecting, selected, onSelect, onToggle }: PluginRowProps): JSX.Element {
  const Icon = plugin.icon
  const enabled = state?.enabled === true
  const failed = state?.phase === 'failed'
  const actionLabel = busy
    ? enabled ? '正在关闭' : '正在开启'
    : failed ? '状态异常，点击重试'
      : enabled ? '已开启，点击关闭' : '已关闭，点击开启'
  return <li className={css.row}>
    {selecting ? <input
      className={css.checkbox}
      type="checkbox"
      checked={selected}
      aria-label={`选择 ${plugin.name}`}
      onChange={(event) => { onSelect(plugin.id, event.currentTarget.checked) }}
    /> : null}
    <span className={css.icon} aria-hidden="true" data-plugin-id={plugin.id}><Icon aria-hidden={true} /></span>
    <div className={css.rowMain}>
      <div className={css.name}>{plugin.name}</div>
      <div className={css.description}>{plugin.description}</div>
      {plugin.meta === undefined ? null : <div className={css.meta}>{plugin.meta}</div>}
    </div>
    {selecting ? null : <button
      type="button"
      className={css.toggle}
      role="switch"
      aria-checked={enabled}
      aria-label={`${plugin.name}：${actionLabel}`}
      title={actionLabel}
      aria-busy={busy}
      data-failed={failed}
      disabled={busy || state === undefined}
      onClick={() => { onToggle(plugin.id, !enabled) }}
    ><span className={css.toggleKnob} aria-hidden="true" /></button>}
  </li>
}

/** Searchable native catalog with inline selection and all-catalog export. */
export function PluginCatalogSection(props: PluginCatalogInjected): JSX.Element {
  const [states, setStates] = useState<Record<string, PluginStatus>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const applySnapshot = (snapshot: PluginStatusSnapshot): void => {
    setStates(Object.fromEntries(snapshot.plugins.map(plugin => [plugin.id, plugin])))
  }

  useEffect(() => {
    let live = true
    void props.loadStatus().then((snapshot) => { if (live) applySnapshot(snapshot) })
      .catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { live = false }
  }, [props.loadStatus])

  const onToggle = async (id: string, enabled: boolean): Promise<void> => {
    setBusyId(id)
    setError('')
    try {
      applySnapshot(await props.togglePlugin(id, enabled))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      try { applySnapshot(await props.loadStatus()) } catch { /* retain the visible error */ }
    } finally {
      setBusyId(null)
    }
  }

  const onSelect = (id: string, selected: boolean): void => {
    setSelectedIds(current => selected
      ? current.includes(id) ? current : [...current, id]
      : current.filter(value => value !== id))
  }

  const cancelExport = (): void => {
    setSelecting(false)
    setSelectedIds([])
    setNotice('')
    setError('')
  }

  const exportSelected = async (): Promise<void> => {
    const ordered = PLUGINS.map(plugin => plugin.id).filter(id => selectedIds.includes(id))
    if (ordered.length === 0 || exporting) return
    setExporting(true)
    setError('')
    setNotice('')
    try {
      const archive = await props.exportPlugins(ordered)
      props.saveArchive(archive)
      setNotice(`已导出 ${ordered.length} 个插件`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setExporting(false)
    }
  }

  const enabledCount = PLUGINS.filter(plugin => states[plugin.id]?.enabled === true).length
  const loaded = PLUGINS.every(plugin => states[plugin.id] !== undefined)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visiblePlugins = useMemo(() => normalizedQuery.length === 0 ? PLUGINS : PLUGINS.filter((plugin) => {
    const category = CATEGORIES.find(entry => entry.id === plugin.category)?.name ?? ''
    return [plugin.id, plugin.name, plugin.description, plugin.meta ?? '', category]
      .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
  }), [normalizedQuery])
  const groups = CATEGORIES.map(category => ({
    ...category,
    plugins: visiblePlugins.filter(plugin => plugin.category === category.id),
  })).filter(group => group.plugins.length > 0)
  const allSelected = selectedIds.length === PLUGINS.length

  return <div className={css.root}>
    <header className={css.hero}>
      <div className={css.heroTop}>
        <div>
          <h2 className={css.title}>小庄的插件</h2>
          <p className={css.intro}>插件可随时开启或关闭；也可以选择导出，交给 AI 安装到另一套 DSH。</p>
        </div>
        {selecting ? null : <button type="button" className={css.exportEntry} onClick={() => {
          setSelecting(true)
          setSelectedIds([])
          setError('')
          setNotice('')
        }}><ExportIcon />导出插件</button>}
      </div>
      <div className={css.repoLine}>
        <span>MIT 开源 · 在 GitHub 给小庄一个 Star ⭐：</span>
        <a className={css.repo} href="https://github.com/niushuanan/xiaozhuang-dsh" target="_blank" rel="noopener noreferrer">
          https://github.com/niushuanan/xiaozhuang-dsh（点击打开 ↗）
        </a>
      </div>
      <div className={css.stats} aria-label="插件概览">
        <div className={css.stat}><span className={css.statValue}>{PLUGINS.length}</span><span className={css.statLabel}>个插件</span></div>
        <div className={css.stat}><span className={css.statValue}>{loaded ? enabledCount : '—'}</span><span className={css.statLabel}>个已开启</span></div>
      </div>
    </header>

    {selecting ? <div className={css.exportBar} aria-label="插件导出选择">
      <button type="button" className={css.secondaryButton} onClick={() => {
        setSelectedIds(allSelected ? [] : PLUGINS.map(plugin => plugin.id))
      }}>{allSelected ? '取消全选' : `全选 ${PLUGINS.length} 个`}</button>
      <span className={css.selectedCount}>已选 {selectedIds.length} 个</span>
      <span className={css.barSpacer} />
      <button type="button" className={css.cancelButton} onClick={cancelExport} disabled={exporting}>取消导出</button>
      <button type="button" className={css.primaryButton} onClick={() => { void exportSelected() }} disabled={selectedIds.length === 0 || exporting}>
        {exporting ? '正在整理…' : `导出 ${selectedIds.length} 个插件`}
      </button>
    </div> : null}

    {error === '' ? null : <div className={css.error} role="alert">{error}</div>}
    {notice === '' ? null : <div className={css.notice} role="status">{notice}</div>}

    <label className={css.search}>
      <IconSearchOutline16 aria-hidden="true" />
      <span className={css.visuallyHidden}>搜索插件</span>
      <input type="search" className={css.searchInput} value={query} placeholder="搜索插件" aria-label="搜索插件" onChange={(event) => { setQuery(event.currentTarget.value) }} />
    </label>

    {groups.length > 0 ? <div className={css.directory} aria-label="插件分类">{groups.map(group => <section className={css.group} key={group.id} aria-labelledby={`plugin-group-${group.id}`}>
      <h3 className={css.groupHeading} id={`plugin-group-${group.id}`}><span>{group.name}</span><span className={css.groupCount} aria-label={`${group.plugins.length} 个插件`}>{group.plugins.length}</span></h3>
      <ul className={css.list} aria-label={group.name}>{group.plugins.map(plugin => <PluginRow
        key={plugin.id}
        plugin={plugin}
        state={states[plugin.id]}
        busy={busyId === plugin.id}
        selecting={selecting}
        selected={selectedIds.includes(plugin.id)}
        onSelect={onSelect}
        onToggle={(id, enabled) => { void onToggle(id, enabled) }}
      />)}</ul>
    </section>)}</div> : <div className={css.empty}>
      <p>没有找到与“{query.trim()}”相关的插件。</p>
      <button type="button" className={css.clear} onClick={() => { setQuery('') }}>清除搜索</button>
    </div>}

    <div className={css.note}>
      <span className={css.noteMark} aria-hidden="true"><IconQuestionOutline14 /></span>
      <span>{selecting ? '全选会导出目录中的全部插件，不受搜索和当前启停状态影响；不会导出对话、设置或账号信息。' : '关闭会停止插件接收新的调用；重新开启后立即恢复。Teamwork 的协作者在独立设置页中管理。'}</span>
    </div>
  </div>
}
