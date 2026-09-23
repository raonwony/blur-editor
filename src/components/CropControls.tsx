import { CROP_PRESETS } from '../utils/geometry'

interface CropControlsProps {
  activePreset: string
  aspectLock: number | null
  cropScale: number
  onApplyPreset: (label: string, ratio: number | null) => void
  onApplyScale: (scale: number) => void
  onRotate: () => void
}

export default function CropControls({ activePreset, aspectLock, cropScale, onApplyPreset, onApplyScale, onRotate }: CropControlsProps) {
  return (
    <div className="tool-panel">
      <div className="panel-actions">
        {CROP_PRESETS.map((p) => (
          <button key={p.label} className={`ghost-btn ${activePreset === p.label ? 'active' : ''}`} onClick={() => onApplyPreset(p.label, p.ratio)}>
            {p.label}
          </button>
        ))}
        <button className="ghost-btn" onClick={onRotate}>⟳ 회전</button>
      </div>
      {aspectLock !== null && (
        <label className="slider-row">
          <span>크기</span>
          <input type="range" min={0.3} max={1} step={0.01} value={cropScale} onChange={(e) => onApplyScale(Number(e.target.value))} />
        </label>
      )}
    </div>
  )
}
