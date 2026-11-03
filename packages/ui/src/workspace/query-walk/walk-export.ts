// The walk as data that can leave the app: every stop the live walk would settle on, with the
// sentence the narrator says there and the rows the stage shows, read from the same scene builders
// and sentences the player uses. Nothing here is re-derived or summarised, so an exported walk
// cannot tell a different story from the one on screen.

import type { Cell, Dialect } from "@dipper/protocol";
import { phasesFor, sentenceFor } from "./narration";
import { projectionsIn, type Program } from "./program";
import { buildScene, type Col, type Row, type Scene } from "./scenes";
import { runsPerRow, stationState, type ProgramData } from "./use-walk";

export type ExportTable = {
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly ExportRow[];
  /** The real row count behind the rows shown, when the walk measured it. */
  readonly total: number | null;
};

export type ExportRow = {
  readonly cells: readonly string[];
  /** What the station's test came to for this row: kept, thrown away, or SQL's unknown. */
  readonly verdict: "pass" | "fail" | "unknown" | null;
};

export type ExportStop = {
  readonly chapter: string;
  readonly station: string;
  readonly sentence: string;
  readonly count: number | null;
  readonly tables: readonly ExportTable[];
};

export type WalkExport = {
  readonly sql: string;
  readonly dialect: Dialect;
  /** When the rows were captured, as an ISO timestamp. Passed in, so the file is a pure function. */
  readonly exportedAt: string;
  /** What the stages read: one snapshot, the user's transaction, or neither. */
  readonly snapshot: string;
  readonly stops: readonly ExportStop[];
};

const text = (cell: Cell | undefined): string => (cell === null || cell === undefined ? "NULL" : String(cell));

function tableOf(title: string, cols: readonly Col[], rows: readonly Row[], total: number | null): ExportTable {
  return {
    title,
    columns: cols.map((col) => col.label),
    rows: rows.map((row) => ({ cells: cols.map((col) => text(row.cells[col.id])), verdict: row.verdict ?? null })),
    total,
  };
}

/** The cards of a settled scene. A group station's buckets become one card per group. */
function tablesOf(scene: Scene): ExportTable[] {
  if (scene.kind === "buckets") {
    return scene.buckets.map((bucket) => tableOf(bucket.title, scene.memberCols, bucket.members, bucket.count));
  }
  return scene.tables.map((view) => tableOf(view.title, view.cols, view.rows, view.total ?? null));
}

/** A chapter the export has no stage for says so, rather than vanishing from the walk. */
const ABSENT: Partial<Record<string, string>> = {
  "per-row": "This chapter runs once per row of another, which the live walk steps through row by row; it is not in the export.",
  held: "This chapter runs once per row of another and is held until a row is picked, so it is not in the export.",
  writes: "This chapter would change the database, so the walk shows it and never runs it.",
  unwalkable: "This chapter could not be walked.",
};

export function walkExport(
  program: Program,
  data: ProgramData,
  capture: { readonly exportedAt: string; readonly snapshot: string },
): WalkExport {
  const stops: ExportStop[] = [];
  for (const run of data.sections) {
    const chapter = run.section.label;
    const walk = runsPerRow(run.status) ? null : run.walk;
    if (walk === null) {
      const why = ABSENT[run.status];
      if (why) stops.push({ chapter, station: "", sentence: why, count: null, tables: [] });
      continue;
    }
    const projections = projectionsIn(program, run.section).map((child) => ({
      label: child.label,
      perRow: child.binding.kind === "bound",
    }));
    walk.stations.forEach((station, index) => {
      const state = stationState(station, walk.results[index]);
      if (state !== "ready") return;
      // The last phase is where the live walk comes to rest on a station before moving on.
      const last = phasesFor(index, walk, state).length - 1;
      const scene = buildScene(index, last, walk);
      stops.push({
        chapter,
        station: station.label,
        sentence: sentenceFor(index, walk, projections),
        count: scene.count,
        tables: tablesOf(scene),
      });
    });
  }
  return { sql: program.text, dialect: program.dialect, exportedAt: capture.exportedAt, snapshot: capture.snapshot, stops };
}
