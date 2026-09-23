import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Project } from './types'

interface BlurDB extends DBSchema {
  projects: {
    key: string
    value: Project
    indexes: { 'by-updatedAt': number }
  }
}

let dbPromise: Promise<IDBPDatabase<BlurDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BlurDB>('blur-editor', 1, {
      upgrade(db) {
        const store = db.createObjectStore('projects', { keyPath: 'id' })
        store.createIndex('by-updatedAt', 'updatedAt')
      },
    })
  }
  return dbPromise
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB()
  await db.put('projects', project)
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB()
  return db.get('projects', id)
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('projects', 'by-updatedAt')
  return all.reverse()
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('projects', id)
}

export async function deleteProjects(ids: string[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('projects', 'readwrite')
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
}
