import { copyFile, cp, mkdir } from "node:fs/promises";
const base = new URL("../", import.meta.url);
await mkdir(new URL("supabase/functions/_shared/", base), { recursive: true });
for (const name of ["engine.js", "seed.js"])
  await copyFile(
    new URL("js/" + name, base),
    new URL("supabase/functions/_shared/" + name, base),
  );
await cp(
  new URL("js/services/", base),
  new URL("supabase/functions/_shared/services/", base),
  { recursive: true },
);
console.log(
  "Shared campaign domain modules copied for Supabase Edge deployment.",
);
