import type { BlurStroke, VideoBlurRegion } from '../types'

// Paints a single blur mark (freehand stroke, or a rect/circle shape) as a
// white mask on a transparent background. Marks are rendered one at a time
// (not merged) so each can carry its own blur strength.
export function buildStrokeMask(width: number, height: number, strokes: BlurStroke[]): HTMLCanvasElement {
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  const ctx = mask.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const shortSide = Math.min(width, height)
  for (const stroke of strokes) {
    if (stroke.shape === 'rect' || stroke.shape === 'circle') {
      const cx = stroke.x * width
      const cy = stroke.y * height
      const rw = stroke.w * width
      const rh = stroke.h * height
      if (stroke.shape === 'circle') {
        ctx.beginPath()
        ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(cx - rw / 2, cy - rh / 2, rw, rh)
      }
      continue
    }
    if (stroke.points.length === 0) continue
    const lineWidth = Math.max(2, stroke.brushSize * shortSide)
    ctx.lineWidth = lineWidth
    if (stroke.points.length === 1) {
      const p = stroke.points[0]
      ctx.beginPath()
      ctx.arc(p.x * width, p.y * height, lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height)
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height)
    }
    ctx.stroke()
  }
  return mask
}

// Paints fixed-position blur regions (video) as a white mask.
export function buildRegionMask(width: number, height: number, regions: VideoBlurRegion[]): HTMLCanvasElement {
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  const ctx = mask.getContext('2d')!
  ctx.fillStyle = '#fff'
  for (const r of regions) {
    const cx = r.x * width
    const cy = r.y * height
    const rw = r.w * width
    const rh = r.h * height
    if (r.shape === 'circle') {
      ctx.beginPath()
      ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillRect(cx - rw / 2, cy - rh / 2, rw, rh)
    }
  }
  return mask
}

// Draws a blurred copy of `source`, masked to `mask`, on top of `targetCtx`.
export function drawBlurredMasked(
  targetCtx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  mask: HTMLCanvasElement,
  blurPx: number,
) {
  const blurred = document.createElement('canvas')
  blurred.width = width
  blurred.height = height
  const bctx = blurred.getContext('2d')!
  bctx.filter = `blur(${blurPx}px)`
  bctx.drawImage(source, 0, 0, width, height)
  bctx.filter = 'none'
  bctx.globalCompositeOperation = 'destination-in'
  bctx.drawImage(mask, 0, 0)
  bctx.globalCompositeOperation = 'source-over'
  targetCtx.drawImage(blurred, 0, 0)
}

export const DEFAULT_BLUR_STRENGTH = 0.6

// Video regions: strength 0..1 -> blur radius as a fraction of the short side
// (2%..18%). Deliberately heavy — video blur is mostly used to hide faces.
export function blurAmountFor(width: number, height: number, strength: number = DEFAULT_BLUR_STRENGTH): number {
  const shortSide = Math.min(width, height)
  return Math.max(6, shortSide * (0.02 + strength * 0.16))
}

// ---- Photo blur ---------------------------------------------------------
// The photo slider is exponential, not linear: every step of the slider changes
// the look by a similar visible amount, and the low end stays gentle enough that
// handwriting is still recognisable as writing ("something is written here").

export const DEFAULT_PHOTO_BLUR_STRENGTH = 0.4

// strength 0..1 -> gaussian sigma of 0.2%..6% of the short side.
// (~1.6px .. 50px on an 825px-tall preview; 0.4 ≈ 0.8%, a soft smudge.)
export function photoBlurSigma(width: number, height: number, strength: number): number {
  const shortSide = Math.min(width, height)
  return Math.max(1, shortSide * 0.002 * Math.pow(30, strength))
}

// strength 0..1 -> mosaic cell edge of 0.6%..5.4% of the short side.
export function mosaicCellSize(width: number, height: number, strength: number): number {
  const shortSide = Math.min(width, height)
  return Math.max(3, Math.round(shortSide * 0.006 * Math.pow(9, strength)))
}

// Shrinks `source` to (tw x th) in steps of at most 2x. A single big drawImage
// downscale only samples a few pixels per cell in some browsers (aliasing /
// noisy blocks); halving repeatedly gives a true average of each cell.
function downscale(source: HTMLCanvasElement, tw: number, th: number): HTMLCanvasElement {
  let cur = source
  while (cur.width > tw || cur.height > th) {
    const next = document.createElement('canvas')
    next.width = Math.max(tw, Math.ceil(cur.width / 2))
    next.height = Math.max(th, Math.ceil(cur.height / 2))
    const nctx = next.getContext('2d')!
    nctx.imageSmoothingEnabled = true
    nctx.imageSmoothingQuality = 'high'
    nctx.drawImage(cur, 0, 0, next.width, next.height)
    cur = next
  }
  return cur
}

// Draws a pixelated copy of `source`, masked to `mask`, on top of `targetCtx`.
// The grid is anchored to the canvas origin so overlapping marks of the same
// size share cell boundaries instead of producing a messy double grid.
export function drawMosaicMasked(
  targetCtx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  mask: HTMLCanvasElement,
  cell: number,
) {
  const cols = Math.max(1, Math.ceil(width / cell))
  const rows = Math.max(1, Math.ceil(height / cell))
  const small = downscale(source, cols, rows)

  const mosaic = document.createElement('canvas')
  mosaic.width = width
  mosaic.height = height
  const mctx = mosaic.getContext('2d')!
  mctx.imageSmoothingEnabled = false
  mctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, width, height)
  mctx.globalCompositeOperation = 'destination-in'
  mctx.drawImage(mask, 0, 0)
  mctx.globalCompositeOperation = 'source-over'
  targetCtx.drawImage(mosaic, 0, 0)
}

// Applies each mark individually (so per-mark style/strength is respected),
// reading and re-drawing onto the same canvas — later marks see earlier
// marks' effect already baked in, so overlaps stack naturally.
export function applyStrokeBlurs(canvas: HTMLCanvasElement, strokes: BlurStroke[]) {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  for (const stroke of strokes) {
    const mask = buildStrokeMask(width, height, [stroke])
    if (stroke.style === 'mosaic') {
      drawMosaicMasked(ctx, canvas, width, height, mask, mosaicCellSize(width, height, stroke.strength))
    } else {
      drawBlurredMasked(ctx, canvas, width, height, mask, photoBlurSigma(width, height, stroke.strength))
    }
  }
}

// Video mosaic cells are coarser than the photo ones (1.2%..8.4% of the short
// side) because video regions are mostly used to anonymise faces.
export function regionMosaicCellSize(width: number, height: number, strength: number): number {
  const shortSide = Math.min(width, height)
  return Math.max(4, Math.round(shortSide * 0.012 * Math.pow(7, strength)))
}

export function applyRegionBlurs(canvas: HTMLCanvasElement, regions: VideoBlurRegion[]) {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  for (const region of regions) {
    const mask = buildRegionMask(width, height, [region])
    if (region.style === 'mosaic') {
      drawMosaicMasked(ctx, canvas, width, height, mask, regionMosaicCellSize(width, height, region.strength))
    } else {
      drawBlurredMasked(ctx, canvas, width, height, mask, blurAmountFor(width, height, region.strength))
    }
  }
}
