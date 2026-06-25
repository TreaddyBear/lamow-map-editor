import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "danger";
};

const buttonBase = "cursor-pointer rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 font-semibold text-[var(--app-text)] hover:bg-[var(--subtle-bg)] disabled:cursor-not-allowed disabled:opacity-[0.45]";
const buttonTone = {
  default: "",
  primary: "border-[#2f6f34] bg-[#2f6f34] text-white hover:bg-[#2f6f34]",
  danger: "border-[#e2b4b4] text-[#9b2424] hover:bg-[#fff0ed]",
} satisfies Record<NonNullable<ButtonProps["tone"]>, string>;

export function Button({ tone = "default", className = "", ...props }: ButtonProps) {
  return <button {...props} className={cn(buttonBase, buttonTone[tone], className)} />;
}

export function ActionRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}

export function FileButton({ children, accept, className = "", onFile }: { children: ReactNode; accept: string; className?: string; onFile: (file: File) => void }) {
  return (
    <label className={cn(buttonBase, "inline-flex w-auto items-center text-base", className)}>
      {children}
      <input type="file" accept={accept} hidden onChange={(event) => event.currentTarget.files?.[0] && onFile(event.currentTarget.files[0])} />
    </label>
  );
}
