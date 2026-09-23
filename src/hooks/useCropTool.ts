import { useState } from 'react'
import type { CropRect } from '../types'
import { clamp, cropForRatio } from '../utils/geometry'

// Shared crop state/logic used by both the photo and video editors.
export function useCropTool(crop: CropRect | null, mediaWidth: number, mediaHeight: number, onChangeCrop: (c: CropRect) => void) {
  const [aspectLock, setAspectLock] = useState<number | null>(null)
  const [cropScale, setCropScale] = useState(1)
  const [activePreset, setActivePreset] = useState('자유')
  const rect = crop ?? { x: 0, y: 0, width: 1, height: 1 }

  function applyPreset(label: string, ratio: number | null) {
    setActivePreset(label)
    setAspectLock(ratio)
    setCropScale(1)
    if (ratio === null) return
    onChangeCrop(cropForRatio(ratio, mediaWidth, mediaHeight))
  }

  function applyCropScale(scale: number) {
    setCropScale(scale)
    if (aspectLock === null) return
    const full = cropForRatio(aspectLock, mediaWidth, mediaHeight)
    const width = full.width * scale
    const height = full.height * scale
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    onChangeCrop({
      width,
      height,
      x: clamp(cx - width / 2, 0, 1 - width),
      y: clamp(cy - height / 2, 0, 1 - height),
    })
  }

  function resetForRotate() {
    setAspectLock(null)
    setActivePreset('자유')
    setCropScale(1)
  }

  return { rect, aspectLock, cropScale, activePreset, applyPreset, applyCropScale, resetForRotate }
}
