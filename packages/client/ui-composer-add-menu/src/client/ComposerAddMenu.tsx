import { useEffect, useId, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import {
  IconCordisPluginOutline14,
  IconFolderOpenOutline16,
  IconPaperclipOutline16,
  IconPlusOutline16,
  IconSkillOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComposerAddOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './ComposerAddMenu.module.css'

/** One-layer native add directory over the conversation owner's live catalogs. */
export function ComposerAddMenu(props: ComposerAddOwnerProps): JSX.Element {
  const {
    mode, disabled, commandMenuOpen, canAddImages, imageMediaTypes, commandItems, slashItems,
    canReferenceFiles, onToggleCommandMenu, onToggleReferenceMenu, onInsertSlashItem,
    onAddImages, onAddTextFiles, focusInput,
  } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const outside = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const keyboard = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOpen(false)
      focusInput()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', keyboard)
    }
  }, [focusInput, open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const toggle = (): void => {
    if (commandMenuOpen) onToggleCommandMenu()
    setOpen(value => !value)
  }
  const keepFocus = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    focusInput()
  }
  const chooseReference = (): void => {
    setOpen(false)
    onToggleReferenceMenu()
    focusInput()
  }
  const chooseSlash = (name: string): void => {
    setOpen(false)
    onInsertSlashItem(name)
  }
  const imageChanged = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = [...(event.currentTarget.files ?? [])]
    if (files.length > 0) onAddImages(files)
    event.currentTarget.value = ''
  }
  const textChanged = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = [...(event.currentTarget.files ?? [])]
    if (files.length > 0) void onAddTextFiles(files)
    event.currentTarget.value = ''
  }
  const officialNames = new Set(commandItems.map(item => item.name))
  const skillItems = slashItems.filter(name => !officialNames.has(name))
  const accept = imageMediaTypes.length > 0 ? imageMediaTypes.join(',') : 'image/*'

  return <div className={css.root} ref={rootRef} data-composer-add-menu="">
    <Tooltip label="添加" side="top" delayMs={500}>
      <button
        type="button"
        className={css.trigger}
        aria-label="添加"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={toggle}
      ><IconPlusOutline16 size={14} /></button>
    </Tooltip>
    <input
      ref={imageInputRef}
      className={css.file}
      type="file"
      accept={accept}
      multiple
      tabIndex={-1}
      aria-hidden="true"
      onChange={imageChanged}
    />
    <input
      ref={textInputRef}
      className={css.file}
      type="file"
      accept="text/*,.md,.markdown,.csv,.json,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.sql,.log"
      multiple
      tabIndex={-1}
      aria-hidden="true"
      onChange={textChanged}
    />
    {open ? <div className={css.menu} id={menuId} role="menu" aria-label={mode === 'chat' ? '上传文件与图片' : '命令、插件与技能'}>
      <div className={css.section} role="presentation">添加</div>
      <button
        type="button"
        className={css.item}
        role="menuitem"
        disabled={!canAddImages}
        onClick={() => { imageInputRef.current?.click(); setOpen(false) }}
      >
        <span className={css.icon} aria-hidden="true"><IconPaperclipOutline16 /></span>
        <span className={css.title}>{mode === 'chat' ? '上传图片' : '图片文件'}</span>
        <span className={css.description}>{canAddImages ? '选择要发送的图片' : '当前模型暂不支持图片'}</span>
      </button>
      {mode === 'chat' ? <button
        type="button"
        className={css.item}
        role="menuitem"
        onClick={() => { textInputRef.current?.click(); setOpen(false) }}
      >
        <span className={css.icon} aria-hidden="true"><IconFolderOpenOutline16 /></span>
        <span className={css.title}>上传文件</span>
        <span className={css.description}>文本、Markdown、表格与代码</span>
      </button> : null}
      {mode === 'work' ? <>
        <button
          type="button"
          className={css.item}
          role="menuitem"
          disabled={!canReferenceFiles}
          onClick={chooseReference}
        >
          <span className={css.icon} aria-hidden="true"><IconFolderOpenOutline16 /></span>
          <span className={css.title}>文件与文件夹</span>
          <span className={css.description}>{canReferenceFiles ? '从当前工作区引用' : '当前会话不可用'}</span>
        </button>
        <div className={`${css.section} ${css.divided}`} role="presentation">命令、插件与技能</div>
        <div className={css.scroll}>
          {commandItems.map(item => <button
            key={`command:${item.name}`}
            type="button"
            className={css.item}
            role="menuitem"
            onClick={() => { chooseSlash(item.name) }}
          >
            <span className={css.icon} aria-hidden="true"><IconCordisPluginOutline14 size={16} /></span>
            <span className={css.title}>{item.name}</span>
            <span className={css.description}>{item.description}</span>
          </button>)}
          {skillItems.map(name => <button
            key={`skill:${name}`}
            type="button"
            className={css.item}
            role="menuitem"
            onClick={() => { chooseSlash(name) }}
          >
            <span className={css.icon} aria-hidden="true"><IconSkillOutline16 /></span>
            <span className={css.title}>{name}</span>
            <span className={css.description}>{`调用 /${name}`}</span>
          </button>)}
          {commandItems.length === 0 && skillItems.length === 0
            ? <div className={css.empty}>暂无可用项目</div>
            : null}
        </div>
      </> : null}
    </div> : null}
  </div>
}
