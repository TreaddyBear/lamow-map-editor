import type { HTMLAttributes, ReactNode, SVGProps } from "react";
import { cn } from "./cn";

export function AppShell({ leftCollapsed, rightOpen, children }: { leftCollapsed: boolean; rightOpen: boolean; children: ReactNode }) {
  return (
    <main
      className={cn(
        "grid h-screen max-h-screen gap-4 overflow-hidden p-4 [grid-template-rows:auto_minmax(0,1fr)] [grid-template-columns:minmax(360px,440px)_minmax(0,1fr)] max-[1180px]:[grid-template-columns:minmax(300px,360px)_minmax(0,1fr)]",
        rightOpen && "[grid-template-columns:minmax(320px,400px)_minmax(0,1fr)_minmax(340px,420px)] max-[1180px]:[grid-template-columns:minmax(300px,360px)_minmax(0,1fr)]",
        leftCollapsed && "[grid-template-columns:minmax(148px,180px)_minmax(0,1fr)]",
        leftCollapsed && rightOpen && "[grid-template-columns:minmax(148px,180px)_minmax(0,1fr)_minmax(340px,420px)] max-[1180px]:[grid-template-columns:minmax(300px,360px)_minmax(0,1fr)]",
      )}
    >
      {children}
    </main>
  );
}

export function TopBar({ children, className = "", ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <header {...props} className={cn("col-span-full flex min-w-0 items-center justify-between gap-4 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)] px-3 py-1.5", className)}>
      {children}
    </header>
  );
}

export function TopBarTitle({ children }: { children: ReactNode }) {
  return <strong className="text-[1.85rem] font-light leading-none">{children}</strong>;
}

export function CanvasPanelLayout({ children }: { children: ReactNode }) {
  return <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">{children}</div>;
}

export function MapStage({ children }: { children: ReactNode }) {
  return <div className="relative min-h-0 p-4">{children}</div>;
}

export function StatusStrip({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 border-t border-[var(--surface-border)] px-4 py-3">{children}</div>;
}

export function SidebarSlot({ children }: { children?: ReactNode }) {
  return <div className="grid grid-rows-[minmax(0,1fr)]">{children}</div>;
}

export function FloatingAsideLayout({ children }: { children: ReactNode }) {
  return <div className="grid grid-rows-[auto_minmax(0,1fr)] max-[1180px]:fixed max-[1180px]:right-4 max-[1180px]:top-4 max-[1180px]:z-10 max-[1180px]:w-[min(420px,calc(100vw-2rem))]">{children}</div>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b border-[var(--surface-border)] px-3 py-2">{children}</div>;
}

export function FloatingWidget({ children, placement = "top-left", className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; placement?: "top-left" | "bottom-right" | "bottom-before-minimap" }) {
  const placementClass = {
    "top-left": "left-7 top-7",
    "bottom-right": "bottom-7 right-7",
    "bottom-before-minimap": "bottom-7 right-[calc(1.75rem+12rem+1.75rem)]",
  }[placement];
  return <div {...props} className={cn("absolute z-10", placementClass, className)}>{children}</div>;
}

export function FloatingSurface({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...props} className={cn("rounded-lg border border-[var(--surface-border)] bg-[color-mix(in_srgb,var(--surface-bg)_94%,transparent)] shadow-[0_8px_22px_rgb(31_49_27_/_12%)]", className)}>
      {children}
    </div>
  );
}

export function MinimapSurface({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg {...props} className={cn("absolute bottom-7 right-7 z-10 h-32 w-48 cursor-pointer rounded-lg border border-[var(--input-border)] bg-[var(--surface-bg)] shadow-[0_8px_22px_rgb(31_49_27_/_12%)]", props.className)}>
      {children}
    </svg>
  );
}

export function DisclosurePane({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return (
    <details className="border-b border-[var(--surface-border)] [&[open]>summary]:border-b [&[open]>summary]:border-[var(--surface-border)]" open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
      <summary className="cursor-pointer bg-[var(--subtle-bg)] px-3.5 py-3 font-extrabold marker:text-[var(--muted-text)]">{title}</summary>
      {children}
    </details>
  );
}
