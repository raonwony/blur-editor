import type { CropRect } from '../types'
import { clamp } from '../utils/geometry'

interface CropOverlayProps {
  rect: CropRect
  aspectLock: number | null
  stageSize: { width: number; height: number }
  onChangeCrop: (c: CropRect) => void
}

export default function CropOverlay({ rect, aspectLock, stageSize, onChangeCrop }: CropOverlayProps) {
  function onBoxPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const start = rect
    const w = stageSize.width || 1
    const h = stageSize.height || 1
    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / w
      const dy = (ev.clientY - startY) / h
      onChangeCrop({
        ...start,
        x: clamp(start.x + dx, 0, 1 - start.width),
        y: clamp(start.y + dy, 0, 1 - start.height),
      })
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onHandlePointerDown(corner: 'nw' | 'ne' | 'sw' | 'se', e: React.PointerEvent) {
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const start = rect
    const w = stageSize.width || 1
    const h = stageSize.height || 1
    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / w
      const dy = (ev.clientY - startY) / h
      let { x, y, width, height } = start
      if (corner === 'se') {
        width = clamp(start.width + dx, 0.1, 1 - start.x)
        height = clamp(start.height + dy, 0.1, 1 - start.y)
      } else if (corner === 'ne') {
        width = clamp(start.width + dx, 0.1, 1 - start.x)
        const newHeight = clamp(start.height - dy, 0.1, start.y + start.height)
        y = start.y + start.height - newHeight
        height = newHeight
      } else if (corner === 'sw') {
        const newWidth = clamp(start.width - dx, 0.1, start.x + start.width)
        x = start.x + start.width - newWidth
        width = newWidth
        height = clamp(start.height + dy, 0.1, 1 - start.y)
      } else {
        const newWidth = clamp(start.width - dx, 0.1, start.x + start.width)
        const newHeight = clamp(start.height - dy, 0.1, start.y + start.height)
        x = start.x + start.width - newWidth
        y = start.y + start.height - newHeight
        width = newWidth
        height = newHeight
      }
      onChangeCrop({ x, y, width, height })
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="crop-layer">
      <div className="crop-dim" style={{ clipPath: `polygon(0% 0%,0% 100%,${rect.x * 100}% 100%,${rect.x * 100}% 0%)` }} />
      <div
        className="crop-dim"
        style={{ clipPath: `polygon(${(rect.x + rect.width) * 100}% 0%,${(rect.x + rect.width) * 100}% 100%,100% 100%,100% 0%)` }}
      />
      <div
        className="crop-dim"
        style={{
          clipPath: `polygon(${rect.x * 100}% 0%,${rect.x * 100}% ${rect.y * 100}%,${(rect.x + rect.width) * 100}% ${rect.y * 100}%,${(rect.x + rect.width) * 100}% 0%)`,
        }}
      />
      <div
        className="crop-dim"
        style={{
          clipPath: `polygon(${rect.x * 100}% ${(rect.y + rect.height) * 100}%,${rect.x * 100}% 100%,${(rect.x + rect.width) * 100}% 100%,${(rect.x + rect.width) * 100}% ${(rect.y + rect.height) * 100}%)`,
        }}
      />
      <div
        className="crop-box"
        style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
        onPointerDown={onBoxPointerDown}
      >
        {aspectLock === null && (
          <>
            <span className="crop-handle nw" onPointerDown={(e) => onHandlePointerDown('nw', e)} />
            <span className="crop-handle ne" onPointerDown={(e) => onHandlePointerDown('ne', e)} />
            <span className="crop-handle sw" onPointerDown={(e) => onHandlePointerDown('sw', e)} />
            <span className="crop-handle se" onPointerDown={(e) => onHandlePointerDown('se', e)} />
          </>
        )}
      </div>
    </div>
  )
}
