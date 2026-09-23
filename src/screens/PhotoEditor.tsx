import { useEffect, useRef, useState } from 'react'
import type { BlurShape, BlurStroke, PhotoProject, Point, Rotation, TextLayer } from '../types'
import { loadImage } from '../utils/media'
import { renderPhoto, rotatedSize } from '../utils/renderPhoto'
import { DEFAULT_BLUR_STRENGTH } from '../utils/canvasBlur'
import { clamp01, normalizeAngle, rotateCropRect90, rotatePoint90 } from '../utils/geometry'
import { FONT_OPTIONS } from '../fonts'
import { useElementSize } from '../hooks/useElementSize'
import { useOverlayRect } from '../hooks/useOverlayRect'
import { useCropTool } from '../hooks/useCropTool'
import CropOverlay from '../components/CropOverlay'
import CropControls from '../components/CropControls'
import './PhotoEditor.css'

const SHAPE_DRAG_THRESHOLD = 0.03
const SHAPE_MIN_SIZE = 0.05

function computeShapeBounds(start: Point, current: Point, defaultSize: number) {
  const minX = Math.min(start.x, current.x)
  const maxX = Math.max(start.x, current.x)
  const minY = Math.min(start.y, current.y)
  const maxY = Math.max(start.y, current.y)
  const dragged = Math.max(maxX - minX, maxY - minY) > SHAPE_DRAG_THRESHOLD
  if (dragged) {
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: Math.max(SHAPE_MIN_SIZE, maxX - minX), h: Math.max(SHAPE_MIN_SIZE, maxY - minY) }
  }
  return { x: start.x, y: start.y, w: defaultSize, h: defaultSize }
}

const FREEFORM_HIT_PADDING = 0.03

function strokeBounds(stroke: BlurStroke) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const pad = stroke.brushSize / 2
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad }
}

function hitTestFreeform(strokes: BlurStroke[], p: Point): BlurStroke | null {
  let best: BlurStroke | null = null
  let bestDist = Infinity
  for (const s of strokes) {
    if (s.shape !== 'freeform' || s.points.length === 0) continue
    const threshold = s.brushSize / 2 + FREEFORM_HIT_PADDING
    let minDist = Infinity
    for (const pt of s.points) {
      const dx = pt.x - p.x
      const dy = pt.y - p.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) minDist = d
    }
    if (minDist <= threshold && minDist < bestDist) {
      best = s
      bestDist = minDist
    }
  }
  return best
}

type BlurMode = BlurShape | 'select'
type Tool = 'blur' | 'text' | 'crop' | null

interface PhotoEditorProps {
  project: PhotoProject
  onChange: (patch: Partial<PhotoProject>) => void
}

