import type { SamplePack } from "../domain/samplePacks";
import type { MapPackV1 } from "../domain/model";
import { TextareaControl } from "./formControls";
import { ActionRow, Button, FileButton, Menu, MenuItem, PanelBody, Stack, StatusMessage } from "./ui";

export function ImportExportPane({ value, message, samples, onJsonText, onCopy, onDownload, onLoadJson, onOpenFile, onRevert, onLoadSample }: { value: string; message: string; pack: MapPackV1; samples: SamplePack[]; onJsonText: (value: string) => void; onCopy: () => void; onDownload: () => void; onLoadJson: () => void; onOpenFile: (file: File) => void; onRevert: () => void; onLoadSample: (key: string) => void }) {
  return (
    <PanelBody className="min-h-0">
      <Stack>
        <ActionRow className="items-center">
          <FileButton className="min-h-0 px-2 py-1.5 text-[0.82rem] leading-tight" accept="application/json,.json,.txt,text/plain" onFile={onOpenFile}>Import</FileButton>
          <Button size="compact" tone="primary" type="button" onClick={onDownload}>Export</Button>
          <Menu trigger={<Button size="compact" type="button">Samples</Button>}>
            {samples.map((sample) => <MenuItem key={sample.key} onSelect={() => onLoadSample(sample.key)}>{sample.label}</MenuItem>)}
          </Menu>
          <Button size="compact" type="button" onClick={onCopy}>Copy JSON</Button>
          <Button size="compact" type="button" onClick={onRevert}>Revert</Button>
        </ActionRow>
        <details className="rounded-lg border border-[var(--surface-border)] bg-[var(--input-bg)]">
          <summary className="cursor-pointer px-3 py-2 font-extrabold">Raw JSON</summary>
          <Stack className="px-3 pb-3">
            <TextareaControl className="min-h-72 font-mono text-xs leading-[1.35]" spellCheck={false} value={value} onChange={(event) => onJsonText(event.currentTarget.value)} />
            <Button type="button" onClick={onLoadJson}>Load pasted JSON</Button>
          </Stack>
        </details>
        {message ? <StatusMessage tone={["Imported", "Copied", "Exported", "Reverted", "Loaded"].some((word) => message.startsWith(word)) ? "ok" : "error"}>{message}</StatusMessage> : null}
      </Stack>
    </PanelBody>
  );
}
