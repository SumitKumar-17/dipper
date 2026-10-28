import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import api from "../../../../../docs/api/http.md?raw";
import readme from "../../../../../README.md?raw";
import "../../page/page.css";
import { ReadingPage } from "../reading-page";
import { docsDocument } from "./content";

// Read from the repo at build time, so the page is always the README and API of this commit.
const document = docsDocument(readme, api);

createRoot(window.document.getElementById("root")!).render(
  <StrictMode>
    <ReadingPage
      title="Docs"
      lede="Installing Dipper, finding your way around it, and the HTTP API its server speaks. The same text as the README in the repository."
      document={document}
    />
  </StrictMode>,
);