export default function PhotoEditor({ project, onChange }: PhotoEditorProps) {
  const [tool, setTool] = useState<Tool>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [brushSize, setBrushSize] = useState(0.06)
  const [shapeSize, setShapeSize] = useState(0.3)
  const [blurMode, setBlurMode] = useState<BlurMode>('freeform')
  const [blurStrength, setBlurStrength] = useState(DEFAULT_BLUR_STRENGTH)
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseImageRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef<{ points: Point[] } | null>(null)
  const shapeDrawRef = useRef<{ start: Point; current: Point } | null>(null)
  const { ref: stageRef } = useElementSize<HTMLDivElement>()
  const overlayRect = useOverlayRect(stageRef, canvasRef)

  useEffect(() => {
    let alive = true
    loadImage(project.original).then((img) => {
      if (alive) setImage(img)
    })
    return () => {
      alive = false
    }
  }, [project.original])

  const media = rotatedSize(project.width, project.height, project.rotation)

  // Rebuild the flattened preview whenever committed edits change.
  useEffect(() => {
    if (!image) return
    const rendered = renderPhoto(image, project, {
      maxDim: 1100,
      includeText: tool !== 'text',
      includeCrop: false,
    })
    baseImageRef.current = rendered
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = rendered.width
    canvas.height = rendered.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(rendered, 0, 0)

    if (blurMode === 'select' && selectedShapeId) {
      const selected = project.blurStrokes.find((s) => s.id === selectedShapeId)
      if (selected && selected.shape === 'freeform' && selected.points.length) {
        const b = strokeBounds(selected)
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = '#6ea8ff'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.strokeRect(b.minX * canvas.width, b.minY * canvas.height, (b.maxX - b.minX) * canvas.width, (b.maxY - b.minY) * canvas.height)
        ctx.restore()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, project.rotation, project.blurStrokes, project.textLayers, tool, blurMode, selectedShapeId])

  function redrawWithLiveStroke() {
    const canvas = canvasRef.current
    const base = baseImageRef.current
    if (!canvas || !base) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(base, 0, 0)
    const stroke = drawingRef.current
    if (stroke && stroke.points.length) {
      ctx.save()
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = '#ffffff'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const shortSide = Math.min(canvas.width, canvas.height)
      ctx.lineWidth = Math.max(2, brushSize * shortSide)
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height)
      }
      ctx.stroke()
      ctx.restore()
    }
    const shapeDraw = shapeDrawRef.current
    if (shapeDraw) {
      const bounds = computeShapeBounds(shapeDraw.start, shapeDraw.current, shapeSize)
      ctx.save()
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      const cx = bounds.x * canvas.width
      const cy = bounds.y * canvas.height
      const w = bounds.w * canvas.width
      const h = bounds.h * canvas.height
      if (blurMode === 'circle') {
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
      } else {
        ctx.rect(cx - w / 2, cy - h / 2, w, h)
      }
      ctx.stroke()
      ctx.restore()
    }
  }

  function toNormalized(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool !== 'blur') return
    const p = toNormalized(e)
    if (blurMode === 'select') {
      const hit = hitTestFreeform(project.blurStrokes, p)
      setSelectedShapeId(hit ? hit.id : null)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (blurMode === 'freeform') {
      drawingRef.current = { points: [p] }
    } else {
      shapeDrawRef.current = { start: p, current: p }
    }
    redrawWithLiveStroke()
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool !== 'blur') return
    const p = toNormalized(e)
    if (blurMode === 'freeform') {
      if (!drawingRef.current) return
      drawingRef.current.points.push(p)
    } else if (blurMode !== 'select') {
      if (!shapeDrawRef.current) return
      shapeDrawRef.current.current = p
    } else {
      return
    }
    redrawWithLiveStroke()
  }
  function onPointerUp() {
    if (tool !== 'blur' || blurMode === 'select') return
    if (blurMode === 'freeform') {
      if (!drawingRef.current) return
      const stroke = drawingRef.current
      drawingRef.current = null
      if (stroke.points.length > 0) {
        const mark: BlurStroke = {
          id: crypto.randomUUID(),
          shape: 'freeform',
          points: stroke.points,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          brushSize,
          strength: blurStrength,
        }
        onChange({ blurStrokes: [...project.blurStrokes, mark] })
        setSelectedShapeId(mark.id)
      }
    } else {
      if (!shapeDrawRef.current) return
      const bounds = computeShapeBounds(shapeDrawRef.current.start, shapeDrawRef.current.current, shapeSize)
      shapeDrawRef.current = null
      const mark: BlurStroke = {
        id: crypto.randomUUID(),
        shape: blurMode,
        points: [],
        x: clamp01(bounds.x),
        y: clamp01(bounds.y),
        w: bounds.w,
        h: bounds.h,
        brushSize: 0,
        strength: blurStrength,
      }
      onChange({ blurStrokes: [...project.blurStrokes, mark] })
      setSelectedShapeId(mark.id)
    }
  }

  function undoStroke() {
    onChange({ blurStrokes: project.blurStrokes.slice(0, -1) })
  }
  function clearStrokes() {
    onChange({ blurStrokes: [] })
  }

  function updateBlurShape(id: string, patch: Partial<BlurStroke>) {
    onChange({ blurStrokes: project.blurStrokes.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }
  function deleteBlurShape(id: string) {
    onChange({ blurStrokes: project.blurStrokes.filter((s) => s.id !== id) })
    if (selectedShapeId === id) setSelectedShapeId(null)
  }
  function onShapePointerDown(e: React.PointerEvent, mark: BlurStroke) {
    e.stopPropagation()
    setSelectedShapeId(mark.id)
    const w = overlayRect.width || 1
    const h = overlayRect.height || 1
    const startX = e.clientX
    const startY = e.clientY
    const origX = mark.x
    const origY = mark.y
    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / w
      const dy = (ev.clientY - startY) / h
      updateBlurShape(mark.id, { x: clamp01(origX + dx), y: clamp01(origY + dy) })
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function addTextLayer() {
    const font = FONT_OPTIONS[0]
    const layer: TextLayer = {
      id: crypto.randomUUID(),
      text: '텍스트',
      font: font.family,
      fontLabel: font.id,
      size: 0.07,
      color: '#ffffff',
      x: 0.5,
      y: 0.5,
      rotation: 0,
    }
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

  const selectedText = project.textLayers.find((t) => t.id === selectedTextId) ?? null
  const selectedShape = project.blurStrokes.find((s) => s.id === selectedShapeId) ?? null
  const selectedFreeform = selectedShape?.shape === 'freeform' ? selectedShape : null
  const selectedRectOrCircle = selectedShape && selectedShape.shape !== 'freeform' ? selectedShape : null

  const cropTool = useCropTool(project.crop, media.width, media.height, (crop) => onChange({ crop }))

  function rotate90() {
    const next = ((project.rotation + 90) % 360) as Rotation
    const blurStrokes = project.blurStrokes.map((s) => {
      if (s.shape === 'freeform') {
        return { ...s, points: s.points.map(rotatePoint90) }
      }
      const center = rotatePoint90({ x: s.x, y: s.y })
      return { ...s, x: center.x, y: center.y }
    })
    const textLayers = project.textLayers.map((t) => {
      const pos = rotatePoint90({ x: t.x, y: t.y })
      return { ...t, x: pos.x, y: pos.y, rotation: normalizeAngle(t.rotation + 90) }
    })
    onChange({
      rotation: next,
      blurStrokes,
      textLayers,
      crop: project.crop ? rotateCropRect90(project.crop) : null,
    })
    cropTool.resetForRotate()
  }

  return (
    <div className="photo-editor">
      <div className="photo-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="photo-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        <div className="overlay-anchor" style={{ left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height }}>
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

          {tool === 'blur' &&
            project.blurStrokes
              .filter((s) => s.shape === 'rect' || s.shape === 'circle')
              .filter((s) => blurMode === 'select' || s.id === selectedShapeId)
              .map((mark) => (
                <div
                  key={mark.id}
                  className={`region-overlay ${mark.shape} ${selectedShapeId === mark.id ? 'selected' : ''}`}
                  style={{
                    left: `${mark.x * 100}%`,
                    top: `${mark.y * 100}%`,
                    width: `${mark.w * 100}%`,
                    height: `${mark.h * 100}%`,
                  }}
                  onPointerDown={(e) => onShapePointerDown(e, mark)}
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
      </div>

      {tool === 'blur' && (
        <div className="tool-panel">
          <div className="panel-actions">
            <button className={`ghost-btn ${blurMode === 'freeform' ? 'active' : ''}`} onClick={() => { setBlurMode('freeform'); setSelectedShapeId(null) }}>자유형</button>
            <button className={`ghost-btn ${blurMode === 'rect' ? 'active' : ''}`} onClick={() => { setBlurMode('rect'); setSelectedShapeId(null) }}>사각형</button>
            <button className={`ghost-btn ${blurMode === 'circle' ? 'active' : ''}`} onClick={() => { setBlurMode('circle'); setSelectedShapeId(null) }}>원형</button>
            <button className={`ghost-btn ${blurMode === 'select' ? 'active' : ''}`} onClick={() => { setBlurMode('select'); setSelectedShapeId(null) }}>선택</button>
          </div>

          {blurMode === 'freeform' && (
            <>
              {selectedFreeform && <p className="panel-subheading">방금 그린 블러 — 바로 조절할 수 있어요</p>}
              <label className="slider-row">
                <span>브러시 크기</span>
                <input
                  type="range"
                  min={0.02}
                  max={0.16}
                  step={0.005}
                  value={selectedFreeform ? selectedFreeform.brushSize : brushSize}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setBrushSize(v)
                    if (selectedFreeform) updateBlurShape(selectedFreeform.id, { brushSize: v })
                  }}
                />
              </label>
              <label className="slider-row">
                <span>강도</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={selectedFreeform ? selectedFreeform.strength : blurStrength}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setBlurStrength(v)
                    if (selectedFreeform) updateBlurShape(selectedFreeform.id, { strength: v })
                  }}
                />
              </label>
              <div className="panel-actions">
                <button className="ghost-btn" onClick={undoStroke} disabled={project.blurStrokes.length === 0}>되돌리기</button>
                <button className="ghost-btn" onClick={clearStrokes} disabled={project.blurStrokes.length === 0}>전체 지우기</button>
              </div>
            </>
          )}

          {(blurMode === 'rect' || blurMode === 'circle') && (
            <>
              <p className="panel-subheading">
                {selectedRectOrCircle ? '방금 그린 블러 — 바로 조절할 수 있어요' : '화면을 드래그해서 블러를 그리세요 (탭만 하면 기본 크기로 생겨요)'}
              </p>
              <label className="slider-row">
                <span>크기</span>
                <input
                  type="range"
                  min={0.05}
                  max={0.8}
                  step={0.01}
                  value={selectedRectOrCircle ? selectedRectOrCircle.w : shapeSize}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setShapeSize(v)
                    if (selectedRectOrCircle) updateBlurShape(selectedRectOrCircle.id, { w: v, h: v })
                  }}
                />
              </label>
              <label className="slider-row">
                <span>강도</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={selectedRectOrCircle ? selectedRectOrCircle.strength : blurStrength}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setBlurStrength(v)
                    if (selectedRectOrCircle) updateBlurShape(selectedRectOrCircle.id, { strength: v })
                  }}
                />
              </label>
              <div className="panel-actions">
                <button className="ghost-btn" onClick={undoStroke} disabled={project.blurStrokes.length === 0}>되돌리기</button>
                <button className="ghost-btn" onClick={clearStrokes} disabled={project.blurStrokes.length === 0}>전체 지우기</button>
              </div>
            </>
          )}

          {blurMode === 'select' && (
            <>
              <p className="panel-subheading">
                {selectedShape ? '선택한 블러를 수정하세요' : '수정할 블러를 화면에서 탭하세요'}
              </p>
              {selectedFreeform && (
                <div className="text-controls">
                  <label className="slider-row">
                    <span>브러시 크기</span>
                    <input
                      type="range"
                      min={0.02}
                      max={0.16}
                      step={0.005}
                      value={selectedFreeform.brushSize}
                      onChange={(e) => updateBlurShape(selectedFreeform.id, { brushSize: Number(e.target.value) })}
                    />
                  </label>
                  <label className="slider-row">
                    <span>강도</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={selectedFreeform.strength}
                      onChange={(e) => updateBlurShape(selectedFreeform.id, { strength: Number(e.target.value) })}
                    />
                  </label>
                  <button className="ghost-btn delete-text-btn" onClick={() => deleteBlurShape(selectedFreeform.id)}>이 블러 삭제</button>
                </div>
              )}
              {selectedRectOrCircle && (
                <div className="text-controls">
                  <label className="slider-row">
                    <span>크기</span>
                    <input
                      type="range"
                      min={0.05}
                      max={0.8}
                      step={0.01}
                      value={selectedRectOrCircle.w}
                      onChange={(e) => updateBlurShape(selectedRectOrCircle.id, { w: Number(e.target.value), h: Number(e.target.value) })}
                    />
                  </label>
                  <label className="slider-row">
                    <span>강도</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={selectedRectOrCircle.strength}
                      onChange={(e) => updateBlurShape(selectedRectOrCircle.id, { strength: Number(e.target.value) })}
                    />
                  </label>
                  <button className="ghost-btn delete-text-btn" onClick={() => deleteBlurShape(selectedRectOrCircle.id)}>이 블러 삭제</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tool === 'text' && (
        <div className="tool-panel">
          <button className="ghost-btn add-text-btn" onClick={addTextLayer}>＋ 텍스트 추가</button>
          {selectedText && (
            <div className="text-controls">
              <input
                className="text-input"
                value={selectedText.text}
                placeholder="텍스트 입력"
                onChange={(e) => updateTextLayer(selectedText.id, { text: e.target.value })}
              />
              <div className="font-row">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    className={`font-chip ${selectedText.fontLabel === f.id ? 'active' : ''}`}
                    style={{ fontFamily: f.family }}
                    onClick={() => updateTextLayer(selectedText.id, { font: f.family, fontLabel: f.id })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="slider-row">
                <span>크기</span>
                <input type="range" min={0.03} max={0.2} step={0.005} value={selectedText.size} onChange={(e) => updateTextLayer(selectedText.id, { size: Number(e.target.value) })} />
              </label>
              <label className="slider-row">
                <span>회전</span>
                <input type="range" min={-180} max={180} step={1} value={selectedText.rotation} onChange={(e) => updateTextLayer(selectedText.id, { rotation: Number(e.target.value) })} />
              </label>
              <div className="color-row">
                {['#ffffff', '#000000', '#ff5c5c', '#ffd23f', '#5cc8ff', '#7cff8f'].map((c) => (
                  <button
                    key={c}
                    className={`color-swatch ${selectedText.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => updateTextLayer(selectedText.id, { color: c })}
                  />
                ))}
                <input type="color" className="color-custom" value={selectedText.color} onChange={(e) => updateTextLayer(selectedText.id, { color: e.target.value })} />
                <button className="ghost-btn delete-text-btn" onClick={() => deleteTextLayer(selectedText.id)}>삭제</button>
              </div>
            </div>
          )}
        </div>
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

function TextOverlayItem({
  layer,
  stageHeight,
  selected,
  onSelect,
  onUpdate,
  onDelete,
}: {
  layer: TextLayer
  stageHeight: number
  selected: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<TextLayer>) => void
  onDelete: () => void
}) {
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    onSelect()
    const stage = e.currentTarget.parentElement
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const origX = layer.x
    const origY = layer.y
    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / rect.width
      const dy = (ev.clientY - startY) / rect.height
      onUpdate({ x: clamp01(origX + dx), y: clamp01(origY + dy) })
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className={`text-overlay ${selected ? 'selected' : ''}`}
      style={{
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
        fontFamily: layer.font,
        color: layer.color,
        fontSize: `${Math.max(10, layer.size * stageHeight)}px`,
      }}
      onPointerDown={onPointerDown}
    >
      {layer.text || '텍스트'}
      {selected && (
        <button
          className="text-delete"
          onPointerDown={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
