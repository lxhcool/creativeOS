export interface AnimationClip {
  id: string
  name: 'idle' | 'walk' | 'attack' | 'shoot' | string
  duration: number
  loop: boolean
  tracks: AnimationTrack[]
}

export interface AnimationTrack {
  boneId: string
  keyframes: Keyframe[]
}

export interface Keyframe {
  time: number
  rotation?: number
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
}
