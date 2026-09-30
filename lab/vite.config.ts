import { defineConfig, type Plugin } from "vite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Dev-only (from agentic-evals): lets the page persist a run to public/results/<name>.json,
// after every round, so a long run survives a crash and can resume. GET reads the file
// straight from disk: Vite's static server only knows about public files that existed
// when it started, so a run saved later would otherwise be invisible and resume would
// silently start over. Inference never touches this server.
function saveResults(): Plugin {
  return {
    name: "save-results",
    configureServer(server) {
      server.middlewares.use("/__save-results", (req, res) => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "recorded";
        if (!/^[a-z0-9-]+$/.test(name)) {
          res.statusCode = 400;
          return res.end("bad name");
        }
        const file = resolve(__dirname, "public/results", `${name}.json`);
        if (req.method === "GET") {
          if (!existsSync(file)) {
            res.statusCode = 404;
            return res.end();
          }
          res.setHeader("content-type", "application/json");
          return res.end(readFileSync(file));
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          mkdirSync(resolve(__dirname, "public/results"), { recursive: true });
          writeFileSync(file, Buffer.concat(chunks));
          res.setHeader("content-type", "application/json");
          res.end('{"ok":true}');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [saveResults()],
  server: { port: 5190, strictPort: true, watch: { ignored: ["**/public/results/**"] } },
  build: { rollupOptions: { input: { main: resolve(__dirname, "index.html"), cascade: resolve(__dirname, "cascade.html") } } },
});
