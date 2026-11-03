// The commands the palette ships with, and the keys that also reach them.
//
// A hook rather than a constant, because every action closes over something from the workspace
// contract - but it takes exactly what it uses, so the dependency list is the six things that
// actually change rather than the twenty the palette happens to destructure.

import {
  ActivityIcon,
  BoxesIcon,
  BookmarkPlusIcon,
  DatabaseZapIcon,
  GitCompareIcon,
  BracesIcon,
  DiffIcon,
  TimerIcon,
  GaugeIcon,
  FootprintsIcon,
  PanelBottomIcon,
  PanelLeftIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  ScanSearchIcon,
  WandSparklesIcon,
  WaypointsIcon,
} from "lucide-react";
import * as React from "react";
import { requestActivity } from "../activity";
import { requestAdvice } from "../advice";
import { requestExplain } from "../explain";
import { requestObjects } from "../objects";
import { requestQueryWalk } from "../query-walk";
import { requestSchemaCompare } from "../schema-diff-view";
import { requestSlowQueries } from "../slow-queries";
import { requestSnippets } from "../snippets";
import { requestCompareConnections } from "../compare-connections";
import { requestMigrations } from "../migrations";
import { requestSchemaDiagram } from "../schema-diagram";
import {
  FORMAT_DOCUMENT_EVENT,
  offsetOfPosition,
  statementAtCursor,
  type FormatDocumentEventDetail,
} from "../sql-editor";
import type { Buffer, CursorPosition, PanelState } from "../types";
import { useShortcuts } from "../shortcut-store";
import { hotkeyLabel } from "../use-hotkey";
import type { PaletteAction } from "./palette-items";


/** Exactly what the built-in actions read from the workspace. */
export type BuiltinActionDeps = {
  activeBuffer: Buffer | undefined;
  activeBufferId: string | null;
  cursor: CursorPosition;
  panels: Pick<PanelState, "outputOpen" | "sidebarOpen">;
  newScratch: () => string;
  save: () => Promise<void>;
  run: (sql?: string) => Promise<string | undefined>;
  refreshSchema: () => Promise<void>;
  togglePanel: (key: "sidebarOpen" | "outputOpen" | "paletteOpen") => void;
};

