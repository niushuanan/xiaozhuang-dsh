import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const ASSET_ROOT = fileURLToPath(new URL('../assets/v14/', import.meta.url))
const MASK_ROOT = fileURLToPath(new URL('../assets/v13/', import.meta.url))
const COMPANION_CSS = readFileSync(fileURLToPath(new URL('../src/client/ProductCompanion.module.css', import.meta.url)), 'utf8')
const SKINS = ['blue', 'black'] as const
const CLIPS = ['lounge', 'focus', 'waiting', 'success'] as const
const PRONE_CLIPS = ['lounge', 'focus', 'waiting', 'success'] as const
const FRAME_COUNTS: Readonly<Record<(typeof CLIPS)[number], number>> = {
  lounge: 20,
  focus: 12,
  waiting: 12,
  success: 12,
}
const CANVAS_SIZE = 384
const CLEAR_EDGE = 8
const DISSOLVE_FRAME_COUNT = 48
const alphaCache = new Map<string, Promise<Uint8Array>>()

async function alphaChannel(name: string): Promise<Uint8Array> {
  const cached = alphaCache.get(name)
  if (cached !== undefined) return cached
  const loading = sharp(`${ASSET_ROOT}${name}`).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  }).then(({ data, info }) => {
    expect(info).toMatchObject({ width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4 })
    const alpha = new Uint8Array(CANVAS_SIZE * CANVAS_SIZE)
    for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4 + 3] ?? 0
    return alpha
  })
  alphaCache.set(name, loading)
  return loading
}

function componentCount(alpha: Uint8Array): number {
  const occupied = alpha.map(value => Number(value >= 24))
  let count = 0
  for (let index = 0; index < occupied.length; index += 1) {
    if (occupied[index] !== 1) continue
    count += 1
    const stack = [index]
    occupied[index] = 2
    while (stack.length > 0) {
      const current = stack.pop()!
      const x = current % CANVAS_SIZE
      const y = Math.floor(current / CANVAS_SIZE)
      const neighbors = [-1, 0, 1].flatMap(deltaY => [-1, 0, 1].map((deltaX) => {
        if (deltaX === 0 && deltaY === 0) return -1
        const nextX = x + deltaX
        const nextY = y + deltaY
        return nextX >= 0 && nextX < CANVAS_SIZE && nextY >= 0 && nextY < CANVAS_SIZE
          ? nextY * CANVAS_SIZE + nextX
          : -1
      }))
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && occupied[neighbor] === 1) {
          occupied[neighbor] = 2
          stack.push(neighbor)
        }
      }
    }
  }
  return count
}

function alphaBounds(alpha: Uint8Array): { width: number; height: number; area: number; bottom: number } {
  let minX = CANVAS_SIZE
  let minY = CANVAS_SIZE
  let maxX = -1
  let maxY = -1
  let area = 0
  for (let y = 0; y < CANVAS_SIZE; y += 1) {
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      if ((alpha[y * CANVAS_SIZE + x] ?? 0) < 24) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      area += 1
    }
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1, area, bottom: maxY }
}

function primaryAlphaBounds(alpha: Uint8Array): ReturnType<typeof alphaBounds> {
  const occupied = alpha.map(value => Number(value >= 24))
  let largest = { width: 0, height: 0, area: 0, bottom: -1 }
  for (let index = 0; index < occupied.length; index += 1) {
    if (occupied[index] !== 1) continue
    let minX = CANVAS_SIZE
    let minY = CANVAS_SIZE
    let maxX = -1
    let maxY = -1
    let area = 0
    const stack = [index]
    occupied[index] = 2
    while (stack.length > 0) {
      const current = stack.pop()!
      const x = current % CANVAS_SIZE
      const y = Math.floor(current / CANVAS_SIZE)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      area += 1
      for (const [deltaX, deltaY] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nextX = x + deltaX
        const nextY = y + deltaY
        if (nextX < 0 || nextX >= CANVAS_SIZE || nextY < 0 || nextY >= CANVAS_SIZE) continue
        const next = nextY * CANVAS_SIZE + nextX
        if (occupied[next] !== 1) continue
        occupied[next] = 2
        stack.push(next)
      }
    }
    if (area > largest.area) {
      largest = { width: maxX - minX + 1, height: maxY - minY + 1, area, bottom: maxY }
    }
  }
  return largest
}

