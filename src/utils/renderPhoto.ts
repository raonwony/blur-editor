import type { PhotoProject, TextLayer } from '../types'
import { applyStrokeBlurs } from './canvasBlur'

interface RenderOptions {
  maxDim?: number
  includeText?: boolean
  includeCrop?: boolean
}

// Draws text layers onto a canvas already sized to (width x height) of the rotated media —
// shared by the photo renderer, the video frame baker, and the video live preview.
export function drawTextLayers(ctx: CanvasRenderingContext2D, textLayers: TextLayer[], width: number, height: number) {
  for (const t of textLayers) {
    if (!t.text.trim()) continue
    ctx.save()
    ctx.translate(t.x * width, t.y * height)
    ctx.rotate((t.rotation * Math.PI) / 180)
    const fontPx = Math.max(8, t.size * height)
    ctx.font = `${fontPx}px ${t.font}`
    ctx.fillStyle = t.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = t.strokeColor ?? 'transparent'
    ctx.lineWidth = Math.max(1, fontPx * 0.12)
    const lines = t.text.split('\n')
    const lineHeight = fontPx * 1.25
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * lineHeight
      if (t.strokeColor) ctx.strokeText(line, 0, y)
      ctx.fillText(line, 0, y)
    })
    ctx.restore()
  }
}

// Renders a photo project (rotation -> blur -> text -> crop) into a canvas.
// Works at any target resolution because all edits are stored normalized (0..1).
export function renderPhoto(image: HTMLImageElement, project: PhotoProject, opts: RenderOptions = {}): HTMLCanvasElement {
  const { maxDim = 1400, includeText = true, includeCrop = true } = opts

  const rotated90 = project.rotation === 90 || project.rotation === 270
  const rw = rotated90 ? image.naturalHeight : image.naturalWidth
  const rh = rotated90 ? image.naturalWidth : image.naturalHeight

  const scale = Math.min(1, maxDim / Math.max(rw, rh))
  const iw = Math.max(1, Math.round(rw * scale))
  const ih = Math.max(1, Math.round(rh * scale))

  const full = document.createElement('canvas')
  full.width = iw
  full.height = ih
  const fctx = full.getContext('2d')!
  fctx.save()
  fctx.translate(iw / 2, ih / 2)
  fctx.rotate((project.rotation * Math.PI) / 180)
  const drawW = rotated90 ? ih : iw
  const drawH = rotated90 ? iw : ih
  fctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH)
  fctx.restore()

  if (project.blurStrokes.length) {
    applyStrokeBlurs(full, project.blurStrokes)
  }

  if (includeText) {
    drawTextLayers(fctx, project.textLayers, iw, ih)
  }

  if (!includeCrop || !project.crop) return full

  const cx = project.crop.x * iw
  const cy = project.crop.y * ih
  const cw = Math.max(1, project.crop.width * iw)
  const ch = Math.max(1, project.crop.height * ih)
  const cropped = document.createElement('canvas')
  cropped.width = Math.round(cw)
  cropped.height = Math.round(ch)
  const cctx = cropped.getContext('2d')!
  cctx.drawImage(full, cx, cy, cw, ch, 0, 0, cropped.width, cropped.height)
  return cropped
}

export function rotatedSize(width: number, height: number, rotation: number) {
  const swapped = rotation === 90 || rotation === 270
  return swapped ? { width: height, height: width } : { width, height }
}