export function useBuiltinActions(
  deps: BuiltinActionDeps,
  close: () => void,
): readonly PaletteAction[] {
  const {
    activeBuffer,
    activeBufferId,
    cursor,
    panels,
    newScratch,
    save,
    run,
    refreshSchema,
    togglePanel,
  } = deps;
  const keys = useShortcuts();

  return React.useMemo(
    () => [
      {
        label: "New file",
        shortcut: hotkeyLabel(keys.newFile),
        icon: PlusIcon,
        onSelect: () => {
          newScratch();
          close();
        },
      },
      {
        label: "Save",
        shortcut: hotkeyLabel(keys.save),
        icon: SaveIcon,
        onSelect: () => {
          void save();
          close();
        },
      },
      {
        label: "Run",
        shortcut: hotkeyLabel(keys.run),
        icon: PlayIcon,
        onSelect: () => {
          void run();
          close();
        },
      },
      {
        label: "Format document",
        shortcut: hotkeyLabel(keys.formatDocument),
        icon: WandSparklesIcon,
        onSelect: () => {
          // The key is bound inside CodeMirror, which needs a keydown reaching the focused
          // editor; this dispatches the same action for the active buffer, and no-ops when
          // nothing is open.
          if (activeBufferId) {
            window.dispatchEvent(
              new CustomEvent<FormatDocumentEventDetail>(FORMAT_DOCUMENT_EVENT, {
                detail: { bufferId: activeBufferId },
              }),
            );
          }
          close();
        },
      },
      {
        label: "Refresh schema",
        hint: "bypasses the server cache",
        icon: RefreshCwIcon,
        onSelect: () => {
          void refreshSchema();
          close();
        },
      },
      {
        label: "Visualise relationships",
        hint: "Tables and the keys that join them",
        icon: WaypointsIcon,
        onSelect: () => {
          requestSchemaDiagram();
          close();
        },
      },
      {
        label: "Visualise query",
        hint: "Walk the statement at the cursor, step by step",
        icon: FootprintsIcon,
        onSelect: () => {
          if (activeBuffer) {
            const at = offsetOfPosition(activeBuffer.content, cursor.line, cursor.col);
            const sql = statementAtCursor(activeBuffer.content, at)?.sql;
            if (sql) requestQueryWalk(sql);
          }
          close();
        },
      },
      {
        label: "Explain query plan",
        hint: "How the database will run the statement at the cursor",
        icon: ScanSearchIcon,
        onSelect: () => {
          if (activeBuffer) {
            const at = offsetOfPosition(activeBuffer.content, cursor.line, cursor.col);
            const sql = statementAtCursor(activeBuffer.content, at)?.sql;
            if (sql) requestExplain(sql);
          }
          close();
        },
      },
      {
        label: "Database objects",
        hint: "Functions, sequences, enums, extensions and triggers",
        icon: BoxesIcon,
        onSelect: () => {
          requestObjects();
          close();
        },
      },
      {
        label: "Compare across connections",
        hint: "Run the statement on several connections and see how the answers differ",
        icon: GitCompareIcon,
        onSelect: () => {
          if (activeBuffer) {
            // The statement at the cursor, as Explain does; with none, the whole file.
            const at = offsetOfPosition(activeBuffer.content, cursor.line, cursor.col);
            requestCompareConnections(statementAtCursor(activeBuffer.content, at)?.sql ?? activeBuffer.content);
          }
          close();
        },
      },
      {
        label: "Migrations",
        hint: "Apply numbered .sql files in order and see what has run",
        icon: DatabaseZapIcon,
        onSelect: () => {
          requestMigrations();
          close();
        },
      },
      {
        label: "Snippets",
        hint: "Saved SQL you can search, tag and insert",
        icon: BracesIcon,
        onSelect: () => {
          requestSnippets();
          close();
        },
      },
      {
        label: "Save query as snippet",
        hint: "Keep what is in the editor to reuse",
        icon: BookmarkPlusIcon,
        onSelect: () => {
          if (activeBuffer) requestSnippets(activeBuffer.content);
          close();
        },
      },
      {
        label: "Slow queries",
        hint: "The statements that have cost the most time",
        icon: TimerIcon,
        onSelect: () => {
          requestSlowQueries();
          close();
        },
      },
      {
        label: "Compare schemas",
        hint: "What would make this database match another one",
        icon: DiffIcon,
        onSelect: () => {
          requestSchemaCompare();
          close();
        },
      },
      {
        label: "Health and index advice",
        hint: "Unused and duplicate indexes, missing foreign key indexes, dead rows",
        icon: GaugeIcon,
        onSelect: () => {
          requestAdvice();
          close();
        },
      },
      {
        label: "Show activity",
        hint: "Sessions, locks and who is blocking whom",
        icon: ActivityIcon,
        onSelect: () => {
          requestActivity();
          close();
        },
      },
      {
        label: panels.outputOpen ? "Hide results" : "Show results",
        shortcut: hotkeyLabel(keys.toggleResults),
        icon: PanelBottomIcon,
        onSelect: () => {
          togglePanel("outputOpen");
          close();
        },
      },
      {
        label: panels.sidebarOpen ? "Hide sidebar" : "Show sidebar",
        shortcut: hotkeyLabel(keys.toggleSidebar),
        icon: PanelLeftIcon,
        onSelect: () => {
          togglePanel("sidebarOpen");
          close();
        },
      },
    ],
    [
      activeBuffer,
      activeBufferId,
      close,
      cursor,
      keys,
      newScratch,
      panels.outputOpen,
      panels.sidebarOpen,
      refreshSchema,
      run,
      save,
      togglePanel,
    ],
  );
}
