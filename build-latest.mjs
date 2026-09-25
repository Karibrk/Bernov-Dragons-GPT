import { readdir, mkdir, copyFile, cp, rm } from "node:fs/promises";

const entries = await readdir(".");

// Přijímá DENIK i DENÍK a varianty .html i .gpt.html.
const rx = /^DEN[IÍ]K_CORE_V(\d+(?:\.\d+)*)(\.gpt)?\.html$/iu;
const candidates = entries
  .map(name => ({ name, m: name.match(rx) }))
  .filter(x => x.m)
  .map(x => ({
    name: x.name,
    version: x.m[1].split(".").map(Number),
    gpt: Boolean(x.m[2])
  }));

if (!candidates.length) {
  throw new Error("Nenalezen žádný DENIK/DENÍK_CORE_V*.html");
}

const compareVersion = (a, b) => {
  const n = Math.max(a.version.length, b.version.length);
  for (let i = 0; i < n; i++) {
    const d = (a.version[i] ?? 0) - (b.version[i] ?? 0);
    if (d) return d;
  }
  // Při stejné verzi má přednost .gpt.html.
  if (a.gpt !== b.gpt) return a.gpt ? 1 : -1;
  return a.name.localeCompare(b.name, "cs");
};

candidates.sort(compareVersion);
const latest = candidates.at(-1);

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await copyFile(latest.name, "dist/index.html");

for (const dir of ["denik-media"]) {
  try {
    await cp(dir, `dist/${dir}`, { recursive: true });
  } catch {}
}

console.log(`Bernov & Dragons: publikuji ${latest.name} jako / (verze ${latest.version.join(".")}${latest.gpt ? ", GPT" : ""})`);
