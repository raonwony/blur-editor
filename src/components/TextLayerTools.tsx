import type { TextLayer } from '../types'
import { clamp01 } from '../utils/geometry'
import { FONT_OPTIONS } from '../fonts'

export function createTextLayer(): TextLayer {
  const font = FONT_OPTIONS[0]
  return {
    id: crypto.randomUUID(),
    text: '텍스트',
    font: font.family,
    fontLabel: font.id,
    size: 0.07,
    color: '#ffffff',
    strokeColor: null,
    x: 0.5,
    y: 0.5,
    rotation: 0,
  }
}

export function TextOverlayItem({
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

  const fontSize = Math.max(10, layer.size * stageHeight)
  return (
    <div
      className={`text-overlay ${selected ? 'selected' : ''}`}
      style={{
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
        fontFamily: layer.font,
        color: layer.color,
        fontSize: `${fontSize}px`,
        WebkitTextStroke: layer.strokeColor ? `${Math.max(1, fontSize * 0.06)}px ${layer.strokeColor}` : undefined,
        paintOrder: 'stroke fill',
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

export function TextToolPanel({
  selectedText,
  onAdd,
  onUpdate,
  onDelete,
}: {
  selectedText: TextLayer | null
  onAdd: () => void
  onUpdate: (patch: Partial<TextLayer>) => void
  onDelete: () => void
}) {
  return (
    <div className="tool-panel">
      <button className="ghost-btn add-text-btn" onClick={onAdd}>＋ 텍스트 추가</button>
      {selectedText && (
        <div className="text-controls">
          <input
            className="text-input"
            value={selectedText.text}
            placeholder="텍스트 입력"
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
          <div className="font-row">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                className={`font-chip ${selectedText.fontLabel === f.id ? 'active' : ''}`}
                style={{ fontFamily: f.family }}
                onClick={() => onUpdate({ font: f.family, fontLabel: f.id })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="slider-row">
            <span>크기</span>
            <input type="range" min={0.03} max={0.2} step={0.005} value={selectedText.size} onChange={(e) => onUpdate({ size: Number(e.target.value) })} />
          </label>
          <label className="slider-row">
            <span>회전</span>
            <input type="range" min={-180} max={180} step={1} value={selectedText.rotation} onChange={(e) => onUpdate({ rotation: Number(e.target.value) })} />
          </label>
          <div className="color-row">
            {['#ffffff', '#000000', '#ff5c5c', '#ffd23f', '#5cc8ff', '#7cff8f'].map((c) => (
              <button
                key={c}
                className={`color-swatch ${selectedText.color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => onUpdate({ color: c })}
              />
            ))}
            <input type="color" className="color-custom" value={selectedText.color} onChange={(e) => onUpdate({ color: e.target.value })} />
          </div>
          <p className="panel-subheading">테두리</p>
          <div className="color-row">
            <button className={`ghost-btn ${!selectedText.strokeColor ? 'active' : ''}`} onClick={() => onUpdate({ strokeColor: null })}>
              없음
            </button>
            {['#000000', '#ffffff'].map((c) => (
              <button
                key={c}
                className={`color-swatch ${selectedText.strokeColor === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => onUpdate({ strokeColor: c })}
              />
            ))}
            <input
              type="color"
              className="color-custom"
              value={selectedText.strokeColor ?? '#000000'}
              onChange={(e) => onUpdate({ strokeColor: e.target.value })}
            />
            <button className="ghost-btn delete-text-btn" onClick={onDelete}>삭제</button>
          </div>
        </div>
      )}
    </div>
  )
}
