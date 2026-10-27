package server

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"dipper/db"
	"dipper/protocol"
)

// exportOptions are the query parameters that shape an export beyond its format.
type exportOptions struct {
	dialect protocol.Dialect
	// table names the target of the SQL format's INSERT statements.
	table string
	// formulaSafe prefixes text a spreadsheet would run as a formula, for files headed for Excel.
	formulaSafe bool
}

type exporter struct {
	contentType string
	extension   string
	write       func(w http.ResponseWriter, result protocol.StatementResult, opts exportOptions) error
}

var exportFormats = map[string]exporter{
	"csv": {"text/csv; charset=utf-8", "csv", func(w http.ResponseWriter, r protocol.StatementResult, o exportOptions) error {
		return writeDelimited(w, r, ',', o)
	}},
	"tsv": {"text/tab-separated-values; charset=utf-8", "tsv", func(w http.ResponseWriter, r protocol.StatementResult, o exportOptions) error {
		return writeDelimited(w, r, '\t', o)
	}},
	"json":     {"application/json; charset=utf-8", "json", writeJSON},
	"ndjson":   {"application/x-ndjson; charset=utf-8", "ndjson", writeNDJSON},
	"markdown": {"text/markdown; charset=utf-8", "md", writeMarkdown},
	"sql":      {"application/sql; charset=utf-8", "sql", writeSQL},
}

func columnNames(result protocol.StatementResult) []string {
	names := make([]string, len(result.Columns))
	for i, column := range result.Columns {
		names[i] = column.Name
	}
	return names
}

// rowsToObjects keeps a column's position when two columns share a name: the later one gets a
// numeric suffix instead of silently replacing the earlier value.
func rowsToObjects(columns []protocol.ResultColumn, rows []protocol.Row) []map[string]any {
	names := uniqueNames(columns)
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		object := make(map[string]any, len(columns))
		for i, name := range names {
			if i < len(row) {
				object[name] = row[i]
			}
		}
		out = append(out, object)
	}
	return out
}

func uniqueNames(columns []protocol.ResultColumn) []string {
	seen := map[string]int{}
	names := make([]string, len(columns))
	for i, column := range columns {
		seen[column.Name]++
		names[i] = column.Name
		if n := seen[column.Name]; n > 1 {
			names[i] = column.Name + "_" + strconv.Itoa(n)
		}
	}
	return names
}

func writeDelimited(w http.ResponseWriter, result protocol.StatementResult, comma rune, opts exportOptions) error {
	out := csv.NewWriter(w)
	out.Comma = comma
	header := columnNames(result)
	if err := out.Write(header); err != nil {
		return err
	}
	for _, row := range result.Rows {
		record := make([]string, len(header))
		for i := range header {
			if i < len(row) {
				record[i] = fieldText(row[i], opts.formulaSafe)
			}
		}
		if err := out.Write(record); err != nil {
			return err
		}
	}
	out.Flush()
	return out.Error()
}

// A null cell is an empty field, which is what a spreadsheet reads back as blank.
func fieldText(value protocol.Cell, formulaSafe bool) string {
	text := cellText(value)
	if formulaSafe {
		if s, isText := value.(string); isText && startsLikeFormula(s) {
			return "'" + text
		}
	}
	return text
}

// Spreadsheets run a cell that opens with one of these as a formula. Only text is prefixed:
// numbers arrive as numbers, so a plain -5 is never touched.
func startsLikeFormula(s string) bool {
	return s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0]))
}

func cellText(value protocol.Cell) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int64:
		return strconv.FormatInt(v, 10)
	}
	return fmt.Sprintf("%v", value)
}

func writeJSON(w http.ResponseWriter, result protocol.StatementResult, _ exportOptions) error {
	body, err := json.MarshalIndent(rowsToObjects(result.Columns, result.Rows), "", "  ")
	if err != nil {
		return err
	}
	_, err = w.Write(append(body, '\n'))
	return err
}

// One JSON object per line, so a consumer can stream it without parsing the whole file.
func writeNDJSON(w http.ResponseWriter, result protocol.StatementResult, _ exportOptions) error {
	encoder := json.NewEncoder(w)
	for _, object := range rowsToObjects(result.Columns, result.Rows) {
		if err := encoder.Encode(object); err != nil {
			return err
		}
	}
	return nil
}

func writeMarkdown(w http.ResponseWriter, result protocol.StatementResult, _ exportOptions) error {
	header := columnNames(result)
	escape := func(s string) string {
		return strings.NewReplacer("|", `\|`, "\n", " ", "\r", "").Replace(s)
	}
	var b strings.Builder
	cells := make([]string, len(header))
	for i, name := range header {
		cells[i] = escape(name)
	}
	b.WriteString("| " + strings.Join(cells, " | ") + " |\n")
	b.WriteString("|" + strings.Repeat(" --- |", len(header)) + "\n")
	for _, row := range result.Rows {
		for i := range header {
			cells[i] = ""
			if i < len(row) {
				cells[i] = escape(cellText(row[i]))
			}
		}
		b.WriteString("| " + strings.Join(cells, " | ") + " |\n")
	}
	_, err := w.Write([]byte(b.String()))
	return err
}

func writeSQL(w http.ResponseWriter, result protocol.StatementResult, opts exportOptions) error {
	table := opts.table
	if table == "" {
		table = "exported_rows"
	}
	rows := make([][]any, len(result.Rows))
	for i, row := range result.Rows {
		rows[i] = make([]any, len(row))
		for j, cell := range row {
			rows[i][j] = cell
		}
	}
	_, err := w.Write([]byte(db.InsertScript(opts.dialect, table, columnNames(result), rows)))
	return err
}

// dialectOf is Postgres when the connection is gone: its quoting is the safer default for a
// script someone will read before running.
func (s *Server) dialectOf(connectionID string) protocol.Dialect {
	if config, err := s.pool.Config(connectionID); err == nil {
		return config.Dialect
	}
	return protocol.DialectPostgres
}
