import { useRef, useState } from 'react'
import { saveProject } from '../db'
import type { PhotoProject, VideoProject } from '../types'
import { makeThumbnail, probeMedia } from '../utils/media'
import './FileSelect.css'

interface FileSelectProps {
  onCreated: (id: string) => void
  onCancel: () => void
}

export default function FileSelect({ onCreated, onCancel }: FileSelectProps) {
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function handleFile(file: File) {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const videoExts = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', '3gp']
      const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tiff', 'tif']
      const isVideo = file.type.startsWith('video') || (!file.type && videoExts.includes(ext))
      const isImage = file.type.startsWith('image') || (!file.type && imageExts.includes(ext))
      if (!isVideo && !isImage) {
        throw new Error('사진 또는 동영상 파일만 사용할 수 있어요.')
      }
      const info = await probeMedia(file, isVideo)
      const thumbnail = await makeThumbnail(file, isVideo).catch(() => null)
      const id = crypto.randomUUID()
      const now = Date.now()

      const base = {
        id,
        status: 'draft' as const,
        createdAt: now,
        updatedAt: now,
        width: info.width,
        height: info.height,
        rotation: 0 as const,
        crop: null,
        textLayers: [],
        original: file,
        thumbnail,
      }

      const project: PhotoProject | VideoProject = isVideo
        ? { ...base, type: 'video', duration: info.duration, blurRegions: [] }
        : { ...base, type: 'photo', blurStrokes: [] }

      await saveProject(project)
      onCreated(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 불러오지 못했어요.')
      setBusy(false)
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!dragging) setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (e.currentTarget === e.target) setDragging(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  return (
    <div className="app-shell select-screen">
      <header className="select-header">
        <button className="ghost-btn" onClick={onCancel}>‹ 뒤로</button>
      </header>
      <main
        className={`select-body ${dragging ? 'dragging' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <h1>사진 또는 동영상 선택</h1>
        <p className="select-sub">블러 처리하고 꾸민 뒤 바로 내보낼 수 있어요.</p>

        <button className="pick-btn" disabled={busy} onClick={() => cameraInput.current?.click()}>
          <span className="pick-icon">📷</span>
          <span>촬영하기</span>
        </button>
        <button className="pick-btn" disabled={busy} onClick={() => galleryInput.current?.click()}>
          <span className="pick-icon">🖼️</span>
          <span>사진첩에서 선택</span>
        </button>
        <p className="select-drop-hint">또는 사진을 이 화면으로 끌어다 놓으세요 (맥 사진 앱에서 바로 드래그 가능)</p>

        {busy && <p className="select-status">불러오는 중…</p>}
        {error && <p className="select-error">{error}</p>}

        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) handleFile(f)
          }}
        />
        <input
          ref={galleryInput}
          type="file"
          accept="image/*,video/*,.heic,.heif,.webp,.avif,.tiff,.tif"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) handleFile(f)
          }}
        />
      </main>
    </div>
  )
}
