import { expect, test } from "bun:test";
import { defaultUser, nameForHost, splitHostPort } from "./host";
import { providerFor } from "./providers";
import { shellWords } from "./shell-words";

test("a typed host splits off its port", () => {
  expect(splitHostPort("db.example.com:5433")).toEqual({ host: "db.example.com", port: 5433 });
  expect(splitHostPort(" db.example.com ")).toEqual({ host: "db.example.com" });
  expect(splitHostPort("[::1]:5433")).toEqual({ host: "::1", port: 5433 });
  expect(splitHostPort("::1")).toEqual({ host: "::1" });
  expect(splitHostPort("/var/run/postgresql")).toEqual({ host: "/var/run/postgresql" });
});

test("a typed host that is not one splits into nothing", () => {
  expect(splitHostPort("db:port")).toBeNull();
  expect(splitHostPort("db:70000")).toBeNull();
  expect(splitHostPort("my db")).toBeNull();
  expect(splitHostPort(":5432")).toBeNull();
});

test("the default login is the dialect's, except on a hosted provider", () => {
  expect(defaultUser("postgres", "db.example.com")).toBe("postgres");
  expect(defaultUser("mysql", "localhost")).toBe("root");
  expect(defaultUser("postgres", "ep-x.us-east-2.aws.neon.tech")).toBeNull();
  expect(defaultUser("sqlite", "")).toBeNull();
});

test("a connection is named after its host", () => {
  expect(nameForHost("localhost", 5432, "postgres")).toBe("postgres-local");
  expect(nameForHost("127.0.0.1", 3307, "mysql")).toBe("mysql-3307");
  expect(nameForHost("orders.c9akciq32.eu-west-1.rds.amazonaws.com", 5432, "postgres")).toBe("orders");
  expect(nameForHost("10.0.0.12", 5432, "postgres")).toBe("10.0.0.12");
  expect(nameForHost("reports.example.com:5544", 5432, "postgres")).toBe("reports");
  expect(nameForHost("ep-cool-darkness-a1b2-pooler.us-east-2.aws.neon.tech", 5432, "postgres")).toBe(
    "ep-cool-darkness-a1b2",
  );
  expect(nameForHost("db.abcdefgh.supabase.co", 5432, "postgres")).toBe("supabase-abcdefgh");
  expect(nameForHost("aws-0-us-east-1.pooler.supabase.com", 6543, "postgres", "postgres.abcdefgh")).toBe(
    "supabase-abcdefgh",
  );
});

test("providers are recognised by host", () => {
  expect(providerFor("ep-x.us-east-2.aws.neon.tech")?.name).toBe("Neon");
  expect(providerFor("db.abcdefgh.supabase.co")?.name).toBe("Supabase");
  expect(providerFor("aws-0-us-east-1.pooler.supabase.com")?.name).toBe("Supabase pooler");
  expect(providerFor("app.c9akciq32.us-east-1.rds.amazonaws.com")?.name).toBe("Amazon RDS");
  expect(providerFor("app.cluster-c9akciq32.us-east-1.rds.amazonaws.com")?.name).toBe("Amazon Aurora");
  expect(providerFor("app.cluster-ro-c9akciq32.us-east-1.rds.amazonaws.com")?.note).toContain("read only");
  expect(providerFor("aws.connect.psdb.cloud")?.name).toBe("PlanetScale");
  expect(providerFor("myserver.postgres.database.azure.com")?.name).toBe("Azure Database");
  expect(providerFor("myserver.mysql.database.azure.com")?.name).toBe("Azure Database");
});

test("look-alike hosts are not providers", () => {
  for (const host of ["neon.tech.example.com", "supabase.co", "rds.amazonaws.com.evil.io", "localhost", "34.122.1.9"]) {
    expect(providerFor(host)).toBeNull();
  }
});

test("shell words follow POSIX quoting", () => {
  expect(shellWords(`psql -c 'select 1' "a \\"b\\"" c\\ d`)).toEqual(["psql", "-c", "select 1", 'a "b"', "c d"]);
  expect(shellWords("psql \\\n  -h db")).toEqual(["psql", "-h", "db"]);
  expect(shellWords(`a ""`)).toEqual(["a", ""]);
  expect(shellWords(`psql 'unterminated`)).toBeNull();
});
