import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import changelog from "../../../../../CHANGELOG.md?raw";
import "../../page/page.css";
import { ReadingPage } from "../reading-page";
import { changelogDocument } from "./content";

// Read from the repo at build time, so the page lists exactly what this commit's CHANGELOG.md does.
const document = changelogDocument(changelog);

createRoot(window.document.getElementById("root")!).render(
  <StrictMode>
    <ReadingPage
      title="Changelog"
      lede="Every notable change to Dipper, newest first. Unreleased is what is on the main branch and not yet in a release."
      document={document}
    />
  </StrictMode>,
);
