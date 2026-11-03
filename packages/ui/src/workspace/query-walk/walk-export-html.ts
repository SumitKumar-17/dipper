// One self-contained HTML file that replays an exported walk: no network, no external assets, and
// the same output for the same walk. It opens from disk in any browser and works offline.
//
// The data rides in a JSON script block and is only ever written into the page with
// `textContent`, never parsed as HTML, so a cell holding `<script>` is shown as text. The one
// escape the JSON needs is `<`, which keeps a `</script>` inside a cell from closing the block.

import type { WalkExport } from "./walk-export";

const STYLE = `
:root { color-scheme: light dark; font: 14px/1.5 system-ui, sans-serif; }
body { margin: 0; background: Canvas; color: CanvasText; }
main { max-width: 72rem; margin: 0 auto; padding: 1.5rem; display: grid; gap: 1rem; }
header h1 { font-size: 1.1rem; margin: 0; }
.note { color: GrayText; font-size: 0.85rem; margin: 0.25rem 0 0; }
pre { white-space: pre-wrap; margin: 0; padding: 0.75rem; border: 1px solid GrayText; border-radius: 0.5rem; font: 13px/1.45 ui-monospace, monospace; }
nav { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
button { font: inherit; padding: 0.3rem 0.8rem; border-radius: 0.4rem; border: 1px solid GrayText; background: Canvas; color: CanvasText; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
#where { font-variant-numeric: tabular-nums; color: GrayText; }
#stage, #cards { display: grid; gap: 1rem; }
#chapter { color: GrayText; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
#station { font-size: 1.05rem; font-weight: 600; margin: 0; }
#sentence { margin: 0; }
.card { overflow-x: auto; border: 1px solid GrayText; border-radius: 0.5rem; }
.card h3 { margin: 0; padding: 0.4rem 0.6rem; font-size: 0.85rem; border-bottom: 1px solid GrayText; }
table { border-collapse: collapse; width: 100%; font: 12px/1.4 ui-monospace, monospace; }
th, td { text-align: left; padding: 0.25rem 0.6rem; white-space: nowrap; }
th { color: GrayText; font-weight: 500; }
tr.fail td { text-decoration: line-through; opacity: 0.55; }
tr.unknown td { font-style: italic; opacity: 0.7; }
td.mark { width: 1.5rem; }
`;

const SCRIPT = `
const walk = JSON.parse(document.getElementById("walk-data").textContent);
const MARKS = { pass: "\\u2713", fail: "\\u2717", unknown: "?" };
const $ = (id) => document.getElementById(id);
let at = 0;
let timer = null;
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
function card(table) {
  const box = el("section", undefined, "card");
  const shown = table.rows.length;
  box.append(el("h3", table.title + " (" + (table.total !== null && table.total > shown ? shown + " of " + table.total : shown) + " rows)"));
  const grid = el("table");
  const head = el("tr");
  head.append(el("th", "", "mark"));
  for (const name of table.columns) head.append(el("th", name));
  grid.append(head);
  for (const row of table.rows) {
    const line = el("tr", undefined, row.verdict || "");
    line.append(el("td", row.verdict ? MARKS[row.verdict] : "", "mark"));
    for (const cell of row.cells) line.append(el("td", cell));
    grid.append(line);
  }
  box.append(grid);
  return box;
}
function show(index) {
  at = Math.max(0, Math.min(walk.stops.length - 1, index));
  const stop = walk.stops[at];
  $("chapter").textContent = stop.chapter;
  $("station").textContent = stop.station;
  $("sentence").textContent = stop.sentence + (stop.count === null ? "" : " (" + stop.count + " rows)");
  $("cards").replaceChildren(...stop.tables.map(card));
  $("where").textContent = (at + 1) + " / " + walk.stops.length;
  $("back").disabled = at === 0;
  $("next").disabled = at === walk.stops.length - 1;
}
function pause() { clearInterval(timer); timer = null; $("play").textContent = "Play"; }
function play() {
  if (at === walk.stops.length - 1) show(0);
  $("play").textContent = "Pause";
  timer = setInterval(() => (at === walk.stops.length - 1 ? pause() : show(at + 1)), 2500);
}
$("back").onclick = () => { pause(); show(at - 1); };
$("next").onclick = () => { pause(); show(at + 1); };
$("play").onclick = () => (timer ? pause() : play());
addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") { pause(); show(at + 1); }
  else if (event.key === "ArrowLeft") { pause(); show(at - 1); }
  else if (event.key === " ") { event.preventDefault(); timer ? pause() : play(); }
});
$("sql").textContent = walk.sql;
$("captured").textContent = "A snapshot of the data at export time (" + walk.exportedAt + "), not a live view: the database may have changed since. " + walk.snapshot;
if (walk.stops.length > 0) show(0);
else $("sentence").textContent = "This walk had no stages to export.";
`;

/** `<` written as its JSON escape, which keeps every string intact and no `</script>` in the block. */
const embed = (data: WalkExport): string => JSON.stringify(data).replaceAll("<", "\\u003c");

export function walkExportHtml(data: WalkExport): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Query walk</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<h1>Query walk</h1>
<p class="note" id="captured"></p>
</header>
<pre id="sql"></pre>
<nav aria-label="Playback">
<button id="back" type="button" aria-label="Step back (left arrow)">←</button>
<button id="play" type="button">Play</button>
<button id="next" type="button" aria-label="Step forward (right arrow)">→</button>
<span id="where"></span>
<span class="note">Left and right arrows step, space plays and pauses.</span>
</nav>
<section id="stage" aria-live="polite">
<div><div id="chapter"></div><p id="station"></p><p id="sentence"></p></div>
<div id="cards"></div>
</section>
</main>
<script type="application/json" id="walk-data">${embed(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
