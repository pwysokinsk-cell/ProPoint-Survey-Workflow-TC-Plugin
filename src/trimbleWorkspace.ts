export interface WorkspaceBridge {
  mode: 'connected' | 'local';
  projectName: string;
  language: string;
  accessTokenState: string;
  activeCommand: string;
  api: any;
}

interface ExtensionMenuItem {
  title: string;
  icon: string;
  command: string;
  subMenus?: ExtensionMenuItem[];
}

const extensionMenu: ExtensionMenuItem = {
  title: 'Survey Workflow',
  icon: 'https://example.com/trimble-workflow-icon.png',
  command: 'SURVEY_OVERVIEW',
  subMenus: [
    {
      title: 'Survey overview',
      icon: 'https://example.com/trimble-workflow-icon.png',
      command: 'SURVEY_OVERVIEW',
    },
    {
      title: 'Status history',
      icon: 'https://example.com/trimble-workflow-icon.png',
      command: 'SURVEY_HISTORY',
    },
  ],
};

function createLocalBridge(): WorkspaceBridge {
  return {
    mode: 'local',
    projectName: 'Local development mode',
    language: 'Unknown',
    accessTokenState: 'Unavailable until embedded in Trimble Connect',
    activeCommand: extensionMenu.command,
    api: null,
  };
}

function getTextValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export async function connectTrimbleWorkspace(onCommand: (command: string) => void): Promise<WorkspaceBridge> {
  if (typeof window === 'undefined' || window.parent === window) {
    return createLocalBridge();
  }

  try {
    const workspaceModule = await import('trimble-connect-workspace-api');
    if (typeof workspaceModule.connect !== 'function') {
      return createLocalBridge();
    }

    const api = await workspaceModule.connect(
      window.parent,
      (event: string, args: { data?: unknown }) => {
        if (event === 'extension.command') {
          onCommand(getTextValue(args?.data) ?? extensionMenu.command);
        }
      },
      30000,
    );

    api?.ui?.setMenu?.(extensionMenu);
    api?.ui?.setActiveMenuItem?.(extensionMenu.command);
    api?.extension?.setStatusMessage?.('Survey workflow ready');

    const [projectResult, settingsResult, tokenResult] = await Promise.allSettled([
      api?.project?.getCurrentProject?.(),
      api?.user?.getUserSettings?.(),
      api?.extension?.getPermission?.('accesstoken'),
    ]);

    const projectName =
      projectResult.status === 'fulfilled' ? getTextValue(projectResult.value?.name) ?? getTextValue(projectResult.value?.title) ?? 'Trimble project' : 'Trimble project';
    const language =
      settingsResult.status === 'fulfilled' ? getTextValue(settingsResult.value?.language) ?? 'Unknown language' : 'Language unavailable';
    const accessTokenState = tokenResult.status === 'fulfilled' ? 'Access token granted' : 'Access token unavailable';

    return {
      mode: 'connected',
      projectName,
      language,
      accessTokenState,
      activeCommand: extensionMenu.command,
      api,
    };
  } catch {
    return createLocalBridge();
  }
}