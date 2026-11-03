import { describe, expect, test } from "bun:test";
import { type FillKey, type FormValues, initialValues, withPatch } from "../form-values";
import { detectConnection } from "./detect";
import { planDraft, planTypedHost } from "./plan";

const blank = initialValues(undefined, "postgres", undefined);
const none = new Set<FillKey>();

function paste(text: string, values: FormValues = blank, owned: ReadonlySet<FillKey> = none) {
  const draft = detectConnection(text);
  if (draft === null) throw new Error(`not detected: ${text}`);
  return planDraft(values, owned, draft);
}

describe("a paste into a fresh form", () => {
  test("fills the address, the password, TLS, the options and a name", () => {
    const fill = paste("postgres://app:pw@db.example.com:6432/shop?sslmode=verify-full");
    expect(fill.patch).toEqual({
      host: "db.example.com",
      port: "6432",
      user: "app",
      password: "pw",
      database: "shop",
      ssl: true,
      sslmode: "verify-full",
      name: "db",
    });
    expect(fill.kept).toEqual([]);
  });

  test("switches from URL mode to the fields, without marking the switch as a field", () => {
    const fill = paste("psql -h db shop", { ...blank, mode: "url" });
    expect(fill.patch.mode).toBe("fields");
    expect(fill.filled).not.toContain("mode");
  });

  test("a mysql paste moves the dialect and its defaults along", () => {
    const fill = paste("mysql -h db -u app");
    expect(fill.patch).toMatchObject({ dialect: "mysql", port: "3306", database: "mysql", host: "db", user: "app" });
  });

  test("a SQLite path switches to a file connection named after the file", () => {
    const fill = paste("sqlite:///srv/data/orders.db");
    expect(fill.patch).toMatchObject({ dialect: "sqlite", database: "/srv/data/orders.db", name: "orders.db" });
    expect(fill.patch.host).toBeUndefined();
    expect(fill.filled).toEqual(["dialect", "database", "name"]);
  });

  test("a hosted provider turns TLS on when the paste does not say", () => {
    expect(paste("psql -h ep-x.us-east-2.aws.neon.tech -U me neondb").patch.ssl).toBe(true);
    expect(paste("psql -h db.internal -U me app").patch.ssl).toBeUndefined();
  });

  test("an explicit sslmode=disable is respected even for a provider", () => {
    expect(paste("postgres://u@db.abc.supabase.co/postgres?sslmode=disable").patch.ssl).toBe(false);
  });

  test("a placeholder password fills nothing and says so", () => {
    const fill = paste("postgresql://postgres.ref:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres");
    expect(fill.patch.password).toBeUndefined();
    expect(fill.placeholderPassword).toBe(true);
    expect(fill.patch.name).toBe("supabase-ref");
  });
});

describe("never over what someone typed", () => {
  const typed = withPatch(blank, { host: "mine.example.com", user: "me", password: "typed", name: "work" });
  const owned = new Set<FillKey>(["host", "user", "password", "name"]);

  test("typed fields are kept and reported; the rest fill", () => {
    const fill = paste("postgres://app:pw@db.example.com:6432/shop", typed, owned);
    expect(fill.patch).toEqual({ port: "6432", database: "shop" });
    expect(fill.kept).toEqual(["host", "user", "password"]);
  });

  test("a field someone emptied is theirs to have filled", () => {
    const fill = paste("postgres://app@db/shop", withPatch(typed, { user: "" }), owned);
    expect(fill.patch.user).toBe("app");
  });

  test("a TLS switch someone set is kept", () => {
    const fill = paste("postgres://u@db/app?sslmode=require", withPatch(blank, { ssl: false }), new Set(["ssl"]));
    expect(fill.patch.ssl).toBeUndefined();
    expect(fill.kept).toContain("ssl");
    expect(fill.patch.sslmode).toBe("require");
  });

  test("a connection being edited keeps its dialect: another dialect's paste fills nothing", () => {
    const editing = initialValues({ name: "prod", dialect: "postgres", host: "db" }, "postgres", undefined);
    const fill = paste("mysql://root@db/app", editing, new Set(["dialect", "name", "host"]));
    expect(fill.conflict).toEqual({ pasted: "mysql", current: "postgres" });
    expect(fill.patch).toEqual({});
  });

  test("a value equal to what is there is neither filled nor kept", () => {
    const fill = paste("postgres://me@mine.example.com/postgres", typed, owned);
    expect(fill.kept).toEqual([]);
    expect(fill.filled).toEqual([]);
  });
});

describe("a host typed by hand", () => {
  test("host:port splits, and the login and name follow", () => {
    const fill = planTypedHost(withPatch(blank, { host: "reports.example.com:5544" }), new Set(["host"]));
    expect(fill?.patch).toEqual({ host: "reports.example.com", port: "5544", user: "postgres", name: "reports" });
  });

  test("a bare host fills the dialect's login and the name, nothing it already has", () => {
    const mysql = initialValues(undefined, "mysql", undefined);
    const fill = planTypedHost(withPatch(mysql, { host: "10.1.2.3" }), new Set(["host"]));
    expect(fill?.patch).toEqual({ user: "root", name: "10.1.2.3" });
  });

  test("a typed login or name is left alone", () => {
    const values = withPatch(blank, { host: "db.example.com", user: "me", name: "mine" });
    expect(planTypedHost(values, new Set(["host", "user", "name"]))).toBeNull();
  });

  test("a provider host turns TLS on and offers no default login", () => {
    const fill = planTypedHost(withPatch(blank, { host: "app.c9akciq32.us-east-1.rds.amazonaws.com" }), new Set(["host"]));
    expect(fill?.patch).toEqual({ ssl: true, name: "app" });
  });

  test("a whole URL typed into the host field is read as a paste", () => {
    const fill = planTypedHost(withPatch(blank, { host: "postgres://app@db.example.com/shop" }), new Set(["host"]));
    expect(fill?.patch).toMatchObject({ host: "db.example.com", user: "app", database: "shop" });
  });

  test("text that is not a host fills nothing", () => {
    expect(planTypedHost(withPatch(blank, { host: "not a host" }), new Set(["host"]))).toBeNull();
    expect(planTypedHost(withPatch(blank, { host: "" }), new Set(["host"]))).toBeNull();
  });
});
