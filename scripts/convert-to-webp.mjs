/**
 * Converts PNG/JPEG under public/images and assets to WebP (quality 82).
 * Run: node scripts/convert-to-webp.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const dirs = [path.join(root, "public", "images"), path.join(root, "assets")];

async function convertFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(ext)) return;
  if (!fs.existsSync(absPath)) return;
  const outPath = absPath.slice(0, -ext.length) + ".webp";
  const before = fs.statSync(absPath).size;
  await sharp(absPath).webp({ quality: 82, effort: 6 }).toFile(outPath);
  const after = fs.statSync(outPath).size;
  console.log(
    `${path.relative(root, absPath)} -> ${path.relative(root, outPath)} (${before} -> ${after} bytes)`
  );
  fs.unlinkSync(absPath);
}

async function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full);
      continue;
    }
    await convertFile(full);
  }
}

for (const dir of dirs) {
  await walk(dir);
}

console.log("Done.");
