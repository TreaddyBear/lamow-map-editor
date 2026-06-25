import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "danger";
  size?: "default" | "compact" | "icon";
};

const buttonBase = "cursor-pointer rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 font-semibold text-[var(--app-text)] hover:bg-[var(--subtle-bg)] disabled:cursor-not-allowed disabled:opacity-[0.45]";
const buttonSize = {
  default: "",
  compact: "min-h-0 px-2 py-1.5 text-[0.82rem] leading-tight",
  icon: "inline-grid h-9 w-9 min-w-9 place-items-center px-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[2.2]",
} satisfies Record<NonNullable<ButtonProps["size"]>, string>;
const buttonTone = {
  default: "",
  primary: "border-[#2f6f34] bg-[#2f6f34] text-white hover:bg-[#2f6f34]",
  danger: "border-[#e2b4b4] text-[#9b2424] hover:bg-[#fff0ed]",
} satisfies Record<NonNullable<ButtonProps["tone"]>, string>;

export function Button({ tone = "default", size = "default", className = "", ...props }: ButtonProps) {
  return <button {...props} className={cn(buttonBase, buttonSize[size], buttonTone[tone], className)} />;
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
