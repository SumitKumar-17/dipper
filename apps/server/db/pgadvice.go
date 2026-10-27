package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"dipper/protocol"
)

// An index that has never been scanned since the counters started, and is not there to enforce
// anything: a unique or primary index earns its keep without being read.
const pgUnusedIndexSQL = `
select s.schemaname, s.relname, s.indexrelname, pg_relation_size(s.indexrelid)
  from pg_stat_user_indexes s
  join pg_index i on i.indexrelid = s.indexrelid
 where s.idx_scan = 0 and not i.indisunique and not i.indisprimary and i.indisvalid
 order by pg_relation_size(s.indexrelid) desc`

// Two indexes on the same table with the same columns, operator classes, expressions and
// predicate do the same job twice.
const pgDuplicateIndexSQL = `
select n.nspname, c.relname,
       array_agg(ic.relname::text order by ic.relname),
       sum(pg_relation_size(ic.oid))::bigint
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
 group by n.nspname, c.relname, i.indrelid, i.indkey::text, i.indclass::text,
          coalesce(i.indexprs::text, ''), coalesce(i.indpred::text, ''), i.indisunique
having count(*) > 1`

// The foreign key's columns must be the leading columns of some index, in any order, or deleting
// a parent row scans the whole child table.
const pgMissingFKIndexSQL = `
select n.nspname, c.relname, con.conname,
       array(select a.attname::text from unnest(con.conkey) k join pg_attribute a
              on a.attrelid = con.conrelid and a.attnum = k order by a.attnum),
       pg_relation_size(c.oid)
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
 where con.contype = 'f'
   and n.nspname not in ('pg_catalog', 'information_schema')
   and not exists (
     select 1 from pg_index i
      where i.indrelid = con.conrelid
        and (i.indkey::int2[])[0:cardinality(con.conkey) - 1] @> con.conkey
        and con.conkey @> (i.indkey::int2[])[0:cardinality(con.conkey) - 1])`

const pgDeadRowsSQL = `
select schemaname, relname, n_live_tup, n_dead_tup
  from pg_stat_user_tables
 where n_dead_tup > 1000 and n_dead_tup > 0.2 * (n_live_tup + n_dead_tup)
 order by n_dead_tup desc`

const pgInvalidIndexSQL = `
select n.nspname, c.relname, ic.relname
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
 where not i.indisvalid`

const pgHealthSQL = `
select pg_database_size(current_database()),
       (select blks_hit::float8 / nullif(blks_hit + blks_read, 0) from pg_stat_database where datname = current_database()),
       (select count(*)::int from pg_stat_activity where backend_type = 'client backend'),
       current_setting('max_connections')::int,
       (select (extract(epoch from max(now() - xact_start)) * 1000)::bigint
          from pg_stat_activity where xact_start is not null and pid <> pg_backend_pid()),
       (select to_char(stats_reset at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          from pg_stat_database where datname = current_database())`

func (d *postgresDriver) Advise(ctx context.Context, database string) (protocol.Advice, error) {
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return protocol.Advice{}, err
	}
	advice := protocol.Advice{Findings: []protocol.Finding{}}
	if err := pool.QueryRow(ctx, pgHealthSQL).Scan(&advice.Health.SizeBytes, &advice.Health.CacheHitRatio,
		&advice.Health.Connections, &advice.Health.MaxConnections, &advice.Health.LongestTransactionMs,
		&advice.Health.StatsResetAt); err != nil {
		return advice, err
	}
	collectors := []func(context.Context, *pgxpool.Pool) ([]protocol.Finding, error){
		pgInvalidIndexes, pgUnusedIndexes, pgDuplicateIndexes, pgMissingFKIndexes, pgDeadRows,
	}
	for _, collect := range collectors {
		found, err := collect(ctx, pool)
		if err != nil {
			return advice, err
		}
		advice.Findings = append(advice.Findings, found...)
	}
	return advice, nil
}

func qualified(schema, name string) string { return quoteIdent(schema) + "." + quoteIdent(name) }

