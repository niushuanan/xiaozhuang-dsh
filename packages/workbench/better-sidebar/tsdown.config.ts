/**
 * tsdown build for @deepseek-ai/dsh-better-sidebar (vendored from
 * omdsh-dev/DSH-better-sidebar, adapted to the xiaozhuang-dsh workspace):
 * the node half (lib/index.js + lib/invariant.js) plus the single browser
 * client bundle (lib/client.js) through the official clientBundle preset,
 * and three lazy chunk bundles (lib/client-<name>.js) emitted only on the
 * Client build face.
 *
 * The core client registers with window.__ModuleLoader__.load({ id, factory })
 * exactly like every other client package (the preset owns the banner and
 * the purity gate). The lazy chunks deliberately do NOT go through the
 * module loader: each assigns its CJS factory to the plugin-owned global
 * registry (globalThis.__dshChunks__[<name>]) and is fetched on first use
 * from this package's own /sidebar/bundle route (see src/bundle-route.ts and
 * src/client/chunk-loader.ts). Chunk externals (react family, cordis, the
 * ui-slots/ui-primitives/runtime module rows) resolve at runtime through the
 * ctx.modules module table; everything else inlines into the chunk script.
 * `codeSplitting: false` keeps every artifact a single script, and the core
 * client must never statically import a chunks/ entry.
 */
import { builtinModules, createRequire } from 'node:module'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { clientBundle } from '../../client/tsdown.client.ts'
import { PLATFORM_MODULES, PRELOADED_CLIENT_EXTERNALS } from '../../client/web/src/platform.ts'

const require = createRequire(import.meta.url)

/** The plugin id stamped into the __ModuleLoader__.load handoff and CSS tags. */
const ID = '@deepseek-ai/dsh-better-sidebar'

/** Node builtins must never survive into a browser artifact. */
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(id => `node:${id}`),
])

/** Specifiers the module table resolves at runtime (shared by chunks). */
const CHUNK_EXTERNALS = [...PLATFORM_MODULES, ...PRELOADED_CLIENT_EXTERNALS]

/** Chunk entries: one per heavy dependency, in lockstep with src/bundle-route.ts. */
const CHUNKS = ['terminal', 'editor', 'mermaid'] as const

/** Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

type BuildPlugin = NonNullable<UserConfig['plugins']>

/**
 * Mermaid-chunk-only alias: pin uuid's BROWSER entry. The mermaid core
 * (mindmap definition) imports the bare `uuid` specifier, which rolldown
 * resolves to uuid's node entry — its dist-node modules import node:crypto
 * and trip the purity gate. The browser entry (Web Crypto based) carries no
 * Node builtins, so alias the specifier there instead of special-casing the
 * gate. Resolved relative to mermaid's own dependency tree.
 */
function mermaidChunkAliases(): BuildPlugin {
  const uuidBrowserEntry = resolvePath(
    dirname(require.resolve('uuid/package.json', { paths: [dirname(require.resolve('mermaid/package.json'))] })),
    'dist/index.js',
  )
  return {
    name: 'dsh-mermaid-uuid-browser-alias',
    resolveId(source: string) {
      if (source === 'uuid') return uuidBrowserEntry
      return null
    },
  }
}

/** The chunk purity gate: module-table externals win, builtins and other @deepseek-ai value imports fail. */
function chunkPurityGate(): BuildPlugin {
  return {
    name: 'dsh-better-sidebar-chunk-purity',
    resolveId(source: string) {
      if (NODE_BUILTINS.has(source)) {
        throw new Error(
          `chunk purity: Node builtin "${source}" cannot run in a lazy browser chunk — `
          + 'select the dependency browser export or add an explicit browser implementation',
        )
      }
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CHUNK_EXTERNALS.includes(source)) return null
      throw new Error(
        `chunk purity: "${source}" is not a module-table external — cross-plugin value imports are forbidden; `
        + 'collaborate through cordis services (type-only imports are erased and never reach this gate)',
      )
    },
  }
}

/** The shared CSS-inline virtual-module plugin (one <style data-plugin> tag per file). */
function chunkCssPlugin(): BuildPlugin {
  return {
    name: 'dsh-better-sidebar-chunk-css',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.css')) return null
      const abs = importer === undefined ? source : resolvePath(dirname(importer), source)
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const { readFile } = await import('node:fs/promises')
      const source = await readFile(fileId)
      const { code } = transform({ filename: fileId, code: source, minify: true })
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(`${ID}/chunk/${fileId}`)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        'export {};',
      ].join('\n')
    },
  }
}

/** One lazy chunk bundle: a standalone CJS script registered under globalThis.__dshChunks__. */
function chunkBundle(name: (typeof CHUNKS)[number]): UserConfig {
  return {
    name: `${ID}/chunk-${name}`,
    entry: { [name]: `lib/types/client/chunks/${name}.js` },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
      'import.meta.resolve': 'undefined',
    },
    inputOptions: {
      resolve: {
        conditionNames: ['browser', 'import', 'require', 'default'],
      },
    },
    deps: {
      neverBundle: (id: string) => CHUNK_EXTERNALS.includes(id),
      alwaysBundle: (id: string) => !CHUNK_EXTERNALS.includes(id) && !NODE_BUILTINS.has(id),
    },
    plugins: [
      chunkPurityGate(),
      chunkCssPlugin(),
      ...(name === 'mermaid' ? [mermaidChunkAliases()] : []),
    ],
    outputOptions: {
      entryFileNames: `client-${name}.js`,
      banner: `globalThis.__dshChunks__ = globalThis.__dshChunks__ || {}; globalThis.__dshChunks__[${JSON.stringify(name)}] = (require) => {`,
      footer: 'return module.exports; };',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  }
}

/**
 * Build-face selection: the node half + core client ride the official
 * clientBundle preset; the lazy chunks emit only on the Client face.
 */
export default (inlineConfig: Pick<UserConfig, 'env'>): UserConfig[] => {
  const base = clientBundle(ID, ['lib/types/index.js', 'lib/types/invariant.js'])(inlineConfig)
  if (inlineConfig.env?.DSH_BUILD_FACE === 'host') return base
  return [...base, ...CHUNKS.map(chunkBundle)]
}
