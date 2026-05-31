export interface CharacterSpec {
  id: string
  name: string
  archetype: 'humanoid' | 'creature' | 'object'
  role?: string
  weapon?: string
  style: 'placeholder'
  skeletonAssetId?: string
  animationAssetIds?: string[]
}
