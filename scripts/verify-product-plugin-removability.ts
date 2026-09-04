/**
 * Destructive-looking but fully reversible product-plugin removal matrix.
 *
 * Every case physically moves the selected folder out of `plugins/`, composes
 * the real Web profile in a fresh DSH home, and restores the folder in a
 * `finally` block. The final case moves every plugin at once and proves the
 * official profile still composes with no repository-local product layer.
 */

import { mkdtemp, mkdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { discoverProductPluginBundles } from '../apps/cli/src/product-plugin-directory.ts'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const pluginsRoot = join(repositoryRoot, 'plugins')

const expectedIds = [
  'adaptive-update',
  'better-sidebar',
  'chat-mode',
  'conversation-import',
  'fluent-output',
  'memory-system',
  'model-usage',
  'multi-window',
  'parallel-development',
  'plugin-manager',
  'product-companion',
  'runtime-pulse',
  'selection-actions',
  'session-modes',
  'skill-manager',
  'teamwork',
  'token-overview',
  'vision',
] as const

function sameIds(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`${label}: expected [${expected.join(', ')}], received [${actual.join(', ')}]`)
  }
}

async function dumpWebConfig(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-removal-home-'))
  try {
    const result = await execa(process.execPath, [
      '--import',
      'tsx/esm',
      'apps/cli/src/bin.ts',
      'web',
      '--dump-default-config',
    ], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DSH_HOME: home,
        DSH_PRODUCT_PLUGINS_DIR: pluginsRoot,
      },
      reject: false,
    })
    if (result.exitCode !== 0) {
      throw new Error(`Web config dump exited ${result.exitCode}: ${result.stderr}`)
    }
    if (result.stderr.trim() !== '') {
      throw new Error(`Web config dump reported a composition warning: ${result.stderr.trim()}`)
    }
    if (!result.stdout.includes('id: modules')) {
      throw new Error('Web config dump omitted the official modules row')
    }
    return result.stdout
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

function assertOfficialFallback(config: string, removed: ReadonlySet<string>): void {
  if (removed.has('conversation-import')) {
    const official = "- id: session-log-download\n  name: '@deepseek-ai/dsh-session-log-export'"
    if (!config.includes(official) || config.includes('patched by product:conversation-import')) {
      throw new Error('conversation-import removal did not restore the official session-log row')
    }
  }
  if (removed.has('session-modes')) {
    const official = "- id: ui-agent-preset\n  name: '@deepseek-ai/dsh-client-ui-agent-preset'"
    if (!config.includes(official) || config.includes('patched by product:session-modes')) {
      throw new Error('session-modes removal did not restore the official agent-preset row')
    }
  }
}

async function withFoldersMoved<T>(
  ids: readonly string[],
  stagingRoot: string,
  run: () => Promise<T>,
): Promise<T> {
  const moved: string[] = []
  try {
    for (const id of ids) {
      const destination = join(stagingRoot, id)
      await mkdir(dirname(destination), { recursive: true })
      await rename(join(pluginsRoot, id), destination)
      moved.push(id)
    }
    return await run()
  } finally {
    for (const id of moved.reverse()) {
      await rename(join(stagingRoot, id), join(pluginsRoot, id))
    }
  }
}

/** Run the 18 single-folder cases and the zero-plugin case. */
export async function verifyProductPluginRemovability(): Promise<void> {
  const initial = await discoverProductPluginBundles(pluginsRoot)
  sameIds(initial.map(bundle => bundle.id), expectedIds, 'initial product plugin set')
  const stagingRoot = await mkdtemp(join(dirname(pluginsRoot), '.product-plugin-removal-'))
  try {
    for (const removedId of expectedIds) {
      await withFoldersMoved([removedId], stagingRoot, async () => {
        const expected = expectedIds.filter(id => id !== removedId)
        const present = await discoverProductPluginBundles(pluginsRoot)
        sameIds(present.map(bundle => bundle.id), expected, `without ${removedId}`)
        const config = await dumpWebConfig()
        if (config.includes(`# == product:${removedId}`)) {
          throw new Error(`${removedId}: removed folder still contributed Web configuration`)
        }
        assertOfficialFallback(config, new Set([removedId]))
      })
      process.stdout.write(`PASS single-folder removal: ${removedId}\n`)
    }

    await withFoldersMoved(expectedIds, stagingRoot, async () => {
      sameIds(
        (await discoverProductPluginBundles(pluginsRoot)).map(bundle => bundle.id),
        [],
        'zero-plugin discovery',
      )
      const config = await dumpWebConfig()
      if (config.includes('# == product:')) {
        throw new Error('zero-plugin Web config retained a product-plugin layer')
      }
      assertOfficialFallback(config, new Set(expectedIds))
    })
    process.stdout.write('PASS zero-plugin Web composition\n')
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }

  sameIds(
    (await discoverProductPluginBundles(pluginsRoot)).map(bundle => bundle.id),
    expectedIds,
    'restored product plugin set',
  )
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await verifyProductPluginRemovability()
}
