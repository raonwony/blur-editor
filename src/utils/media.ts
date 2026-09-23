export interface MediaInfo {
  width: number
  height: number
  duration: number
}

export function probeMedia(file: Blob, isVideo: boolean): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    if (isVideo) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
        URL.revokeObjectURL(url)
      }
      video.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('영상을 읽을 수 없습니다'))
      }
      video.src = url
    } else {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight, duration: 0 })
        URL.revokeObjectURL(url)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('이미지를 읽을 수 없습니다'))
      }
      img.src = url
    }
  })
}

export async function makeThumbnail(file: Blob, isVideo: boolean): Promise<Blob> {
  const size = 480
  const url = URL.createObjectURL(file)
  try {
    let w: number
    let h: number
    let source: CanvasImageSource
    if (isVideo) {
      const video = document.createElement('video')
      video.preload = 'auto'
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
      w = video.videoWidth
      h = video.videoHeight
      source = video
    } else {
      const img = new Image()
      img.src = url
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('썸네일 생성 실패'))
      })
      w = img.naturalWidth
      h = img.naturalHeight
      source = img
    }
    const scale = size / Math.max(w, h)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('썸네일 생성 실패'))), 'image/jpeg', 0.75)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다'))
    img.src = url
  })
}
