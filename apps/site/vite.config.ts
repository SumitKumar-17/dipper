import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Lets an ngrok tunnel show the page on a phone. ngrok owns the DNS for these names, so allowing
// them does not reopen the rebinding hole the host check closes. Tunnel the built page (preview):
// dev serves some 540 unbundled modules, which don't finish loading through a free tunnel.
const tunnelHosts = [".ngrok-free.app"];

// Three pages, each its own entry so the landing never ships the Markdown parser and the reading
// pages never ship the scenes. lab/ is a dev-only test page: `vite dev` serves any .html under the
// root, and the build reads only these inputs, which keeps it out of the deploy.
const pages = {
  main: "index.html",
  docs: "docs/index.html",
  changelog: "changelog/index.html",
};

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    rolldownOptions: {
      input: Object.fromEntries(
        Object.entries(pages).map(([name, path]) => [name, fileURLToPath(new URL(path, import.meta.url))]),
      ),
      output: {
        // Libraries in chunks of their own, so a deploy that changes only the site's code leaves them
        // cached, and moving from one page to another reuses React. Each group holds code that loads
        // at one moment: React on every page, motion with the landing, the editor with a scene's
        // window. A group that mixed those would drag lazy code into the first paint.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "motion", test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
            { name: "editor", test: /node_modules[\\/](@codemirror|@lezer)[\\/]/ },
          ],
        },
      },
    },
    // three.js is the one big chunk (about 0.5 MB, the bird's renderer), and it is only fetched
    // after first paint; the default 500 kB warning would fire on every build for it.
    chunkSizeWarningLimit: 600,
  },
  server: {
    // Several agents run this app side by side on assigned ports; a silent walk to the next free
    // port would put one of them on another's page.
    strictPort: true,
    allowedHosts: tunnelHosts,
  },
  preview: {
    strictPort: true,
    allowedHosts: tunnelHosts,
  },
});
