export type Question = { question: string; answer: string };

/** The questions people ask before installing. One entry per question; the page and its search markup both read this. */
export const FAQ: readonly Question[] = [
  {
    question: "Is Dipper free?",
    answer: "Yes. It is open source under the MIT licence, with no account, no paid tier and no telemetry.",
  },
  {
    question: "Where is my data stored?",
    answer:
      "On your machine. Connections, settings and query history live in ~/.dipper, and your queries are plain .sql files in a folder you choose. Nothing is sent anywhere.",
  },
  {
    question: "Which databases does it support?",
    answer:
      "PostgreSQL and MySQL, running locally, in a container, or hosted (Neon, Supabase, RDS and the like). Some tools, such as index advice, are PostgreSQL only for now.",
  },
  {
    question: "Can it change my data?",
    answer:
      "Only when you ask. Queries run as written, and the table editor shows the exact SQL of every change and checks it with a dry run before applying all of it in one transaction. A connection can also be marked read-only, which the server enforces.",
  },
  {
    question: "Is it safe to explain a query with Analyze?",
    answer:
      "Analyze runs the statement to get real timings, so Dipper runs it inside a transaction that is always rolled back. Sequence values and other effects that databases do not roll back can still advance.",
  },
  {
    question: "How do I update it?",
    answer: "Run dipper update. It checks the download against the release checksum before replacing the binary.",
  },
  {
    question: "Does it work on Windows?",
    answer: "Yes. Download the .exe from the releases page. The install script is for macOS and Linux.",
  },
];
