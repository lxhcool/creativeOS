export type UploadMediaType = "video" | "image" | "image_sequence" | "animation";

export type SpriteUpload = {
  upload_id: string;
  display_name: string;
  media_type?: UploadMediaType;
  media_url?: string;
  video_url?: string;
  media_info?: {
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
    frame_count?: number;
  };
};

export type SpriteFrame = {
  index: number;
  name: string;
  original_name?: string;
  url: string;
  thumb_url?: string;
  width?: number;
  height?: number;
  source_index?: number;
};

export type SpriteJob = {
  job_id: string;
  frame_count: number;
  frames: SpriteFrame[];
  processed_dir?: string;
  source_media_type?: UploadMediaType;
  video_info?: Record<string, unknown>;
  ffmpeg_accel?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type SpritePreview = {
  preview_id: string;
  upload_id?: string;
  source_url: string;
  processed_url: string;
  key_color?: string;
  sample_time?: number;
  sample_frame?: number;
  source_media_type?: UploadMediaType;
  matte?: Record<string, unknown>;
  options?: Record<string, unknown>;
  postprocess?: Record<string, { enabled?: boolean; changed_pixels?: number; [key: string]: unknown }>;
};

export type SpriteExport = {
  output_dir?: string;
  frames_dir?: string;
  frame_count?: number;
  video_name?: string;
  video_url?: string;
  webm_name?: string;
  webm_url?: string;
  mov_name?: string;
  mov_url?: string;
  gif_name?: string;
  gif_url?: string;
};

export type MagicVariant = {
  key: "half" | "quarter" | "eighth";
  label?: string;
  frame_count?: number;
  max_width?: number;
  max_height?: number;
  frames?: SpriteFrame[];
};

export type SpriteMagic = MagicVariant & {
  magic_id: string;
  resize_mode?: "hard" | "soft";
  resize_mode_label?: string;
  generated_count?: number;
  reused_count?: number;
  variants?: Partial<Record<MagicVariant["key"], MagicVariant>>;
};

export type ProcessingOptions = {
  keepEvery: number;
  outputScale: number;
  canvasMode: "auto" | "square_bottom" | "square_center";
  reducePx: number;
  chromaEnabled: boolean;
  matteMode:
    | "chroma"
    | "birefnet"
    | "birefnet_chroma"
    | "corridorkey"
    | "luma"
    | "birefnet_corridorkey"
    | "birefnet_corridorkey_key"
    | "birefnet_luma"
    | "birefnet_luma_key"
    | "birefnet_luma_corridorkey"
    | "none";
  keyMode: "auto" | "manual";
  manualKeyHex: string;
  threshold: number;
  softness: number;
  despillStrength: number;
  haloPixels: number;
  foregroundProtectEnabled: boolean;
  foregroundProtectHex: string;
  foregroundProtectTolerance: number;
  foregroundProtectStrength: number;
  corridorkeyScreen: "auto" | "green" | "blue";
  lumaBlack: number;
  lumaWhite: number;
  lumaGamma: number;
  lumaStrength: number;
  batchGreenToBlack: boolean;
  batchGreenDesaturate: boolean;
  batchSemiTransparentToBlack: boolean;
  batchSemiTransparentToOpaque: boolean;
};
