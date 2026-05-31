import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
};

export function Card({
  children,
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`
        rounded-lg border border-border bg-surface
        ${paddingClasses[padding]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
