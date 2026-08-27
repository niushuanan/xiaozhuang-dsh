import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { ManagedSkillDetail, ManagedSkillFile, ManagedSkillSourceGroup, ManagedSkillSummary } from './types.ts'

interface SkillSummaryLike {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly category?: string
  readonly source: string
  readonly provider: string
}

interface SkillDefinitionLike extends SkillSummaryLike {
  readonly content: string
  readonly path?: string
  readonly resourceBase?:
    | { readonly kind: 'directory'; readonly path: string }
    | { readonly kind: 'url'; readonly url: string }
    | { readonly kind: 'opaque'; readonly description: string }
}

interface SkillsReader {
  readonly list: (options?: { readonly cwd?: string; readonly scope?: ScopeKey }) => Promise<readonly SkillSummaryLike[]>
  readonly get: (name: string, options?: { readonly cwd?: string; readonly scope?: ScopeKey }) => Promise<SkillDefinitionLike | undefined>
}

function sourceGroup(source: string): ManagedSkillSourceGroup {
  if (source === 'user-dsh' || source === 'user-agents') return 'personal'
  if (source === 'project-dsh' || source === 'project-agents') return 'project'
  if (source === 'runtime') return 'runtime'
  if (source === 'bundled') return 'bundled'
  return 'custom'
}

function summaryOf(skill: SkillSummaryLike): ManagedSkillSummary {
  const group = sourceGroup(skill.source)
  return {
    name: skill.name,
    description: skill.description,
    ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
    ...skill.category === undefined ? {} : { category: skill.category },
    source: skill.source,
    sourceGroup: group,
    provider: skill.provider,
    writable: group === 'personal',
  }
}

/**
 * Project the winning Skill catalog into user-facing source and writeability metadata.
 * @param skills - current Skill registry reader.
 * @param cwd - workspace used by project-sensitive providers.
 * @param scope - optional active Session scope used by preset-specific providers.
 * @returns sorted Settings rows.
 */
export async function listManagedSkills(
  skills: SkillsReader,
  cwd: string,
  scope?: ScopeKey,
): Promise<ManagedSkillSummary[]> {
  const rows = (await skills.list({ cwd, ...scope === undefined ? {} : { scope } })).map(summaryOf)
  return rows.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}

const MAX_PREVIEW_FILES = 512
const MAX_PREVIEW_TOTAL_BYTES = 24 * 1024 * 1024
const MAX_INLINE_FILE_BYTES = 2 * 1024 * 1024
const IMAGE_MIME: Readonly<Record<string, string>> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
}
const CODE_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.css', '.go', '.html', '.java', '.js', '.jsx', '.json', '.mjs', '.py', '.rb', '.rs', '.sh', '.sql', '.ts', '.tsx', '.xml', '.yaml', '.yml'])
const TEXT_EXTENSIONS = new Set(['.csv', '.ini', '.log', '.text', '.txt'])

function virtualSkillMarkdown(skill: SkillDefinitionLike): string {
  return `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.content}`
}

function preview(path: string, bytes: Buffer): ManagedSkillFile {
  const extension = extname(path).toLowerCase()
  const imageMime = IMAGE_MIME[extension]
  if (imageMime !== undefined && bytes.byteLength <= MAX_INLINE_FILE_BYTES) {
    return { path, kind: 'image', size: bytes.byteLength, dataUrl: `data:${imageMime};base64,${bytes.toString('base64')}` }
  }
  if (bytes.byteLength <= MAX_INLINE_FILE_BYTES) {
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (!content.includes('\0')) {
        if (extension === '.md' || extension === '.mdx') return { path, kind: 'markdown', size: bytes.byteLength, content }
        if (CODE_EXTENSIONS.has(extension)) return { path, kind: 'code', size: bytes.byteLength, content }
        if (TEXT_EXTENSIONS.has(extension) || basename(path).toLowerCase() === 'license') return { path, kind: 'text', size: bytes.byteLength, content }
      }
    } catch {
      // Invalid UTF-8 is presented as binary metadata.
    }
  }
  return { path, kind: 'binary', size: bytes.byteLength, mimeType: 'application/octet-stream' }
}

async function readDirectoryFiles(root: string): Promise<ManagedSkillFile[]> {
  const canonicalRoot = await realpath(root)
  const files: ManagedSkillFile[] = []
  let total = 0
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = resolve(directory, entry.name)
      const info = await lstat(path)
      if (info.isSymbolicLink()) throw new Error('Skill resources cannot contain symbolic links')
      if (info.isDirectory()) {
        await visit(path)
        continue
      }
      if (!info.isFile()) continue
      const canonical = await realpath(path)
      if (!canonical.startsWith(`${canonicalRoot}${sep}`)) throw new Error('Skill resource escapes its directory')
      files.push(preview(relative(canonicalRoot, canonical).split(sep).join('/'), await readFile(canonical)))
      total += info.size
      if (files.length > MAX_PREVIEW_FILES || total > MAX_PREVIEW_TOTAL_BYTES) throw new Error('Skill resources are too large to preview')
    }
  }
  await visit(canonicalRoot)
  return files
}

/**
 * Read one winning Skill and preview only its owned regular files.
 * @param skills - current Skill registry reader.
 * @param cwd - workspace used by project-sensitive providers.
 * @param name - exact Skill name selected by the user.
 * @param scope - optional active Session scope used by preset-specific providers.
 * @returns human-readable metadata and bounded file previews.
 */
export async function readManagedSkill(skills: SkillsReader, cwd: string, name: string, scope?: ScopeKey): Promise<ManagedSkillDetail> {
  const skill = await skills.get(name, { cwd, ...scope === undefined ? {} : { scope } })
  if (skill === undefined) throw new Error('Skill not found')
  let files: ManagedSkillFile[]
  if (skill.path !== undefined && skill.resourceBase?.kind === 'directory') {
    const root = resolve(skill.resourceBase.path)
    const path = resolve(skill.path)
    const rootCanonical = await realpath(root)
    const pathCanonical = await realpath(path)
    if (pathCanonical !== rootCanonical && !pathCanonical.startsWith(`${rootCanonical}${sep}`)) throw new Error('Skill file escapes its resource directory')
    files = basename(path).toLowerCase() === 'skill.md'
      ? await readDirectoryFiles(rootCanonical)
      : [preview(basename(pathCanonical), await readFile(pathCanonical))]
  } else if (skill.path !== undefined) {
    const path = await realpath(skill.path)
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Skill file is not a regular file')
    files = [preview(basename(path), await readFile(path))]
  } else {
    const content = virtualSkillMarkdown(skill)
    files = [{ path: 'SKILL.md', kind: 'markdown', size: Buffer.byteLength(content), content }]
  }
  return {
    ...summaryOf(skill),
    explanation: skill.whenToUse === undefined ? skill.description : `${skill.description}\n\n${skill.whenToUse}`,
    files,
  }
}
