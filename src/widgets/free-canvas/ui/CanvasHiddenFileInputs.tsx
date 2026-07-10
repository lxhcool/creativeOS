import type { RefObject } from "react";

type PendingTargetRef = {
  current: string | null;
};

export function CanvasHiddenFileInputs({
  brainImageInputRef,
  imageInputRef,
  videoInputRef,
  audioInputRef,
  importInputRef,
  pendingImageTargetRef,
  pendingVideoTargetRef,
  pendingAudioTargetRef,
  onBrainImageFile,
  onImageFile,
  onVideoFile,
  onAudioFile,
  onImportFile,
}: {
  brainImageInputRef: RefObject<HTMLInputElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  audioInputRef: RefObject<HTMLInputElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  pendingImageTargetRef: PendingTargetRef;
  pendingVideoTargetRef: PendingTargetRef;
  pendingAudioTargetRef: PendingTargetRef;
  onBrainImageFile: (file: File | undefined) => void | Promise<void>;
  onImageFile: (file: File | undefined, targetId?: string | null) => void | Promise<void>;
  onVideoFile: (file: File | undefined, targetId?: string | null) => void | Promise<void>;
  onAudioFile: (file: File | undefined, targetId?: string | null) => void | Promise<void>;
  onImportFile: (file: File | undefined) => void | Promise<void>;
}) {
  return (
    <>
      <input
        ref={brainImageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          void onBrainImageFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const targetId = pendingImageTargetRef.current;
          pendingImageTargetRef.current = null;
          void onImageFile(event.target.files?.[0], targetId);
          event.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mov,video/*"
        className="hidden"
        onChange={(event) => {
          const targetId = pendingVideoTargetRef.current;
          pendingVideoTargetRef.current = null;
          void onVideoFile(event.target.files?.[0], targetId);
          event.target.value = "";
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/*"
        className="hidden"
        onChange={(event) => {
          const targetId = pendingAudioTargetRef.current;
          pendingAudioTargetRef.current = null;
          void onAudioFile(event.target.files?.[0], targetId);
          event.target.value = "";
        }}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="image/*,video/*,video/quicktime,.mov,audio/*,application/json,.json"
        className="hidden"
        onChange={(event) => {
          void onImportFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </>
  );
}
