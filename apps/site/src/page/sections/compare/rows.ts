/** Who is compared. Kept to tools people actually reach for when they need a SQL client. */
export const TOOLS = ["Dipper", "DBeaver", "TablePlus", "pgAdmin", "psql"] as const;
export type Tool = (typeof TOOLS)[number];

export type CompareRow = {
  label: string;
  /** One cell per tool, in the order of TOOLS. */
  cells: readonly [string, string, string, string, string];
};

// Only claims that are stable and easy to check. A row that would need a footnote to be fair does
// not belong here. The page says when this was last looked at, because other projects keep moving.
export const COMPARE_ROWS: readonly CompareRow[] = [
  { label: "Free and open source", cells: ["Yes (MIT)", "Community edition", "No", "Yes", "Yes"] },
  { label: "PostgreSQL and MySQL", cells: ["Both", "Both, and many more", "Both, and more", "PostgreSQL only", "PostgreSQL only"] },
  { label: "Needs an account", cells: ["No", "No", "No", "No", "No"] },
  { label: "One small self-contained binary", cells: ["Yes, about 14 MB", "No", "No", "No", "Yes"] },
  { label: "Steps through how a query runs", cells: ["Yes", "No", "No", "No", "No"] },
  { label: "Plain .sql files as notebooks", cells: ["Yes", "No", "No", "No", "No"] },
  { label: "Edits table rows in a grid", cells: ["Yes", "Yes", "Yes", "Yes", "No"] },
];

export const COMPARED_ON = "October 2026";
