// The implementation of WorkspaceApi, backed by `dipper serve` through @dipper/client. There is no
// fixture provider and no offline mode, so everything any surface renders came off the wire.
// Derived-not-stored is the rule throughout: schema staleness is computed from what loaded versus
// what is wanted, never written into state by an effect.
//
// Actions report failures through state rather than rejecting. The exceptions are the ones whose
// return value *is* the answer and so have no state channel to fail into: `testConnection`,
// `addConnection`/`updateConnection`, and `discoverServers`.
//
// Each concern below is its own hook; this file is where they are wired to each other - the server
// gate that enables them all, and the four seams between them: a run's DDL re-introspects the
// schema, a save-as relists the workspace, a file event reaches whichever buffer holds it, and the
// files a previous session left open are reopened once the server can answer for them.

import type { DipperClient } from "@dipper/client";
import type { BrowseResult, FileSearchResult, ServerEvent } from "@dipper/protocol";
import { asyncData, type PanelState, type WorkspaceApi } from "@dipper/ui";
import * as React from "react";
import { serverClient } from "../server-client";
import { usePanels } from "../use-panels";
import { useBuffers } from "./use-buffers";
import { useFileSession } from "./use-file-session";
import { useConnections } from "./use-connections";
import { workspaceOf } from "./run-scope";
import { useRuns } from "./use-runs";
import { useTableTools } from "./use-table-tools";
import { useTransaction } from "./use-transaction";
import { useSchema } from "./use-schema";
import { useServerEvents } from "./use-server-events";
import { useServerGate } from "./use-server-gate";
import { useSettings } from "./use-settings";
import { useSnippets } from "./use-snippets";
import { useWorkspaceFiles } from "./use-workspace-files";

export type LiveWorkspaceOptions = {
  /** Injected by tests; the shared singleton otherwise. */
  client?: DipperClient;
};

