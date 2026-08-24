import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(root, 'assets/source-v8')
const outputRoot = resolve(root, 'assets/v8')
const frameSize = 384
const contentSize = 360

const sheets = [
  { clip: 'lounge', file: 'blue-lounge-sheet.png', columns: 5, rows: 4, opticalScale: 0.82 },
  {
    clip: 'portal',
    file: 'blue-portal-sheet.png',
    columns: 4,
    rows: 3,
    opticalScale: 0.82,
    bottomGutter: 41,
    targetBottom: 343,
  },
  { clip: 'focus', file: 'blue-focus-sheet.png', columns: 4, rows: 3, opticalScale: 0.82 },
  { clip: 'waiting', file: 'blue-waiting-sheet.png', columns: 4, rows: 3, opticalScale: 0.82 },
  { clip: 'success', file: 'blue-success-sheet.png', columns: 4, rows: 3, opticalScale: 0.82 },
]

async function removeMagentaBackground(source) {
  const decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = Buffer.from(decoded.data)
  for (let offset = 0; offset < pixels.length; offset += decoded.info.channels) {
    const red = pixels[offset] ?? 0
    const green = pixels[offset + 1] ?? 0
    const blue = pixels[offset + 2] ?? 0
    const magenta = Math.min(red, blue) - green
    if (red >= 60 && blue >= 100 && magenta >= 35 && Math.abs(red - blue) <= 180) {
      pixels[offset + 3] = 0
    }
  }
  return sharp(pixels, { raw: decoded.info }).png().toBuffer()
}

/**
 * Keep each authored camera cell intact. Semantic loops share the prone camera;
 * the portal sheet receives one fixed optical calibration and the same visible
 * bottom baseline, so teleporting never resizes or stretches the character.
 */
async function extractGridFrames(source, columns, rows, requestedGridInset = 2) {
  const metadata = await sharp(source).metadata()
  const cellWidth = Math.floor((metadata.width ?? 0) / columns)
  const cellHeight = Math.floor((metadata.height ?? 0) / rows)
  const gridInset = Math.min(requestedGridInset, Math.floor(Math.min(cellWidth, cellHeight) * 0.01))
  if (cellWidth <= gridInset * 2 || cellHeight <= gridInset * 2) {
    throw new Error(`Invalid grid dimensions in ${source}`)
  }

  const frames = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = column * cellWidth + gridInset
      const top = row * cellHeight + gridInset
      const width = cellWidth - gridInset * 2
      const height = cellHeight - gridInset * 2
      const cell = await sharp(source).extract({ left, top, width, height }).png().toBuffer()
      frames.push(await removeMagentaBackground(cell))
    }
  }
  return frames
}

function blackSkin(buffer, info) {
  const pixels = Buffer.from(buffer)
  for (let offset = 0; offset < pixels.length; offset += info.channels) {
    if (pixels[offset + 3] === 0) continue
    const red = pixels[offset]
    const green = pixels[offset + 1]
    const blue = pixels[offset + 2]
    const blueDominant = blue > red * 1.08 && blue > green * 1.02
    if (!blueDominant) continue

    const light = Math.round(red * 0.21 + green * 0.72 + blue * 0.07)
    const signal = green > red * 1.55 && blue > red * 1.65 && light > 115
    if (signal) {
      pixels[offset] = 80
      pixels[offset + 1] = 150
      pixels[offset + 2] = 255
      continue
    }

    const charcoal = Math.max(16, Math.min(118, Math.round(light * 0.58)))
    pixels[offset] = charcoal
    pixels[offset + 1] = Math.min(128, charcoal + 4)
    pixels[offset + 2] = Math.min(138, charcoal + 10)
  }
  return pixels
}

function removeSmallComponents(buffer, info, minimumPixels = 80) {
  const pixels = Buffer.from(buffer)
  const occupied = new Uint8Array(info.width * info.height)
  for (let index = 0; index < occupied.length; index += 1) {
    occupied[index] = (pixels[index * info.channels + 3] ?? 0) >= 24 ? 1 : 0
  }

  for (let start = 0; start < occupied.length; start += 1) {
    if (occupied[start] !== 1) continue
    const component = []
    const stack = [start]
    occupied[start] = 2
    while (stack.length > 0) {
      const current = stack.pop()
      component.push(current)
      const x = current % info.width
      const y = Math.floor(current / info.width)
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) continue
          const nextX = x + deltaX
          const nextY = y + deltaY
          if (nextX < 0 || nextY < 0 || nextX >= info.width || nextY >= info.height) continue
          const next = nextY * info.width + nextX
          if (occupied[next] === 1) {
            occupied[next] = 2
            stack.push(next)
          }
        }
      }
    }
    if (component.length >= minimumPixels) continue
    for (const index of component) pixels[index * info.channels + 3] = 0
  }
  return pixels
}

function alignVisibleBottom(buffer, info, targetBottom) {
  let currentBottom = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if ((buffer[(y * info.width + x) * info.channels + 3] ?? 0) >= 24) currentBottom = y
    }
  }
  if (currentBottom < 0 || currentBottom === targetBottom) return buffer
  const shift = targetBottom - currentBottom
  const aligned = Buffer.alloc(buffer.length)
  for (let y = 0; y < info.height; y += 1) {
    const targetY = y + shift
    if (targetY < 0 || targetY >= info.height) continue
    const sourceStart = y * info.width * info.channels
    const targetStart = targetY * info.width * info.channels
    buffer.copy(aligned, targetStart, sourceStart, sourceStart + info.width * info.channels)
  }
  return aligned
}

async function normalizeLockedCell(
  input,
  opticalScale = 1,
  bottomGutter = (frameSize - contentSize) / 2,
  targetBottom,
) {
  const targetSize = Math.round(contentSize * opticalScale)
  const horizontalGutter = Math.floor((frameSize - targetSize) / 2)
  const topGutter = frameSize - targetSize - bottomGutter
  const normalized = await sharp(input)
    .resize(targetSize, targetSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: topGutter,
      bottom: bottomGutter,
      left: horizontalGutter,
      right: frameSize - targetSize - horizontalGutter,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const cleaned = removeSmallComponents(normalized.data, normalized.info)
  const aligned = targetBottom === undefined
    ? cleaned
    : alignVisibleBottom(cleaned, normalized.info, targetBottom)
  return sharp(aligned, {
    raw: {
      width: normalized.info.width,
      height: normalized.info.height,
      channels: normalized.info.channels,
    },
  }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

let built = 0
for (const sheet of sheets) {
  const source = resolve(sheet.sourceRoot ?? sourceRoot, sheet.file)
  const frames = await extractGridFrames(source, sheet.columns, sheet.rows, sheet.gridInset)

  for (let index = 0; index < frames.length; index += 1) {
    const blue = await normalizeLockedCell(
      frames[index],
      sheet.opticalScale,
      sheet.bottomGutter,
      sheet.targetBottom,
    )
    const suffix = String(index + 1).padStart(2, '0')
    await sharp(blue).toFile(resolve(outputRoot, `blue-${sheet.clip}-${suffix}.png`))

    const { data, info } = await sharp(blue).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    await sharp(blackSkin(data, info), {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(resolve(outputRoot, `black-${sheet.clip}-${suffix}.png`))
    built += 2
  }
}

console.log(`Built ${built} companion frames in ${outputRoot}`)
