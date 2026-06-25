import { Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ActionRow, Button, Menu, MenuItem } from "./ui";

type Props = {
  sidebarCollapsed: boolean;
  rightSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onToggleRightSidebar: () => void;
  onOpenBlueprints: () => void;
  onOpenSettings: () => void;
};

export function AppTopBar({ sidebarCollapsed, rightSidebarOpen, onToggleSidebar, onToggleRightSidebar, onOpenBlueprints, onOpenSettings }: Props) {
  return (
    <header className="col-span-full flex min-w-0 items-center justify-between gap-4 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)] px-3 py-1.5">
      <ActionRow className="items-center">
        <Menu trigger={<Button size="icon" type="button" title="App menu"><MenuIcon /></Button>}>
          <MenuItem onSelect={onOpenBlueprints}>Blueprints</MenuItem>
          <MenuItem onSelect={onOpenSettings}>Settings</MenuItem>
        </Menu>
        <Button size="icon" type="button" title={sidebarCollapsed ? "Show left sidebar" : "Hide left sidebar"} onClick={onToggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        <strong className="text-[1.85rem] font-light leading-none">LaMow Map Editor</strong>
      </ActionRow>
      <ActionRow className="items-center">
        <Button size="icon" type="button" title={rightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"} tone={rightSidebarOpen ? "primary" : "default"} onClick={onToggleRightSidebar}>{rightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>
      </ActionRow>
    </header>
  );
}
