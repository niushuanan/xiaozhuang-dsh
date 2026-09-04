/** In-memory selective plugin export with a closed server-owned file catalog. */

import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { PLUGIN_EXPORT_CATALOG, type PluginExportCatalog, type PluginExportDefinition, type PluginExportSource } from './catalog.ts'

const MAX_EXPORT_BYTES = 64 * 1024 * 1024
const MAX_EXPORT_FILES = 12_000
const EXCLUDED_SEGMENTS = new Set(['node_modules', '.git', '.cache', '.turbo', 'coverage', 'test-results', 'tests', 'test', 'design-qa', '.claude'])
const EXCLUDED_NAMES = new Set(['.env', '.env.local', '.DS_Store', 'credentials.json', 'models_cache.json'])
const SOURCE_ROOT_FILE_PATTERNS = [
  /^package\.json$/,
  /^README(?:\.[^.]+)?\.md$/,
  /^LICENSE(?:\.[^.]+)?$/,
  /^UPSTREAM\.md$/,
  /^cordis\.patch\.yml$/,
  /^agent\.cordis\.yml$/,
  /^preset\.yml$/,
  /^tsconfig(?:\.[^.]+)?\.json$/,
  /^tsdown\.config\.ts$/,
]

export type { PluginExportCatalog } from './catalog.ts'

interface ExportInput {
  readonly selectedIds: readonly string[]
  readonly repositoryRoot: string
  readonly profilePackagesRoot: string
  readonly sourceCommit: string
  readonly now: Date
  readonly catalog?: PluginExportCatalog
}

interface CollectedFile {
  readonly path: string
  readonly bytes: Uint8Array
  readonly sha256: string
  readonly size: number
}

interface PluginManifestEntry {
  readonly id: string
  readonly name: string
  readonly rows: PluginExportDefinition['rows']
  readonly sources: readonly PluginExportSource[]
}

export interface PluginExportResult {
  readonly filename: string
  readonly bytes: Uint8Array
}

function normalized(path: string): string {
  return path.split(sep).join('/')
}

function safeRoot(root: string, child: string): string {
  const absoluteRoot = resolve(root)
  const absolute = resolve(absoluteRoot, child)
  const rel = relative(absoluteRoot, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(absolute) === absoluteRoot) {
    throw new Error('插件导出路径越界')
  }
  return absolute
}

function globPattern(pattern: string): RegExp {
  let expression = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern.charAt(index)
    if (character === '*' && pattern[index + 1] === '*') {
      index += 1
      if (pattern[index + 1] === '/') {
        index += 1
        expression += '(?:.*/)?'
      } else {
        expression += '.*'
      }
    } else if (character === '*') {
      expression += '[^/]*'
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    }
  }
  return new RegExp(`${expression}$`)
}

async function repositoryFilePatterns(packageRoot: string): Promise<readonly RegExp[]> {
  try {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as { files?: unknown }
    if (!Array.isArray(manifest.files)) return []
    return manifest.files.filter((entry): entry is string => typeof entry === 'string').map(globPattern)
  } catch {
    return []
  }
}

function includeRepositoryFile(rel: string, packagePatterns: readonly RegExp[]): boolean {
  if (!rel.includes('/')) return SOURCE_ROOT_FILE_PATTERNS.some(pattern => pattern.test(rel))
  if (rel.startsWith('src/')) return true
  return packagePatterns.some(pattern => pattern.test(rel))
}

async function walk(root: string, kind: PluginExportSource['kind']): Promise<readonly { path: string; bytes: Uint8Array }[]> {
  const packagePatterns = kind === 'repository' ? await repositoryFilePatterns(root) : []
  const output: { path: string; bytes: Uint8Array }[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (EXCLUDED_SEGMENTS.has(entry.name) || EXCLUDED_NAMES.has(entry.name) || entry.name.endsWith('.tsbuildinfo')) continue
      const absolute = resolve(directory, entry.name)
      const info = await lstat(absolute)
      if (info.isSymbolicLink()) continue
      if (info.isDirectory()) {
        await visit(absolute)
        continue
      }
      if (!info.isFile()) continue
      const rel = normalized(relative(root, absolute))
      if (kind === 'repository' && !includeRepositoryFile(rel, packagePatterns)) continue
      output.push({ path: rel, bytes: await readFile(absolute) })
    }
  }
  await visit(root)
  return output
}

function installationReadme(plugins: readonly PluginManifestEntry[]): string {
  const names = plugins.map(plugin => `- ${plugin.name} (\`${plugin.id}\`)`).join('\n')
  return `# 小庄 DSH 插件安装包\n\n本压缩包包含以下插件：\n\n${names}\n\n请把整个压缩包交给能够读取和修改目标 DSH 项目的 AI，并要求它先阅读 AGENTS.md、INSTALL.md 和 manifest.json，再执行安装。压缩包不含账号、密钥、对话、用户设置或 node_modules。\n`
}

