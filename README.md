# Elixour Music Website

Static, framework-free website for Elixour Music.

## Local preview

From the repository root, run:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Homepage photograph

The selected original photograph is stored at:

```text
public/images/homepage/night-sky.jpg
```

The stylesheet uses a responsive cover crop and keeps the comet in frame on narrow screens.

## Alpha music player audio

Add or remove MP3 files in:

```text
public/audio/
```

Then rebuild the track manifest:

```sh
node scripts/generate-audio-manifest.mjs
```

The player reads `public/audio/tracks.json`; song titles are derived from filenames by replacing underscores and hyphens with spaces. For example, `Death_of_Innocence.mp3` is displayed as “Death of Innocence.” The generated `downloads` metadata reserves room for future FLAC and WAV assets, but the Alpha player does not expose downloads.

## Deployment

The site uses relative paths and can be served directly by GitHub Pages from the repository root.
