import { Boxes, Map, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ActionRow, Button, Menu, MenuItem, MenuLabel, MenuSeparator, TopBar, TopBarTitle } from "../Components/Base";
import type { AppView } from "../Pages/App";

type Props = {
  sidebarCollapsed: boolean;
  rightSidebarOpen: boolean;
  onViewChange: (view: AppView) => void;
  onToggleSidebar: () => void;
  onToggleRightSidebar: () => void;
  onOpenBlueprints: () => void;
  onOpenSettings: () => void;
};

export function AppTopBar({ sidebarCollapsed, rightSidebarOpen, onViewChange, onToggleSidebar, onToggleRightSidebar, onOpenBlueprints, onOpenSettings }: Props) {
  return (
    <TopBar>
      <ActionRow className="items-center">
        <Menu trigger={<Button size="icon" type="button" title="App menu"><MenuIcon /></Button>}>
          <MenuLabel>Navigate</MenuLabel>
          <MenuItem onSelect={() => onViewChange("map")}><Map className="mr-2 inline h-4 w-4" /> Map editor</MenuItem>
          <MenuItem onSelect={() => onViewChange("assets")}><Boxes className="mr-2 inline h-4 w-4" /> Asset editor</MenuItem>
          <MenuSeparator />
          <MenuLabel>Map editor</MenuLabel>
          <MenuItem onSelect={onOpenBlueprints}>Blueprints</MenuItem>
          <MenuItem onSelect={onOpenSettings}>Settings</MenuItem>
        </Menu>
        <Button size="icon" type="button" title={sidebarCollapsed ? "Show left sidebar" : "Hide left sidebar"} onClick={onToggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        <TopBarTitle>LaMow Editor</TopBarTitle>
      </ActionRow>
      <ActionRow className="items-center">
        <Button size="icon" type="button" title={rightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"} tone={rightSidebarOpen ? "primary" : "default"} onClick={onToggleRightSidebar}>{rightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>
      </ActionRow>
    </TopBar>
  );
}