function agentInstructions(): string {
  return '# 安装 AI 指令\n\n你正在安装一组从 Xiaozhuang DSH 导出的插件。\n\n1. 先阅读 INSTALL.md 与 manifest.json，再检查目标仓库的 AGENTS.md、当前 commit、目录结构和未提交改动。\n2. 只安装 manifest.plugins 中的能力；不得覆盖用户数据、对话历史、凭据、DSH Home 或无关插件。\n3. 优先把 payload 中的包按原相对路径合入，并把 manifest 中的 Cordis rows 合并到目标 Web Profile／bundle，不得整体替换目标 patch。\n4. 只执行覆盖所选插件的构建、类型检查或真实入口验证。\n5. 记录新增文件、修改文件、Cordis 行和所有兼容性调整。\n\n如果目标版本不兼容，遵循 INSTALL.md 的冲突兜底，不得用 reset、checkout 覆盖或删除整个目录解决冲突。\n'
}

function installInstructions(): string {
  return '# 安装与兼容流程\n\n## 直接安装\n\n1. 确认目标是 DSH 源码 checkout 或可写 Profile，并保留现有未提交改动。\n2. 对每个插件读取 manifest 中的 sources 与 rows。product 源必须把完整目录保留在 `plugins/<插件 id>`，不得把其中的文件摊入核心目录；repository 源按其原相对路径合入源码；profile 源可作为 out-of-tree 包放入目标 Profile 的 packages 目录。\n3. 让目标产品的插件目录发现器按文件夹生成构建入口、Web bundle 依赖和 Cordis rows；同 id 的行只合并本插件需要的 name、config 与 disabled，不覆盖其他字段。移除该插件文件夹后，发现器必须跳过它且核心仍能启动。\n4. 复用目标版本已有依赖，缺失依赖按目标仓库的包管理方式安装。\n5. 执行所选包的定向构建，并从真实设置或对话入口确认能力出现；再临时移走该文件夹，确认其他插件与核心仍可运行。\n\n## 冲突或失败兜底\n\n发生冲突或直接安装失败时，安装 AI 可以自行调整插件文件夹内的文件路径、import、类型、Slot 接口、package manifest 和 Cordis 组装，使 manifest 所描述的用户能力兼容目标 DSH。核心只允许增加与具体产品无关的中性扩展点；调整范围必须限制在冲突文件、所选插件及其直接依赖，并保留目标版本的新能力与用户数据。每项调整都要写入最终安装报告。无法安全兼容时停止，不留下半安装的启用行，并报告阻塞点与可恢复方式。\n'
}

function archiveTimestamp(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}${value.month}${value.day}-${value.hour}${value.minute}${value.second}`
}

/** Build one bounded ZIP from server-owned plugin definitions. */
export async function buildPluginExport(input: ExportInput): Promise<PluginExportResult> {
  const catalog = input.catalog ?? PLUGIN_EXPORT_CATALOG
  const selectedIds = [...new Set(input.selectedIds)]
  const plugins: PluginExportDefinition[] = []
  for (const id of selectedIds) {
    const plugin = catalog[id]
    if (plugin === undefined) throw new Error('插件选择无效')
    plugins.push(plugin)
  }
  if (plugins.length === 0) throw new Error('插件选择无效')
  const files: CollectedFile[] = []
  let totalBytes = 0
  for (const plugin of plugins) {
    for (const source of plugin.sources) {
      const base = source.kind === 'profile' ? input.profilePackagesRoot : input.repositoryRoot
      const root = safeRoot(base, source.path)
      const sourceFiles = await walk(root, source.kind)
      if (sourceFiles.length === 0) throw new Error(`插件 ${plugin.name} 缺少可导出代码`)
      for (const file of sourceFiles) {
        const archivePath = normalized(`payload/${plugin.id}/${source.kind}/${source.path}/${file.path}`)
        totalBytes += file.bytes.byteLength
        if (totalBytes > MAX_EXPORT_BYTES || files.length >= MAX_EXPORT_FILES) throw new Error('插件导出内容过大，请分批导出')
        files.push({
          path: archivePath,
          bytes: file.bytes,
          size: file.bytes.byteLength,
          sha256: createHash('sha256').update(file.bytes).digest('hex'),
        })
      }
    }
  }

  const manifestPlugins: PluginManifestEntry[] = plugins.map(plugin => ({
    id: plugin.id, name: plugin.name, rows: plugin.rows, sources: plugin.sources,
  }))
  const manifest = {
    schemaVersion: 1,
    kind: 'xiaozhuang-dsh-plugin-export',
    createdAt: input.now.toISOString(),
    sourceCommit: input.sourceCommit,
    plugins: manifestPlugins,
    files: files.map(file => ({ path: file.path, size: file.size, sha256: file.sha256 })),
    excludes: ['node_modules', 'Git metadata', 'tests', 'caches', 'credentials', 'sessions', 'conversation history', 'user settings'],
  }
  const archive: Record<string, Uint8Array> = {
    'README.md': strToU8(installationReadme(manifestPlugins)),
    'AGENTS.md': strToU8(agentInstructions()),
    'INSTALL.md': strToU8(installInstructions()),
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
  }
  for (const file of files) archive[file.path] = file.bytes
  return {
    filename: `xiaozhuang-dsh-plugins-${archiveTimestamp(input.now)}.zip`,
    bytes: zipSync(archive, { level: 6 }),
  }
}
