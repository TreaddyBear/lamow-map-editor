import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

type MenuProps = {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
};

export function Menu({ trigger, children, align = "start" }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-content" align={align} sideOffset={6}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ children, onSelect, disabled = false, tone = "default" }: { children: ReactNode; onSelect?: () => void; disabled?: boolean; tone?: "default" | "danger" }) {
  return (
    <DropdownMenu.Item className={`menu-item ${tone === "danger" ? "danger" : ""}`} disabled={disabled} onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="menu-separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="menu-label">{children}</DropdownMenu.Label>;
}
