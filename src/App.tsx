import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createElementDraft,
  getNextStatuses,
  getStatusMeta,
  initialElements,
  initialOperators,
  statusCatalog,
  type HistoryEntry,
  type Operator,
  type StatusKey,
  type SurveyElement,
} from './types';
import { connectTrimbleWorkspace, type WorkspaceBridge } from './trimbleWorkspace';

const storageKey = 'survey-workflow-tracker-state';

interface AppState {
  elements: SurveyElement[];
  operators: Operator[];
}

const defaultWorkspaceBridge: WorkspaceBridge = {
  mode: 'local',
  projectName: 'Local development mode',
  language: 'Unknown',
  accessTokenState: 'Unavailable until embedded in Trimble Connect',
  activeCommand: 'SURVEY_OVERVIEW',
  api: null,
};

function loadState(): AppState {
  const saved = window.localStorage.getItem(storageKey);

  if (!saved) {
    return {
      elements: initialElements,
      operators: initialOperators,
    };
  }

  try {
    const parsed = JSON.parse(saved) as Partial<AppState>;
    const elements = Array.isArray(parsed.elements) && parsed.elements.length > 0 ? parsed.elements : initialElements;
    const operators = Array.isArray(parsed.operators) && parsed.operators.length > 0 ? parsed.operators : initialOperators;

    return {
      elements,
      operators,
    };
  } catch {
    return {
      elements: initialElements,
      operators: initialOperators,
    };
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [workspace, setWorkspace] = useState<WorkspaceBridge>(defaultWorkspaceBridge);
  const [selectedElementId, setSelectedElementId] = useState(state.elements[0]?.id ?? '');
  const [selectedOperatorId, setSelectedOperatorId] = useState(state.operators[0]?.id ?? '');
  const [nextStatus, setNextStatus] = useState<StatusKey | ''>(state.elements[0]?.currentStatus ?? '');
  const [statusNote, setStatusNote] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [operatorRole, setOperatorRole] = useState('Field crew');
  const [operatorActive, setOperatorActive] = useState(true);
  const [newElementName, setNewElementName] = useState('');
  const [newElementGuid, setNewElementGuid] = useState('');
  const [newElementStatus, setNewElementStatus] = useState<StatusKey>('DATA_PREPARED');
  const [newElementOperatorId, setNewElementOperatorId] = useState(state.operators[0]?.id ?? '');

  useEffect(() => {
    let cancelled = false;

    void connectTrimbleWorkspace((command) => {
      setWorkspace((current) => ({
        ...current,
        activeCommand: command || current.activeCommand,
      }));
    }).then((bridge) => {
      if (!cancelled) {
        setWorkspace(bridge);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedElement = useMemo(
    () => state.elements.find((element) => element.id === selectedElementId) ?? state.elements[0],
    [selectedElementId, state.elements],
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!selectedElement) {
      return;
    }

    if (!selectedElement.assignedOperatorId) {
      setSelectedOperatorId(state.operators[0]?.id ?? '');
    } else {
      setSelectedOperatorId(selectedElement.assignedOperatorId);
    }

    setNextStatus(selectedElement.currentStatus);
    setStatusNote('');
    setQuickNote('');
  }, [selectedElement?.id, state.operators]);

  useEffect(() => {
    if (!state.operators.some((operator) => operator.id === selectedOperatorId)) {
      setSelectedOperatorId(state.operators[0]?.id ?? '');
    }
  }, [selectedOperatorId, state.operators]);

  useEffect(() => {
    if (!state.operators.some((operator) => operator.id === newElementOperatorId)) {
      setNewElementOperatorId(state.operators[0]?.id ?? '');
    }
  }, [newElementOperatorId, state.operators]);

  const activeOperators = useMemo(
    () => state.operators.filter((operator: Operator) => operator.active),
    [state.operators],
  );

  const historyFeed = useMemo(() => {
    if (!selectedElement) {
      return [] as HistoryEntry[];
    }

    return [...selectedElement.history].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  }, [selectedElement]);

  const canAdvance = Boolean(nextStatus && selectedElement);

  function updateElement(elementId: string, updater: (element: SurveyElement) => SurveyElement) {
    setState((current) => ({
      ...current,
      elements: current.elements.map((element) => (element.id === elementId ? updater(element) : element)),
    }));
  }

  function handleStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedElement || !nextStatus) {
      return;
    }

    const operator = activeOperators.find((entry) => entry.id === selectedOperatorId) ?? activeOperators[0];
    if (!operator) {
      return;
    }

    const now = new Date().toISOString();
    const note = statusNote.trim();
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      kind: 'status',
      elementId: selectedElement.id,
      operatorId: operator.id,
      operatorName: operator.name,
      fromStatus: selectedElement.currentStatus,
      toStatus: nextStatus,
      note,
      createdAt: now,
    };

    updateElement(selectedElement.id, (element) => ({
      ...element,
      currentStatus: nextStatus,
      assignedOperatorId: operator.id,
      note: note || element.note,
      history: [entry, ...element.history],
    }));

    workspace.api?.extension?.setStatusMessage?.(
      `Updated ${selectedElement.name} to ${getStatusMeta(nextStatus).label}`,
    );

    setStatusNote('');
  }

  function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedElement) {
      return;
    }

    const note = quickNote.trim();
    if (!note) {
      return;
    }

    const operator = activeOperators.find((entry) => entry.id === selectedOperatorId) ?? activeOperators[0];
    if (!operator) {
      return;
    }

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      kind: 'note',
      elementId: selectedElement.id,
      operatorId: operator.id,
      operatorName: operator.name,
      note,
      createdAt: new Date().toISOString(),
    };

    updateElement(selectedElement.id, (element) => ({
      ...element,
      assignedOperatorId: operator.id,
      note,
      history: [entry, ...element.history],
    }));

    workspace.api?.extension?.setStatusMessage?.(`Added note to ${selectedElement.name}`);

    setQuickNote('');
  }

  function handleAddOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = operatorName.trim();
    if (!trimmedName) {
      return;
    }

    const entry: Operator = {
      id: `op-${crypto.randomUUID()}`,
      name: trimmedName,
      role: operatorRole.trim() || 'Field crew',
      active: operatorActive,
    };

    setState((current) => ({
      ...current,
      operators: [...current.operators, entry],
    }));
    setSelectedOperatorId(entry.id);
    setOperatorName('');
    setOperatorRole('Field crew');
    setOperatorActive(true);
  }

  function handleAddElement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newElementName.trim();
    const guid = newElementGuid.trim();
    const operator = state.operators.find((entry) => entry.id === newElementOperatorId) ?? state.operators[0];

    if (!name) {
      return;
    }

    const element = createElementDraft(name, guid, newElementStatus, operator?.id ?? '');

    setState((current) => ({
      ...current,
      elements: [...current.elements, element],
    }));
    setSelectedElementId(element.id);
    setNewElementName('');
    setNewElementGuid('');
    setNewElementStatus('DATA_PREPARED');
    setNewElementOperatorId(state.operators[0]?.id ?? '');
  }

  if (!selectedElement) {
    return <div className="shell empty-shell">No elements are available yet.</div>;
  }

  const currentOperator = state.operators.find((operator) => operator.id === selectedElement.assignedOperatorId);
  const currentStatusMeta = getStatusMeta(selectedElement.currentStatus);
  const nextStatuses = getNextStatuses(selectedElement.currentStatus);

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Trimble Connect survey workflow</p>
          <h1>Track element status, operator ownership, and history in one place.</h1>
          <div className="workspace-banner">
            <span className={`connection-pill ${workspace.mode}`}>{workspace.mode === 'connected' ? 'Connected to Trimble Connect' : 'Local development mode'}</span>
            <span>{workspace.projectName}</span>
            <span>{workspace.language}</span>
            <span>{workspace.accessTokenState}</span>
            <span>Menu: {workspace.activeCommand}</span>
          </div>
        </div>
        <div className="hero-card">
          <span className="hero-card-label">Current focus</span>
          <strong>{selectedElement.name}</strong>
          <span>{selectedElement.guid}</span>
        </div>
      </header>

      <main className="workspace">
        <aside className="panel list-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Elements</p>
              <h2>Survey items</h2>
            </div>
            <span className="count-pill">{state.elements.length} tracked</span>
          </div>

          <form className="action-card compact-form" onSubmit={handleAddElement}>
            <div className="action-header">
              <div>
                <p className="panel-kicker">Add</p>
                <h3>New element</h3>
              </div>
            </div>

            <label>
              Name
              <input value={newElementName} onChange={(event) => setNewElementName(event.target.value)} placeholder="e.g. Panel P-07" />
            </label>

            <label>
              GUID
              <input value={newElementGuid} onChange={(event) => setNewElementGuid(event.target.value)} placeholder="Optional GUID" />
            </label>

            <label>
              Initial status
              <select value={newElementStatus} onChange={(event) => setNewElementStatus(event.target.value as StatusKey)}>
                {statusCatalog.map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Assigned operator
              <select value={newElementOperatorId} onChange={(event) => setNewElementOperatorId(event.target.value)}>
                {state.operators.map((operator) => (
                  <option key={operator.id} value={operator.id}>
                    {operator.name}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit">Add element</button>
          </form>

          <div className="element-list">
            {state.elements.map((element) => {
              const statusMeta = getStatusMeta(element.currentStatus);
              const isActive = element.id === selectedElement.id;
              const operator = state.operators.find((entry) => entry.id === element.assignedOperatorId);

              return (
                <button
                  key={element.id}
                  type="button"
                  className={`element-card ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedElementId(element.id)}
                >
                  <div className="element-card-top">
                    <strong>{element.name}</strong>
                    <span className={`status-badge tone-${statusMeta.tone}`}>{statusMeta.label}</span>
                  </div>
                  <span className="element-guid">{element.guid}</span>
                  <div className="element-meta">
                    <span>{operator ? operator.name : 'Unassigned'}</span>
                    <span>{element.history.length} history entries</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel details-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Details</p>
              <h2>{selectedElement.name}</h2>
            </div>
            <span className={`status-badge tone-${currentStatusMeta.tone}`}>{currentStatusMeta.label}</span>
          </div>

          <div className="detail-grid">
            <article className="detail-card">
              <span className="detail-label">Assigned operator</span>
              <strong>{currentOperator ? currentOperator.name : 'Not assigned'}</strong>
              <span>{currentOperator ? currentOperator.role : 'No operator selected yet'}</span>
            </article>
            <article className="detail-card">
              <span className="detail-label">Element GUID</span>
              <strong>{selectedElement.guid}</strong>
              <span>Stored for future Trimble Connect linking</span>
            </article>
            <article className="detail-card">
              <span className="detail-label">Current note</span>
              <strong>{selectedElement.note || 'No note yet'}</strong>
              <span>Latest explanation attached to the task</span>
            </article>
          </div>

          <div className="actions-grid">
            <form className="action-card" onSubmit={handleStatusSubmit}>
              <div className="action-header">
                <div>
                  <p className="panel-kicker">Status change</p>
                  <h3>Workflow update</h3>
                </div>
                <span className="count-pill">{nextStatuses.length === 0 ? 'Flexible' : `${nextStatuses.length} suggested`}</span>
              </div>

              <label>
                Operator
                <select value={selectedOperatorId} onChange={(event) => setSelectedOperatorId(event.target.value)}>
                  {activeOperators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.name} - {operator.role}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                New status
                <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as StatusKey)}>
                  {statusCatalog.map((status) => (
                    <option key={status.key} value={status.key}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Note for this transition
                <textarea
                  value={statusNote}
                  onChange={(event) => setStatusNote(event.target.value)}
                  placeholder="Add a short explanation for the handoff, correction, or confirmation."
                  rows={4}
                />
              </label>

              <button type="submit" disabled={!canAdvance}>
                Save status update
              </button>
            </form>

            <form className="action-card" onSubmit={handleNoteSubmit}>
              <div className="action-header">
                <div>
                  <p className="panel-kicker">Info note</p>
                  <h3>Log an explanation</h3>
                </div>
                <span className="count-pill">History only</span>
              </div>

              <label>
                Operator
                <select value={selectedOperatorId} onChange={(event) => setSelectedOperatorId(event.target.value)}>
                  {activeOperators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.name} - {operator.role}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Note text
                <textarea
                  value={quickNote}
                  onChange={(event) => setQuickNote(event.target.value)}
                  placeholder="Write what needs to be documented for the element."
                  rows={4}
                />
              </label>

              <button type="submit" disabled={!quickNote.trim()}>
                Add note to history
              </button>
            </form>
          </div>

          <form className="action-card compact-form" onSubmit={handleAddOperator}>
            <div className="action-header">
              <div>
                <p className="panel-kicker">People</p>
                <h3>New operator</h3>
              </div>
            </div>

            <label>
              Name
              <input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} placeholder="e.g. Jane Doe" />
            </label>

            <label>
              Role
              <input value={operatorRole} onChange={(event) => setOperatorRole(event.target.value)} placeholder="e.g. Surveyor" />
            </label>

            <label className="toggle-row">
              <span>Active</span>
              <input type="checkbox" checked={operatorActive} onChange={(event) => setOperatorActive(event.target.checked)} />
            </label>

            <button type="submit">Add operator</button>
          </form>

          <section className="timeline-card">
            <div className="action-header">
              <div>
                <p className="panel-kicker">History</p>
                <h3>Recent activity</h3>
              </div>
              <span className="count-pill">{historyFeed.length} entries</span>
            </div>

            <div className="timeline">
              {historyFeed.length === 0 ? (
                <p className="empty-copy">No history yet for this element.</p>
              ) : (
                historyFeed.map((entry) => {
                  const fromMeta = entry.fromStatus ? getStatusMeta(entry.fromStatus) : undefined;
                  const toMeta = entry.toStatus ? getStatusMeta(entry.toStatus) : undefined;

                  return (
                    <article key={entry.id} className="timeline-entry">
                      <div className="timeline-entry-head">
                        <strong>{entry.operatorName}</strong>
                        <span>{formatDateTime(entry.createdAt)}</span>
                      </div>
                      {entry.kind === 'status' ? (
                        <p>
                          Status changed from <strong>{fromMeta?.label ?? 'None'}</strong> to <strong>{toMeta?.label ?? 'Unknown'}</strong>.
                        </p>
                      ) : (
                        <p>Note recorded against the current task state.</p>
                      )}
                      {entry.note ? <p className="timeline-note">{entry.note}</p> : <p className="timeline-note muted">No note added.</p>}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;
