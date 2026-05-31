"use client";

interface VerificationCodeInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function VerificationCodeInput({
  value,
  onChange,
}: VerificationCodeInputProps) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ""}
          onChange={(event) => {
            const digit = event.target.value.replace(/\D/g, "").slice(-1);
            const chars = value.split("");
            chars[index] = digit;
            onChange(chars.join("").slice(0, 6));

            if (digit && index < 5) {
              const next = event.currentTarget.parentElement?.children[
                index + 1
              ] as HTMLInputElement | null;
              next?.focus();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !value[index] && index > 0) {
              const previous = event.currentTarget.parentElement?.children[
                index - 1
              ] as HTMLInputElement | null;
              previous?.focus();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = event.clipboardData
              .getData("text")
              .replace(/\D/g, "")
              .slice(0, 6);
            onChange(pasted);

            const lastIndex = Math.min(pasted.length, 5);
            const target = event.currentTarget.parentElement?.children[
              lastIndex
            ] as HTMLInputElement | null;
            target?.focus();
          }}
          className="h-14 w-12 rounded-2xl border border-white/10 bg-white/[0.07] text-center text-xl font-semibold text-white backdrop-blur-2xl shadow-lg shadow-black/20 cursor-pointer hover:bg-white/[0.10] hover:border-white/[0.15] focus:border-white/25 focus:bg-white/[0.10] focus:outline-none focus:ring-2 focus:ring-white/15 transition duration-150"
        />
      ))}
    </div>
  );
}
