package db

import (
	"context"
	"testing"
)

func TestMentionsMatchesWholeWordsOnly(t *testing.T) {
	cases := []struct {
		source, name string
		want         bool
	}{
		{"select * from users", "users", true},
		{"select * from `users`", "users", true},
		{`select * from "Users" u`, "users", true},
		{"select * from users_archive", "users", false},
		{"select * from superusers", "users", false},
		{"select 1", "", false},
	}
	for _, c := range cases {
		if got := mentions(c.source, c.name); got != c.want {
			t.Errorf("mentions(%q, %q) = %v, want %v", c.source, c.name, got, c.want)
		}
	}
}

func TestViewsThroughFollowsViewsOnViews(t *testing.T) {
	views := []viewDefinition{
		{name: "active_users", sql: "create view active_users as select id, email from users where active"},
		{name: "active_emails", sql: "create view active_emails as select email from active_users"},
		{name: "orders_v", sql: "create view orders_v as select * from orders"},
	}
	found := viewsThrough(views, "main", "users", "")
	if len(found) != 2 || found[0].Name != "active_users" || found[0].Depth != 1 || found[1].Name != "active_emails" || found[1].Depth != 2 {
		t.Fatalf("got %+v", found)
	}
	if got := viewsThrough(views, "main", "users", "phone"); len(got) != 0 {
		t.Errorf("a column no view reads must find nothing: %+v", got)
	}
}

func TestSqliteDependents(t *testing.T) {
	d := openSqlite(t)
	ctx := context.Background()
	for _, stmt := range []string{
		"create table users (id integer primary key, email text)",
		"create table orders (id integer primary key, user_id integer references users(id))",
		"create view active_users as select id, email from users",
		"create view emails as select email from active_users",
		"create table audit (note text)",
		"create trigger log_user after insert on orders begin insert into audit select email from users; end",
	} {
		if _, err := d.db.ExecContext(ctx, stmt); err != nil {
			t.Fatal(err)
		}
	}
	all, err := d.Dependents(ctx, "", "", "users", "")
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]int{}
	for _, item := range all.Items {
		kinds[item.Kind]++
	}
	if kinds["view"] != 2 || kinds["foreign_key"] != 1 || kinds["trigger"] != 1 {
		t.Errorf("unexpected dependents: %+v", all.Items)
	}
	byColumn, _ := d.Dependents(ctx, "", "", "users", "email")
	for _, item := range byColumn.Items {
		if item.Kind == "foreign_key" {
			t.Errorf("a foreign key on id is not a dependent of email: %+v", item)
		}
	}
}
