"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Accessible label for screen readers */
  "aria-label": string;
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
};

export function IconButton({
  children,
  size = "md",
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center rounded-xl
        cursor-pointer backdrop-blur-2xl transition duration-150
        hover:bg-white/[0.12]
        focus:outline-none focus:ring-2 focus:ring-white/15
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
