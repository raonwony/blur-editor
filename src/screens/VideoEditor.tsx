import { useEffect, useRef, useState } from 'react'
import type { Rotation, TextLayer, VideoBlurRegion, VideoProject } from '../types'
import { applyRegionBlurs, DEFAULT_BLUR_STRENGTH } from '../utils/canvasBlur'
import { clamp01, normalizeAngle, rotateCropRect90, rotatePoint90 } from '../utils/geometry'
import { drawTextLayers, rotatedSize } from '../utils/renderPhoto'
import { useElementSize } from '../hooks/useElementSize'
import { useOverlayRect } from '../hooks/useOverlayRect'
import { useCropTool } from '../hooks/useCropTool'
import CropOverlay from '../components/CropOverlay'
import CropControls from '../components/CropControls'
import { createTextLayer, TextOverlayItem, TextToolPanel } from '../components/TextLayerTools'
import './VideoEditor.css'

type Tool = 'blur' | 'text' | 'crop' | null

interface VideoEditorProps {
  project: VideoProject
  onChange: (patch: Partial<VideoProject>) => void
}

function formatTime(t: number) {
  if (!Number.isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VideoEditor({ project, onChange }: VideoEditorProps) {
  const [tool, setTool] = useState<Tool>(null)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(project.duration || 0)
  const [isPlaying, setIsPlaying] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { ref: stageRef } = useElementSize<HTMLDivElement>()
  const overlayRect = useOverlayRect(stageRef, canvasRef)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const media = rotatedSize(project.width, project.height, project.rotation)
  const cropTool = useCropTool(project.crop, media.width, media.height, (crop) => onChange({ crop }))

  useEffect(() => {
    const url = URL.createObjectURL(project.original)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [project.original])

  // Continuous draw loop keeps the canvas preview (rotation + active blur regions) in sync
  // with the <video> element whether playing, paused, or being scrubbed.
  useEffect(() => {
    let raf = 0
    function draw() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState >= 2) {
        const rotated90 = project.rotation === 90 || project.rotation === 270
        const rw = rotated90 ? video.videoHeight : video.videoWidth
        const rh = rotated90 ? video.videoWidth : video.videoHeight
        if (rw && rh) {
          if (canvas.width !== rw || canvas.height !== rh) {
            canvas.width = rw
            canvas.height = rh
          }
          const ctx = canvas.getContext('2d')!
          ctx.save()
          ctx.translate(rw / 2, rh / 2)
          ctx.rotate((project.rotation * Math.PI) / 180)
          const dw = rotated90 ? rh : rw
          const dh = rotated90 ? rw : rh
          ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh)
          ctx.restore()

          const t = video.currentTime
          const active = project.blurRegions.filter((r) => t >= r.start && t <= r.end)
          if (active.length) {
            applyRegionBlurs(canvas, active)
          }

          if (tool !== 'text' && project.textLayers.length) {
            drawTextLayers(ctx, project.textLayers, rw, rh)
          }
        }
        setCurrentTime(video.currentTime)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [project.rotation, project.blurRegions, project.textLayers, tool])

  function onLoadedMetadata() {
    const video = videoRef.current
    if (!video) return
    setDuration(video.duration)
    if (Math.abs(video.duration - project.duration) > 0.05) {
      onChange({ duration: video.duration })
    }
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  function seek(t: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = clamp01(t / (duration || 1)) * (duration || 0)
  }

  function addRegion() {
    const t = videoRef.current?.currentTime ?? 0
    const region: VideoBlurRegion = {
      id: crypto.randomUUID(),
      shape: 'circle',
      x: 0.5,
      y: 0.5,
      w: 0.28,
      h: 0.28,
      start: t,
      end: Math.min(duration || t + 2, t + 2),
      strength: DEFAULT_BLUR_STRENGTH,
    }
    onChange({ blurRegions: [...project.blurRegions, region] })
    setSelectedRegionId(region.id)
    setTool('blur')
  }
  function updateRegion(id: string, patch: Partial<VideoBlurRegion>) {
    onChange({ blurRegions: project.blurRegions.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  }
  function deleteRegion(id: string) {
    onChange({ blurRegions: project.blurRegions.filter((r) => r.id !== id) })
    if (selectedRegionId === id) setSelectedRegionId(null)
  }
  function selectRegion(region: VideoBlurRegion) {
    setSelectedRegionId(region.id)
    seek(region.start)
  }

  function onRegionPointerDown(e: React.PointerEvent, region: VideoBlurRegion) {
    e.stopPropagation()
    setSelectedRegionId(region.id)
    const w = overlayRect.width || 1
    const h = overlayRect.height || 1
    const startX = e.clientX
    const startY = e.clientY
    const origX = region.x
    const origY = region.y
    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / w
      const dy = (ev.clientY - startY) / h
      updateRegion(region.id, { x: clamp01(origX + dx), y: clamp01(origY + dy) })
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function addTextLayer() {
    const layer = createTextLayer()
    onChange({ textLayers: [...project.textLayers, layer] })
    setSelectedTextId(layer.id)
  }
  function updateTextLayer(id: string, patch: Partial<TextLayer>) {
    onChange({ textLayers: project.textLayers.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  }
  function deleteTextLayer(id: string) {
    onChange({ textLayers: project.textLayers.filter((t) => t.id !== id) })
    if (selectedTextId === id) setSelectedTextId(null)
  }

  function rotate90() {
    const next = ((project.rotation + 90) % 360) as Rotation
    const blurRegions = project.blurRegions.map((r) => {
      const center = rotatePoint90({ x: r.x, y: r.y })
      return { ...r, x: center.x, y: center.y }
    })
    const textLayers = project.textLayers.map((t) => {
      const pos = rotatePoint90({ x: t.x, y: t.y })
      return { ...t, x: pos.x, y: pos.y, rotation: normalizeAngle(t.rotation + 90) }
    })
    onChange({
      rotation: next,
      blurRegions,
      textLayers,
      crop: project.crop ? rotateCropRect90(project.crop) : null,
    })
    cropTool.resetForRotate()
  }

  const selectedRegion = project.blurRegions.find((r) => r.id === selectedRegionId) ?? null
  const selectedText = project.textLayers.find((t) => t.id === selectedTextId) ?? null

  return (
    <div className="video-editor">
      <div className="photo-stage video-stage" ref={stageRef}>
        {videoUrl && (
          <video
            ref={videoRef}
            className="video-el"
            src={videoUrl}
            playsInline
            muted={false}
            onLoadedMetadata={onLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        )}
        <canvas ref={canvasRef} className="photo-canvas video-canvas" onClick={togglePlay} />

        <div className="overlay-anchor" style={{ left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height }}>
          {tool === 'blur' &&
            project.blurRegions.map((region) => (
              <div
                key={region.id}
                className={`region-overlay ${region.shape} ${selectedRegionId === region.id ? 'selected' : ''} ${currentTime >= region.start && currentTime <= region.end ? 'active-now' : ''}`}
                style={{
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.w * 100}%`,
                  height: `${region.h * 100}%`,
                }}
                onPointerDown={(e) => onRegionPointerDown(e, region)}
              />
            ))}

          {tool === 'text' &&
            project.textLayers.map((layer) => (
              <TextOverlayItem
                key={layer.id}
                layer={layer}
                stageHeight={overlayRect.height}
                selected={selectedTextId === layer.id}
                onSelect={() => setSelectedTextId(layer.id)}
                onUpdate={(patch) => updateTextLayer(layer.id, patch)}
                onDelete={() => deleteTextLayer(layer.id)}
              />
            ))}

          {tool === 'crop' && (
            <CropOverlay
              rect={cropTool.rect}
              aspectLock={cropTool.aspectLock}
              stageSize={{ width: overlayRect.width, height: overlayRect.height }}
              onChangeCrop={(crop) => onChange({ crop })}
            />
          )}
        </div>

        {!isPlaying && tool === null && (
          <button className="play-btn" onClick={togglePlay} aria-label="재생">
            ▶
          </button>
        )}
      </div>

      <div className="scrub-row">
        <button className="icon-btn play-toggle" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
        <span className="time-label">{formatTime(currentTime)}</span>
        <input
          className="scrub-input"
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="time-label">{formatTime(duration)}</span>
      </div>

      {tool === 'blur' && (
        <div className="tool-panel">
          <button className="ghost-btn add-text-btn" onClick={addRegion}>＋ 블러 영역 추가</button>
          {project.blurRegions.length > 0 && (
            <div className="region-chip-row">
              {project.blurRegions.map((r, i) => (
                <button key={r.id} className={`ghost-btn ${selectedRegionId === r.id ? 'active' : ''}`} onClick={() => selectRegion(r)}>
                  블러 {i + 1} ({formatTime(r.start)}–{formatTime(r.end)})
                </button>
              ))}
            </div>
          )}
          {selectedRegion && (
            <div className="text-controls">
              <div className="panel-actions">
                <button className={`ghost-btn ${selectedRegion.shape === 'circle' ? 'active' : ''}`} onClick={() => updateRegion(selectedRegion.id, { shape: 'circle' })}>원형</button>
                <button className={`ghost-btn ${selectedRegion.shape === 'rect' ? 'active' : ''}`} onClick={() => updateRegion(selectedRegion.id, { shape: 'rect' })}>사각형</button>
              </div>
              <label className="slider-row">
                <span>크기</span>
                <input
                  type="range"
                  min={0.08}
                  max={0.7}
                  step={0.01}
                  value={selectedRegion.w}
                  onChange={(e) => updateRegion(selectedRegion.id, { w: Number(e.target.value), h: Number(e.target.value) })}
                />
              </label>
              <label className="slider-row">
                <span>강도</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={selectedRegion.strength}
                  onChange={(e) => updateRegion(selectedRegion.id, { strength: Number(e.target.value) })}
                />
              </label>
              <div className="trim-row">
                <div className="trim-labels">
                  <span>{formatTime(selectedRegion.start)}</span>
                  <span>구간</span>
                  <span>{formatTime(selectedRegion.end)}</span>
                </div>
                <TrimRange
                  duration={duration || 0}
                  start={selectedRegion.start}
                  end={selectedRegion.end}
                  onChange={(start, end) => updateRegion(selectedRegion.id, { start, end })}
                  onScrub={seek}
                />
              </div>
              <button className="ghost-btn delete-text-btn" onClick={() => deleteRegion(selectedRegion.id)}>이 블러 삭제</button>
            </div>
          )}
        </div>
      )}

      {tool === 'text' && (
        <TextToolPanel
          selectedText={selectedText}
          onAdd={addTextLayer}
          onUpdate={(patch) => selectedText && updateTextLayer(selectedText.id, patch)}
          onDelete={() => selectedText && deleteTextLayer(selectedText.id)}
        />
      )}

      {tool === 'crop' && (
        <CropControls
          activePreset={cropTool.activePreset}
          aspectLock={cropTool.aspectLock}
          cropScale={cropTool.cropScale}
          onApplyPreset={cropTool.applyPreset}
          onApplyScale={cropTool.applyCropScale}
          onRotate={rotate90}
        />
      )}

      <nav className="tool-tabs">
        <button className={`tool-tab ${tool === 'blur' ? 'active' : ''}`} onClick={() => setTool(tool === 'blur' ? null : 'blur')}>
          <span className="tool-icon">◍</span>블러
        </button>
        <button className={`tool-tab ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool(tool === 'text' ? null : 'text')}>
          <span className="tool-icon">✎</span>손글씨
        </button>
        <button className={`tool-tab ${tool === 'crop' ? 'active' : ''}`} onClick={() => setTool(tool === 'crop' ? null : 'crop')}>
          <span className="tool-icon">⛶</span>크롭
        </button>
      </nav>
    </div>
  )
}

const TRIM_MIN_GAP = 0.1

function TrimRange({
  duration,
  start,
  end,
  onChange,
  onScrub,
}: {
  duration: number
  start: number
  end: number
  onChange: (start: number, end: number) => void
  onScrub: (t: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  function posToTime(clientX: number) {
    const track = trackRef.current
    if (!track || !duration) return 0
    const rect = track.getBoundingClientRect()
    return clamp01((clientX - rect.left) / rect.width) * duration
  }

  function onHandlePointerDown(which: 'start' | 'end', e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    function move(ev: PointerEvent) {
      const t = posToTime(ev.clientX)
      if (which === 'start') {
        const next = Math.min(t, end - TRIM_MIN_GAP)
        onChange(Math.max(0, next), end)
        onScrub(Math.max(0, next))
      } else {
        const next = Math.max(t, start + TRIM_MIN_GAP)
        onChange(start, Math.min(duration, next))
        onScrub(Math.min(duration, next))
      }
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startPct = duration ? (start / duration) * 100 : 0
  const endPct = duration ? (end / duration) * 100 : 100

  return (
    <div className="trim-track" ref={trackRef}>
      <div className="trim-range" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} />
      <div className="trim-handle" style={{ left: `${startPct}%` }} onPointerDown={(e) => onHandlePointerDown('start', e)} />
      <div className="trim-handle" style={{ left: `${endPct}%` }} onPointerDown={(e) => onHandlePointerDown('end', e)} />
    </div>
  )
}