describe('product companion generated frames', () => {
  it('does not add a rectangular shadow or focus ring around the transparent character canvas', () => {
    const characterImageRule = COMPANION_CSS.match(/\.characterImage\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? ''
    expect(characterImageRule).not.toMatch(/(?:box-shadow|drop-shadow)/)
    expect(COMPANION_CSS).not.toMatch(/\.character:focus-visible/)
  })

  it('keeps every runtime frame clear of the canvas edge', async () => {
    for (const skin of SKINS) {
      for (const clip of CLIPS) {
        for (let frame = 1; frame <= FRAME_COUNTS[clip]; frame += 1) {
          const name = `${skin}-${clip}-${String(frame).padStart(2, '0')}.png`
          const alpha = await alphaChannel(name)
          let maximumEdgeAlpha = 0
          for (let y = 0; y < CANVAS_SIZE; y += 1) {
            for (let x = 0; x < CANVAS_SIZE; x += 1) {
              if (x < CLEAR_EDGE || y < CLEAR_EDGE || x >= CANVAS_SIZE - CLEAR_EDGE || y >= CANVAS_SIZE - CLEAR_EDGE) {
                maximumEdgeAlpha = Math.max(maximumEdgeAlpha, alpha[y * CANVAS_SIZE + x] ?? 0)
              }
            }
          }
          expect(maximumEdgeAlpha, `${name} has edge residue`).toBe(0)
        }
      }
    }
  })

  it('contains one character composition and only intentional attached accents', async () => {
    for (const skin of SKINS) {
      for (const clip of CLIPS) {
        for (let frame = 1; frame <= FRAME_COUNTS[clip]; frame += 1) {
          const name = `${skin}-${clip}-${String(frame).padStart(2, '0')}.png`
          const maximumComponents = clip === 'success' ? 3 : 2
          expect(componentCount(await alphaChannel(name)), name).toBeLessThanOrEqual(maximumComponents)
        }
      }
    }
  })

  it('keeps blue and black silhouettes identical', async () => {
    for (const clip of CLIPS) {
      for (let frame = 1; frame <= FRAME_COUNTS[clip]; frame += 1) {
        const suffix = `${clip}-${String(frame).padStart(2, '0')}.png`
        expect(await alphaChannel(`black-${suffix}`)).toEqual(await alphaChannel(`blue-${suffix}`))
      }
    }
  }, 45_000)

  it('keeps the authored camera locked within each continuous loop', async () => {
    for (const clip of PRONE_CLIPS) {
      const bounds = await Promise.all(Array.from(
        { length: FRAME_COUNTS[clip] },
        (_, frame) => alphaChannel(`blue-${clip}-${String(frame + 1).padStart(2, '0')}.png`)
          .then(primaryAlphaBounds),
      ))
      const width = bounds.map(value => value.width)
      const height = bounds.map(value => value.height)
      const area = bounds.map(value => value.area)
      expect(Math.max(...width) - Math.min(...width), `${clip} width drift`).toBeLessThanOrEqual(28)
      expect(Math.max(...height) - Math.min(...height), `${clip} height drift`).toBeLessThanOrEqual(18)
      expect(Math.max(...area) / Math.min(...area), `${clip} volume drift`).toBeLessThan(1.2)
    }
  })

  it('keeps every runtime state in the same wide prone camera', async () => {
    for (const clip of PRONE_CLIPS) {
      for (let frame = 1; frame <= FRAME_COUNTS[clip]; frame += 1) {
        const name = `blue-${clip}-${String(frame).padStart(2, '0')}.png`
        const bounds = alphaBounds(await alphaChannel(name))
        expect(bounds.width, `${name} is not a wide prone silhouette`).toBeGreaterThan(190)
        expect(bounds.height, `${name} exceeds the prone camera height`).toBeLessThan(245)
      }
    }
  })

  it('keeps the lower prone silhouette light enough to leave composer whitespace', async () => {
    for (const clip of PRONE_CLIPS) {
      let totalArea = 0
      let lowerRightArea = 0
      for (let frame = 1; frame <= FRAME_COUNTS[clip]; frame += 1) {
        const alpha = await alphaChannel(`blue-${clip}-${String(frame).padStart(2, '0')}.png`)
        for (let y = 0; y < CANVAS_SIZE; y += 1) {
          for (let x = 0; x < CANVAS_SIZE; x += 1) {
            if ((alpha[y * CANVAS_SIZE + x] ?? 0) < 24) continue
            totalArea += 1
            if (x >= 145 && y >= 180) lowerRightArea += 1
          }
        }
      }
      expect(lowerRightArea / totalArea, `${clip} lower body is visually too heavy`)
        .toBeLessThan(0.535)
    }
  })

  it('keeps the pearl-white ice-blue forearm guards readable in both skins', async () => {
    for (const clip of PRONE_CLIPS) {
      const ratios = []
      for (const skin of SKINS) {
        const { data, info } = await sharp(`${ASSET_ROOT}${skin}-${clip}-01.png`)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        let visible = 0
        let paleIce = 0
        // All accepted prone cameras keep the foreground forearm guards in
        // this shared lower-left band while the torso remains above it.
        for (let y = 260; y < 355; y += 1) {
          for (let x = 40; x < 180; x += 1) {
            const offset = (y * info.width + x) * info.channels
            if ((data[offset + 3] ?? 0) <= 32) continue
            visible += 1
            if ((data[offset] ?? 0) > 150
              && (data[offset + 1] ?? 0) > 160
              && (data[offset + 2] ?? 0) > 185) paleIce += 1
          }
        }
        ratios.push(paleIce / visible)
      }
      expect(Math.min(...ratios), `${clip} bracers merged back into the dark costume`)
        .toBeGreaterThan(0.14)
      expect(Math.abs((ratios[0] ?? 0) - (ratios[1] ?? 0)), `${clip} skin contrast drift`)
        .toBeLessThan(0.03)
    }
  })

  it('builds 48 masks from the real character material instead of a separate bubble cloud', async () => {
    const material = new Uint8Array(CANVAS_SIZE * CANVAS_SIZE)
    for (const clip of CLIPS) {
      for (let frame = 1; frame <= FRAME_COUNTS[clip]; frame += 1) {
        const alpha = await alphaChannel(`blue-${clip}-${String(frame).padStart(2, '0')}.png`)
        for (let pixel = 0; pixel < material.length; pixel += 1) {
          if ((alpha[pixel] ?? 0) >= 8) material[pixel] = 255
        }
      }
    }
    const materialCoverage = material.reduce((total, value) => total + value, 0)
    const bodyCoverage = []
    const fragmentCoverage = []
    for (let frame = 1; frame <= DISSOLVE_FRAME_COUNT; frame += 1) {
      const suffix = String(frame).padStart(2, '0')
      for (const kind of ['body', 'fragment'] as const) {
        const path = `${MASK_ROOT}${kind}-mask-${suffix}.png`
        const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        expect(info).toMatchObject({ width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4 })
        let coverage = 0
        let escaped = 0
        for (let index = 0; index < CANVAS_SIZE * CANVAS_SIZE; index += 1) {
          const alpha = data[index * info.channels + 3] ?? 0
          coverage += alpha
          if ((material[index] ?? 0) === 0 && alpha > 0) escaped += 1
        }
        expect(escaped, `${kind}-${suffix} escaped the character`).toBe(0)
        if (kind === 'body') bodyCoverage.push(coverage)
        else fragmentCoverage.push(coverage)
      }
    }
    expect(bodyCoverage[0]).toBe(materialCoverage)
    expect(bodyCoverage.at(-1)).toBe(0)
    for (let index = 1; index < bodyCoverage.length; index += 1) {
      expect(bodyCoverage[index]).toBeLessThanOrEqual(bodyCoverage[index - 1])
    }
    expect(Math.max(...fragmentCoverage.slice(3, -2))).toBeGreaterThan(500_000)
    expect(fragmentCoverage[0]).toBe(0)
    expect(fragmentCoverage.at(-1)).toBe(0)
    expect(COMPANION_CSS).toContain('mask-image: var(--companion-material-mask)')
    expect(COMPANION_CSS).toContain('material-mask-out var(--dissolve-frame-crossfade-ms)')
    expect(COMPANION_CSS).not.toContain('bubble-cloud-cycle')
    expect(COMPANION_CSS).not.toContain('companion-dissolve')
  })

  it('keeps the companion controls phase-aligned with material relocation', () => {
    expect(COMPANION_CSS).toContain(".root[data-teleport='departing'] .quickControls")
    expect(COMPANION_CSS).toContain(".root[data-teleport='arriving'] .quickControls")
    expect(COMPANION_CSS).toContain('companion-accessories-depart var(--dissolve-phase-ms)')
    expect(COMPANION_CSS).toContain('companion-accessories-arrive var(--dissolve-phase-ms)')
    expect(COMPANION_CSS).toContain('0%, 8% { opacity: 1')
    expect(COMPANION_CSS).toContain('40%, 100% { opacity: 0')
  })
})
