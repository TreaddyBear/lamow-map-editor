import type { ReactNode } from "react";
import type { Point2 } from "../domain/model";

type FieldProps = {
  label: string;
  value: string | number;
  type?: string;
  onCommit: (value: string) => void;
};

export function Field({ label, value, type = "text", onCommit }: FieldProps) {
  return (
    <label>
      {label}
      <input
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
    <label>
      {label}
      <textarea key={value} spellCheck={false} defaultValue={value} onBlur={(event) => onCommit(event.currentTarget.value)} />
    </label>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
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
    <label className="checkbox-label">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      {label}
    </label>
  );
}

export function Point2Fields({ label, point, onChange }: { label: string; point: Point2; onChange: (point: Point2) => void }) {
  return (
    <div className="two">
      <Field label={`${label} x`} value={point[0]} type="number" onCommit={(value) => onChange([Number(value), point[1]])} />
      <Field label={`${label} z`} value={point[1]} type="number" onCommit={(value) => onChange([point[0], Number(value)])} />
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">
        <h3>{title}</h3>
        {action}
      </div>
      <div className="stack">{children}</div>
    </div>
  );
}
