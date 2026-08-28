import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(root, 'assets/source-v14')
const outputRoot = resolve(root, 'assets/v14')
const effectSourceRoot = resolve(root, 'assets/source-v9')
const effectOutputRoot = resolve(root, 'assets/v9')
const dissolveOutputRoot = resolve(root, 'assets/v13')
const frameSize = 384
const contentSize = 360
const dissolveFrameCount = 48
const dissolveRuntimeSize = 256

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
async function extractGridFrames(source, columns, rows, requestedGridInset = 4) {
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
    // The pearl-white bracers are a cross-skin readability cue, not a blue
    // garment panel. Keep their pale ice material legible in Night Black
    // instead of collapsing it back into the surrounding charcoal costume.
    const paleIce = red >= 145 && green >= 155 && blue >= 185 && light >= 165
    if (paleIce) {
      pixels[offset] = Math.max(red, 202)
      pixels[offset + 1] = Math.max(green, 214)
      pixels[offset + 2] = Math.max(blue, 232)
      continue
    }
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

function contiguousRuns(values) {
  const runs = []
  for (const value of values) {
    const previous = runs.at(-1)
    if (previous !== undefined && value === previous.end + 1) previous.end = value
    else runs.push({ start: value, end: value })
  }
  return runs
}

/**
 * ImageGen occasionally leaves unequal outer rows on a contact sheet. Detect
 * the authored black separators instead of assuming a mathematically perfect
 * grid, then read only the complete cells. This preserves all 20 real drawings
 * without ever admitting a cropped frame into the runtime.
 */
async function extractAuthoredGridFrames(source, columns, rows) {
  const decoded = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const blackAt = (x, y) => {
    const offset = (y * decoded.info.width + x) * decoded.info.channels
    return (decoded.data[offset] ?? 255) < 24
      && (decoded.data[offset + 1] ?? 255) < 24
      && (decoded.data[offset + 2] ?? 255) < 24
  }
  const horizontal = []
  for (let y = 0; y < decoded.info.height; y += 1) {
    let black = 0
    for (let x = 0; x < decoded.info.width; x += 1) if (blackAt(x, y)) black += 1
    if (black >= decoded.info.width * 0.68) horizontal.push(y)
  }
  const vertical = []
  for (let x = 0; x < decoded.info.width; x += 1) {
    let black = 0
    for (let y = 0; y < decoded.info.height; y += 1) if (blackAt(x, y)) black += 1
    if (black >= decoded.info.height * 0.68) vertical.push(x)
  }
  const rowLines = contiguousRuns(horizontal)
  const columnLines = contiguousRuns(vertical)
  if (rowLines.length < rows + 1 || columnLines.length < columns + 1) {
    throw new Error(`Could not detect ${columns}x${rows} authored grid in ${source}`)
  }

  const frames = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = columnLines[column].end + 1
      const top = rowLines[row].end + 1
      const width = columnLines[column + 1].start - left
      const height = rowLines[row + 1].start - top
      if (width <= 0 || height <= 0) throw new Error(`Invalid authored cell in ${source}`)
      const cell = await sharp(source).extract({ left, top, width, height }).png().toBuffer()
      frames.push(await removeMagentaBackground(cell))
    }
  }
  return frames
}

