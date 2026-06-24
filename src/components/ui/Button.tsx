import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "danger";
};

export function Button({ tone = "default", className = "", ...props }: ButtonProps) {
  const toneClass = tone === "default" ? "" : tone;
  return <button {...props} className={[toneClass, className].filter(Boolean).join(" ")} />;
}

export function ActionRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={["json-actions", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function FileButton({ children, accept, onFile }: { children: ReactNode; accept: string; onFile: (file: File) => void }) {
  return (
    <label className="file-button">
      {children}
      <input type="file" accept={accept} hidden onChange={(event) => event.currentTarget.files?.[0] && onFile(event.currentTarget.files[0])} />
    </label>
  );
}
