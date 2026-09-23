import type { CropRect, Point } from '../types'

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

// Rotates a normalized (0..1) point 90° clockwise within its unit square —
// the same transform a 90° clockwise photo rotation applies to its bounding box.
export function rotatePoint90(p: Point): Point {
  return { x: 1 - p.y, y: p.x }
}

// Same transform applied to a normalized crop rect (top-left + size).
export function rotateCropRect90(crop: CropRect): CropRect {
  return { x: 1 - crop.y - crop.height, y: crop.x, width: crop.height, height: crop.width }
}

// Keeps a rotation/tilt angle (degrees) within (-180, 180] after adding a delta.
export function normalizeAngle(deg: number): number {
  let a = deg % 360
  if (a <= -180) a += 360
  if (a > 180) a -= 360
  return a
}

export interface CropAspectPreset {
  label: string
  ratio: number | null // width/height in real pixels, null = free
}

export const CROP_PRESETS: CropAspectPreset[] = [
  { label: '자유', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '9:16', ratio: 9 / 16 },
]

// Given a pixel aspect ratio (w/h) and the rotated media's pixel size,
// return a centered crop rect in normalized (0..1) coordinates.
export function cropForRatio(ratio: number, mediaW: number, mediaH: number) {
  // width, height are normalized (0..1); want (width*mediaW)/(height*mediaH) === ratio
  let height = 1
  let width = (ratio * mediaH) / mediaW
  if (width > 1) {
    width = 1
    height = mediaW / (ratio * mediaH)
  }
  width = clamp01(width)
  height = clamp01(height)
  return {
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height,
  }
}
