import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "./cn";

type MenuProps = {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Menu({ trigger, children, align = "start", open, onOpenChange }: MenuProps) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuContentClass} align={align} sideOffset={6}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ children, onSelect, disabled = false, tone = "default" }: { children: ReactNode; onSelect?: () => void; disabled?: boolean; tone?: "default" | "danger" }) {
  return (
    <DropdownMenu.Item className={cn(menuItemClass, tone === "danger" && "border-[#e2b4b4] text-[#9b2424]")} disabled={disabled} onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className={menuSeparatorClass} />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className={menuLabelClass}>{children}</DropdownMenu.Label>;
}

export const menuContentClass = "z-20 grid min-w-48 gap-0.5 rounded-lg border border-[var(--input-border)] bg-[var(--surface-bg)] p-1.5 shadow-[0_12px_30px_rgb(31_49_27_/_18%)]";
export const menuItemClass = "cursor-pointer rounded-[5px] px-2.5 py-2 text-sm font-semibold text-[var(--app-text)] outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-[0.45] data-[highlighted]:bg-[var(--subtle-bg)]";
export const menuLabelClass = "px-2.5 pb-0.5 pt-1 text-[0.68rem] font-black uppercase tracking-[0.04em] text-[var(--muted-text)]";
export const menuSeparatorClass = "my-0.5 h-px bg-[var(--surface-border)]";
