import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (
      path !== "/" &&
      path !== "/battle-for-christopia.html" &&
      path !== "/config.js" &&
      !/^\/(js|css|assets)\//.test(path)
    ) {
      res.writeHead(404).end("Not found");
      return;
    }
    const file = resolve(
      root,
      "." + (path === "/" ? "/battle-for-christopia.html" : path),
    );
    if (
      !file.startsWith(root.endsWith(sep) ? root : root + sep) ||
      /\/(supabase|tests|scripts)\//.test(file.slice(root.length - 1))
    ) {
      res.writeHead(404).end("Not found");
      return;
    }
    if (!(await stat(file)).isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `Christopia: http://localhost:${port}/battle-for-christopia.html`,
  ),
);
