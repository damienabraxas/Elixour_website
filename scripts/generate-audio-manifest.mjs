import { readdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const audioDirectory = resolve(repositoryRoot, "public/audio");
const manifestPath = resolve(audioDirectory, "tracks.json");
const minorWords = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "to"]);

const titleFromFilename = (filename) => {
  const words = filename.slice(0, -extname(filename).length).split(/[_-]+/);

  return words
    .map((word, index) => {
      const normalized = word.toLowerCase();
      if (index > 0 && minorWords.has(normalized)) return normalized;
      return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    })
    .join(" ");
};

const filenames = (await readdir(audioDirectory))
  .filter((filename) => extname(filename).toLowerCase() === ".mp3")
  .sort((first, second) => first.localeCompare(second));

const tracks = filenames.map((filename) => ({
  id: filename.slice(0, -extname(filename).length).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  title: titleFromFilename(filename),
  streamUrl: `public/audio/${encodeURIComponent(filename)}`,
  downloads: { flac: null, wav: null },
}));

await writeFile(manifestPath, `${JSON.stringify(tracks, null, 2)}\n`);
console.log(`Wrote ${relative(repositoryRoot, manifestPath)} with ${tracks.length} track(s).`);