export function useLiveWorkspace(options: LiveWorkspaceOptions = {}): WorkspaceApi {
  const { client: injected } = options;
  // Built on first use: it reads `window.location.origin`, absent when the export is prerendered.
  const getClient = React.useCallback((): DipperClient => injected ?? serverClient(), [injected]);

  /** Every load and effect below is gated on this, so a gated app makes exactly one request. */
  const { server, enabled } = useServerGate(getClient, injected);

  const { settings, refresh: refreshSettings, updateSettings } = useSettings(getClient, enabled);
  const settingsData = asyncData(settings);
  const { snippets, saveSnippet, deleteSnippet } = useSnippets(getClient, enabled);

  const {
    workspace,
    roots,
    refresh: refreshFiles,
    refreshWorkspace,
    reportError: reportFileError,
  } = useWorkspaceFiles(getClient, enabled, settingsData);

  const connections = useConnections(getClient, enabled);
  const { schema, reintrospect, refreshSchema } = useSchema(
    getClient,
    enabled,
    connections.connectionId,
    connections.database,
  );

  const { syncExternalFile, ...buffers } = useBuffers(getClient, enabled, {
    autosave: settingsData?.autosave ?? true,
    autosaveDelayMs: settingsData?.autosaveDelayMs ?? 1200,
    reportFileError,
    refreshWorkspace: refreshFiles,
  });

  // The fourth seam: which files were open last time, reopened through the same `openFile` the
  // Files tab uses. See `use-file-session.ts` for why it is remembered apart from the layout.
  const { restoring } = useFileSession(enabled, buffers, reportFileError);

  const { panels, setPanel: setPanelState, togglePanel } = usePanels();

  /**
   * The grid reconciles its tree against the buffers that exist and writes the result back, so
   * until the restore has opened them that write is a pruned layout - it would erase the very
   * arrangement the restored files are about to re-materialise, pane ids being path-derived.
   * Holding back that one write for those few hundred milliseconds is what brings the splits back
   * with the files. Every other panel write, and every layout write afterwards, goes through.
   */
  const setPanel = React.useCallback(
    <K extends keyof PanelState>(key: K, value: PanelState[K]): void => {
      if (key === "layout" && restoring) return;
      setPanelState(key, value);
    },
    [restoring, setPanelState],
  );

  const openOutput = React.useCallback((): void => setPanel("outputOpen", true), [setPanel]);

  /**
   * Which folder the query about to run belongs to, so History can be read per project. Derived
   * from the active buffer rather than stored: it is a pure function of the tab you are in and the
   * roots that are open.
   */
  const runWorkspace = React.useMemo(
    () => workspaceOf(buffers.activeBuffer?.path, roots, server.queriesDir),
    [buffers.activeBuffer?.path, roots, server.queriesDir],
  );

  const tableTools = useTableTools(getClient, {
    connectionId: connections.connectionId,
    database: connections.database,
  });

  const transaction = useTransaction(getClient, {
    connectionId: connections.connectionId,
    database: connections.database,
  });

  const runs = useRuns(getClient, enabled, {
    sessionId: transaction.sessionId,
    onRunFinished: transaction.refresh,
    connectionId: connections.connectionId,
    database: connections.database,
    activeSql: buffers.activeBuffer?.content,
    workspace: runWorkspace,
    settings: settingsData,
    onSchemaChanged: reintrospect,
    openOutput,
  });

  const onServerEvent = React.useCallback(
    (event: ServerEvent): void => {
      // A `run` event is this client's own run coming back; the record is already held.
      if (event.type === "roots") {
        refreshSettings();
        refreshFiles();
        return;
      }
      if (event.type !== "file") return;
      const change = event.event;
      if (change.type !== "change") {
        // The listing moved. An open buffer stays open: its text is the last copy that exists.
        refreshFiles();
        return;
      }
      if (change.created) refreshFiles();
      syncExternalFile(change.path, change.modifiedAt);
    },
    [refreshFiles, refreshSettings, syncExternalFile],
  );

  useServerEvents(getClient, enabled, onServerEvent);

  const searchFiles = React.useCallback(
    (query: string): Promise<FileSearchResult> => getClient().files.search(query),
    [getClient],
  );

  const browse = React.useCallback(
    (path?: string): Promise<BrowseResult> =>
      getClient().browse(path === undefined ? {} : { path }),
    [getClient],
  );

  return {
    connections: connections.connections,
    connectionId: connections.connectionId,
    connection: connections.connection,
    database: connections.database,
    databases: connections.databases,
    connect: connections.connect,
    selectDatabase: connections.selectDatabase,
    addConnection: connections.addConnection,
    updateConnection: connections.updateConnection,
    removeConnection: connections.removeConnection,
    testConnection: connections.testConnection,
    discoverServers: connections.discoverServers,

    schema,
    refreshSchema,

    buffers: buffers.buffers,
    activeBufferId: buffers.activeBufferId,
    activeBuffer: buffers.activeBuffer,
    saveState: buffers.saveState,
    newScratch: buffers.newScratch,
    openFile: buffers.openFile,
    closeBuffer: buffers.closeBuffer,
    focusBuffer: buffers.focusBuffer,
    editBuffer: buffers.editBuffer,
    setBufferView: buffers.setBufferView,
    save: buffers.save,
    saveAs: buffers.saveAs,
    renameFile: buffers.renameFile,
    deleteFile: buffers.deleteFile,
    resolveConflict: buffers.resolveConflict,

    workspace,
    roots,
    refreshWorkspace,

    cursor: buffers.cursor,
    setCursor: buffers.setCursor,

    runs: runs.runs,
    activeRun: runs.activeRun,
    activeRunFromHistory: runs.activeRunFromHistory,
    run: runs.run,
    exportUrl: runs.exportUrl,
    cancelRun: runs.cancelRun,
    selectRun: runs.selectRun,
    probe: runs.probe,
    ...tableTools,
    transaction: transaction.view,
    beginTransaction: transaction.begin,
    commitTransaction: transaction.commit,
    rollbackTransaction: transaction.rollback,
    historyStats: runs.historyStats,
    clearHistory: runs.clearHistory,
    historyScope: runs.historyScope,
    setHistoryScope: runs.setHistoryScope,

    settings,
    updateSettings,

    server,
    browse,
    searchFiles,
    snippets,
    saveSnippet,
    deleteSnippet,

    panels,
    setPanel,
    togglePanel,
  };
}
