export type ProjectType = 'photo' | 'video'
export type ProjectStatus = 'draft' | 'done'
export type Rotation = 0 | 90 | 180 | 270

export interface Point {
  x: number // 0..1, normalized to rotated media width
  y: number // 0..1, normalized to rotated media height
}

export type BlurShape = 'freeform' | 'rect' | 'circle'

export interface BlurStroke {
  id: string
  shape: BlurShape
  points: Point[] // freeform only
  x: number // rect/circle only — normalized center x
  y: number // rect/circle only — normalized center y
  w: number // rect/circle only — normalized width (bounding box)
  h: number // rect/circle only — normalized height (bounding box)
  brushSize: number // freeform only — 0..1, normalized to min(width, height)
  strength: number // 0..1, blur intensity
}

export interface VideoBlurRegion {
  id: string
  shape: 'circle' | 'rect'
  x: number // normalized center x
  y: number // normalized center y
  w: number // normalized width (bounding box)
  h: number // normalized height (bounding box)
  start: number // seconds
  end: number // seconds
  strength: number // 0..1, blur intensity
}

export interface TextLayer {
  id: string
  text: string
  font: string // CSS font-family value
  fontLabel: string
  size: number // 0..1, normalized to media height
  color: string
  strokeColor: string | null // null = no outline
  x: number // normalized center x
  y: number // normalized center y
  rotation: number // degrees
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

interface BaseProject {
  id: string
  status: ProjectStatus
  createdAt: number
  updatedAt: number
  width: number
  height: number
  rotation: Rotation
  crop: CropRect | null
  textLayers: TextLayer[]
  original: Blob
  thumbnail: Blob | null
}

export interface PhotoProject extends BaseProject {
  type: 'photo'
  blurStrokes: BlurStroke[]
}

export interface VideoProject extends BaseProject {
  type: 'video'
  duration: number
  blurRegions: VideoBlurRegion[]
  exportedBlob?: Blob
}

export type Project = PhotoProject | VideoProject
