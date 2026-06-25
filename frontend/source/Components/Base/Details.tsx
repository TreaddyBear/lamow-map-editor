import type { ReactNode } from "react";
import { Stack } from "./Surface";

export function InlineDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-[var(--surface-border)] bg-[var(--input-bg)]">
      <summary className="cursor-pointer px-3 py-2 font-extrabold">{title}</summary>
      <Stack className="px-3 pb-3">{children}</Stack>
    </details>
  );
}