func pgInvalidIndexes(ctx context.Context, pool *pgxpool.Pool) ([]protocol.Finding, error) {
	rows, err := pool.Query(ctx, pgInvalidIndexSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []protocol.Finding
	for rows.Next() {
		var schema, table, index string
		if err := rows.Scan(&schema, &table, &index); err != nil {
			return nil, err
		}
		out = append(out, protocol.Finding{
			Kind: protocol.FindingInvalidIndex, Schema: schema, Table: table,
			Title:  fmt.Sprintf("Index %s is invalid", index),
			Detail: "A CREATE INDEX CONCURRENTLY failed part way. The index costs writes and is never used.",
			Fix:    "drop index " + qualified(schema, index) + ";",
		})
	}
	return out, rows.Err()
}

func pgUnusedIndexes(ctx context.Context, pool *pgxpool.Pool) ([]protocol.Finding, error) {
	rows, err := pool.Query(ctx, pgUnusedIndexSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []protocol.Finding
	for rows.Next() {
		var schema, table, index string
		var size int64
		if err := rows.Scan(&schema, &table, &index, &size); err != nil {
			return nil, err
		}
		out = append(out, protocol.Finding{
			Kind: protocol.FindingUnusedIndex, Schema: schema, Table: table, SizeBytes: &size,
			Title:  fmt.Sprintf("Index %s has never been used", index),
			Detail: "No query has scanned it since the usage counters started. It still slows every write to the table.",
			Fix:    "drop index " + qualified(schema, index) + ";",
		})
	}
	return out, rows.Err()
}

func pgDuplicateIndexes(ctx context.Context, pool *pgxpool.Pool) ([]protocol.Finding, error) {
	rows, err := pool.Query(ctx, pgDuplicateIndexSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []protocol.Finding
	for rows.Next() {
		var schema, table string
		var names []string
		var size int64
		if err := rows.Scan(&schema, &table, &names, &size); err != nil {
			return nil, err
		}
		// Keep the first by name and offer to drop the rest.
		drops := make([]string, 0, len(names)-1)
		for _, name := range names[1:] {
			drops = append(drops, "drop index "+qualified(schema, name)+";")
		}
		out = append(out, protocol.Finding{
			Kind: protocol.FindingDuplicateIndex, Schema: schema, Table: table, SizeBytes: &size,
			Title:  fmt.Sprintf("%s are the same index", strings.Join(names, " and ")),
			Detail: "They cover the same columns with the same options, so the table pays to maintain both.",
			Fix:    strings.Join(drops, "\n"),
		})
	}
	return out, rows.Err()
}

func pgMissingFKIndexes(ctx context.Context, pool *pgxpool.Pool) ([]protocol.Finding, error) {
	rows, err := pool.Query(ctx, pgMissingFKIndexSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []protocol.Finding
	for rows.Next() {
		var schema, table, constraint string
		var columns []string
		var size int64
		if err := rows.Scan(&schema, &table, &constraint, &columns, &size); err != nil {
			return nil, err
		}
		quoted := make([]string, len(columns))
		for i, c := range columns {
			quoted[i] = quoteIdent(c)
		}
		out = append(out, protocol.Finding{
			Kind: protocol.FindingMissingFKIndex, Schema: schema, Table: table,
			Title:  fmt.Sprintf("Foreign key %s has no index", constraint),
			Detail: "Deleting or updating a row in the referenced table scans this whole table to check for children.",
			Fix:    "create index on " + qualified(schema, table) + " (" + strings.Join(quoted, ", ") + ");",
		})
	}
	return out, rows.Err()
}

func pgDeadRows(ctx context.Context, pool *pgxpool.Pool) ([]protocol.Finding, error) {
	rows, err := pool.Query(ctx, pgDeadRowsSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []protocol.Finding
	for rows.Next() {
		var schema, table string
		var live, dead int64
		if err := rows.Scan(&schema, &table, &live, &dead); err != nil {
			return nil, err
		}
		out = append(out, protocol.Finding{
			Kind: protocol.FindingDeadRows, Schema: schema, Table: table,
			Title:  fmt.Sprintf("%s has %d dead rows against %d live", table, dead, live),
			Detail: "Dead rows are space and scan time that autovacuum has not reclaimed yet.",
			Fix:    "vacuum (analyze) " + qualified(schema, table) + ";",
		})
	}
	return out, rows.Err()
}
