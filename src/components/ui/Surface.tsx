import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Panel({ as: Component = "section", children, className = "", ...props }: HTMLAttributes<HTMLElement> & { as?: ElementType; children: ReactNode }) {
  return (
    <Component {...props} className={cn("panel h-full max-h-full min-h-0 min-w-0 overflow-hidden rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)]", className)}>
      {children}
    </Component>
  );
}

export function PanelHeader({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...props} className={cn("flex items-center justify-between gap-4 border-b border-[var(--surface-border)] px-4 py-3", className)}>
      {children}
    </div>
  );
}

export function PanelBody({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...props} className={cn("overflow-auto p-4", className)}>
      {children}
    </div>
  );
}

export function Stack({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...props} className={cn("grid gap-3", className)}>
      {children}
    </div>
  );
}

export function Item({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...props} className={cn("rounded-lg border border-[var(--surface-border)] bg-[var(--input-bg)] p-3", className)}>
      {children}
    </div>
  );
}

export function SectionHeader({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...props} className={cn("mb-2.5 flex items-center justify-between gap-2", className)}>
      {children}
    </div>
  );
}

export function Hint({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...props} className={cn("text-[0.82rem] leading-snug text-[var(--muted-text)]", className)}>
      {children}
    </div>
  );
}

export function StatusMessage({ tone = "ok", children }: { tone?: "ok" | "error"; children: ReactNode }) {
  return <div className={cn("rounded-md px-3 py-2 text-sm", tone === "ok" ? "bg-[var(--ok-bg)] text-[var(--ok-text)]" : "bg-[var(--error-bg)] text-[var(--error-text)]")}>{children}</div>;
}
