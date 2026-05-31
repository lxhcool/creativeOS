export interface Skeleton {
  id: string
  name: string
  bones: Bone[]
}

export interface Bone {
  id: string
  name: string
  parentId?: string
  length: number
  rotation: number
  x?: number
  y?: number
}
