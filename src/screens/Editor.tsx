import { useCallback, useEffect, useRef, useState } from 'react'
import { getProject, saveProject } from '../db'
import type { Project } from '../types'
import { regenerateThumbnail } from '../utils/thumbnail'
import PhotoEditor from './PhotoEditor'
import VideoEditor from './VideoEditor'
import './Editor.css'

interface EditorProps {
  projectId: string
  onBack: () => void
  onDone: (id: string) => void
}

export default function Editor({ projectId, onBack, onDone }: EditorProps) {
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const dirtyRef = useRef(false)
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    getProject(projectId).then((p) => {
      if (!alive) return
      setProject(p ?? null)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [projectId])

  const update = useCallback((patch: Partial<Project>) => {
    setProject((prev) => {
      if (!prev) return prev
      return { ...prev, ...patch, updatedAt: Date.now() } as Project
    })
    dirtyRef.current = true
  }, [])

  useEffect(() => {
    if (!project || !dirtyRef.current) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      await saveProject(project)
      dirtyRef.current = false
      setSaveState('saved')
      if (savedTimeout.current) clearTimeout(savedTimeout.current)
      savedTimeout.current = setTimeout(() => setSaveState('idle'), 1500)
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  async function flush() {
    if (project && dirtyRef.current) {
      await saveProject(project)
      dirtyRef.current = false
    }
  }

  async function handleBack() {
    await flush()
    onBack()
  }

  async function handleDone() {
    if (!project) return
    const thumbnail = await regenerateThumbnail(project)
    const done = { ...project, status: 'done' as const, thumbnail, updatedAt: Date.now() }
    await saveProject(done)
    dirtyRef.current = false
    onDone(project.id)
  }

  if (loading) {
    return (
      <div className="app-shell editor-loading-screen">
        <p>불러오는 중…</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="app-shell editor-loading-screen">
        <p>작업을 찾을 수 없어요.</p>
        <button className="ghost-btn" onClick={onBack}>홈으로</button>
      </div>
    )
  }

  return (
    <div className="app-shell editor-screen">
      <header className="editor-header">
        <button className="ghost-btn" onClick={handleBack}>‹ 뒤로</button>
        <span className={`save-indicator ${saveState}`}>
          {saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동 저장됨' : ''}
        </span>
        <button className="primary-btn done-btn" onClick={handleDone}>완료</button>
      </header>
      {project.type === 'photo' ? (
        <PhotoEditor project={project} onChange={update} />
      ) : (
        <VideoEditor project={project} onChange={update} />
      )}
    </div>
  )
}
