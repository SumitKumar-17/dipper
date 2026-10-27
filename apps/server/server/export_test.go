package server

import (
	"net/http/httptest"
	"strings"
	"testing"

	"dipper/protocol"
)

func sampleResult() protocol.StatementResult {
	return protocol.StatementResult{
		Columns: []protocol.ResultColumn{{Name: "id"}, {Name: "note"}, {Name: "id"}},
		Rows: []protocol.Row{
			{"1", "a|b", float64(2.5)},
			{"2", "=SUM(A1)", nil},
		},
	}
}

func export(t *testing.T, format string, opts exportOptions) string {
	t.Helper()
	rec := httptest.NewRecorder()
	if err := exportFormats[format].write(rec, sampleResult(), opts); err != nil {
		t.Fatal(err)
	}
	return rec.Body.String()
}

func TestEveryAdvertisedFormatWrites(t *testing.T) {
	for name := range exportFormats {
		if export(t, name, exportOptions{dialect: protocol.DialectPostgres}) == "" {
			t.Errorf("%s produced nothing", name)
		}
	}
}

func TestDelimitedKeepsDuplicateColumnsAndOptionallyDefusesFormulas(t *testing.T) {
	plain := export(t, "csv", exportOptions{})
	if !strings.HasPrefix(plain, "id,note,id\n") || !strings.Contains(plain, "2,=SUM(A1),") {
		t.Errorf("unexpected csv:\n%s", plain)
	}
	safe := export(t, "csv", exportOptions{formulaSafe: true})
	if !strings.Contains(safe, "'=SUM(A1)") {
		t.Errorf("formula text must be prefixed when safe is on:\n%s", safe)
	}
	if !strings.Contains(export(t, "tsv", exportOptions{}), "id\tnote\tid\n") {
		t.Error("tsv must be tab separated")
	}
}

func TestJSONFormatsDoNotLoseDuplicateColumns(t *testing.T) {
	if !strings.Contains(export(t, "json", exportOptions{}), `"id_2": 2.5`) {
		t.Error("the second id column must survive under a new name")
	}
	lines := strings.Split(strings.TrimSpace(export(t, "ndjson", exportOptions{})), "\n")
	if len(lines) != 2 {
		t.Errorf("ndjson is one object per line, got %d lines", len(lines))
	}
}

func TestMarkdownEscapesPipes(t *testing.T) {
	md := export(t, "markdown", exportOptions{})
	if !strings.Contains(md, `a\|b`) || !strings.Contains(md, "| --- | --- | --- |") {
		t.Errorf("unexpected markdown:\n%s", md)
	}
}

func TestSQLExportQuotesPerDialect(t *testing.T) {
	pg := export(t, "sql", exportOptions{dialect: protocol.DialectPostgres, table: "t"})
	if !strings.Contains(pg, `insert into "t" ("id", "note", "id") values ('1', 'a|b', 2.5);`) {
		t.Errorf("unexpected postgres sql:\n%s", pg)
	}
	my := export(t, "sql", exportOptions{dialect: protocol.DialectMySQL, table: "t"})
	if !strings.Contains(my, "insert into `t`") || !strings.Contains(my, "NULL);") {
		t.Errorf("unexpected mysql sql:\n%s", my)
	}
}
