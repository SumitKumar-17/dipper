package db

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"dipper/protocol"
)

// ErrTableNotFound is returned when the requested relation does not exist.
var ErrTableNotFound = errors.New("table not found")

const pgRelationSQL = `
select c.oid::oid, c.relkind::text,
       obj_description(c.oid, 'pg_class'),
       pg_get_userbyid(c.relowner),
       coalesce(pg_get_partkeydef(c.oid), ''),
       coalesce((select pn.nspname || '.' || pc.relname
                   from pg_inherits i
                   join pg_class pc on pc.oid = i.inhparent
                   join pg_namespace pn on pn.oid = pc.relnamespace
                  where i.inhrelid = c.oid), ''),
       case when c.relkind in ('v','m') then pg_get_viewdef(c.oid, true) else '' end,
       pg_total_relation_size(c.oid), pg_relation_size(c.oid), pg_indexes_size(c.oid)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = $1 and c.relname = $2 and c.relkind in ('r','p','v','m','f')`

const pgColumnDetailSQL = `
select a.attname, format_type(a.atttypid, a.atttypmod), not a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid),
       coalesce(i.indisprimary, false), a.attnum,
       col_description(a.attrelid, a.attnum),
       case a.attidentity when 'a' then 'always' when 'd' then 'by default' else '' end,
       case when a.attgenerated = 's' then pg_get_expr(d.adbin, d.adrelid) else '' end,
       case when a.attcollation <> 0 and a.attcollation <> t.typcollation then co.collname end
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  left join pg_index i on i.indrelid = a.attrelid and i.indisprimary and a.attnum = any (i.indkey)
  left join pg_collation co on co.oid = a.attcollation
 where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
 order by a.attnum`

// Key columns come from pg_get_indexdef per position, so an expression index shows its expression
// rather than a missing column name.
const pgIndexSQL = `
select ic.relname, am.amname, ix.indisunique, ix.indisprimary, ix.indisvalid,
       array(select pg_get_indexdef(ix.indexrelid, k, true)
               from generate_series(1, ix.indnkeyatts) as k order by k),
       pg_get_expr(ix.indpred, ix.indrelid),
       pg_get_indexdef(ix.indexrelid),
       pg_relation_size(ic.oid),
       s.idx_scan
  from pg_index ix
  join pg_class ic on ic.oid = ix.indexrelid
  join pg_am am on am.oid = ic.relam
  left join pg_stat_all_indexes s on s.indexrelid = ix.indexrelid
 where ix.indrelid = $1
 order by ix.indisprimary desc, ic.relname`

const pgConstraintSQL = `
select con.conname, con.contype::text, pg_get_constraintdef(con.oid, true),
       array(select a.attname::text
               from unnest(con.conkey) with ordinality as u(attnum, ord)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum
              order by u.ord)
  from pg_constraint con
 where con.conrelid = $1 and con.contype in ('p','u','f','c','x')
 order by case con.contype when 'p' then 0 when 'u' then 1 when 'f' then 2 when 'c' then 3 else 4 end,
          con.conname`

const pgTriggerSQL = `
select tgname, tgenabled <> 'D', pg_get_triggerdef(oid, true)
  from pg_trigger
 where tgrelid = $1 and not tgisinternal
 order by tgname`

const pgStatsSQL = `
select n_live_tup, n_dead_tup, seq_scan, idx_scan,
       last_vacuum::text, last_autovacuum::text, last_analyze::text, last_autoanalyze::text
  from pg_stat_all_tables
 where relid = $1`

func (d *postgresDriver) TableDetail(ctx context.Context, database, schema, table string) (protocol.TableDetail, error) {
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return protocol.TableDetail{}, err
	}
	return readPgTableDetail(ctx, pool, schema, table)
}

