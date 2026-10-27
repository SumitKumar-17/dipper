package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"dipper/protocol"
)

const pgSystemSchemas = `('pg_catalog', 'information_schema', 'pg_toast')`

// Aggregates and window functions have no definition pg_get_functiondef can print, so they are
// left out; a function the user wrote is what this view is for.
const pgRoutinesSQL = `
select n.nspname, p.proname, case p.prokind when 'p' then 'procedure' else 'function' end,
       pg_get_function_identity_arguments(p.oid),
       case when p.prokind = 'p' then '' else pg_get_function_result(p.oid) end,
       l.lanname, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname not in ` + pgSystemSchemas + `
   and p.prokind in ('f', 'p')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
 order by n.nspname, p.proname`

const pgSequencesSQL = `
select schemaname, sequencename, data_type::text, increment_by, last_value
  from pg_sequences
 where schemaname not in ` + pgSystemSchemas + `
 order by schemaname, sequencename`

const pgEnumsSQL = `
select n.nspname, t.typname, array_agg(e.enumlabel::text order by e.enumsortorder)
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
 group by n.nspname, t.typname
 order by n.nspname, t.typname`

const pgExtensionsSQL = `
select e.extname, e.extversion, n.nspname
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 order by e.extname`

const pgObjectTriggersSQL = `
select n.nspname, c.relname, t.tgname, t.tgenabled <> 'D', pg_get_triggerdef(t.oid, true)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal and n.nspname not in ` + pgSystemSchemas + `
 order by n.nspname, c.relname, t.tgname`

func (d *postgresDriver) Objects(ctx context.Context, database string) (protocol.DatabaseObjects, error) {
	objects := emptyObjects()
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return objects, err
	}
	steps := []func(context.Context, *pgxpool.Pool, *protocol.DatabaseObjects) error{
		pgReadRoutines, pgReadSequences, pgReadEnums, pgReadExtensions, pgReadObjectTriggers,
	}
	for _, step := range steps {
		if err := step(ctx, pool, &objects); err != nil {
			return objects, err
		}
	}
	return objects, nil
}

func pgReadRoutines(ctx context.Context, pool *pgxpool.Pool, out *protocol.DatabaseObjects) error {
	rows, err := pool.Query(ctx, pgRoutinesSQL)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var r protocol.Routine
		if err := rows.Scan(&r.Schema, &r.Name, &r.Kind, &r.Arguments, &r.Returns, &r.Language, &r.Definition); err != nil {
			return err
		}
		out.Routines = append(out.Routines, r)
	}
	return rows.Err()
}

func pgReadSequences(ctx context.Context, pool *pgxpool.Pool, out *protocol.DatabaseObjects) error {
	rows, err := pool.Query(ctx, pgSequencesSQL)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var s protocol.Sequence
		if err := rows.Scan(&s.Schema, &s.Name, &s.DataType, &s.Increment, &s.LastValue); err != nil {
			return err
		}
		out.Sequences = append(out.Sequences, s)
	}
	return rows.Err()
}

func pgReadEnums(ctx context.Context, pool *pgxpool.Pool, out *protocol.DatabaseObjects) error {
	rows, err := pool.Query(ctx, pgEnumsSQL)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var e protocol.EnumType
		if err := rows.Scan(&e.Schema, &e.Name, &e.Labels); err != nil {
			return err
		}
		out.Enums = append(out.Enums, e)
	}
	return rows.Err()
}

func pgReadExtensions(ctx context.Context, pool *pgxpool.Pool, out *protocol.DatabaseObjects) error {
	rows, err := pool.Query(ctx, pgExtensionsSQL)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var e protocol.Extension
		if err := rows.Scan(&e.Name, &e.Version, &e.Schema); err != nil {
			return err
		}
		out.Extensions = append(out.Extensions, e)
	}
	return rows.Err()
}

func pgReadObjectTriggers(ctx context.Context, pool *pgxpool.Pool, out *protocol.DatabaseObjects) error {
	rows, err := pool.Query(ctx, pgObjectTriggersSQL)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var t protocol.ObjectTrigger
		if err := rows.Scan(&t.Schema, &t.Table, &t.Name, &t.Enabled, &t.Definition); err != nil {
			return err
		}
		out.Triggers = append(out.Triggers, t)
	}
	return rows.Err()
}
