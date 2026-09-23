import type { Project } from '../types'
import { loadImage } from './media'
import { renderPhoto } from './renderPhoto'

// Regenerates the project's list thumbnail from the current edits so the
// home screen reflects blur/text/crop once the user finishes an edit.
export async function regenerateThumbnail(project: Project): Promise<Blob | null> {
  try {
    if (project.type === 'photo') {
      const img = await loadImage(project.original)
      const canvas = renderPhoto(img, project, { maxDim: 480, includeText: true, includeCrop: true })
      return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.75))
    }

    // Video: draw a representative frame with rotation + crop applied (blur
    // regions are only baked into pixels during export, so they're skipped here).
    const url = URL.createObjectURL(project.original)
    try {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.src = url
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve()
        video.onerror = () => reject(new Error('썸네일 생성 실패'))
      })
      video.currentTime = Math.min(0.15, (video.duration || 0.3) / 2)
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve()
      })

      const rotated90 = project.rotation === 90 || project.rotation === 270
      const rw = rotated90 ? video.videoHeight : video.videoWidth
      const rh = rotated90 ? video.videoWidth : video.videoHeight
      const scale = Math.min(1, 480 / Math.max(rw, rh))
      const iw = Math.max(1, Math.round(rw * scale))
      const ih = Math.max(1, Math.round(rh * scale))

      const full = document.createElement('canvas')
      full.width = iw
      full.height = ih
      const fctx = full.getContext('2d')!
      fctx.save()
      fctx.translate(iw / 2, ih / 2)
      fctx.rotate((project.rotation * Math.PI) / 180)
      const dw = rotated90 ? ih : iw
      const dh = rotated90 ? iw : ih
      fctx.drawImage(video, -dw / 2, -dh / 2, dw, dh)
      fctx.restore()

      let out = full
      if (project.crop) {
        const cx = project.crop.x * iw
        const cy = project.crop.y * ih
        const cw = Math.max(1, project.crop.width * iw)
        const ch = Math.max(1, project.crop.height * ih)
        const cropped = document.createElement('canvas')
        cropped.width = Math.round(cw)
        cropped.height = Math.round(ch)
        cropped.getContext('2d')!.drawImage(full, cx, cy, cw, ch, 0, 0, cropped.width, cropped.height)
        out = cropped
      }
      return await new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/jpeg', 0.75))
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return project.thumbnail
  }
}
