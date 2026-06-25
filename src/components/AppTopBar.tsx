import { ActionRow, Button, Menu, MenuItem, MenuSeparator } from "./ui";

type Props = {
  sidebarCollapsed: boolean;
  rightSidebarOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToggleSidebar: () => void;
  onToggleRightSidebar: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
};

export function AppTopBar({ sidebarCollapsed, rightSidebarOpen, canUndo, canRedo, onToggleSidebar, onToggleRightSidebar, onUndo, onRedo, onReset }: Props) {
  return (
    <header className="app-topbar">
      <ActionRow className="topbar-left">
        <Menu trigger={<Button className="icon-button" type="button" title="Menu"><span className="hamburger-icon" aria-hidden="true" /></Button>}>
          <MenuItem disabled={!canUndo} onSelect={onUndo}>Undo</MenuItem>
          <MenuItem disabled={!canRedo} onSelect={onRedo}>Redo</MenuItem>
          <MenuSeparator />
          <MenuItem tone="danger" onSelect={onReset}>Reset map</MenuItem>
        </Menu>
        <strong>LaMow Map Editor</strong>
      </ActionRow>
      <ActionRow className="topbar-actions">
        <Button className="icon-button" type="button" title={sidebarCollapsed ? "Show left sidebar" : "Hide left sidebar"} onClick={onToggleSidebar}>{sidebarCollapsed ? ">" : "<"}</Button>
        <Button type="button" disabled={!canUndo} onClick={onUndo}>Undo</Button>
        <Button type="button" disabled={!canRedo} onClick={onRedo}>Redo</Button>
        <Button className="icon-button" type="button" title={rightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"} tone={rightSidebarOpen ? "primary" : "default"} onClick={onToggleRightSidebar}>{rightSidebarOpen ? ">" : "<"}</Button>
      </ActionRow>
    </header>
  );
}
