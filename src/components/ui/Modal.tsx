"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { IconButton } from "./IconButton";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
  className = "",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  // Enter animation
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Force a frame delay so the browser registers the initial state before animating
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      document.body.style.overflow = "hidden";
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [open]);

  // Exit animation
  useEffect(() => {
    if (!open && mounted) {
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
        document.body.style.overflow = "";
      }, 200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown, open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`
          absolute inset-0 cursor-pointer transition-all duration-300
          ${visible ? "bg-black/60 backdrop-blur-sm" : "bg-transparent backdrop-blur-none"}
        `}
      />

      {/* Card */}
      <div
        className={`
          relative z-10 w-full ${maxWidth} rounded-[28px] border border-white/[0.12]
          bg-[#02070b]/[0.75] p-6 text-white shadow-2xl shadow-black/50 backdrop-blur-lg
          transition-all duration-300 ease-out
          ${visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}
          ${className}
        `.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="absolute left-5 top-5 flex gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>

        <IconButton
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-4 top-4 text-white/30 hover:text-white/80 cursor-pointer transition-colors"
        >
          ×
        </IconButton>

        {title && (
          <h2 className="mb-5 mt-5 text-lg font-semibold text-white/90">
            {title}
          </h2>
        )}

        {children}
      </div>
    </div>
  );
}
