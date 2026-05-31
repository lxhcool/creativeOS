export type AssetType =
  | 'character'
  | 'skeleton'
  | 'animation'
  | 'image'
  | 'video'
  | 'text'
  | 'document'
  | 'project'

export interface Asset {
  id: string
  workspaceId: string
  projectId?: string
  type: AssetType
  name: string
  source: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
