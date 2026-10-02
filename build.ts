import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const outDir = join(import.meta.dir, "dist");
const portalUrl = process.env.PORTAL_URL;
if (!portalUrl) throw new Error("PORTAL_URL is required. Run INSTALL.sh.");
const portalOrigin = new URL(portalUrl).origin;

async function copy(file: string) {
  await Bun.write(join(outDir, file), Bun.file(join(import.meta.dir, "src", file)));
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await Bun.write(join(import.meta.dir, "src/config.ts"), `export const PORTAL_ORIGIN = ${JSON.stringify(portalOrigin)};\n`);
const result = await Bun.build({
  entrypoints: ["src/background.ts", "src/content.ts", "src/popup.ts", "src/offscreen.ts"],
  outdir: outDir,
  target: "browser",
  minify: false,
  sourcemap: "external",
  naming: "[name].js"
});
if (!result.success) throw new Error("Extension build failed");
const manifest = await Bun.file(join(import.meta.dir, "src/manifest.template.json")).text();
await Bun.write(join(outDir, "manifest.json"), manifest.replaceAll("__PORTAL_ORIGIN__", portalOrigin));
for (const file of ["popup.html", "popup.css", "content.css", "offscreen.html"]) await copy(file);
console.log(`Built ${outDir}`);
