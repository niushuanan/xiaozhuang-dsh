import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const ASSET_ROOT = fileURLToPath(new URL('../assets/v8/', import.meta.url))
const COMPANION_CSS = readFileSync(fileURLToPath(new URL('../src/client/ProductCompanion.module.css', import.meta.url)), 'utf8')
const SKINS = ['blue', 'black'] as const
const CLIPS = ['lounge', 'portal', 'focus', 'waiting', 'success'] as const
const PRONE_CLIPS = ['lounge', 'focus', 'waiting', 'success'] as const
const FRAME_COUNTS: Readonly<Record<(typeof CLIPS)[number], number>> = {
  lounge: 20,
  portal: 6,
  focus: 12,
  waiting: 12,
  success: 12,
}
const CANVAS_SIZE = 384
const CLEAR_EDGE = 8
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
          const maximumComponents = clip === 'success' || clip === 'portal' ? 3 : 2
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
          .then(alphaBounds),
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

  it('locks the portal to the same optical body length and composer baseline', async () => {
    const lounge = alphaBounds(await alphaChannel('blue-lounge-01.png'))
    const portal = await Promise.all(Array.from(
      { length: FRAME_COUNTS.portal },
      (_, frame) => alphaChannel(`blue-portal-${String(frame + 1).padStart(2, '0')}.png`)
        .then(alphaBounds),
    ))
    for (const [index, bounds] of portal.entries()) {
      expect(
        Math.abs(Math.max(bounds.width, bounds.height) - lounge.width),
        `portal-${index + 1} changes optical body length`,
      ).toBeLessThanOrEqual(8)
      expect(Math.abs(bounds.bottom - lounge.bottom), `portal-${index + 1} changes baseline`)
        .toBeLessThanOrEqual(3)
    }
  })
})
