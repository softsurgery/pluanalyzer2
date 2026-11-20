export interface WorkspaceTabSettings {
  showRegulations: boolean;
  showCadastralInfo: boolean;
  showFeasibility: boolean;
  showHistory: boolean;
  showCompare: boolean;
  showJsonInspector: boolean;
  showSettings: boolean;
}

export const DEFAULT_WORKSPACE_TAB_SETTINGS: WorkspaceTabSettings = {
  showRegulations: true,
  showCadastralInfo: true,
  showFeasibility: false,
  showHistory: true,
  showCompare: false,
  showJsonInspector: true,
  showSettings: true,
};

export function resolveWorkspaceTabSettings(
  tabs?: Partial<Record<keyof WorkspaceTabSettings, boolean | null>> | null,
): WorkspaceTabSettings {
  return {
    showRegulations:
      tabs?.showRegulations ?? DEFAULT_WORKSPACE_TAB_SETTINGS.showRegulations,
    showCadastralInfo:
      tabs?.showCadastralInfo ??
      DEFAULT_WORKSPACE_TAB_SETTINGS.showCadastralInfo,
    showFeasibility:
      tabs?.showFeasibility ?? DEFAULT_WORKSPACE_TAB_SETTINGS.showFeasibility,
    showHistory: tabs?.showHistory ?? DEFAULT_WORKSPACE_TAB_SETTINGS.showHistory,
    showCompare: tabs?.showCompare ?? DEFAULT_WORKSPACE_TAB_SETTINGS.showCompare,
    showJsonInspector:
      tabs?.showJsonInspector ??
      DEFAULT_WORKSPACE_TAB_SETTINGS.showJsonInspector,
    showSettings:
      tabs?.showSettings ?? DEFAULT_WORKSPACE_TAB_SETTINGS.showSettings,
  };
}
