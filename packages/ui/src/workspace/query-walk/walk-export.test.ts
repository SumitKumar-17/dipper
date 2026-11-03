import { describe, expect, test } from "bun:test";
import type { StatementResult } from "@dipper/protocol";
import { buildProgram, isUnsupportedProgram, type Program } from "./program";
import { buildResultStation } from "./steps";
import type { ProgramData } from "./use-walk";
import { walkExport, type WalkExport } from "./walk-export";
import { walkExportHtml } from "./walk-export-html";

const statement = (columns: string[], rows: (string | number | null)[][]): StatementResult => ({
  index: 0,
  sql: "",
  columns: columns.map((name) => ({ name, type: "text", align: "left" })),
  rows,
  rowCount: rows.length,
  affectedRows: null,
  command: "SELECT",
  durationMs: 0,
  truncated: false,
  notices: [],
});

/** A one-station walk whose probes have all landed, the way `useProgram` leaves it. */
function walked(sql: string): { program: Program; data: ProgramData } {
  const program = buildProgram(sql, "postgres");
  if (isUnsupportedProgram(program)) throw new Error(program.reason);
  const section = program.sections[0]!;
  const station = buildResultStation(section.text);
  const data: ProgramData = {
    program,
    sections: [
      {
        section,
        status: "done",
        walk: {
          parsed: null,
          text: section.text,
          result: section.result,
          stations: [station],
          results: [
            {
              status: "done",
              queries: {
                sample: { ok: true, result: statement(["n", "s"], [[1, "</script><b>x</b>"], [2, null]]) },
                count: { ok: true, result: statement(["count"], [["2"]]) },
              },
            },
          ],
        },
      },
    ],
  };
  return { program, data };
}

const capture = { exportedAt: "2026-11-03T12:00:00.000Z", snapshot: "Every stage reads one snapshot." };

describe("walkExport", () => {
  test("carries each settled stop's sentence and the rows its stage shows", () => {
    const { program, data } = walked("select 1 as n");
    const model = walkExport(program, data, capture);
    expect(model.stops).toHaveLength(1);
    const stop = model.stops[0]!;
    expect(stop.station).toBe("RESULT");
    expect(stop.sentence.length).toBeGreaterThan(0);
    expect(stop.tables[0]?.columns).toEqual(["n", "s"]);
    expect(stop.tables[0]?.rows.map((row) => row.cells)).toEqual([
      ["1", "</script><b>x</b>"],
      ["2", "NULL"],
    ]);
  });

  test("a station still loading is not exported as if it had an answer", () => {
    const { program, data } = walked("select 1 as n");
    const loading: ProgramData = {
      ...data,
      sections: data.sections.map((run) => ({
        ...run,
        walk: run.walk && { ...run.walk, results: [{ status: "loading", queries: {} }] },
      })),
    };
    expect(walkExport(program, loading, capture).stops).toEqual([]);
  });
});

describe("walkExportHtml", () => {
  const { program, data } = walked("select 1 as n");
  const model: WalkExport = walkExport(program, data, capture);
  const html = walkExportHtml(model);

  test("is the same file for the same walk", () => {
    expect(walkExportHtml(model)).toBe(html);
  });

  test("references nothing outside itself and forbids the network", () => {
    expect(html).not.toMatch(/\b(src|href)=/);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("default-src 'none'");
  });

  test("a cell cannot close the data block, and the data reads back whole", () => {
    const block = /<script type="application\/json" id="walk-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(block).not.toContain("<");
    expect(JSON.parse(block)).toEqual(JSON.parse(JSON.stringify(model)));
  });

  test("says it is a snapshot of the data at export time", () => {
    expect(html).toContain("A snapshot of the data at export time");
  });
});
