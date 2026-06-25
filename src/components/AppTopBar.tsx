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
    <header className="app-topbar">
      <ActionRow className="topbar-left">
        <Menu trigger={<Button className="icon-button" type="button" title="App menu"><MenuIcon /></Button>}>
          <MenuItem onSelect={onOpenBlueprints}>Blueprints</MenuItem>
          <MenuItem onSelect={onOpenSettings}>Settings</MenuItem>
        </Menu>
        <Button className="icon-button" type="button" title={sidebarCollapsed ? "Show left sidebar" : "Hide left sidebar"} onClick={onToggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        <strong>LaMow Map Editor</strong>
      </ActionRow>
      <ActionRow className="topbar-actions">
        <Button className="icon-button" type="button" title={rightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"} tone={rightSidebarOpen ? "primary" : "default"} onClick={onToggleRightSidebar}>{rightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>
      </ActionRow>
    </header>
  );
}