func readPgTableDetail(ctx context.Context, pool *pgxpool.Pool, schema, table string) (protocol.TableDetail, error) {
	detail := protocol.TableDetail{
		Schema: schema, Name: table,
		Columns: []protocol.ColumnDetail{}, Indexes: []protocol.IndexInfo{},
		Constraints: []protocol.Constraint{}, Triggers: []protocol.TriggerInfo{},
	}

	var oid uint32
	var relkind, viewDef string
	var total, heap, indexes int64
	err := pool.QueryRow(ctx, pgRelationSQL, schema, table).Scan(
		&oid, &relkind, &detail.Comment, &detail.Owner, &detail.PartitionKey, &detail.PartitionOf,
		&viewDef, &total, &heap, &indexes)
	if errors.Is(err, pgx.ErrNoRows) {
		return detail, ErrTableNotFound
	}
	if err != nil {
		return detail, err
	}
	detail.Kind = relationKind(relkind)
	toast := max(total-heap-indexes, 0)
	detail.Stats = &protocol.TableStats{TotalBytes: &total, TableBytes: &heap, IndexBytes: &indexes, ToastBytes: &toast}

	steps := []func() error{
		func() error { return readPgColumns(ctx, pool, oid, &detail) },
		func() error { return readPgIndexes(ctx, pool, oid, &detail) },
		func() error { return readPgConstraints(ctx, pool, oid, &detail) },
		func() error { return readPgTriggers(ctx, pool, oid, &detail) },
		func() error { return readPgStats(ctx, pool, oid, &detail) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return detail, err
		}
	}
	detail.DDL = PostgresDDL(detail, viewDef)
	return detail, nil
}

func readPgColumns(ctx context.Context, pool *pgxpool.Pool, oid uint32, detail *protocol.TableDetail) error {
	rows, err := pool.Query(ctx, pgColumnDetailSQL, oid)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var c protocol.ColumnDetail
		if err := rows.Scan(&c.Name, &c.Type, &c.Nullable, &c.Default, &c.PK, &c.Position,
			&c.Comment, &c.Identity, &c.Generated, &c.Collation); err != nil {
			return err
		}
		detail.Columns = append(detail.Columns, c)
	}
	return rows.Err()
}

func readPgIndexes(ctx context.Context, pool *pgxpool.Pool, oid uint32, detail *protocol.TableDetail) error {
	rows, err := pool.Query(ctx, pgIndexSQL, oid)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var ix protocol.IndexInfo
		if err := rows.Scan(&ix.Name, &ix.Method, &ix.Unique, &ix.Primary, &ix.Valid,
			&ix.Columns, &ix.Predicate, &ix.Definition, &ix.SizeBytes, &ix.Scans); err != nil {
			return err
		}
		detail.Indexes = append(detail.Indexes, ix)
	}
	return rows.Err()
}

func readPgConstraints(ctx context.Context, pool *pgxpool.Pool, oid uint32, detail *protocol.TableDetail) error {
	rows, err := pool.Query(ctx, pgConstraintSQL, oid)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var c protocol.Constraint
		var kind string
		if err := rows.Scan(&c.Name, &kind, &c.Definition, &c.Columns); err != nil {
			return err
		}
		c.Kind = pgConstraintKind(kind)
		if c.Columns == nil {
			c.Columns = []string{}
		}
		detail.Constraints = append(detail.Constraints, c)
	}
	return rows.Err()
}

func readPgTriggers(ctx context.Context, pool *pgxpool.Pool, oid uint32, detail *protocol.TableDetail) error {
	rows, err := pool.Query(ctx, pgTriggerSQL, oid)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var t protocol.TriggerInfo
		if err := rows.Scan(&t.Name, &t.Enabled, &t.Definition); err != nil {
			return err
		}
		detail.Triggers = append(detail.Triggers, t)
	}
	return rows.Err()
}

// A relation with no statistics row (a view, or a table the collector has not seen) keeps the
// size numbers and leaves the rest nil.
func readPgStats(ctx context.Context, pool *pgxpool.Pool, oid uint32, detail *protocol.TableDetail) error {
	s := detail.Stats
	err := pool.QueryRow(ctx, pgStatsSQL, oid).Scan(&s.LiveRows, &s.DeadRows, &s.SeqScans, &s.IndexScans,
		&s.LastVacuum, &s.LastAutovacuum, &s.LastAnalyze, &s.LastAutoanalyze)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}

func pgConstraintKind(code string) protocol.ConstraintKind {
	switch code {
	case "p":
		return protocol.ConstraintPrimaryKey
	case "u":
		return protocol.ConstraintUnique
	case "f":
		return protocol.ConstraintForeignKey
	case "x":
		return protocol.ConstraintExclusion
	}
	return protocol.ConstraintCheck
}
