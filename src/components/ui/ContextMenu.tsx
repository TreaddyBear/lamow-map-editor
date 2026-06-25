import * as RadixContextMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";

export function ContextMenuRoot({ children }: { children: ReactNode }) {
  return <RadixContextMenu.Root>{children}</RadixContextMenu.Root>;
}

export function ContextMenuTrigger({ children }: { children: ReactNode }) {
  return <RadixContextMenu.Trigger asChild>{children}</RadixContextMenu.Trigger>;
}

export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content className="menu-content context-content">{children}</RadixContextMenu.Content>
    </RadixContextMenu.Portal>
  );
}

export function ContextMenuItem({ children, onSelect, disabled = false, tone = "default" }: { children: ReactNode; onSelect?: () => void; disabled?: boolean; tone?: "default" | "danger" }) {
  return (
    <RadixContextMenu.Item className={`menu-item ${tone === "danger" ? "danger" : ""}`} disabled={disabled} onSelect={onSelect}>
      {children}
    </RadixContextMenu.Item>
  );
}

export function ContextMenuSub({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <RadixContextMenu.Sub>
      <RadixContextMenu.SubTrigger className="menu-item context-sub-trigger">{trigger}</RadixContextMenu.SubTrigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.SubContent className="menu-content context-sub-content" sideOffset={6} alignOffset={-5}>
          {children}
        </RadixContextMenu.SubContent>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Sub>
  );
}

export function ContextMenuSeparator() {
  return <RadixContextMenu.Separator className="menu-separator" />;
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return <RadixContextMenu.Label className="menu-label">{children}</RadixContextMenu.Label>;
}
