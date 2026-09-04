/**
 * Optional repository-local product bundle discovery.
 * @module @deepseek-ai/dsh/product-plugin-directory
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

interface ProductPluginManifest {
  name?: unknown
  dsh?: { bundle?: { patch?: unknown } }
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
}

/** One discovered bundle with its parsed Cordis patch layer. */
export interface ProductPluginLayer extends ProductPluginBundle {
  /** Parsed entries from the plugin-owned bundle patch. */
  readonly patches: PatchOptions[]
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
    bundles.push({ id: entry.name, directory, manifestPath, patchPath })
  }
  return bundles
}

/**
 * Load every present product plugin's native bundle patch.
 * @param root - absolute product plugin directory.
 * @returns parsed layers in stable folder order.
 */
export async function loadProductPluginLayers(root: string): Promise<readonly ProductPluginLayer[]> {
  const bundles = await discoverProductPluginBundles(root)
  return bundles.map(bundle => ({
    ...bundle,
    patches: loadOverlayPatches(`dsh product plugin ${bundle.id}`, bundle.patchPath),
  }))
}
