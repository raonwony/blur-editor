import type { VideoProject } from '../types'
import { applyRegionBlurs } from './canvasBlur'
import { drawTextLayers } from './renderPhoto'

type CaptureCanvas = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
type CaptureVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext }

export function canBakeVideo(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof (HTMLCanvasElement.prototype as CaptureCanvas).captureStream === 'function' &&
    (typeof HTMLMediaElement === 'undefined' ||
      typeof (HTMLMediaElement.prototype as CaptureVideo).captureStream === 'function' ||
      typeof AudioContext !== 'undefined' ||
      typeof (window as AudioContextWindow).webkitAudioContext !== 'undefined')
  )
}

function pickMimeType(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c
  }
  return ''
}

// Plays the source video in full, drawing each frame (rotation -> blur regions -> crop)
// onto a canvas and re-encoding it via MediaRecorder. Real-time, so it takes ~duration seconds.
export async function bakeVideo(project: VideoProject, onProgress?: (fraction: number) => void): Promise<Blob> {
  if (!canBakeVideo()) {
    throw new Error('이 기기/브라우저는 동영상 저장을 지원하지 않아요.')
  }

  const url = URL.createObjectURL(project.original)
  const video = document.createElement('video') as CaptureVideo
  video.src = url
  video.playsInline = true

  // Start playback and resume Web Audio synchronously from the export button's
  // click. Safari doesn't expose HTMLMediaElement.captureStream, so its audio
  // must be routed through a MediaStreamDestination instead.
  const nativeStream = video.captureStream ? video.captureStream() : video.mozCaptureStream?.()
  let audioContext: AudioContext | null = null
  let audioDestination: MediaStreamAudioDestinationNode | null = null
  let playPromise: Promise<void>
  if (nativeStream) {
    video.muted = true
    playPromise = video.play()
  } else {
    const AudioContextConstructor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext
    if (!AudioContextConstructor) {
      URL.revokeObjectURL(url)
      throw new Error('이 브라우저에서는 동영상 오디오를 처리할 수 없어요.')
    }
    audioContext = new AudioContextConstructor()
    audioDestination = audioContext.createMediaStreamDestination()
    const source = audioContext.createMediaElementSource(video)
    source.connect(audioDestination)
    video.muted = false
    void audioContext.resume()
    playPromise = video.play()
  }

  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) return resolve()
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('영상을 불러올 수 없어요.'))
    })
    await playPromise

  const rotated90 = project.rotation === 90 || project.rotation === 270
  const rw = rotated90 ? video.videoHeight : video.videoWidth
  const rh = rotated90 ? video.videoWidth : video.videoHeight

  const crop = project.crop
  const outW = Math.max(2, Math.round((crop ? crop.width * rw : rw) / 2) * 2)
  const outH = Math.max(2, Math.round((crop ? crop.height * rh : rh) / 2) * 2)

  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = rw
  fullCanvas.height = rh
  const fctx = fullCanvas.getContext('2d')!

  const outCanvas = document.createElement('canvas') as CaptureCanvas
  outCanvas.width = outW
  outCanvas.height = outH
  const octx = outCanvas.getContext('2d')!

  function drawFrame() {
    fctx.save()
    fctx.translate(rw / 2, rh / 2)
    fctx.rotate((project.rotation * Math.PI) / 180)
    const dw = rotated90 ? rh : rw
    const dh = rotated90 ? rw : rh
    fctx.drawImage(video, -dw / 2, -dh / 2, dw, dh)
    fctx.restore()

    const t = video.currentTime
    const active = project.blurRegions.filter((r) => t >= r.start && t <= r.end)
    if (active.length) {
      applyRegionBlurs(fullCanvas, active)
    }

    if (project.textLayers.length) {
      drawTextLayers(fctx, project.textLayers, rw, rh)
    }

    if (crop) {
      octx.drawImage(fullCanvas, crop.x * rw, crop.y * rh, crop.width * rw, crop.height * rh, 0, 0, outW, outH)
    } else {
      octx.drawImage(fullCanvas, 0, 0, outW, outH)
    }
  }

  const canvasStream = outCanvas.captureStream!(30)
  const audioTracks = nativeStream?.getAudioTracks() ?? audioDestination?.stream.getAudioTracks() ?? []
  if (!audioTracks.length && !video.muted) {
    throw new Error('동영상 오디오를 가져오지 못했어요. Safari를 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.')
  }
  const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks])

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }))
    recorder.onerror = () => reject(new Error('녹화 중 오류가 발생했어요.'))
  })

  let raf = 0
  function loop() {
    if (video.paused || video.ended) return
    drawFrame()
    onProgress?.(video.duration ? video.currentTime / video.duration : 0)
    raf = requestAnimationFrame(loop)
  }

  try {
    recorder.start(250)
    raf = requestAnimationFrame(loop)
    await new Promise<void>((resolve) => {
      video.onended = () => resolve()
    })
    cancelAnimationFrame(raf)
    drawFrame()
    onProgress?.(1)
    await new Promise((r) => setTimeout(r, 150))
    recorder.stop()
    return await stopped
  } finally {
    cancelAnimationFrame(raf)
  }
  } finally {
    video.pause()
    URL.revokeObjectURL(url)
    await audioContext?.close()
  }
}
