"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-white/[0.14] text-white border-white/[0.15] hover:bg-white/[0.22] hover:border-white/25",
  secondary:
    "bg-white/[0.07] text-white/85 border-white/10 hover:bg-white/[0.14] hover:text-white hover:border-white/20",
  ghost:
    "bg-transparent text-white/50 hover:bg-white/[0.08] hover:text-white/80 border-transparent",
  danger:
    "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center rounded-3xl border
        font-medium backdrop-blur-2xl shadow-lg shadow-black/20
        cursor-pointer transition duration-150
        hover:shadow-xl hover:shadow-black/30
        active:scale-[0.98]
        focus:outline-none focus:ring-2 focus:ring-white/15
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `.trim()}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
