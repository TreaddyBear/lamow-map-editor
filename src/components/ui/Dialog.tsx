import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

type DialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
};

export function Dialog({ open, title, children, onOpenChange }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-30 bg-[rgb(20_32_22_/_28%)]" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 z-[31] grid max-h-[min(34rem,calc(100vh-2rem))] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)] text-[var(--app-text)] shadow-[0_18px_60px_rgb(31_49_27_/_24%)]" aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-4 border-b border-[var(--surface-border)] px-3 py-2.5">
            <RadixDialog.Title className="m-0 text-base font-extrabold">{title}</RadixDialog.Title>
            <RadixDialog.Close className={cn("icon-button")} type="button" title={`Close ${title}`}><X /></RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
