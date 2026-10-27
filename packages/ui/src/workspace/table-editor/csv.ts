// A small RFC 4180 CSV reader. Quoting is where hand-rolled parsers go wrong, so the rules are
// stated here and every one of them is tested: a field may be quoted, a quoted field may hold the
// delimiter, a newline or a doubled quote, and a file may end with or without a final newline.

export type CsvResult = { rows: string[][]; error: string | null };

/** Parses `text` into rows of fields. A quote that never closes is reported rather than guessed at. */
export function parseCsv(text: string, delimiter = ","): CsvResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const endField = (): void => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = (): void => {
    endField();
    // A blank line is not a row of one empty field.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  // A byte order mark at the start is the file's, not the first header's.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (c === delimiter) endField();
    else if (c === "\n") endRow();
    else if (c === "\r") {
      if (source[i + 1] === "\n") i++;
      endRow();
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (inQuotes) return { rows, error: "A quoted field is never closed." };
  if (fieldStarted || field !== "" || row.length > 0) endRow();
  return { rows, error: null };
}

/** Picks the delimiter that splits the first line into the most fields: comma, semicolon or tab. */
export function guessDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}
