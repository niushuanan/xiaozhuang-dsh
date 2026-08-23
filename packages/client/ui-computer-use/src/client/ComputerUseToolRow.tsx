import { useMemo, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import {
  IconBrowseOutline16, IconInspectOutline12, IconSettingsOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ComputerUseToolRow.module.css'

type Props = ToolCallViewProps & PropsLocale<'settings.computerUse'>

const TITLES: Record<string, string> = {
  computer_list_apps: 'Computer Use · Apps', computer_get_state: 'Computer Use · Inspect',
  computer_click: 'Computer Use · Click', computer_secondary_action: 'Computer Use · Action',
  computer_scroll: 'Computer Use · Scroll', computer_drag: 'Computer Use · Drag',
  computer_type_text: 'Computer Use · Type', computer_press_key: 'Computer Use · Key',
  computer_set_value: 'Computer Use · Set value', browser_open: 'Browser · Open',
  browser_snapshot: 'Browser · Inspect', browser_click: 'Browser · Click', browser_fill: 'Browser · Fill',
  browser_press_key: 'Browser · Key', browser_scroll: 'Browser · Scroll', browser_tabs: 'Browser · Tabs',
  browser_use_tab: 'Browser · Switch tab', browser_close: 'Browser · Close',
}

function firstArgument(raw: string): string {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    const first = Object.values(value).find(item => typeof item === 'string')
    return typeof first === 'string' ? first : ''
  } catch { return raw.split('\n')[0] ?? '' }
}

export function ComputerUseToolRow({ toolName, block, inspect, t }: Props) {
  const [open, setOpen] = useState(false)
  const settled = 'kind' in block
  const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? ''
  const result = useMemo(() => {
    if (!settled) return { text: '', image: false, error: false }
    const texts = block.content.filter(item => item.type === 'text').map(item => item.text)
    return {
      text: texts.join('\n'),
      image: block.content.some(item => item.type === 'image'),
      error: block.error !== undefined,
    }
  }, [block, settled])
  const expandable = argsRaw !== '' || result.text !== '' || result.image
  return (
    <div className={css.root} data-state={!settled ? 'running' : result.error ? 'error' : 'ok'}>
      <button className={css.row} type="button" disabled={!expandable} aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        <span className={css.icon} aria-hidden="true">
          {toolName.startsWith('browser_') ? <IconBrowseOutline16 size={14} /> : <IconSettingsOutline16 size={14} />}
        </span>
        <strong>{TITLES[toolName] ?? toolName}</strong>
        <span className={css.separator} aria-hidden="true" />
        <span className={css.summary}>{!settled ? t('running') : firstArgument(argsRaw) || t('result')}</span>
        {result.image ? <span className={css.visual}>{t('screenshot')}</span> : null}
        {inspect !== undefined ? (
          <span className={css.inspect} onClick={(event) => { event.stopPropagation(); inspect() }}>
            <IconInspectOutline12 />
          </span>
        ) : null}
      </button>
      {open && expandable ? (
        <div className={css.body}>
          {argsRaw !== '' ? <pre>{argsRaw}</pre> : null}
          {result.text !== '' ? <pre>{result.text}</pre> : null}
        </div>
      ) : null}
    </div>
  )
}
