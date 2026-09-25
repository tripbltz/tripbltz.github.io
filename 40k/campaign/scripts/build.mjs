import { cp, mkdir, writeFile } from "node:fs/promises";
const base = new URL("../", import.meta.url);
const destination = new URL("dist/", base);
await mkdir(destination, { recursive: true });
for (const name of [
  "battle-for-christopia.html",
  "css",
  "js",
  "assets",
  "config.js",
])
  await cp(new URL(name, base), new URL(name, destination), {
    recursive: true,
  });
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (Boolean(url) !== Boolean(key))
  throw new Error(
    "Set both SUPABASE_URL and SUPABASE_ANON_KEY, or neither for local demo.",
  );
if (url && key) {
  if (!url.startsWith("https://"))
    throw new Error("SUPABASE_URL must use HTTPS.");
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "Only a publishable/anon key may be included in browser configuration.",
    );
  try {
    const role = JSON.parse(
      Buffer.from(key.split(".")[1] || "", "base64url").toString(),
    ).role;
    if (role && role !== "anon")
      throw new Error("Refusing to publish a non-anon JWT.");
  } catch (error) {
    if (error.message.includes("Refusing")) throw error;
  }
  await writeFile(
    new URL("config.js", destination),
    `window.CHRISTOPIA_CONFIG = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })};\n`,
  );
}
await cp(
  new URL("battle-for-christopia.html", destination),
  new URL("index.html", destination),
);
console.log("Static site prepared in campaign/dist.");
