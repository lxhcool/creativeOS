import { useCallback, useEffect, useRef, useState } from "react";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useHtmlImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = src;
  }, [src]);

  return image;
}

export function useHtmlVideo(src?: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [coverReady, setCoverReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!src) {
      setVideo(null);
      setCoverReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const nextVideo = document.createElement("video");
    videoRef.current = nextVideo;
    nextVideo.src = src;
    nextVideo.muted = true;
    nextVideo.loop = true;
    nextVideo.playsInline = true;
    nextVideo.preload = "metadata";
    const markCoverReady = () => {
      setCoverReady(true);
      setVideo(nextVideo);
    };
    nextVideo.onloadeddata = () => {
      markCoverReady();
    };
    const syncTime = () => setCurrentTime(nextVideo.currentTime || 0);
    const syncDuration = () =>
      setDuration(Number.isFinite(nextVideo.duration) ? nextVideo.duration : 0);
    const prepareCover = () => {
      syncDuration();
      try {
        nextVideo.currentTime = Math.min(0.05, Math.max(0, nextVideo.duration || 0));
      } catch {
        markCoverReady();
      }
    };
    nextVideo.addEventListener("timeupdate", syncTime);
    nextVideo.addEventListener("loadedmetadata", syncDuration);
    nextVideo.addEventListener("loadedmetadata", prepareCover);
    nextVideo.addEventListener("durationchange", syncDuration);
    nextVideo.addEventListener("seeked", markCoverReady);
    nextVideo.onplay = () => setIsPlaying(true);
    nextVideo.onpause = () => setIsPlaying(false);

    return () => {
      nextVideo.pause();
      nextVideo.removeEventListener("timeupdate", syncTime);
      nextVideo.removeEventListener("loadedmetadata", syncDuration);
      nextVideo.removeEventListener("loadedmetadata", prepareCover);
      nextVideo.removeEventListener("durationchange", syncDuration);
      nextVideo.removeEventListener("seeked", markCoverReady);
      nextVideo.src = "";
      nextVideo.load();
      videoRef.current = null;
      setCoverReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;

    if (currentVideo.paused) {
      void currentVideo.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      currentVideo.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const currentVideo = videoRef.current;
      if (!currentVideo || duration <= 0) return;
      currentVideo.currentTime = clamp(ratio, 0, 1) * duration;
      setCurrentTime(currentVideo.currentTime);
    },
    [duration],
  );

  const toggleMute = useCallback(() => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;
    currentVideo.muted = !currentVideo.muted;
    setMuted(currentVideo.muted);
  }, []);

  return {
    coverReady,
    currentTime,
    duration,
    isPlaying,
    muted,
    progress: duration > 0 ? currentTime / duration : 0,
    seekToRatio,
    toggle,
    toggleMute,
    video,
  };
}

export function useHtmlAudio(src?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!src) {
      audioRef.current?.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setMuted(false);
      return;
    }

    const audio = new Audio(src);
    audio.preload = "metadata";
    audioRef.current = audio;

    const syncTime = () => setCurrentTime(audio.currentTime || 0);
    const syncDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      audio.currentTime = clamp(ratio, 0, 1) * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration],
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  }, []);

  return {
    currentTime,
    duration,
    isPlaying,
    muted,
    progress: duration > 0 ? currentTime / duration : 0,
    seekToRatio,
    toggle,
    toggleMute,
  };
}

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}
