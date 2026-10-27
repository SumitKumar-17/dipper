/** One card in the feature grid. Adding a feature to the page is adding an entry here. */
export type Feature = {
  title: string;
  text: string;
  /** Where it lives in the app, so a reader knows how to find it. */
  where: string;
};

export const FEATURES: readonly Feature[] = [
  {
    title: "Table Editor",
    text: "Open a table, edit cells, add and delete rows. Every change is shown as the exact SQL it will run, checked with a dry run, then applied in one transaction or not at all.",
    where: "Double-click a table",
  },
  {
    title: "Query plans",
    text: "EXPLAIN drawn as a tree weighted by cost. Turn on Analyze for real timings; it runs inside a transaction that is always rolled back. Stale statistics and wasted scans are called out.",
    where: "Right-click a statement",
  },
  {
    title: "Activity and locks",
    text: "Every session, what it is waiting for, and who is blocking whom. Cancel a query or end a connection after a confirmation.",
    where: "Command palette",
  },
  {
    title: "Health and indexes",
    text: "Unused and duplicate indexes, foreign keys with no index, and bloated tables, each with the statement that would fix it. Nothing runs without you.",
    where: "Command palette",
  },
  {
    title: "Compare schemas",
    text: "See what would make one database match another and get a migration script, with anything that deletes data last and clearly marked.",
    where: "Command palette",
  },
  {
    title: "Structure and DDL",
    text: "Sizes, vacuum state, columns, indexes with scan counts, constraints and triggers for any table, plus the statements that would recreate it.",
    where: "Open a table",
  },
];