async function normalizePortalEffect(frame) {
  const decoded = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const cleaned = removeSmallComponents(decoded.data, decoded.info, 2_000)
  return sharp(cleaned, { raw: decoded.info })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
    .resize(336, 336, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .extend({
      top: 24,
      bottom: 24,
      left: 24,
      right: 24,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function buildPortalEffects() {
  await rm(effectOutputRoot, { recursive: true, force: true })
  await mkdir(effectOutputRoot, { recursive: true })
  const main = await extractAuthoredGridFrames(
    resolve(effectSourceRoot, 'blue-portal-effect-sheet-a.png'),
    5,
    3,
  )
  const supplement = await extractAuthoredGridFrames(
    resolve(effectSourceRoot, 'blue-portal-effect-sheet-b.png'),
    5,
    1,
  )
  const frames = [...main, ...supplement]
  if (frames.length !== 20) throw new Error(`Expected 20 portal drawings, received ${frames.length}`)

  for (let index = 0; index < frames.length; index += 1) {
    const suffix = String(index + 1).padStart(2, '0')
    const blue = await normalizePortalEffect(frames[index])
    await sharp(blue).toFile(resolve(effectOutputRoot, `blue-portal-effect-${suffix}.png`))
    const blackDecoded = await sharp(blue).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    await sharp(blackSkin(blackDecoded.data, blackDecoded.info), {
      raw: {
        width: blackDecoded.info.width,
        height: blackDecoded.info.height,
        channels: blackDecoded.info.channels,
      },
    })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(resolve(effectOutputRoot, `black-portal-effect-${suffix}.png`))
  }
}

function seededRandom(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let mixed = value
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61)
    return ((mixed ^ mixed >>> 14) >>> 0) / 4_294_967_296
  }
}

function smoothstep(value) {
  const bounded = Math.max(0, Math.min(1, value))
  return bounded * bounded * (3 - 2 * bounded)
}

async function characterMaterialMask() {
  const material = Buffer.alloc(frameSize * frameSize)
  for (const sheet of sheets.filter(sheet => sheet.clip !== 'portal')) {
    const count = sheet.columns * sheet.rows
    for (let frame = 1; frame <= count; frame += 1) {
      const source = resolve(outputRoot, `blue-${sheet.clip}-${String(frame).padStart(2, '0')}.png`)
      const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      for (let pixel = 0; pixel < material.length; pixel += 1) {
        if ((data[pixel * info.channels + 3] ?? 0) >= 8) material[pixel] = 255
      }
    }
  }
  return material
}

function localMaterialDensity(material, centerX, centerY, radius = 11) {
  let occupied = 0
  let sampled = 0
  for (let y = centerY - radius; y <= centerY + radius; y += 4) {
    for (let x = centerX - radius; x <= centerX + radius; x += 4) {
      if (x < 0 || y < 0 || x >= frameSize || y >= frameSize) continue
      sampled += 1
      if ((material[y * frameSize + x] ?? 0) > 0) occupied += 1
    }
  }
  return sampled === 0 ? 0 : occupied / sampled
}

/**
 * Derive the dissolve directly from the authored character silhouette. Seeds
 * exist only where one of the real V14 drawings has body material. A coherent
 * right-to-left wave releases boots, hair tips and garment edges first while
 * the face stays readable until the final beat.
 */
function createDissolveSeeds(material) {
  const random = seededRandom(0xD33F5EEC)
  const seeds = []
  const spacing = 10
  for (let y = 44; y <= 360; y += spacing) {
    for (let x = 18; x <= 374; x += spacing) {
      const centerX = Math.round(x + (random() - 0.5) * 6)
      const centerY = Math.round(y + (random() - 0.5) * 6)
      if ((material[centerY * frameSize + centerX] ?? 0) === 0) continue
      const faceDistance = Math.hypot((centerX - 113) / 48, (centerY - 176) / 58)
      const faceProtection = faceDistance < 1 ? (1 - faceDistance) * 0.22 : 0
      const density = localMaterialDensity(material, centerX, centerY)
      const edgeRelease = 1 - density
      const bodyDirection = 1 - Math.max(0, Math.min(1, (centerX - 30) / 330))
      const start = Math.max(0.025, Math.min(
        0.78,
        0.035 + bodyDirection * 0.62 + random() * 0.085 + faceProtection - edgeRelease * 0.11,
      ))
      seeds.push({
        x: centerX,
        y: centerY,
        radius: 7 + random() * 4.5 + edgeRelease * 3.5,
        start,
        duration: 0.15 + random() * 0.085,
      })
    }
  }
  return seeds
}

function buildBodyMask(progress, seeds, material) {
  const alpha = Buffer.from(material)
  if (progress <= 0 || progress >= 1) return alpha
  for (let y = 0; y < frameSize; y += 1) {
    for (let x = 0; x < frameSize; x += 1) {
      const pixel = y * frameSize + x
      if ((material[pixel] ?? 0) === 0) continue
      let retention = 1
      for (const seed of seeds) {
        const growth = smoothstep((progress - seed.start) / seed.duration)
        if (growth <= 0) continue
        const distance = Math.hypot(x - seed.x, y - seed.y)
        const signedEdge = distance - seed.radius * growth
        const hole = 1 - smoothstep((signedEdge + 1.6) / 3.2)
        retention *= 1 - hole
        if (retention <= 0.001) break
      }
      alpha[pixel] = Math.round(retention * 255)
    }
  }
  return alpha
}

function alphaMaskPng(alpha) {
  const rgba = Buffer.alloc(frameSize * frameSize * 4, 255)
  for (let index = 0; index < alpha.length; index += 1) rgba[index * 4 + 3] = alpha[index]
  return sharp(rgba, { raw: { width: frameSize, height: frameSize, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function writeRuntimeMaskStrip(kind, masks) {
  const cells = await Promise.all(masks.map(async alpha => ({
    input: await sharp(await alphaMaskPng(alpha))
      .resize(dissolveRuntimeSize, dissolveRuntimeSize, { fit: 'fill' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer(),
  })))
  await sharp({
    create: {
      width: dissolveRuntimeSize,
      height: dissolveRuntimeSize * dissolveFrameCount,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite(cells.map((cell, index) => ({
      input: cell.input,
      left: 0,
      top: index * dissolveRuntimeSize,
    })))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(dissolveOutputRoot, `${kind}-mask-strip.png`))
}

async function buildBodyDissolveMasks() {
  await rm(dissolveOutputRoot, { recursive: true, force: true })
  await mkdir(dissolveOutputRoot, { recursive: true })
  const material = await characterMaterialMask()
  const seeds = createDissolveSeeds(material)
  const bodyMasks = Array.from({ length: dissolveFrameCount }, (_, index) =>
    index === dissolveFrameCount - 1
      ? Buffer.alloc(frameSize * frameSize)
      : buildBodyMask(index / (dissolveFrameCount - 1), seeds, material))
  const fragmentMasks = bodyMasks.map((current, index) => {
    const prior = bodyMasks[Math.max(0, index - 6)]
    const fragments = Buffer.alloc(frameSize * frameSize)
    if (index < bodyMasks.length - 1) {
      for (let pixel = 0; pixel < fragments.length; pixel += 1) {
        fragments[pixel] = Math.max(0, (prior[pixel] ?? 0) - (current[pixel] ?? 0))
      }
    }
    return fragments
  })

  for (let index = 0; index < bodyMasks.length; index += 1) {
    const suffix = String(index + 1).padStart(2, '0')
    await sharp(await alphaMaskPng(bodyMasks[index]))
      .toFile(resolve(dissolveOutputRoot, `body-mask-${suffix}.png`))

    await sharp(await alphaMaskPng(fragmentMasks[index]))
      .toFile(resolve(dissolveOutputRoot, `fragment-mask-${suffix}.png`))
  }

  await Promise.all([
    writeRuntimeMaskStrip('body', bodyMasks),
    writeRuntimeMaskStrip('fragment', fragmentMasks),
  ])
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
await buildPortalEffects()
console.log(`Built 40 compositor portal frames in ${effectOutputRoot}`)
await buildBodyDissolveMasks()
console.log(`Built ${dissolveFrameCount * 2} character-derived dissolve masks and 2 runtime strips in ${dissolveOutputRoot}`)
