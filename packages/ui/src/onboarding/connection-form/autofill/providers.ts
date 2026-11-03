// Hosted databases recognised by their hostname. Only patterns a provider documents as its own
// are here: Google Cloud SQL, for one, hands out a bare IP address, so there is nothing to match.
//
// A provider turns TLS on and may name the connection, and that is all it does to the form. Its
// note says what the person would otherwise learn from a failed connection; it never supplies a
// credential or an option, because the provider's own dashboard is the only source of those.

export type Provider = {
  readonly name: string;
  readonly note: string;
  /** A name for the connection when the host's first label does not identify it. */
  readonly connectionName?: string;
};

type Matcher = (host: string, user: string) => Provider | null;

const neon: Matcher = (host) => {
  if (!/\.neon\.tech$/i.test(host)) return null;
  const endpoint = (host.split(".")[0] ?? "").replace(/-pooler$/i, "");
  return {
    name: "Neon",
    note: /-pooler\./i.test(host)
      ? "TLS is required. This is the pooled endpoint; an idle one can take a few seconds to wake."
      : "TLS is required. An idle endpoint can take a few seconds to wake.",
    ...(endpoint === "" ? {} : { connectionName: endpoint }),
  };
};

const supabase: Matcher = (host, user) => {
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(host);
  if (direct?.[1] !== undefined) {
    return {
      name: "Supabase",
      note: "TLS is required. The direct host is IPv6 only unless the IPv4 add-on is on; if it does not answer, use the session pooler address from the Connect dialog.",
      connectionName: `supabase-${direct[1]}`,
    };
  }
  if (!/\.pooler\.supabase\.com$/i.test(host)) return null;
  // The pooler is shared, so the project is named by the user instead: `postgres.<project ref>`.
  const project = /^postgres\.([a-z0-9]+)$/i.exec(user)?.[1];
  return {
    name: "Supabase pooler",
    note: "TLS is required. The user is postgres.<project ref>; port 5432 is session mode and 6543 transaction mode.",
    ...(project === undefined ? {} : { connectionName: `supabase-${project}` }),
  };
};

const rds: Matcher = (host) => {
  if (!/\.rds\.amazonaws\.com(?:\.cn)?$/i.test(host)) return null;
  const label = host.split(".")[1] ?? "";
  const kind = /^cluster-ro-/i.test(label)
    ? "Reader endpoint, read only. "
    : /^cluster-/i.test(label)
      ? "Cluster endpoint. "
      : "";
  return {
    name: kind === "" ? "Amazon RDS" : "Amazon Aurora",
    note: `${kind}RDS signs its certificates with Amazon's own CA, which is not in the system trust store: set the CA certificate to the RDS bundle (truststore.pki.rds.amazonaws.com) or the TLS mode to require.`,
  };
};

const planetscale: Matcher = (host) =>
  /\.psdb\.cloud$/i.test(host)
    ? { name: "PlanetScale", note: "TLS is required. Passwords are per branch, from the Connect dialog." }
    : null;

const azure: Matcher = (host) =>
  /\.(?:postgres|mysql)\.database\.azure\.com$/i.test(host)
    ? { name: "Azure Database", note: "TLS is required." }
    : null;

const MATCHERS: readonly Matcher[] = [neon, supabase, rds, planetscale, azure];

export function providerFor(host: string, user = ""): Provider | null {
  const trimmed = host.trim();
  for (const match of MATCHERS) {
    const provider = match(trimmed, user.trim());
    if (provider !== null) return provider;
  }
  return null;
}
