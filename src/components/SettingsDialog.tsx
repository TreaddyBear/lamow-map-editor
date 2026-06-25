import { SelectField } from "./formControls";
import { Dialog, PanelBody, Stack } from "./ui";

type Props = {
  open: boolean;
  theme: "light" | "dark";
  onTheme: (theme: "light" | "dark") => void;
  onClose: () => void;
};

export function SettingsDialog({ open, theme, onTheme, onClose }: Props) {
  return (
    <Dialog open={open} title="Settings" onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <PanelBody>
        <Stack>
        <SelectField
          label="theme"
          value={theme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(value) => onTheme(value === "dark" ? "dark" : "light")}
        />
        </Stack>
      </PanelBody>
    </Dialog>
  );
}
