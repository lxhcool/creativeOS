"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, hint, required, className = "", id, ...props }, ref) {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-white/80"
          >
            {label}
            {required && <span className="ml-1 text-danger">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full rounded-2xl border bg-white/[0.07] px-3 py-2 text-sm text-white
            placeholder:text-white/30 backdrop-blur-2xl
            shadow-lg shadow-black/20
            hover:bg-white/[0.10] hover:border-white/[0.15]
            focus:outline-none focus:ring-2 focus:ring-white/15 focus:border-white/25 focus:bg-white/[0.10]
            transition duration-150
            ${error ? "border-danger/40" : "border-white/10"}
            ${className}
          `.trim()}
          {...props}
        />
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-white/30">{hint}</p>
        )}
      </div>
    );
  },
);
