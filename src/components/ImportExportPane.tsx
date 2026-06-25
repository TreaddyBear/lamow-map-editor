import type { MapPackV1 } from "../domain/model";
import { ActionRow, Button, FileButton } from "./ui";

export function ImportExportPane({ value, message, onJsonText, onCopy, onDownload, onLoadJson, onOpenFile, onRevert }: { value: string; message: string; pack: MapPackV1; onJsonText: (value: string) => void; onCopy: () => void; onDownload: () => void; onLoadJson: () => void; onOpenFile: (file: File) => void; onRevert: () => void }) {
  return (
    <div className="panel-body stack">
      <ActionRow className="io-actions">
        <FileButton accept="application/json,.json,.txt,text/plain" onFile={onOpenFile}>Import</FileButton>
        <Button tone="primary" type="button" onClick={onDownload}>Export</Button>
        <Button type="button" onClick={onCopy}>Copy JSON</Button>
        <Button type="button" onClick={onRevert}>Revert</Button>
      </ActionRow>
      <details className="raw-json-pane">
        <summary>Raw JSON</summary>
        <div className="stack">
          <textarea spellCheck={false} value={value} onChange={(event) => onJsonText(event.currentTarget.value)} />
          <Button type="button" onClick={onLoadJson}>Load pasted JSON</Button>
        </div>
      </details>
      {message ? <div className={["Imported", "Copied", "Exported", "Reverted"].some((word) => message.startsWith(word)) ? "ok" : "error"}>{message}</div> : null}
    </div>
  );
}
