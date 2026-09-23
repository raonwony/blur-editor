import { useEffect, useMemo, useState } from 'react'
import { deleteProjects, getAllProjects } from '../db'
import type { Project } from '../types'
import './Home.css'

interface HomeProps {
  onNew: () => void
  onOpen: (id: string) => void
}

function useObjectUrl(blob: Blob | null | undefined): string | null {
  return useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
}

function Thumb({ project, selected, manageMode, onClick }: { project: Project; selected: boolean; manageMode: boolean; onClick: () => void }) {
  const url = useObjectUrl(project.thumbnail)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  return (
    <button className={`thumb ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="thumb-media">
        {url ? <img src={url} alt="" /> : <div className="thumb-placeholder" />}
        {project.type === 'video' && <span className="thumb-badge video">동영상</span>}
        <span className={`thumb-badge status ${project.status}`}>{project.status === 'done' ? '완료' : '미완성'}</span>
        {manageMode && <span className={`thumb-check ${selected ? 'on' : ''}`}>{selected ? '✓' : ''}</span>}
      </div>
    </button>
  )
}

export default function Home({ onNew, onOpen }: HomeProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [manageMode, setManageMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function refresh() {
    setLoading(true)
    const all = await getAllProjects()
    setProjects(all)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleTap(id: string) {
    if (manageMode) toggleSelect(id)
    else onOpen(id)
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`선택한 ${selected.size}개 작업을 삭제할까요?`)) return
    await deleteProjects([...selected])
    setSelected(new Set())
    await refresh()
  }

  function exitManage() {
    setManageMode(false)
    setSelected(new Set())
  }

  return (
    <div className="app-shell home-screen">
      <header className="home-header">
        <h1>블러 에디터</h1>
        {projects.length > 0 && (
          manageMode ? (
            <button className="ghost-btn" onClick={exitManage}>취소</button>
          ) : (
            <button className="ghost-btn" onClick={() => setManageMode(true)}>관리</button>
          )
        )}
      </header>

      <main className="home-body">
        {loading ? (
          <div className="home-empty">불러오는 중…</div>
        ) : projects.length === 0 ? (
          <div className="home-empty">
            <p>아직 작업이 없어요.</p>
            <p className="home-empty-sub">새 작업을 시작해서 사진이나 동영상을 편집해보세요.</p>
          </div>
        ) : (
          <div className="thumb-grid">
            {projects.map((p) => (
              <Thumb
                key={p.id}
                project={p}
                selected={selected.has(p.id)}
                manageMode={manageMode}
                onClick={() => handleTap(p.id)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="home-footer">
        {manageMode ? (
          <button
            className="primary-btn danger"
            disabled={selected.size === 0}
            onClick={handleDeleteSelected}
          >
            선택 삭제 ({selected.size})
          </button>
        ) : (
          <button className="primary-btn new-btn" onClick={onNew}>＋ 새 작업</button>
        )}
      </footer>
    </div>
  )
}
