import type { SamplePack } from "../domain/samplePacks";
import type { MapPackV1 } from "../domain/model";
import { TextareaControl } from "./formControls";
import { ActionRow, Button, FileButton, Menu, MenuItem, PanelBody, Stack, StatusMessage } from "./ui";

export function ImportExportPane({ value, message, samples, onJsonText, onCopy, onDownload, onLoadJson, onOpenFile, onRevert, onLoadSample }: { value: string; message: string; pack: MapPackV1; samples: SamplePack[]; onJsonText: (value: string) => void; onCopy: () => void; onDownload: () => void; onLoadJson: () => void; onOpenFile: (file: File) => void; onRevert: () => void; onLoadSample: (key: string) => void }) {
  return (
    <PanelBody className="min-h-0">
      <Stack>
        <ActionRow className="io-actions">
          <FileButton accept="application/json,.json,.txt,text/plain" onFile={onOpenFile}>Import</FileButton>
          <Button tone="primary" type="button" onClick={onDownload}>Export</Button>
          <Menu trigger={<Button type="button">Samples</Button>}>
            {samples.map((sample) => <MenuItem key={sample.key} onSelect={() => onLoadSample(sample.key)}>{sample.label}</MenuItem>)}
          </Menu>
          <Button type="button" onClick={onCopy}>Copy JSON</Button>
          <Button type="button" onClick={onRevert}>Revert</Button>
        </ActionRow>
        <details className="raw-json-pane">
          <summary>Raw JSON</summary>
          <Stack className="px-3 pb-3">
            <TextareaControl spellCheck={false} value={value} onChange={(event) => onJsonText(event.currentTarget.value)} />
            <Button type="button" onClick={onLoadJson}>Load pasted JSON</Button>
          </Stack>
        </details>
        {message ? <StatusMessage tone={["Imported", "Copied", "Exported", "Reverted", "Loaded"].some((word) => message.startsWith(word)) ? "ok" : "error"}>{message}</StatusMessage> : null}
      </Stack>
    </PanelBody>
  );
}
