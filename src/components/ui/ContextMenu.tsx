import * as RadixContextMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { menuContentClass, menuItemClass, menuLabelClass, menuSeparatorClass } from "./Menu";

export function ContextMenuRoot({ children }: { children: ReactNode }) {
  return <RadixContextMenu.Root>{children}</RadixContextMenu.Root>;
}

export function ContextMenuTrigger({ children }: { children: ReactNode }) {
  return <RadixContextMenu.Trigger asChild>{children}</RadixContextMenu.Trigger>;
}

export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content className={menuContentClass}>{children}</RadixContextMenu.Content>
    </RadixContextMenu.Portal>
  );
}

export function ContextMenuItem({ children, onSelect, disabled = false, tone = "default" }: { children: ReactNode; onSelect?: () => void; disabled?: boolean; tone?: "default" | "danger" }) {
  return (
    <RadixContextMenu.Item className={cn(menuItemClass, tone === "danger" && "border-[#e2b4b4] text-[#9b2424]")} disabled={disabled} onSelect={onSelect}>
      {children}
    </RadixContextMenu.Item>
  );
}

export function ContextMenuSub({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <RadixContextMenu.Sub>
      <RadixContextMenu.SubTrigger className={menuItemClass}>{trigger}</RadixContextMenu.SubTrigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.SubContent className={menuContentClass} sideOffset={6} alignOffset={-5}>
          {children}
        </RadixContextMenu.SubContent>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Sub>
  );
}

export function ContextMenuSeparator() {
  return <RadixContextMenu.Separator className={menuSeparatorClass} />;
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return <RadixContextMenu.Label className={menuLabelClass}>{children}</RadixContextMenu.Label>;
}
