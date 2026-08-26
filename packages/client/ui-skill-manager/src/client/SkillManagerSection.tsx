import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconSkillOutline16, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
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

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => { reject(reader.error ?? new Error('无法读取文件')) }
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') return reject(new Error('无法读取文件'))
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

function FilePreview({ file }: { readonly file: ManagedSkillFile }): JSX.Element {
  if (file.kind === 'image') return <img className={css.imagePreview} src={file.dataUrl} alt={file.path} />
  if (file.kind === 'binary') return (
    <div className={css.binaryPreview}>
      <strong>{file.path}</strong>
      <span>{file.mimeType}</span>
      <span>{file.size.toLocaleString()} bytes</span>
    </div>
  )
  if (file.kind === 'markdown') return <div className={css.markdown}><MarkdownText text={file.content} /></div>
  return <pre className={css.textPreview}><code>{file.content}</code></pre>
}

export function SkillManagerSection({ listSkills, loadSkill, importSource }: SkillManagerInjected): JSX.Element {
  const [skills, setSkills] = useState<readonly ManagedSkillSummary[]>([])
  const [detail, setDetail] = useState<ManagedSkillDetail>()
  const [selectedFile, setSelectedFile] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const result = await listSkills()
    setSkills(result.skills)
  }, [listSkills])

  useEffect(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : String(error))) }, [refresh])

  const openSkill = useCallback(async (name: string) => {
    setBusy(true)
    setMessage('')
    try {
      const loaded = await loadSkill(name)
      setDetail(loaded)
      setSelectedFile(loaded.files[0]?.path)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [loadSkill])

  const runImport = useCallback(async (request: SkillImportRequest) => {
    setBusy(true)
    setMessage('正在整理并验证 Skill…')
    try {
      const result = await importSource(request)
      await refresh()
      await openSkill(result.installed)
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

  return (
    <section className={css.root} aria-label="Skill 管理">
      <header className={css.header}>
        <div>
          <h2>Skill 管理</h2>
          <p>查看当前能力，或把外部资料整理成个人 Skill。</p>
        </div>
        <div className={css.importActions}>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>导入文件</button>
          <button type="button" onClick={() => folderInput.current?.click()} disabled={busy}>导入文件夹</button>
          <input ref={fileInput} className={css.hiddenInput} aria-label="导入 Skill 文件" type="file" multiple onChange={(event) => { void importFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
          <input ref={folderInput} className={css.hiddenInput} aria-label="导入 Skill 文件夹" type="file" multiple {...{ webkitdirectory: '', directory: '' }} onChange={(event) => { void importFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
        </div>
      </header>

      <form className={css.github} onSubmit={(event) => {
        event.preventDefault()
        if (githubUrl.trim() !== '') void runImport({ kind: 'github', url: githubUrl.trim() })
      }}>
        <input aria-label="GitHub 仓库 URL" type="url" placeholder="https://github.com/owner/repository" value={githubUrl} onChange={event => setGithubUrl(event.currentTarget.value)} />
        <button type="submit" disabled={busy || githubUrl.trim() === ''}>从 GitHub 导入</button>
      </form>

      {message !== '' && <div className={css.status} role="status">{message}</div>}

      <div className={css.workspace}>
        <aside className={css.skills} aria-label="Skill 列表">
          {skills.map(skill => (
            <button key={`${skill.source}:${skill.name}`} type="button" className={css.skillRow} aria-current={detail?.name === skill.name ? 'true' : undefined} onClick={() => { void openSkill(skill.name) }} disabled={busy}>
              <IconSkillOutline16 size={16} />
              <span className={css.skillCopy}><strong>{skill.name}</strong><small>{SOURCE_LABELS[skill.sourceGroup]}</small></span>
              <span className={skill.writable ? css.writable : css.readonly}>{skill.writable ? '可写' : '只读'}</span>
            </button>
          ))}
          {skills.length === 0 && <p className={css.empty}>当前没有 Skill</p>}
        </aside>

        <main className={css.detail}>
          {detail === undefined ? (
            <div className={css.emptyDetail}><IconSkillOutline16 size={28} /><p>选择一个 Skill 查看说明和文件。</p></div>
          ) : (
            <>
              <div className={css.detailHeader}>
                <div><h3>{detail.name}</h3><p>{detail.explanation}</p></div>
                <span className={detail.writable ? css.writable : css.readonly}>{detail.writable ? '个人 · 可写' : `${SOURCE_LABELS[detail.sourceGroup]} · 只读`}</span>
              </div>
              <div className={css.files}>
                <nav className={css.fileTree} aria-label={`${detail.name} 文件`} role="tree">
                  {detail.files.map(file => (
                    <button key={file.path} type="button" role="treeitem" aria-selected={currentFile?.path === file.path} className={css.fileRow} style={{ paddingLeft: `${12 + Math.max(0, file.path.split('/').length - 1) * 14}px` }} onClick={() => setSelectedFile(file.path)}>
                      {file.path.split('/').at(-1)}
                    </button>
                  ))}
                </nav>
                <article className={css.preview} aria-label={currentFile?.path ?? '文件预览'}>
                  {currentFile === undefined ? <p>没有可预览文件</p> : <FilePreview file={currentFile} />}
                </article>
              </div>
            </>
          )}
        </main>
      </div>
    </section>
  )
}
