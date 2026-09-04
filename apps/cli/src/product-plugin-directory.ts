/**
 * Optional repository-local product bundle discovery.
 * @module @deepseek-ai/dsh/product-plugin-directory
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

interface ProductPluginManifest {
  name?: unknown
  dsh?: { bundle?: { patch?: unknown; replaces?: unknown } }
}

/** One native bundle found beneath the product plugin directory. */
export interface ProductPluginBundle {
  /** Stable plugin id declared by its folder name. */
  readonly id: string
  /** Absolute plugin folder. */
  readonly directory: string
  /** Absolute package manifest path. */
  readonly manifestPath: string
  /** Absolute bundle patch path. */
  readonly patchPath: string
  /** Optional upstream-row to bundle-row redirects used while reading legacy user patches. */
  readonly replacements?: Readonly<Record<string, string>>
}

/** One discovered bundle with its parsed Cordis patch layer. */
export interface ProductPluginLayer extends ProductPluginBundle {
  /** Parsed entries from the plugin-owned bundle patch. */
  readonly patches: PatchOptions[]
}

function parseReplacements(manifestPath: string, value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${manifestPath}: dsh.bundle.replaces must be an object mapping old row ids to bundle row ids`)
  }
  const replacements: Record<string, string> = {}
  for (const [source, target] of Object.entries(value)) {
    if (source.trim() === '' || typeof target !== 'string' || target.trim() === '') {
      throw new Error(`${manifestPath}: dsh.bundle.replaces must map non-empty row ids to non-empty row ids`)
    }
    if (source === target) {
      throw new Error(`${manifestPath}: dsh.bundle.replaces cannot map ${JSON.stringify(source)} to itself`)
    }
    replacements[source] = target
  }
  return replacements
}

function insertedRowIds(patches: readonly PatchOptions[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const patch of patches) {
    for (const entry of patch.insert ?? []) {
      if (typeof entry.id === 'string' && entry.id !== '') ids.add(entry.id)
      if (entry.group && Array.isArray(entry.config)) {
        for (const id of insertedRowIds([{ insert: entry.config }])) ids.add(id)
      }
    }
  }
  return ids
}

/**
 * Resolve the optional product plugin directory for this installation.
 * @param installAnchor - absolute path of the CLI package manifest.
 * @param configured - optional inherited-environment override.
 * @param cwd - base for a relative override.
 * @returns the absolute directory to scan.
 */
export function resolveProductPluginRoot(
  installAnchor: string,
  configured: string | undefined,
  cwd: string = process.cwd(),
): string {
  if (configured !== undefined && configured.trim() !== '') return resolve(cwd, configured)
  return resolve(dirname(installAnchor), '..', '..', 'plugins')
}

/**
 * Discover native product bundles from direct child folders.
 * @param root - absolute product plugin directory.
 * @returns discovered bundles; a missing root is an empty optional layer.
 */
export async function discoverProductPluginBundles(root: string): Promise<readonly ProductPluginBundle[]> {
  const absoluteRoot = resolve(root)
  let entries
  try {
    entries = await readdir(absoluteRoot, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const bundles: ProductPluginBundle[] = []
  for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = join(absoluteRoot, entry.name)
    const manifestPath = join(directory, 'package.json')
    let manifest: ProductPluginManifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ProductPluginManifest
    } catch (error) {
      throw new Error(`${manifestPath}: failed to read product plugin manifest: ${String(error)}`)
    }
    if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
      throw new Error(`${manifestPath}: name must be a non-empty string`)
    }
    const declaredPatch = manifest.dsh?.bundle?.patch
    if (typeof declaredPatch !== 'string' || declaredPatch.trim() === '' || isAbsolute(declaredPatch)) {
      throw new Error(`${manifestPath}: dsh.bundle.patch must be a non-empty relative path`)
    }
    const patchPath = resolve(directory, declaredPatch)
    const patchFromDirectory = relative(directory, patchPath)
    if (patchFromDirectory === '..' || patchFromDirectory.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
      || isAbsolute(patchFromDirectory)) {
      throw new Error(`${manifestPath}: dsh.bundle.patch must stay inside the plugin folder`)
    }
    try {
      if (!(await stat(patchPath)).isFile()) throw new Error('path is not a file')
    } catch (error) {
      throw new Error(`${manifestPath}: dsh.bundle.patch does not name a readable file: ${String(error)}`)
    }
    const replacements = parseReplacements(manifestPath, manifest.dsh?.bundle?.replaces)
    bundles.push({
      id: entry.name,
      directory,
      manifestPath,
      patchPath,
      ...(replacements === undefined ? {} : { replacements }),
    })
  }
  return bundles
}

/**
 * Load every present product plugin's native bundle patch.
 * @param root - absolute product plugin directory.
 * @returns parsed layers in stable folder order.
 */
export async function loadProductPluginLayers(root: string): Promise<readonly ProductPluginLayer[]> {
  // Discovery is also used by the pre-build orchestrator, before app-boot has
  // emitted its package entrypoint. Load the parser only on the runtime path.
  const { loadOverlayPatches } = await import('@deepseek-ai/dsh-app-boot')
  const bundles = await discoverProductPluginBundles(root)
  return bundles.map((bundle) => {
    const patches = loadOverlayPatches(`dsh product plugin ${bundle.id}`, bundle.patchPath)
    const ownedIds = insertedRowIds(patches)
    for (const target of Object.values(bundle.replacements ?? {})) {
      if (!ownedIds.has(target)) {
        throw new Error(`${bundle.manifestPath}: dsh.bundle.replaces target ${JSON.stringify(target)} is not inserted by this plugin`)
      }
    }
    return { ...bundle, patches }
  })
}

/**
 * Reconcile user patches written by the pre-directory product with the
 * physically present product bundles. Duplicate legacy inserts become
 * ordinary overrides of the folder-owned row, while a bundle-declared
 * upstream replacement receives the user's former switch/config patches.
 * With the folder absent there is no ownership claim and the user patch is
 * returned unchanged, preserving the upstream fallback.
 * @param layers - product bundles present for this composition.
 * @param patches - one later user or command-line patch layer.
 * @returns a detached compatible patch list.
 */
export function reconcileProductPluginUserPatches(
  layers: readonly ProductPluginLayer[],
  patches: readonly PatchOptions[],
): PatchOptions[] {
  const ownedIds = new Set<string>()
  const replacements = new Map<string, string>()
  for (const layer of layers) {
    for (const id of insertedRowIds(layer.patches)) ownedIds.add(id)
    for (const [source, target] of Object.entries(layer.replacements ?? {})) {
      const previous = replacements.get(source)
      if (previous !== undefined && previous !== target) {
        throw new Error(`product plugins replace row ${JSON.stringify(source)} with both ${JSON.stringify(previous)} and ${JSON.stringify(target)}`)
      }
      replacements.set(source, target)
    }
  }
  if (ownedIds.size === 0 && replacements.size === 0) return patches.map(patch => structuredClone(patch))

  const result: PatchOptions[] = []
  for (const original of patches) {
    const patch = structuredClone(original)
    if (patch.insert !== undefined) {
      const retained = []
      const overrides: PatchOptions[] = []
      for (const entry of patch.insert) {
        const target = ownedIds.has(entry.id) ? entry.id : replacements.get(entry.id)
        if (target === undefined) {
          retained.push(entry)
          continue
        }
        const { id: _id, name: _name, ...values } = entry
        if (Object.keys(values).length > 0) overrides.push({ id: target, ...values })
      }
      if (retained.length > 0) result.push({ ...patch, insert: retained })
      result.push(...overrides)
      continue
    }

    if (typeof patch.id !== 'string') {
      result.push(patch)
      continue
    }
    const target = replacements.get(patch.id) ?? (ownedIds.has(patch.id) ? patch.id : undefined)
    if (target === undefined) {
      result.push(patch)
      continue
    }
    const { name: _name, ...values } = patch
    result.push({ ...values, id: target })
  }
  return result
}
