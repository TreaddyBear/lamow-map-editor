import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { ActionRow, Button } from "./ui";

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
        <Button className="icon-button" type="button" title={sidebarCollapsed ? "Show left sidebar" : "Hide left sidebar"} onClick={onToggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        <strong>LaMow Map Editor</strong>
      </ActionRow>
      <ActionRow className="topbar-actions">
        <Button className="icon-button" type="button" disabled={!canUndo} title="Undo" onClick={onUndo}><Undo2 /></Button>
        <Button className="icon-button" type="button" disabled={!canRedo} title="Redo" onClick={onRedo}><Redo2 /></Button>
        <Button className="icon-button" type="button" title="Reset map" onClick={onReset}><RotateCcw /></Button>
        <Button className="icon-button" type="button" title={rightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"} tone={rightSidebarOpen ? "primary" : "default"} onClick={onToggleRightSidebar}>{rightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>
      </ActionRow>
    </header>
  );
}
