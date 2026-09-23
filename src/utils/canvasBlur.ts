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

// strength 0..1 -> blur radius as a fraction of the short side (2%..18%),
// floored so even tiny images get a visible blur.
export function blurAmountFor(width: number, height: number, strength: number = DEFAULT_BLUR_STRENGTH): number {
  const shortSide = Math.min(width, height)
  return Math.max(6, shortSide * (0.02 + strength * 0.16))
}

// Applies each mark's blur individually (so per-mark strength is respected),
// reading and re-drawing onto the same canvas — later marks see earlier
// marks' blur already baked in, so overlaps stack naturally.
export function applyStrokeBlurs(canvas: HTMLCanvasElement, strokes: BlurStroke[]) {
  const ctx = canvas.getContext('2d')!
  for (const stroke of strokes) {
    const mask = buildStrokeMask(canvas.width, canvas.height, [stroke])
    drawBlurredMasked(ctx, canvas, canvas.width, canvas.height, mask, blurAmountFor(canvas.width, canvas.height, stroke.strength))
  }
}

export function applyRegionBlurs(canvas: HTMLCanvasElement, regions: VideoBlurRegion[]) {
  const ctx = canvas.getContext('2d')!
  for (const region of regions) {
    const mask = buildRegionMask(canvas.width, canvas.height, [region])
    drawBlurredMasked(ctx, canvas, canvas.width, canvas.height, mask, blurAmountFor(canvas.width, canvas.height, region.strength))
  }
}
