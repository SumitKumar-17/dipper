import { describe, expect, test } from "bun:test";
import { detectConnection } from "./detect";
import type { ConnectionDraft } from "./draft";

/** The draft without the bookkeeping, for samples that only care about the connection. */
function read(text: string): Omit<ConnectionDraft, "options" | "ignored"> & Partial<ConnectionDraft> {
  const draft = detectConnection(text);
  if (draft === null) throw new Error(`not detected: ${text}`);
  const { options, ignored, ...rest } = draft;
  return {
    ...rest,
    ...(Object.keys(options).length > 0 ? { options } : {}),
    ...(ignored.length > 0 ? { ignored } : {}),
  };
}

describe("URLs", () => {
  test("a full postgres URL", () => {
    expect(read("postgres://app:s3cret@db.example.com:6432/shop?sslmode=verify-full")).toEqual({
      source: "url",
      dialect: "postgres",
      host: "db.example.com",
      port: 6432,
      user: "app",
      password: "s3cret",
      database: "shop",
      ssl: true,
      options: { sslmode: "verify-full" },
    });
  });

  test("Neon's copied string keeps sslmode and names channel_binding as not carried over", () => {
    expect(
      read(
        "postgresql://neondb_owner:npg_AbC123xYz@ep-cool-darkness-a1b2c3d4-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
      ),
    ).toEqual({
      source: "url",
      dialect: "postgres",
      host: "ep-cool-darkness-a1b2c3d4-pooler.us-east-2.aws.neon.tech",
      user: "neondb_owner",
      password: "npg_AbC123xYz",
      database: "neondb",
      ssl: true,
      options: { sslmode: "require" },
      ignored: ["channel_binding"],
    });
  });

  test("Supabase's pooler string with its password placeholder fills no password", () => {
    const draft = read(
      "postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    );
    expect(draft.password).toBeUndefined();
    expect(draft.placeholderPassword).toBe(true);
    expect(draft.user).toBe("postgres.abcdefghijklmnop");
    expect(draft.port).toBe(6543);
  });

  test("percent-encoded credentials are decoded", () => {
    const draft = read("postgres://me%40corp:p%40ss%2Fw%3Ard@localhost/app");
    expect(draft.user).toBe("me@corp");
    expect(draft.password).toBe("p@ss/w:rd");
  });

  test("an unencoded @ in the password still splits at the last @", () => {
    expect(read("postgres://me:p@ss@db.local/app").password).toBe("p@ss");
  });

  test("mysql, mariadb, mysql2 and SQLAlchemy driver suffixes", () => {
    expect(read("mysql://root@127.0.0.1:3307/app").dialect).toBe("mysql");
    expect(read("mariadb://root@db/app").dialect).toBe("mysql");
    expect(read("mysql2://root@db/app").dialect).toBe("mysql");
    expect(read("postgresql+psycopg2://u:p@db/app").dialect).toBe("postgres");
    expect(read("mysql+pymysql://u:p@db/app").dialect).toBe("mysql");
  });

  test("PlanetScale's TLS spellings turn TLS on", () => {
    expect(read("mysql://u:pscale_pw_x@aws.connect.psdb.cloud/app?sslaccept=strict").ssl).toBe(true);
    expect(read('mysql://u:p@aws.connect.psdb.cloud/app?ssl={"rejectUnauthorized":true}').ssl).toBe(true);
    expect(read("mysql://u:p@h/app?ssl-mode=REQUIRED")).toMatchObject({ ssl: true, options: { sslmode: "require" } });
    expect(read("mysql://u:p@h/app?tls=skip-verify")).toMatchObject({ ssl: true, options: { sslmode: "require" } });
  });

  test("sslmode=disable turns TLS off and is kept", () => {
    expect(read("postgres://u@db.example.com/app?sslmode=disable")).toMatchObject({
      ssl: false,
      options: { sslmode: "disable" },
    });
  });

  test("an unknown sslmode is not carried over", () => {
    const draft = read("postgres://u@db.example.com/app?sslmode=strict");
    expect(draft.ssl).toBeUndefined();
    expect(draft.ignored).toEqual(["sslmode"]);
  });

  test("certificate paths, search_path and a socket directory", () => {
    expect(
      read("postgres://u@db/app?sslrootcert=/etc/ca.pem&options=-c%20search_path%3Dapp,public"),
    ).toMatchObject({ options: { sslrootcert: "/etc/ca.pem", search_path: "app,public" } });
    expect(read("postgres:///app?host=/var/run/postgresql").host).toBe("/var/run/postgresql");
    expect(read("mysql://root@localhost/app?socket=/tmp/mysql.sock").options).toEqual({
      socket: "/tmp/mysql.sock",
    });
  });

  test("an IPv6 host loses its brackets", () => {
    expect(read("postgres://u@[::1]:5433/app")).toMatchObject({ host: "::1", port: 5433 });
  });

  test("a URL with only a database", () => {
    expect(read("postgres:///app")).toEqual({ source: "url", dialect: "postgres", database: "app" });
  });

  test("user and password as query parameters", () => {
    expect(read("postgresql://db.example.com/app?user=me&password=pw")).toMatchObject({
      user: "me",
      password: "pw",
    });
  });
});

describe("JDBC", () => {
  test("pgJDBC with credentials in the query", () => {
    expect(
      read("jdbc:postgresql://db.example.com:5432/shop?user=app&password=pw&ssl=true&sslmode=verify-ca&currentSchema=sales"),
    ).toEqual({
      source: "jdbc",
      dialect: "postgres",
      host: "db.example.com",
      port: 5432,
      user: "app",
      password: "pw",
      database: "shop",
      ssl: true,
      options: { sslmode: "verify-ca", search_path: "sales" },
    });
  });

  test("Connector/J flags", () => {
    expect(read("jdbc:mysql://db:3306/app?useSSL=true&serverTimezone=UTC")).toMatchObject({
      dialect: "mysql",
      ssl: true,
      ignored: ["serverTimezone"],
    });
    expect(read("jdbc:mysql://db/app?sslMode=VERIFY_IDENTITY").options).toEqual({ sslmode: "verify-full" });
    expect(read("jdbc:mariadb://db/app?useSSL=false").ssl).toBe(false);
  });

  test("the host-less pgJDBC form", () => {
    expect(read("jdbc:postgresql:shop")).toEqual({ source: "jdbc", dialect: "postgres", database: "shop" });
  });
});

describe("psql", () => {
  test("short flags, with PGPASSWORD in front", () => {
    expect(read("PGPASSWORD=pw psql -h db.example.com -p 5433 -U app -d shop")).toEqual({
      source: "psql",
      dialect: "postgres",
      host: "db.example.com",
      port: 5433,
      user: "app",
      password: "pw",
      database: "shop",
    });
  });

  test("long flags, attached values and positional dbname and user", () => {
    expect(read("psql --host=db --port=6000 shop app")).toMatchObject({
      host: "db",
      port: 6000,
      database: "shop",
      user: "app",
    });
    expect(read("psql -hdb -Uapp -dshop")).toMatchObject({ host: "db", user: "app", database: "shop" });
  });

  test("a URL as the dbname, as Neon and Supabase print it", () => {
    expect(read("psql 'postgresql://u:pw@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require'")).toMatchObject({
      source: "psql",
      host: "ep-x.eu-central-1.aws.neon.tech",
      password: "pw",
      ssl: true,
    });
  });

  test("a conninfo string as the dbname", () => {
    expect(read('psql "host=db port=5444 dbname=shop user=app sslmode=require"')).toMatchObject({
      host: "db",
      port: 5444,
      database: "shop",
      user: "app",
      options: { sslmode: "require" },
    });
  });

  test("switches and commands are skipped, a prompt and line continuations are not in the way", () => {
    expect(read("$ psql -X -c 'select 1' -h db \\\n  -U app shop")).toMatchObject({
      host: "db",
      user: "app",
      database: "shop",
    });
    expect(read("/usr/lib/postgresql/16/bin/psql -h db shop").host).toBe("db");
    expect(read("psql -h db shop < schema.sql").database).toBe("shop");
  });

  test("inside a code fence", () => {
    expect(read("```bash\npsql -h db -U app shop\n```").host).toBe("db");
  });
});

describe("mysql", () => {
  test("a bare -p asks for the password and does not swallow the database", () => {
    expect(read("mysql -h db.example.com -P 3307 -u app -p shop")).toEqual({
      source: "mysql",
      dialect: "mysql",
      host: "db.example.com",
      port: 3307,
      user: "app",
      database: "shop",
    });
  });

  test("an attached password, long flags and TLS", () => {
    expect(
      read("mysql --host=db --user=app -ppw --database=shop --ssl-mode=VERIFY_IDENTITY --ssl-ca=/etc/ca.pem"),
    ).toMatchObject({
      password: "pw",
      database: "shop",
      ssl: true,
      options: { sslmode: "verify-full", sslrootcert: "/etc/ca.pem" },
    });
    expect(read("mariadb -uroot --password=pw -S /tmp/mysql.sock app")).toMatchObject({
      user: "root",
      password: "pw",
      options: { socket: "/tmp/mysql.sock" },
    });
  });

  test("MYSQL_PWD in front", () => {
    expect(read("MYSQL_PWD=pw mysql -u app -h db").password).toBe("pw");
  });
});

describe("environment lines", () => {
  test("DATABASE_URL, exported and quoted", () => {
    expect(read('export DATABASE_URL="postgres://app:pw@db.example.com/shop"')).toMatchObject({
      source: "env",
      host: "db.example.com",
      password: "pw",
    });
    expect(read("DATABASE_URL=mysql://root@db/app # local")).toMatchObject({ dialect: "mysql", database: "app" });
    expect(read('$env:DATABASE_URL = "postgres://u@db/app"').host).toBe("db");
  });

  test("a .env block prefers DATABASE_URL over DIRECT_URL", () => {
    const env = [
      "# Prisma",
      'DIRECT_URL="postgresql://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"',
      'DATABASE_URL="postgresql://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"',
      "NODE_ENV=production",
    ].join("\n");
    expect(read(env)).toMatchObject({ port: 6543, ignored: ["pgbouncer"] });
  });

  test("a PGHOST block, as Neon offers it", () => {
    const env = "PGHOST='ep-x.us-east-2.aws.neon.tech'\nPGDATABASE='neondb'\nPGUSER='neondb_owner'\nPGPASSWORD='npg_x'\nPGSSLMODE='require'";
    expect(read(env)).toEqual({
      source: "env",
      dialect: "postgres",
      host: "ep-x.us-east-2.aws.neon.tech",
      database: "neondb",
      user: "neondb_owner",
      password: "npg_x",
      ssl: true,
      options: { sslmode: "require" },
    });
  });

  test("a JDBC string in an env line", () => {
    expect(read("SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/app").dialect).toBe("postgres");
  });
});

describe("libpq DSN", () => {
  test("keyword/value pairs with a quoted password", () => {
    expect(read("host=db port=5432 dbname=shop user=app password='a b\\'c' sslmode=verify-full")).toEqual({
      source: "dsn",
      dialect: "postgres",
      host: "db",
      port: 5432,
      database: "shop",
      user: "app",
      password: "a b'c",
      ssl: true,
      options: { sslmode: "verify-full" },
    });
  });

  test("unknown keywords pass through as ignored, secrets other than the password too", () => {
    expect(read("host=db dbname=app connect_timeout=10 sslpassword=x")).toMatchObject({
      ignored: ["sslpassword", "connect_timeout"],
    });
  });
});

describe("SQLite", () => {
  test("URLs and bare paths", () => {
    expect(read("sqlite:///home/me/app.db")).toEqual({ source: "sqlite", dialect: "sqlite", database: "/home/me/app.db" });
    expect(read("sqlite:data/app.db").database).toBe("data/app.db");
    expect(read("file:///C:/data/app.db?mode=ro")).toMatchObject({ database: "C:/data/app.db", ignored: ["mode"] });
    expect(read("/var/lib/app/app.sqlite3").database).toBe("/var/lib/app/app.sqlite3");
    expect(read("C:\\data\\app.db").database).toBe("C:\\data\\app.db");
    expect(read("sqlite3 ./app.db").database).toBe("./app.db");
  });
});

describe("text that is not a connection pastes as text", () => {
  const notConnections = [
    "",
    "   ",
    "hello world",
    "db.example.com",
    "localhost:5432",
    "app.db",
    "SELECT * FROM users WHERE id = 1",
    "https://neon.tech/docs/connect",
    "a=b",
    "name=value other=thing",
    "search_path=app",
    "psql",
    "mysql -p",
    "sudo -u postgres psql",
    "NODE_ENV=production",
    "export FOO=bar",
    "redis://localhost:6379",
    "mongodb+srv://u:p@cluster0.mongodb.net/app",
    "jdbc:sqlserver://db:1433;databaseName=app",
    "password",
    "s3cr3t-p@ss!",
  ];
  for (const text of notConnections) {
    test(JSON.stringify(text), () => expect(detectConnection(text)).toBeNull());
  }
});

describe("malformed connections fill nothing", () => {
  const malformed = [
    // A port that is not a port.
    "postgres://u:p@db:99999/app",
    "postgres://u:p@db:54x2/app",
    "psql -h db -p five",
    "mysql -h db -P 0",
    "host=db port=abc dbname=app",
    "PGPORT=nope psql -h db",
    // Multi-host lists the form cannot hold.
    "postgres://u@h1:5432,h2:5432/app",
    "host=h1,h2 dbname=app",
    // An unescaped # or / in the password cut the URL in the wrong place.
    "postgres://u:pa#ss@db/app",
    "postgres://u:pa/ss@db/app",
    // A path where the database name should be.
    "postgres://u@db/app/extra",
    // Two lines joined into one host.
    "postgres://u@db\n.example.com/app",
    // An unterminated quote.
    "psql -h 'db -U app",
    // A host with a space.
    "psql -h 'db host' app",
    // Too many positional arguments to be what they claim.
    "mysql app extra",
    // A broken escape.
    "postgres://u:%zz@db/app",
    // Host placeholders.
    "postgres://user:pass@<host>:5432/db",
    // Nothing after the scheme.
    "postgres://",
    "mysql://",
  ];
  for (const text of malformed) {
    test(JSON.stringify(text), () => expect(detectConnection(text)).toBeNull());
  }

  test("placeholders for the user and database are left out, not filled", () => {
    expect(read("postgres://<user>:<password>@db.example.com/<database>")).toEqual({
      source: "url",
      dialect: "postgres",
      host: "db.example.com",
      placeholderPassword: true,
    });
    expect(read("postgres://${DB_USER}:${DB_PASS}@db/app").user).toBeUndefined();
  });

  test("a very long paste is not read", () => {
    expect(detectConnection(`postgres://u@db/app?x=${"a".repeat(9000)}`)).toBeNull();
  });
});
