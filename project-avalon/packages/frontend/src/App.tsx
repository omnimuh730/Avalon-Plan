import { analyzeFormFields } from './ai/analyze-form.js';
import { buildApplyInjectionPlanPayload } from './ai/apply-injection-plan.js';
import { buildFormInjectionPlan } from './ai/generate-injection-plan.js';
import { formatProfileForPrompt, readProfileFile } from './ai/profile.js';
import type { FieldActionPlan, FormAnalysisResult } from './ai/types.js';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  ACTION_DEFINITIONS,
  DEFAULT_SESSION_ID,
  SOCKET_EVENTS,
  createActionId,
  type ActionableTarget,
  type ActionablePageContext,
  type ApplyProgress,
  type ActionableTree,
  type ActionResult,
  type ActionType,
  type InjectionPlan,
  type PropertyFilter,
  type RegisteredPayload,
  type RemoteAction,
  type TabInfo,
  type TargetSelector,
} from '@avalon/shared';

const DEFAULT_SERVER = import.meta.env.VITE_AVALON_SERVER ?? 'http://localhost:3847';

const TARGET_VERIFY_ACTIONS = new Set<ActionType>(['highlight', 'clear_highlight']);

const ACTION_OPTIONS = Object.entries(ACTION_DEFINITIONS).filter(
  ([key]) =>
    !TARGET_VERIFY_ACTIONS.has(key as ActionType) &&
    key !== 'fetch_actionable_tree' &&
    key !== 'apply_injection_plan',
);

interface LogEntry {
  id: string;
  at: string;
  message: string;
  success?: boolean;
}

function emptyProperty(): PropertyFilter {
  return { attribute: 'class', pattern: '' };
}

function formatTreeOptions(options: ActionableTarget['options'], maxShown = 12): string | null {
  if (!options?.length) return null;
  const labels = options.map((o) => o.label).filter(Boolean);
  if (labels.length <= maxShown) return labels.join(' · ');
  const shown = labels.slice(0, maxShown).join(' · ');
  return `${shown} · +${labels.length - maxShown} more`;
}

function fieldId(groupIdx: number, childIdx: number): string {
  return `${groupIdx}:${childIdx}`;
}

