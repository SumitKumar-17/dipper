// The commands the palette ships with, and the keys that also reach them.
//
// A hook rather than a constant, because every action closes over something from the workspace
// contract - but it takes exactly what it uses, so the dependency list is the six things that
// actually change rather than the twenty the palette happens to destructure.

import {
  ActivityIcon,
  BoxesIcon,
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
import { requestSchemaDiagram } from "../schema-diagram";
import {
  FORMAT_DOCUMENT_EVENT,
  offsetOfPosition,
  statementAtCursor,
  type FormatDocumentEventDetail,
} from "../sql-editor";
import type { Buffer, CursorPosition, PanelState } from "../types";
import { FORMAT_DOCUMENT, NEW_FILE, RUN, SAVE, TOGGLE_RESULTS, TOGGLE_SIDEBAR } from "../shortcuts";
import { hotkeyLabel } from "../use-hotkey";
import type { PaletteAction } from "./palette-items";

export { FORMAT_DOCUMENT, NEW_FILE, RUN, SAVE, TOGGLE_RESULTS, TOGGLE_SIDEBAR } from "../shortcuts";

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

  return React.useMemo(
    () => [
      {
        label: "New file",
        shortcut: hotkeyLabel(NEW_FILE),
        icon: PlusIcon,
        onSelect: () => {
          newScratch();
          close();
        },
      },
      {
        label: "Save",
        shortcut: hotkeyLabel(SAVE),
        icon: SaveIcon,
        onSelect: () => {
          void save();
          close();
        },
      },
      {
        label: "Run",
        shortcut: hotkeyLabel(RUN),
        icon: PlayIcon,
        onSelect: () => {
          void run();
          close();
        },
      },
      {
        label: "Format document",
        shortcut: hotkeyLabel(FORMAT_DOCUMENT),
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
        shortcut: hotkeyLabel(TOGGLE_RESULTS),
        icon: PanelBottomIcon,
        onSelect: () => {
          togglePanel("outputOpen");
          close();
        },
      },
      {
        label: panels.sidebarOpen ? "Hide sidebar" : "Show sidebar",
        shortcut: hotkeyLabel(TOGGLE_SIDEBAR),
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
