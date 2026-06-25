import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import type { Point2 } from "../domain/model";
import { SectionHeader, Stack } from "./ui";
import { cn } from "./ui/cn";

type FieldProps = {
  label: string;
  value: string | number;
  type?: string;
  onCommit: (value: string) => void;
};

export function Field({ label, value, type = "text", onCommit }: FieldProps) {
  return (
    <label className={fieldLabelClass}>
      {label}
      <TextInput
        key={String(value)}
        type={type}
        defaultValue={String(value)}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function TextAreaField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  return (
    <label className={fieldLabelClass}>
      {label}
      <TextareaControl className="min-h-56" key={value} spellCheck={false} defaultValue={value} onBlur={(event) => onCommit(event.currentTarget.value)} />
    </label>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className={fieldLabelClass}>
      {label}
      <select className={fieldControlClass} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted-text)]">
      <input className="w-auto" type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      {label}
    </label>
  );
}

export function FormLabel({ children, className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label {...props} className={cn(fieldLabelClass, className)}>
      {children}
    </label>
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldControlClass, className)} />;
}

export function TextareaControl({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldControlClass, "resize-y", className)} />;
}

export function Point2Fields({ label, point, onChange }: { label: string; point: Point2; onChange: (point: Point2) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Field label={`${label} x`} value={point[0]} type="number" onCommit={(value) => onChange([Number(value), point[1]])} />
      <Field label={`${label} z`} value={point[1]} type="number" onCommit={(value) => onChange([point[0], Number(value)])} />
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-[var(--surface-border)] pt-3.5">
      <SectionHeader>
        <h3 className="m-0 text-[0.92rem]">{title}</h3>
        {action}
      </SectionHeader>
      <Stack>{children}</Stack>
    </div>
  );
}

const fieldLabelClass = "grid gap-1 text-xs font-bold text-[var(--muted-text)]";
const fieldControlClass = "w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-2 text-[var(--app-text)]";
