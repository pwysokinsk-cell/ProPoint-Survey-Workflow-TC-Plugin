export const statusCatalog = [
  { key: 'DATA_PREPARED', label: 'Data Prepared', tone: 'neutral' },
  { key: 'DATA_UPDATED', label: 'Data updated', tone: 'info' },
  { key: 'ASSIGN_STAKEOUT', label: 'Assignment: Stake out', tone: 'warning' },
  { key: 'STAKED_OUT', label: 'Staked out', tone: 'success' },
  { key: 'ASSIGN_GMK', label: 'Assignment: GMK', tone: 'warning' },
  { key: 'GEOMETRICAL_CONTROL', label: 'Geometrical Control', tone: 'info' },
  { key: 'ASSIGN_SMB', label: 'Assignment: SMB', tone: 'warning' },
  { key: 'AS_BUILT_PERFORMED', label: 'As-built performed', tone: 'success' },
  { key: 'DOCUMENTATION_CLOSED', label: 'Documentation Closed', tone: 'closed' },
] as const;

export type StatusKey = (typeof statusCatalog)[number]['key'];
export type StatusTone = (typeof statusCatalog)[number]['tone'];

export interface Operator {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

export interface HistoryEntry {
  id: string;
  kind: 'status' | 'note';
  elementId: string;
  operatorId: string;
  operatorName: string;
  fromStatus?: StatusKey;
  toStatus?: StatusKey;
  note: string;
  createdAt: string;
}

export interface SurveyElement {
  id: string;
  name: string;
  guid: string;
  currentStatus: StatusKey;
  assignedOperatorId: string;
  note: string;
  history: HistoryEntry[];
}

export const allowedTransitions: Record<StatusKey, StatusKey[]> = {
  DATA_PREPARED: ['DATA_UPDATED'],
  DATA_UPDATED: ['ASSIGN_STAKEOUT'],
  ASSIGN_STAKEOUT: ['STAKED_OUT'],
  STAKED_OUT: ['ASSIGN_GMK'],
  ASSIGN_GMK: ['GEOMETRICAL_CONTROL'],
  GEOMETRICAL_CONTROL: ['ASSIGN_SMB'],
  ASSIGN_SMB: ['AS_BUILT_PERFORMED'],
  AS_BUILT_PERFORMED: ['DOCUMENTATION_CLOSED'],
  DOCUMENTATION_CLOSED: [],
};

export const initialOperators: Operator[] = [
  { id: 'op-anna', name: 'Anna Kowalska', role: 'Surveyor', active: true },
  { id: 'op-piotr', name: 'Piotr Nowak', role: 'GMK', active: true },
  { id: 'op-marta', name: 'Marta Zielinska', role: 'SMB', active: true },
  { id: 'op-lukasz', name: 'Lukasz Wrobel', role: 'Coordinator', active: true },
];

export const initialElements: SurveyElement[] = [
  {
    id: 'elem-101',
    name: 'Column C-12',
    guid: '0fbc4f12-cc72-4ef2-90a0-7c8a2a5b1101',
    currentStatus: 'DATA_PREPARED',
    assignedOperatorId: 'op-lukasz',
    note: 'Ready for the first field handoff.',
    history: [],
  },
  {
    id: 'elem-204',
    name: 'Beam B-07',
    guid: '6e0d49c9-3f10-4f7d-99cc-8c528cb53400',
    currentStatus: 'ASSIGN_STAKEOUT',
    assignedOperatorId: 'op-anna',
    note: 'Stake out scheduled for afternoon shift.',
    history: [],
  },
  {
    id: 'elem-307',
    name: 'Wall W-22',
    guid: '9d33ac79-0f24-4f8d-bdd0-89e43f511d13',
    currentStatus: 'GEOMETRICAL_CONTROL',
    assignedOperatorId: 'op-piotr',
    note: 'Awaiting control verification and approval.',
    history: [],
  },
];

export function createElementDraft(
  name: string,
  guid: string,
  currentStatus: StatusKey,
  assignedOperatorId: string,
): SurveyElement {
  const finalName = name.trim() || 'New survey element';
  const finalGuid = guid.trim() || `elem-${crypto.randomUUID().slice(0, 8)}`;

  return {
    id: `elem-${crypto.randomUUID()}`,
    name: finalName,
    guid: finalGuid,
    currentStatus,
    assignedOperatorId,
    note: 'New element added to workflow.',
    history: [],
  };
}

export function getStatusMeta(status: StatusKey) {
  return statusCatalog.find((entry) => entry.key === status) ?? statusCatalog[0];
}

export function getNextStatuses(status: StatusKey) {
  return allowedTransitions[status];
}