function treeFieldLabel(tree: ActionableTree, id: string): string {
  const [groupIdx, childIdx] = id.split(':').map((part) => Number(part));
  if (!Number.isFinite(groupIdx) || !Number.isFinite(childIdx)) return id;
  return tree[groupIdx]?.children[childIdx]?.target ?? id;
}

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [sessionId, setSessionId] = useState('');
  const [connected, setConnected] = useState(false);
  const [registered, setRegistered] = useState<RegisteredPayload | null>(null);
  const [peers, setPeers] = useState({ extension: false, controller: false });
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<number | ''>('');
  const [tag, setTag] = useState('button');
  const [properties, setProperties] = useState<PropertyFilter[]>([emptyProperty()]);
  const [index, setIndex] = useState(0);
  const [action, setAction] = useState<ActionType>('click');
  const [payloadJson, setPayloadJson] = useState('{}');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [actionableTree, setActionableTree] = useState<ActionableTree | null>(null);
  const [treePage, setTreePage] = useState<ActionablePageContext | null>(null);
  // Off by default: the fill plan types into comboboxes and picks the matching
  // option live, so pre-harvesting options via focus-probe (slow) is unnecessary.
  const [probeComboboxes, setProbeComboboxes] = useState(false);
  const [applicantContext, setApplicantContext] = useState('');
  const [profileFileName, setProfileFileName] = useState<string | null>(null);
  const [formAnalysis, setFormAnalysis] = useState<FormAnalysisResult | null>(null);
  const [generatedScript, setGeneratedScript] = useState('');
  const [fieldScriptsById, setFieldScriptsById] = useState<Record<string, string>>({});
  const [injectionPlan, setInjectionPlan] = useState<InjectionPlan | null>(null);
  const [selectedTreeFieldId, setSelectedTreeFieldId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const profileFileRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const applyingRef = useRef(false);

  const actionPlanByFieldId = useMemo(() => {
    const map = new Map<string, FieldActionPlan>();
    for (const field of formAnalysis?.fields ?? []) {
      map.set(field.id, field);
    }
    return map;
  }, [formAnalysis]);

  const displayedScript = useMemo(() => {
    if (selectedTreeFieldId) {
      const snippet = fieldScriptsById[selectedTreeFieldId];
      if (snippet) return snippet;
      return `No step for "${selectedTreeFieldId}" — it is skipped or has no value. Run Analyze to rebuild the plan.`;
    }
    return generatedScript;
  }, [fieldScriptsById, generatedScript, selectedTreeFieldId]);

  const selectedFieldLabel =
    selectedTreeFieldId && actionableTree
      ? treeFieldLabel(actionableTree, selectedTreeFieldId)
      : null;

  const actionMeta = ACTION_DEFINITIONS[action];

  const canExecute = connected && peers.extension;
  const executeDisabledReason = !connected
    ? 'Connect to the relay server first.'
    : !peers.extension
      ? `Extension not on session "${sessionId || DEFAULT_SESSION_ID}". Clear Session ID on both sides (uses "${DEFAULT_SESSION_ID}") or paste the extension's session ID here, then Reconnect both.`
      : null;

  const pushLog = useCallback((message: string, success?: boolean) => {
    setLogs((prev) => [
      {
        id: `${Date.now()}_${Math.random()}`,
        at: new Date().toLocaleTimeString(),
        message,
        success,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const connect = useCallback(() => {
    socketRef.current?.removeAllListeners();
    socketRef.current?.disconnect();
    const next = io(serverUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = next;

    next.on('connect', () => {
      setConnected(true);
      pushLog('Connected to relay server');
      next.emit(
        SOCKET_EVENTS.REGISTER,
        { role: 'controller', sessionId: sessionId || undefined },
        (response: RegisteredPayload) => {
          setRegistered(response);
          setSessionId(response.sessionId);
          setPeers(response.peers);
          pushLog(`Registered session ${response.sessionId}`);
        },
      );
    });

    next.on('disconnect', () => {
      setConnected(false);
      setRegistered(null);
      pushLog('Disconnected');
    });

    next.on('peers-update', (payload: { peers: typeof peers }) => {
      setPeers(payload.peers);
    });

    next.on(SOCKET_EVENTS.TABS_UPDATE, (nextTabs: TabInfo[]) => {
      setTabs(nextTabs);
      if (nextTabs.length && selectedTabId === '') {
        const active = nextTabs.find((t) => t.active) ?? nextTabs[0];
        setSelectedTabId(active.id);
      }
    });

    next.on(SOCKET_EVENTS.APPLY_PROGRESS, (progress: ApplyProgress) => {
      pushLog(progress.message, progress.phase !== 'error');
    });

    next.on(SOCKET_EVENTS.ACTION_RESULT, (result: ActionResult) => {
      const data = result.data as
        | {
            tree?: ActionableTree;
            page?: ActionablePageContext;
            applied?: number;
            skipped?: number;
            failed?: number;
            urlMismatch?: { expected: string; actual: string };
          }
        | undefined;
      if (result.success && data?.tree) {
        setActionableTree(data.tree);
        setFormAnalysis(null);
        setGeneratedScript('');
        setFieldScriptsById({});
        setInjectionPlan(null);
        setSelectedTreeFieldId(null);
        if (data.page) {
          setTreePage(data.page);
          setSelectedTabId(data.page.tabId);
        }
        const groups = data.tree.length;
        const targets = data.tree.reduce((n, g) => n + g.children.length, 0);
        const pageHint = data.page?.url ? ` · ${data.page.url}` : '';
        pushLog(`Actionable tree: ${groups} group(s), ${targets} target(s)${pageHint}`, true);
        return;
      }
      if (result.success && data?.applied != null) {
        applyingRef.current = false;
        setApplying(false);
        const mismatch =
          data.urlMismatch != null
            ? ` (page URL changed: expected ${data.urlMismatch.expected})`
            : '';
        pushLog(
          `Apply inject: ${data.applied} applied, ${data.skipped ?? 0} skipped, ${data.failed ?? 0} failed${mismatch}`,
          (data.failed ?? 0) === 0,
        );
        return;
      }
      if (!result.success && applyingRef.current) {
        applyingRef.current = false;
        setApplying(false);
      }
      pushLog(
        result.success
          ? `Action ${result.actionId} OK${result.data ? `: ${JSON.stringify(result.data)}` : ''}`
          : `Action ${result.actionId} failed: ${result.error}`,
        result.success,
      );
    });

    next.on(
      SOCKET_EVENTS.SCREENSHOT_RESULT,
      (payload: { dataUrl?: string; error?: string }) => {
        if (payload.dataUrl) {
          setScreenshot(payload.dataUrl);
          pushLog('Screenshot received', true);
        } else {
          pushLog(`Screenshot failed: ${payload.error}`, false);
        }
      },
    );
  }, [pushLog, selectedTabId, serverUrl, sessionId]);

  useEffect(() => {
    return () => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
    };
  }, []);

  const buildTarget = useCallback((): TargetSelector => {
    return {
      tag,
      properties: properties.filter((p) => p.attribute && p.pattern),
      index,
    };
  }, [tag, properties, index]);

  const emitAction = useCallback(
    (remoteAction: RemoteAction) => {
      if (!socketRef.current?.connected) {
        pushLog('Not connected', false);
        return;
      }
      socketRef.current.emit(SOCKET_EVENTS.EXECUTE_ACTION, remoteAction);
      pushLog(`Sent ${remoteAction.action} (${remoteAction.id})`);
    },
    [pushLog],
  );

  const target: TargetSelector | undefined = useMemo(() => {
    if (!actionMeta.needsTarget) return undefined;
    return buildTarget();
  }, [actionMeta.needsTarget, buildTarget]);

  const buildAction = (): RemoteAction => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadJson || '{}') as Record<string, unknown>;
    } catch {
      throw new Error('Payload must be valid JSON');
    }

    return {
      id: createActionId(),
      tabId: selectedTabId === '' ? undefined : Number(selectedTabId),
      target,
      action,
      payload,
    };
  };

  const executeAction = () => {
    try {
      emitAction(buildAction());
    } catch (error) {
      pushLog(error instanceof Error ? error.message : 'Invalid action', false);
    }
  };

  const highlightTarget = () => {
    emitAction({
      id: createActionId(),
      tabId: selectedTabId === '' ? undefined : Number(selectedTabId),
      target: buildTarget(),
      action: 'highlight',
      payload: {},
    });
  };

  const clearHighlight = () => {
    emitAction({
      id: createActionId(),
      tabId: selectedTabId === '' ? undefined : Number(selectedTabId),
      action: 'clear_highlight',
      payload: {},
    });
  };

  const applyControlTarget = useCallback((control: TargetSelector) => {
    setTag(control.tag);
    setProperties(control.properties.length ? control.properties : [emptyProperty()]);
    setIndex(control.index ?? 0);
  }, []);

  const highlightControl = useCallback(
    (control: TargetSelector) => {
      applyControlTarget(control);
      emitAction({
        id: createActionId(),
        tabId: selectedTabId === '' ? undefined : Number(selectedTabId),
        target: control,
        action: 'highlight',
        payload: {},
      });
    },
    [applyControlTarget, emitAction, selectedTabId],
  );

  const fetchActionableTreeAction = () => {
    emitAction({
      id: createActionId(),
      tabId: selectedTabId === '' ? undefined : Number(selectedTabId),
      action: 'fetch_actionable_tree',
      payload: { probeComboboxes },
    });
  };

  const buildPlanFromFields = (fields: FieldActionPlan[]): InjectionPlan | null => {
    if (!actionableTree?.length || !fields.length) {
      return null;
    }
    const { plan, preview, fieldPreviews } = buildFormInjectionPlan({
      tree: actionableTree,
      fields,
    });
    setInjectionPlan(plan);
    setGeneratedScript(preview);
    setFieldScriptsById(Object.fromEntries(fieldPreviews.map((entry) => [entry.id, entry.preview])));
    pushLog(`Fill plan built · ${plan.steps.length} step(s)`, true);
    return plan;
  };

  const analyzeTree = async () => {
    if (!actionableTree?.length) {
      pushLog('Fetch an actionable tree first', false);
      return;
    }
    setAnalyzing(true);
    try {
      const profile = formatProfileForPrompt(applicantContext);
      const result = await analyzeFormFields({
        tree: actionableTree,
        applicantContext: profile || undefined,
      });
      setFormAnalysis(result);
      setGeneratedScript('');
      setFieldScriptsById({});
      setInjectionPlan(null);
      setSelectedTreeFieldId(null);
      const cost = result.usage?.cost?.totalUsd;
      pushLog(
        `Action plan: ${result.fields.length} field(s)${cost != null ? ` · $${cost.toFixed(6)}` : ''}`,
        true,
      );
      buildPlanFromFields(result.fields);
    } catch (error) {
      pushLog(error instanceof Error ? error.message : 'Analysis failed', false);
    } finally {
      setAnalyzing(false);
    }
  };

  const generatePlan = (): InjectionPlan | null => {
    if (!formAnalysis?.fields.length) {
      pushLog('Analyze the form first', false);
      return null;
    }
    return buildPlanFromFields(formAnalysis.fields);
  };

  const applyActionPlan = async () => {
    if (!actionableTree?.length || !formAnalysis?.fields.length) {
      pushLog('Analyze the form first to build an action plan', false);
      return;
    }
    if (!treePage?.tabId) {
      pushLog('No page context — fetch the actionable tree on the target tab first', false);
      return;
    }
    if (!canExecute) {
      pushLog(executeDisabledReason ?? 'Cannot execute', false);
      return;
    }

    applyingRef.current = true;
    setApplying(true);

    try {
      const plan = injectionPlan ?? generatePlan();
      if (!plan || plan.steps.length === 0) {
        applyingRef.current = false;
        setApplying(false);
        pushLog('No fill plan to apply', false);
        return;
      }

      const payload = buildApplyInjectionPlanPayload(plan, treePage);

      emitAction({
        id: createActionId(),
        tabId: treePage.tabId,
        action: 'apply_injection_plan',
        payload: payload as unknown as Record<string, unknown>,
      });
      pushLog(`Applying fill plan (${plan.steps.length} steps) on tab ${treePage.tabId}…`);
    } catch (error) {
      applyingRef.current = false;
      setApplying(false);
      pushLog(error instanceof Error ? error.message : 'Apply failed', false);
    }
  };

  const copyGeneratedScript = async () => {
    if (!displayedScript.trim()) return;
    try {
      await navigator.clipboard.writeText(displayedScript);
      pushLog(
        selectedTreeFieldId ? 'Copied field step to clipboard' : 'Copied full fill plan to clipboard',
        true,
      );
    } catch {
      pushLog('Could not copy to clipboard', false);
    }
  };

  const handleProfilePaste = (value: string) => {
    setApplicantContext(value);
    setProfileFileName(null);
  };

  const handleProfileFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const formatted = await readProfileFile(file);
      setApplicantContext(formatted);
      setProfileFileName(file.name);
      pushLog(`Loaded profile from ${file.name}`, true);
    } catch (error) {
      pushLog(error instanceof Error ? error.message : 'Failed to read profile file', false);
    }
  };

  const selectTreeTarget = (entry: ActionableTarget, id: string) => {
    setSelectedTreeFieldId(id);
    highlightControl(entry.control);
    const hasStep = Boolean(fieldScriptsById[id]);
    pushLog(
      `Selected "${entry.target}"${hasStep ? ' — showing field step' : ' — no step (skipped or no value)'}`,
    );
  };

  const showFullFormScript = () => {
    setSelectedTreeFieldId(null);
    pushLog('Showing full fill plan');
  };

  const requestTabs = () => {
    socketRef.current?.emit(SOCKET_EVENTS.REQUEST_TABS);
    pushLog('Requested tab list');
  };

  const requestScreenshot = () => {
    socketRef.current?.emit(SOCKET_EVENTS.REQUEST_SCREENSHOT, {
      tabId: selectedTabId === '' ? undefined : Number(selectedTabId),
    });
    pushLog('Requested screenshot');
  };

  const updateProperty = (idx: number, patch: Partial<PropertyFilter>) => {
    setProperties((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  return (
    <div className="app">
      <header>
        <h1>Avalon Controller</h1>
        <div className="status-pill">
          <span className={`status-dot ${connected ? 'connected' : ''}`} />
          {connected ? 'Connected' : 'Offline'}
          {registered && (
            <span>
              · ext {peers.extension ? '✓' : '✗'} · session {registered.sessionId.slice(0, 8)}
            </span>
          )}
        </div>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Connection</h2>
          <div className="field">
            <label>Relay server</label>
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
          </div>
          <div className="field">
            <label>Session ID</label>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder={`Empty → shared "${DEFAULT_SESSION_ID}" session`}
            />
            <p className="hint">
              Must match the extension sidebar. Leave empty on both sides to pair automatically.
            </p>
          </div>
          <div className="actions-row">
            <button onClick={connect}>{connected ? 'Reconnect' : 'Connect'}</button>
            <button className="secondary" onClick={requestTabs} disabled={!connected || !peers.extension}>
              Refresh tabs
            </button>
            <button className="secondary" onClick={requestScreenshot} disabled={!connected || !peers.extension}>
              Screenshot
            </button>
            <button className="secondary" onClick={fetchActionableTreeAction} disabled={!canExecute}>
              Fetch actionable tree
            </button>
          </div>
          <label className="probe-toggle">
            <input
              type="checkbox"
              checked={probeComboboxes}
              onChange={(e) => setProbeComboboxes(e.target.checked)}
            />
            Probe comboboxes (open dropdowns to read options)
          </label>
          {tabs.length > 0 && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Target tab</label>
              <select
                value={selectedTabId}
                onChange={(e) => setSelectedTabId(e.target.value ? Number(e.target.value) : '')}
              >
                {tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    [{tab.id}] {tab.title.slice(0, 60)} — {tab.url.slice(0, 80)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {screenshot && <img className="screenshot-preview" src={screenshot} alt="Tab screenshot" />}
        </section>

        <section className="panel">
          <h2>Target</h2>
          <div className="field">
            <label>Tag</label>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="button, a, div, input..." />
          </div>
          <div className="field">
            <label>Properties (dynamic attribute filters)</label>
            {properties.map((prop, idx) => (
              <div className="field-row" key={idx}>
                <input
                  value={prop.attribute}
                  onChange={(e) => updateProperty(idx, { attribute: e.target.value })}
                  placeholder="class, id, data-*, text"
                />
                <input
                  value={prop.pattern}
                  onChange={(e) => updateProperty(idx, { pattern: e.target.value })}
                  placeholder="?__index__ or ?_id_?"
                />
                <button
                  className="danger"
                  type="button"
                  onClick={() => setProperties((prev) => prev.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </div>
            ))}
            <button className="secondary" type="button" onClick={() => setProperties((p) => [...p, emptyProperty()])}>
              + Add property
            </button>
            <p className="hint">
              Use <code>?</code> as a wildcard segment (matches any characters). Example: pattern{' '}
              <code>?__index__</code> matches <code>2X6x__index__</code>.
            </p>
          </div>
          <div className="field">
            <label>Index (nth match)</label>
            <input
              type="number"
              min={0}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
          </div>
          <div className="actions-row">
            <button type="button" onClick={highlightTarget} disabled={!canExecute}>
              Highlight
            </button>
            <button type="button" className="secondary" onClick={clearHighlight} disabled={!canExecute}>
              Clear highlight
            </button>
          </div>
          {!canExecute && executeDisabledReason && <p className="hint">{executeDisabledReason}</p>}
          {canExecute && (
            <p className="hint">Highlight the target on the page to verify your selector before running an action.</p>
          )}
        </section>

        <section className="panel">
          <h2>Action</h2>
          <div className="field">
            <label>Action type</label>
            <select value={action} onChange={(e) => setAction(e.target.value as ActionType)}>
              {ACTION_OPTIONS.map(([key, def]) => (
                <option key={key} value={key}>
                  {def.label} — {def.description}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Payload (JSON)</label>
            <textarea
              value={payloadJson}
              onChange={(e) => setPayloadJson(e.target.value)}
              placeholder={
                action === 'type'
                  ? '{"text":"hello"}'
                  : action === 'file_upload'
                    ? '{"files":[{"name":"a.txt","mimeType":"text/plain","base64":"..."}]}'
                    : action === 'scroll_by'
                      ? '{"x":0,"y":400}'
                      : action === 'wait'
                        ? '{"ms":1000}'
                        : action === 'navigate'
                          ? '{"url":"https://example.com"}'
                          : '{}'
              }
            />
          </div>
          <button onClick={executeAction} disabled={!canExecute}>
            Execute
          </button>
        </section>

        <section className="panel">
          <h2>Event log</h2>
          <div className="log">
            {logs.length === 0 && <div className="hint">No events yet.</div>}
            {logs.map((entry) => (
              <div
                key={entry.id}
                className={`log-entry ${entry.success === true ? 'success' : entry.success === false ? 'error' : ''}`}
              >
                [{entry.at}] {entry.message}
              </div>
            ))}
          </div>
        </section>
      </div>

      {actionableTree && actionableTree.length > 0 && (
        <section className="panel tree-panel">
          <div className="tree-panel-header">
            <h2>Actionable tree</h2>
            <div className="tree-panel-actions">
              <button type="button" onClick={analyzeTree} disabled={analyzing || applying}>
                {analyzing ? 'Analyzing…' : 'Analyze'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => generatePlan()}
                disabled={!formAnalysis?.fields.length || applying || analyzing}
              >
                Build plan
              </button>
              <button
                type="button"
                className="secondary"
                onClick={applyActionPlan}
                disabled={
                  !formAnalysis?.fields.length ||
                  applying ||
                  analyzing ||
                  !canExecute ||
                  !treePage?.tabId
                }
              >
                {applying ? 'Applying…' : 'Apply (inject)'}
              </button>
            </div>
          </div>
          {treePage ? (
            <p className="hint analysis-meta">
              Target page: tab {treePage.tabId}
              {treePage.url ? ` · ${treePage.url}` : ''}
            </p>
          ) : null}
          <p className="hint">Click a target to prefill the selector and highlight it on the page.</p>
          <div className="field">
            <label>Profile — profile.json</label>
            <div className="profile-input-row">
              <input
                ref={profileFileRef}
                type="file"
                accept=".json,application/json"
                className="visually-hidden"
                onChange={handleProfileFile}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => profileFileRef.current?.click()}
              >
                Upload profile.json
              </button>
              {profileFileName ? <span className="hint profile-file-name">{profileFileName}</span> : null}
            </div>
            <textarea
              className="applicant-context"
              value={applicantContext}
              onChange={(e) => handleProfilePaste(e.target.value)}
              placeholder={'Paste profile.json contents here, or upload the file above.\n\nExample: copy from project root profile.json (uses autoBidProfile fields).'}
              rows={5}
            />
          </div>
          {formAnalysis?.usage && (
            <p className="hint analysis-meta">
              {formAnalysis.fields.length} actions · {formAnalysis.usage.totalTokens} tokens
              {formAnalysis.usage.cost
                ? ` · $${formAnalysis.usage.cost.totalUsd.toFixed(6)} ${formAnalysis.usage.cost.currency}`
                : ''}
            </p>
          )}
          {actionableTree && actionableTree.length > 0 ? (
            <div className="injection-script-panel">
              <div className="injection-script-header">
                <h3>
                  {selectedFieldLabel ? `Field step · ${selectedFieldLabel}` : 'Form fill plan'}
                </h3>
                <div className="injection-script-actions">
                  {selectedTreeFieldId ? (
                    <button type="button" className="secondary" onClick={showFullFormScript}>
                      Full plan
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void copyGeneratedScript()}
                    disabled={!displayedScript.trim()}
                  >
                    Copy
                  </button>
                </div>
              </div>
              {injectionPlan ? (
                <p className="hint analysis-meta">{injectionPlan.steps.length} step(s) · deterministic</p>
              ) : selectedTreeFieldId ? (
                <p className="hint">Click a tree field to preview its step. Use Full plan for apply.</p>
              ) : null}
              <textarea
                className="injection-script-editor"
                value={displayedScript}
                readOnly
                placeholder="Run Analyze to build the deterministic fill plan."
                spellCheck={false}
              />
            </div>
          ) : null}
          {actionableTree.map((group, groupIdx) => (
            <div className="tree-group" key={groupIdx}>
              <h3 className="tree-group-content">{group.content || '(no label)'}</h3>
              <ul className="tree-targets">
                {group.children.map((entry, childIdx) => {
                  const id = fieldId(groupIdx, childIdx);
                  const plan = actionPlanByFieldId.get(id);
                  const required = entry.target.includes('*');
                  return (
                    <li key={childIdx}>
                      <button
                        type="button"
                        className={`tree-target-row${selectedTreeFieldId === id ? ' tree-target-row-selected' : ''}`}
                        onClick={() => selectTreeTarget(entry, id)}
                        disabled={!canExecute}
                      >
                        <span className="tree-target-label">
                          {entry.target}
                          {required ? <span className="required-badge">required</span> : null}
                        </span>
                        <span className="tree-target-meta">
                          {entry.controlType} · &lt;{entry.control.tag}&gt;
                          {entry.options?.length
                            ? ` · ${entry.options.length} options${entry.optionsSource ? ` (${entry.optionsSource})` : ''}`
                            : ''}
                        </span>
                        {entry.options?.length ? (
                          <span className="tree-target-options">{formatTreeOptions(entry.options)}</span>
                        ) : null}
                        {plan ? (
                          <span
                            className={`action-plan ${plan.shouldSkip === 'Yes' ? 'action-plan-skip' : 'action-plan-go'}`}
                          >
                            <span className="action-plan-row">
                              <span className="action-plan-key">Action</span>
                              {plan.action}
                            </span>
                            <span className="action-plan-row">
                              <span className="action-plan-key">ShouldSkip</span>
                              {plan.shouldSkip}
                            </span>
                            <span className="action-plan-row">
                              <span className="action-plan-key">Value</span>
                              {plan.value}
                            </span>
                            {plan.notes ? (
                              <span className="action-plan-notes">{plan.notes}</span>
                            ) : null}
                          </span>
                        ) : entry.controlType === 'link' && !required ? (
                          <span className="action-plan action-plan-skip">
                            <span className="action-plan-row">
                              <span className="action-plan-key">ShouldSkip</span>
                              Yes
                            </span>
                            <span className="action-plan-notes">Informational link — not sent to analysis</span>
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
