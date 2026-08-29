import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconChevronDownOutline14, IconChevronLeftOutline14, IconFolderOpenOutline16, IconLinkOutline16,
  IconPaperclipOutline16, IconSkillOutline16, MarkdownText, Menu, SettingsSectionHeader,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ManagedSkillDetail, ManagedSkillFile, ManagedSkillSummary, SkillImportRequest, SkillInstallResult, UploadedSkillFile,
} from '../types.ts'
import css from './SkillManagerSection.module.css'

export interface SkillManagerInjected {
  readonly listSkills: () => Promise<{ readonly skills: readonly ManagedSkillSummary[] }>
  readonly loadSkill: (name: string) => Promise<ManagedSkillDetail>
  readonly importSource: (request: SkillImportRequest) => Promise<SkillInstallResult>
}

const SOURCE_LABELS = {
  personal: '个人', project: '项目', runtime: '运行时', custom: '自定义', bundled: '内置',
} as const

function skillIntro(skill: ManagedSkillSummary): string {
  return [skill.description, skill.whenToUse]
    .filter(part => part !== undefined && part.trim() !== '')
    .join('\n\n')
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => { reject(reader.error ?? new Error('无法读取文件')) }
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('无法读取文件'))
        return
      }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

async function uploadedFiles(list: FileList | readonly File[]): Promise<UploadedSkillFile[]> {
  return Promise.all(Array.from(list).map(async file => ({
    path: file.webkitRelativePath || file.name,
    contentBase64: await fileBase64(file),
    ...file.type === '' ? {} : { mimeType: file.type },
  })))
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u

function visibleMarkdown(content: string): string {
  return content.replace(FRONTMATTER, '').trimStart()
}

function fileSize(size: number): string {
  if (size < 1_024) return `${size} B`
  if (size < 1_048_576) return `${Math.round(size / 1_024)} KB`
  return `${(size / 1_048_576).toFixed(1)} MB`
}

function FilePreview({ file }: { readonly file: ManagedSkillFile }): ReactElement {
  if (file.kind === 'image') return <img className={css.imagePreview} src={file.dataUrl} alt={file.path} />
  if (file.kind === 'binary') return (
    <div className={css.binaryPreview}>
      <strong>{file.path}</strong>
      <span>{file.mimeType}</span>
      <span>{file.size.toLocaleString()} bytes</span>
    </div>
  )
  if (file.kind === 'markdown') return <div className={css.markdown}><MarkdownText text={visibleMarkdown(file.content)} /></div>
  return <pre className={css.textPreview}><code>{file.content}</code></pre>
}

export function SkillManagerSection({ listSkills, loadSkill, importSource }: SkillManagerInjected): ReactElement {
  const [skills, setSkills] = useState<readonly ManagedSkillSummary[]>([])
  const [detail, setDetail] = useState<ManagedSkillDetail>()
  const [selectedFile, setSelectedFile] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [message, setMessage] = useState('')
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [githubImportOpen, setGithubImportOpen] = useState(false)
  const [githubUrl, setGithubUrl] = useState('')
  const [introExpanded, setIntroExpanded] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const githubInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const result = await listSkills()
    setSkills(result.skills)
  }, [listSkills])

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : String(error))
    })
  }, [refresh])
  useEffect(() => { if (githubImportOpen) githubInput.current?.focus() }, [githubImportOpen])

  const openSkill = useCallback(async (name: string) => {
    setLoadingDetail(true)
    setMessage('')
    try {
      const loaded = await loadSkill(name)
      setDetail(loaded)
      setSelectedFile(loaded.files[0]?.path)
      setIntroExpanded(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingDetail(false)
    }
  }, [loadSkill])

  const runImport = useCallback(async (request: SkillImportRequest) => {
    setBusy(true)
    setMessage('正在整理并验证 Skill…')
    try {
      const result = await importSource(request)
      await refresh()
      await openSkill(result.installed)
      setGithubImportOpen(false)
      setGithubUrl('')
      setMessage(`已安装 ${result.installed}${result.replaced ? '，原 Skill 已安全替换' : ''}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [importSource, openSkill, refresh])

  const importFiles = useCallback(async (files: FileList | null) => {
    if (files === null || files.length === 0) return
    await runImport({ kind: 'files', files: await uploadedFiles(files) })
  }, [runImport])

  const currentFile = useMemo(() => detail?.files.find(file => file.path === selectedFile) ?? detail?.files[0], [detail, selectedFile])
  const introCollapsible = detail !== undefined && (detail.explanation.length > 120 || detail.explanation.includes('\n'))

  const chooseImport = (id: string): void => {
    setImportMenuOpen(false)
    setGithubImportOpen(id === 'github')
    if (id === 'file') fileInput.current?.click()
    if (id === 'folder') folderInput.current?.click()
  }

  return (
    <section className={css.root} aria-label="Skill 管理">
      <SettingsSectionHeader
        className={css.header}
        title="Skill 管理"
        description="查看当前能力，或把外部资料整理成个人 Skill。"
        actions={<div className={css.importActions}>
          <Menu
            open={importMenuOpen}
            onClose={() => { setImportMenuOpen(false) }}
            onSelect={chooseImport}
            align="end"
            portal
            items={[
              { id: 'file', label: '导入文件', icon: <IconPaperclipOutline16 size={16} /> },
              { id: 'folder', label: '导入文件夹', icon: <IconFolderOpenOutline16 size={16} /> },
              { id: 'github', label: '从 GitHub 导入', icon: <IconLinkOutline16 size={16} /> },
            ]}
            anchor={(
              <button
                type="button"
                className={css.importButton}
                aria-haspopup="menu"
                aria-expanded={importMenuOpen}
                disabled={busy}
                onClick={() => { setImportMenuOpen(open => !open) }}
              >
                <span>导入 Skill</span>
                <IconChevronDownOutline14 size={12} />
              </button>
            )}
          />
          <input ref={fileInput} className={css.hiddenInput} aria-label="导入 Skill 文件" type="file" multiple onChange={(event) => { void importFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
          <input ref={folderInput} className={css.hiddenInput} aria-label="导入 Skill 文件夹" type="file" multiple {...{ webkitdirectory: '', directory: '' }} onChange={(event) => { void importFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
        </div>}
      />

      {githubImportOpen && (
        <form className={css.github} onSubmit={(event) => {
          event.preventDefault()
          if (githubUrl.trim() !== '') void runImport({ kind: 'github', url: githubUrl.trim() })
        }}>
          <div className={css.githubCopy}>
            <strong>从 GitHub 导入</strong>
            <span>粘贴公开仓库首页地址</span>
          </div>
          <input ref={githubInput} aria-label="GitHub 仓库 URL" type="url" placeholder="https://github.com/owner/repository" value={githubUrl} onChange={(event) => { setGithubUrl(event.currentTarget.value) }} />
          <button type="submit" disabled={busy || githubUrl.trim() === ''}>确认导入</button>
        </form>
      )}

      {message !== '' && <div className={css.status} role="status">{message}</div>}

      <div className={css.workspace}>
        {detail === undefined ? (
          <aside className={css.skills} aria-label="Skill 列表">
            <div className={css.skillsHeader}><span>全部 Skill</span><strong>{skills.length}</strong></div>
            {skills.map((skill) => {
              const intro = skillIntro(skill)
              return (
                <button key={`${skill.source}:${skill.name}`} type="button" className={css.skillRow} onClick={() => { void openSkill(skill.name) }} disabled={busy || loadingDetail}>
                  <IconSkillOutline16 size={16} />
                  <span className={css.skillCopy}>
                    <span className={css.skillTitle}>
                      <strong>{skill.name}</strong>
                      {skill.category !== undefined && skill.category.trim() !== '' && (
                        <span className={css.skillCategory}>{skill.category}</span>
                      )}
                    </span>
                    {intro.trim() === '' ? null : <p className={css.skillIntro}>{intro}</p>}
                  </span>
                  <span className={skill.writable ? css.writable : css.readonly}>{skill.writable ? '可写' : '只读'}</span>
                </button>
              )
            })}
            {skills.length === 0 && <p className={css.empty}>当前没有 Skill</p>}
          </aside>
        ) : (
          <main className={css.detail}>
            <section className={css.detailHeader} aria-label={`${detail.name} 介绍`}>
              <button type="button" className={css.backButton} aria-label="返回全部 Skill" onClick={() => { setDetail(undefined); setSelectedFile(undefined); setIntroExpanded(false) }}>
                <IconChevronLeftOutline14 size={14} />
                <span>全部 Skill</span>
              </button>
              <div className={css.detailSummary}>
                <div className={css.detailTitle}>
                  <div>
                    <h3>{detail.name}</h3>
                    <span>{detail.files.length} 个文件</span>
                    {detail.category !== undefined && detail.category.trim() !== '' && (
                      <span className={css.skillCategory}>{detail.category}</span>
                    )}
                  </div>
                  <span className={detail.writable ? css.writable : css.readonly}>{detail.writable ? '个人 · 可写' : `${SOURCE_LABELS[detail.sourceGroup]} · 只读`}</span>
                </div>
                <p className={`${css.introText} ${introCollapsible && !introExpanded ? css.introClamped : ''}`}>{detail.explanation}</p>
                {introCollapsible && (
                  <button type="button" className={css.introToggle} aria-expanded={introExpanded} onClick={() => { setIntroExpanded(expanded => !expanded) }}>
                    {introExpanded ? '收起介绍' : '展开介绍'}
                  </button>
                )}
              </div>
            </section>
            <div className={css.files}>
              <nav className={css.fileTree} aria-label={`${detail.name} 文件`} role="tree">
                <div className={css.fileTreeHeader}><span>文件</span><span>{detail.files.length}</span></div>
                {detail.files.map(file => (
                  <button key={file.path} title={file.path} type="button" role="treeitem" aria-selected={currentFile?.path === file.path} className={css.fileRow} style={{ paddingLeft: `${12 + Math.max(0, file.path.split('/').length - 1) * 14}px` }} onClick={() => { setSelectedFile(file.path) }}>
                    {file.path.split('/').at(-1)}
                  </button>
                ))}
              </nav>
              <article className={css.preview} aria-label={currentFile?.path ?? '文件预览'}>
                <div className={css.previewHeader}>
                  <strong>{currentFile?.path ?? '没有文件'}</strong>
                  {currentFile !== undefined && <span>{fileSize(currentFile.size)}</span>}
                </div>
                <div className={css.previewBody}>
                  {currentFile === undefined ? <p>没有可预览文件</p> : <FilePreview file={currentFile} />}
                </div>
              </article>
            </div>
          </main>
        )}
      </div>
    </section>
  )
}
