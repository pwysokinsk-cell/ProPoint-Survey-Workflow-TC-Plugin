export interface WorkspaceBridge {
  mode: 'connected' | 'local';
  projectName: string;
  language: string;
  accessTokenState: string;
  activeCommand: string;
  api: any;
}

export interface ModelAttribute {
  name: string;
  value: string;
}

export interface ModelElementReference {
  guid: string;
  name: string;
  attributes: ModelAttribute[];
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

function getScalarValue(value: unknown) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return getTextValue(value);
}

function getSelectionEnvelopeId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return getScalarValue(value);
  }

  const record = value as Record<string, unknown>;
  const directId = getScalarValue(record.id)
    ?? getScalarValue(record.objectId)
    ?? getScalarValue(record.objectRuntimeId)
    ?? getScalarValue(record.guid)
    ?? getScalarValue(record.uniqueId)
    ?? getScalarValue(record.modelObjectId);
  if (directId) {
    return directId;
  }

  const arrayKeys = ['modelObjectIds', 'objectRuntimeIds', 'objectIds', 'ids'] as const;
  for (const arrayKey of arrayKeys) {
    const candidate = record[arrayKey];
    if (!Array.isArray(candidate) || candidate.length === 0) {
      continue;
    }

    const first = candidate[0];
    const firstId = getSelectionEnvelopeId(first);
    if (firstId) {
      return firstId;
    }
  }

  return undefined;
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

function collectModelAttributes(value: unknown, attributes: ModelAttribute[] = [], visited = new Set<unknown>()) {
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return attributes;
  }

  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectModelAttributes(item, attributes, visited));
    return attributes;
  }

  const record = value as Record<string, unknown>;
  const name = getTextValue(record.name)
    ?? getTextValue(record.displayName)
    ?? getTextValue(record.propertyName)
    ?? getTextValue(record.key);
  const scalarValue = getTextValue(record.value)
    ?? getTextValue(record.displayValue)
    ?? getTextValue(record.propertyValue);

  if (name && scalarValue && !['name', 'value', 'key', 'displayname', 'propertyname', 'propertyvalue'].includes(name.toLowerCase())) {
    if (!attributes.some((attribute) => attribute.name === name && attribute.value === scalarValue)) {
      attributes.push({ name, value: scalarValue });
    }
  }

  Object.values(record).forEach((child) => collectModelAttributes(child, attributes, visited));
  return attributes;
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
    throw new Error('Viewer selection API is not available for this extension context.');
  }

  const selection = await api.viewer.getSelection();
  const selectionItems = Array.isArray(selection)
    ? selection
    : selection?.modelObjectIds ?? selection?.objects ?? selection?.selection ?? [selection];
  const selected = selectionItems[0];
  if (selected === undefined || selected === null) {
    throw new Error('No active model selection found in Trimble viewer.');
  }

  const selectionId = getSelectionEnvelopeId(selected) ?? (typeof selected === 'object'
    ? getModelValue(selected, ['id', 'objectId', 'objectRuntimeId', 'guid', 'uniqueId', 'modelObjectId'])
    : String(selected));
  if (!selectionId) {
    throw new Error('Selected object ID could not be resolved from Trimble selection payload.');
  }

  let modelObject: unknown = selected;
  const objectPropertiesProvider = api.viewer.getObjectProperties;
  if (objectPropertiesProvider) {
    let properties: any;
    const selectionRecord = selected && typeof selected === 'object'
      ? selected as Record<string, unknown>
      : undefined;
    const modelId = getTextValue(selectionRecord?.modelId);
    const objectRuntimeIds = Array.isArray(selectionRecord?.objectRuntimeIds)
      ? selectionRecord.objectRuntimeIds.filter((value): value is number => typeof value === 'number')
      : [];
    const requestCandidates: Array<() => Promise<unknown>> = [];

    if (modelId && objectRuntimeIds.length > 0) {
      requestCandidates.push(() => objectPropertiesProvider(modelId, objectRuntimeIds));
    }

    requestCandidates.push(
      () => objectPropertiesProvider(selected),
      () => objectPropertiesProvider({ modelObjectIds: [selectionId] }),
      () => objectPropertiesProvider({ objectRuntimeIds: [selectionId] }),
      () => objectPropertiesProvider([selected]),
      () => objectPropertiesProvider([selectionId]),
    );

    for (const requestCandidate of requestCandidates) {
      try {
        properties = await requestCandidate();
        if (properties) {
          break;
        }
      } catch {
        continue;
      }
    }

    if (!properties) {
      throw new Error('Trimble returned no object properties for the current selection.');
    }

    modelObject = Array.isArray(properties)
      ? properties[0]
      : properties?.modelObjects?.[0]
      ?? properties?.objects?.[0]
      ?? properties?.modelObjectProperties?.[0]
      ?? properties;
  }

  const attributes = collectModelAttributes(modelObject);
  const guid = getModelValue(modelObject, ['guid', 'objectGuid', 'uniqueId', 'id', 'objectRuntimeId', 'modelObjectId'])
    ?? getNestedPropertyValue(modelObject, ['guid', 'object guid', 'unique id', 'id'])
    ?? attributes.find((attribute) => attribute.name.toLowerCase() === 'guid (ms)')?.value
    ?? selectionId;
  const name = getModelValue(modelObject, ['name', 'objectName', 'displayName', 'elementName', 'Name'])
    ?? getNestedPropertyValue(modelObject, ['name', 'object name', 'element name', 'Name'])
    ?? attributes.find((attribute) => attribute.name === '1-Konstruksjonsdel')?.value
    ?? `Model element ${guid.slice(0, 8)}`;

  return { guid, name, attributes };
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