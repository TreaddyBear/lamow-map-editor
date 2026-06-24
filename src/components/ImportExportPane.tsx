import type { MapPackV1 } from "../domain/model";
import { ActionRow, Button, FileButton } from "./ui";

export function ImportExportPane({ value, message, onJsonText, onCopy, onImport, onOpenFile }: { value: string; message: string; pack: MapPackV1; onJsonText: (value: string) => void; onCopy: () => void; onImport: () => void; onOpenFile: (file: File) => void }) {
  return (
    <div className="panel-body stack">
      <ActionRow>
        <Button tone="primary" type="button" onClick={onCopy}>Copy</Button>
        <FileButton accept="application/json,.json,.txt,text/plain" onFile={onOpenFile}>Open file</FileButton>
        <Button type="button" onClick={onImport}>Import</Button>
      </ActionRow>
      <textarea spellCheck={false} value={value} onChange={(event) => onJsonText(event.currentTarget.value)} />
      {message ? <div className={message.startsWith("Imported") || message.startsWith("Copied") ? "ok" : "error"}>{message}</div> : null}
      <div className="hint">Import accepts the draft v1 pack shape, a single v1 level, or old prototype map JSON. Export is always the draft v1 pack shape.</div>
    </div>
  );
}
