export interface WorkspaceBridge {
  mode: 'connected' | 'local';
  projectName: string;
  language: string;
  accessTokenState: string;
  activeCommand: string;
  api: any;
}

export interface ModelElementReference {
  guid: string;
  name: string;
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

function getPropertyValue(properties: unknown, keys: string[]): string | undefined {
  if (!Array.isArray(properties)) {
    return undefined;
  }

  for (const property of properties) {
    if (!property || typeof property !== 'object') {
      continue;
    }

    const record = property as Record<string, unknown>;
    const propertyName = getTextValue(record.name)
      ?? getTextValue(record.key)
      ?? getTextValue(record.displayName)
      ?? getTextValue(record.propertyName);
    if (propertyName && keys.some((key) => propertyName.toLowerCase() === key.toLowerCase())) {
      return getTextValue(record.value)
        ?? getTextValue(record.displayValue)
        ?? getTextValue(record.propertyValue);
    }
  }

  return undefined;
}

function getNestedPropertyValue(value: unknown, keys: string[]): string | undefined {
  if (Array.isArray(value)) {
    return getPropertyValue(value, keys);
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return getPropertyValue(record.properties, keys)
    ?? getPropertyValue(record.propertyValues, keys)
    ?? getPropertyValue(record.attributes, keys)
    ?? getPropertyValue(record.items, keys)
    ?? getNestedPropertyValue(record.categories, keys);
}

function getModelValue(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const directValue = getTextValue(record[key]);
    if (directValue) {
      return directValue;
    }
  }

  return getPropertyValue(record.properties, keys);
}

export async function getSelectedModelElement(api: any): Promise<ModelElementReference | null> {
  if (!api?.viewer?.getSelection) {
    return null;
  }

  const selection = await api.viewer.getSelection();
  const selectionItems = Array.isArray(selection)
    ? selection
    : selection?.modelObjectIds ?? selection?.objects ?? selection?.selection ?? [selection];
  const selected = selectionItems[0];
  if (selected === undefined || selected === null) {
    return null;
  }

  const selectionId = typeof selected === 'object'
    ? getModelValue(selected, ['id', 'objectId', 'objectRuntimeId', 'guid', 'uniqueId'])
    : String(selected);
  if (!selectionId) {
    return null;
  }

  let modelObject: unknown = selected;
  if (api.viewer.getObjectProperties) {
    let properties: any;
    try {
      properties = await api.viewer.getObjectProperties({ modelObjectIds: [selectionId] });
    } catch {
      properties = await api.viewer.getObjectProperties([selected]);
    }

    modelObject = Array.isArray(properties)
      ? properties[0]
      : properties?.modelObjects?.[0]
      ?? properties?.objects?.[0]
      ?? properties?.modelObjectProperties?.[0]
      ?? properties;
  }

  const guid = getModelValue(modelObject, ['guid', 'objectGuid', 'uniqueId', 'id', 'objectRuntimeId', 'modelObjectId'])
    ?? getNestedPropertyValue(modelObject, ['guid', 'object guid', 'unique id', 'id'])
    ?? selectionId;
  const name = getModelValue(modelObject, ['name', 'objectName', 'displayName', 'elementName', 'Name'])
    ?? getNestedPropertyValue(modelObject, ['name', 'object name', 'element name', 'Name'])
    ?? `Model element ${guid.slice(0, 8)}`;

  return { guid, name };
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