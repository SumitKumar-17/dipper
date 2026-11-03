package db

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"

	"dipper/protocol"
)

// The target's oid, or null when it does not exist. Built from quoted parts so a name with a dot or
// an upper case letter resolves to exactly the table that was asked about.
const pgTargetSQL = `select to_regclass(quote_ident($1) || '.' || quote_ident($2))::oid`

const pgColumnSQL = `select attnum::int from pg_attribute where attrelid = $1 and attname = $2 and not attisdropped`

// Views are found through pg_rewrite, where Postgres records what each view's query reads, and then
// followed through views built on views. $2 is the column's attnum, or 0 for the whole table: a view
// that reads the whole row (refobjsubid 0) is always a dependent. A column narrows only the first
// hop, since anything built on an affected view is affected.
const pgViewsSQL = `
with recursive v(oid, depth, path) as (
  select r.ev_class, 1, array[r.ev_class]
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
   where d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
     and d.refobjid = $1 and r.ev_class <> d.refobjid
     and ($2::int = 0 or d.refobjsubid in (0, $2::int))
   group by r.ev_class
  union all
  select r.ev_class, v.depth + 1, v.path || r.ev_class
    from v
    join pg_depend d on d.refobjid = v.oid and d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
    join pg_rewrite r on r.oid = d.objid
   where r.ev_class <> v.oid and not r.ev_class = any(v.path)
)
select n.nspname, c.relname, c.relkind::text, min(v.depth)::int
  from v
  join pg_class c on c.oid = v.oid
  join pg_namespace n on n.oid = c.relnamespace
 group by n.nspname, c.relname, c.relkind
 order by min(v.depth), n.nspname, c.relname`

// The columns of the target that each direct view reads.
const pgViewColumnsSQL = `
select n.nspname, c.relname, array_agg(distinct a.attname::text order by a.attname::text)
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join pg_class c on c.oid = r.ev_class
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
 where d.classid = 'pg_rewrite'::regclass and d.refobjid = $1 and d.refobjsubid > 0 and c.oid <> d.refobjid
 group by n.nspname, c.relname`

// Foreign keys on other tables that point at the target. A self reference is left out: it goes with
// the table. confkey holds the referenced columns' attnums.
const pgReferencingSQL = `
select n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid, true),
       (select array_agg(a.attname::text order by a.attnum) from pg_attribute a
         where a.attrelid = con.confrelid and a.attnum = any(con.confkey))
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
 where con.contype = 'f' and con.confrelid = $1 and con.conrelid <> con.confrelid
   and ($2::int = 0 or $2::int = any(con.confkey))
 order by n.nspname, c.relname, con.conname`

// Function bodies are text to Postgres, so the catalog cannot say what a routine reads. The sources
// of the user's own SQL and PL/pgSQL routines are fetched and searched in Go instead.
const pgRoutineSourcesSQL = `
select n.nspname, p.proname, p.prosrc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname not in ` + pgSystemSchemas + `
   and l.lanname in ('sql', 'plpgsql') and p.prokind in ('f', 'p')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
 order by n.nspname, p.proname`

func (d *postgresDriver) Dependents(ctx context.Context, database, schema, table, column string) (protocol.Dependents, error) {
	out := protocol.Dependents{Items: []protocol.Dependent{}}
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return out, err
	}
	var oid *uint32
	if err := pool.QueryRow(ctx, pgTargetSQL, schema, table).Scan(&oid); err != nil {
		return out, err
	}
	if oid == nil {
		return out, errors.New(schema + "." + table + " does not exist")
	}
	attnum := 0
	if column != "" {
		if err := pool.QueryRow(ctx, pgColumnSQL, *oid, column).Scan(&attnum); err != nil {
			return out, errors.New("column " + column + " does not exist on " + table)
		}
	}
	steps := []func(context.Context, *pgxpool.Pool, uint32, int, string, string, *protocol.Dependents) error{
		pgReadViewDependents, pgReadReferencing, pgReadRoutineDependents,
	}
	for _, step := range steps {
		if err := step(ctx, pool, *oid, attnum, table, column, &out); err != nil {
			return out, err
		}
	}
	return out, nil
}

func pgReadViewDependents(ctx context.Context, pool *pgxpool.Pool, oid uint32, attnum int, _, _ string, out *protocol.Dependents) error {
	used := map[[2]string][]string{}
	cols, err := pool.Query(ctx, pgViewColumnsSQL, oid)
	if err != nil {
		return err
	}
	for cols.Next() {
		var schema, name string
		var names []string
		if err := cols.Scan(&schema, &name, &names); err != nil {
			cols.Close()
			return err
		}
		used[[2]string{schema, name}] = names
	}
	cols.Close()
	if err := cols.Err(); err != nil {
		return err
	}

	rows, err := pool.Query(ctx, pgViewsSQL, oid, attnum)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var d protocol.Dependent
		var relkind string
		if err := rows.Scan(&d.Schema, &d.Name, &relkind, &d.Depth); err != nil {
			return err
		}
		d.Kind = "view"
		if relkind == "m" {
			d.Kind = "materialized_view"
		}
		if d.Depth == 1 {
			d.Columns = used[[2]string{d.Schema, d.Name}]
		}
		out.Items = append(out.Items, d)
	}
	return rows.Err()
}

func pgReadReferencing(ctx context.Context, pool *pgxpool.Pool, oid uint32, attnum int, _, _ string, out *protocol.Dependents) error {
	rows, err := pool.Query(ctx, pgReferencingSQL, oid, attnum)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		d := protocol.Dependent{Kind: "foreign_key", Depth: 1}
		if err := rows.Scan(&d.Schema, &d.Table, &d.Name, &d.Detail, &d.Columns); err != nil {
			return err
		}
		out.Items = append(out.Items, d)
	}
	return rows.Err()
}

func pgReadRoutineDependents(ctx context.Context, pool *pgxpool.Pool, _ uint32, _ int, table, column string, out *protocol.Dependents) error {
	rows, err := pool.Query(ctx, pgRoutineSourcesSQL)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var schema, name, source string
		if err := rows.Scan(&schema, &name, &source); err != nil {
			return err
		}
		if mentionsTarget(source, table, column) {
			out.Items = append(out.Items, protocol.Dependent{Kind: "routine", Schema: schema, Name: name, Depth: 1, Guess: true})
		}
	}
	return rows.Err()
}
