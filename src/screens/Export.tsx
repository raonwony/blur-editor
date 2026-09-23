import { useEffect, useRef, useState } from 'react'
import { getProject } from '../db'
import type { Project } from '../types'
import { loadImage } from '../utils/media'
import { renderPhoto } from '../utils/renderPhoto'
import { bakeVideo, canBakeVideo } from '../utils/bakeVideo'
import { canShareFiles, downloadBlob, shareOrDownload } from '../utils/share'
import './Export.css'

interface ExportProps {
  projectId: string
  onHome: () => void
  onBackToEdit: (id: string) => void
}

export default function Export({ projectId, onHome, onBackToEdit }: ExportProps) {
  const [project, setProject] = useState<Project | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'working' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    let alive = true
    getProject(projectId).then((p) => {
      if (alive) setProject(p ?? null)
    })
    return () => {
      alive = false
    }
  }, [projectId])

  useEffect(() => {
    if (!project || startedRef.current) return
    startedRef.current = true
    run(project)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function run(p: Project) {
    setStatus('working')
    setError(null)
    try {
      if (p.type === 'photo') {
        const img = await loadImage(p.original)
        const canvas = renderPhoto(img, p, { maxDim: 2200, includeText: true, includeCrop: true })
        const outBlob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했어요.'))), 'image/jpeg', 0.92),
        )
        setBlob(outBlob)
        setPreviewUrl(URL.createObjectURL(outBlob))
        setStatus('ready')
      } else {
        if (!canBakeVideo()) {
          setStatus('error')
          setError('이 브라우저에서는 동영상 블러 저장을 지원하지 않아요. 최신 Chrome/Safari에서 시도해보세요.')
          return
        }
        const outBlob = await bakeVideo(p, (f) => setProgress(f))
        setBlob(outBlob)
        setPreviewUrl(URL.createObjectURL(outBlob))
        setStatus('ready')
      }
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : '내보내기에 실패했어요.')
    }
  }

  function filename() {
    if (!project) return 'blur-edit'
    const ext = project.type === 'photo' ? 'jpg' : blob?.type.includes('mp4') ? 'mp4' : 'webm'
    return `blur-edit-${project.id.slice(0, 8)}.${ext}`
  }

  async function handleSave() {
    if (!blob) return
    downloadBlob(blob, filename())
    setToast('사진첩(다운로드 폴더)에 저장했어요.')
  }

  async function handleShare() {
    if (!blob) return
    const result = await shareOrDownload(blob, filename())
    setToast(result === 'shared' ? '공유했어요.' : result === 'downloaded' ? '공유를 지원하지 않아 저장했어요.' : null)
  }

  if (!project) {
    return (
      <div className="app-shell export-screen">
        <p className="export-status">불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="app-shell export-screen">
      <header className="export-header">
        <button className="ghost-btn" onClick={() => onBackToEdit(project.id)}>‹ 편집으로</button>
        <h1>내보내기</h1>
        <span />
      </header>

      <main className="export-body">
        {status === 'working' && (
          <div className="export-status">
            <div className="spinner" />
            <p>{project.type === 'video' ? '동영상을 처리하고 있어요…' : '이미지를 만들고 있어요…'}</p>
            {project.type === 'video' && (
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="export-status">
            <p className="export-error">{error}</p>
            <button className="ghost-btn" onClick={() => { startedRef.current = false; run(project) }}>다시 시도</button>
          </div>
        )}

        {status === 'ready' && previewUrl && (
          <div className="export-preview">
            {project.type === 'photo' ? (
              <img src={previewUrl} alt="완성된 사진" />
            ) : (
              <video src={previewUrl} controls playsInline className="export-video" />
            )}
          </div>
        )}
      </main>

      {toast && <div className="export-toast">{toast}</div>}

      <footer className="export-footer">
        <button className="primary-btn" disabled={status !== 'ready'} onClick={handleSave}>사진첩에 저장</button>
        {canShareFiles() && (
          <button className="ghost-btn" disabled={status !== 'ready'} onClick={handleShare}>바로 공유</button>
        )}
        <button className="ghost-btn" onClick={onHome}>목록으로</button>
      </footer>
    </div>
  )
}
