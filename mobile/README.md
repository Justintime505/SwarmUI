# Swarm Mobile

A phone-first web app for SwarmUI. It is a separate front end that talks to the normal SwarmUI server API, so it runs alongside the desktop page and shares its models, backends and image library.

It is a web page, not an app-store app: open it in the phone's browser, and add it to the home screen if you want an icon.

## What it does

- **Generate:** prompt, model picker, aspect ratio, steps, CFG, seed, images per run, LoRAs with weights.
- **Image to image and inpainting:** start from a photo or a previous result, and paint a mask with a brush.
- **Live preview** of the image as it is made, with a strip of this session's results to flick through while the next one runs.
- **Generate menu** (hold the Generate button): generate forever, live previews, interrupt, and background batches.
- **Background batches:** ask for a number of images, each with a new random seed. They run on the server, so they continue with the phone locked or the browser closed.
- **Gallery:** a timeline of saved images by day, folders, starred filter, per-batch view, delete and multi-select.
- **Output folders:** choose where new images are saved before generating.
- **Profiles:** each person gets a private image library, optionally behind a PIN. Models, LoRAs and settings stay shared.
- **Model tags:** each model and LoRA remembers tags (quality tags, trigger words) that are added to the prompt and negative prompt automatically.

## Build

Needs Node.js 20 or newer.

```sh
cd mobile
npm install
npm run build
```

The build is written to `src/wwwroot/mobile/`, which SwarmUI serves. That folder is not in git, so build once after cloning and again after pulling changes.

## Use

Start SwarmUI as usual, then open `http://<server>:7801/mobile/index.html`. A phone that opens the server's root address is sent there automatically once the app has been built.

To reach it from a phone, SwarmUI has to listen on the network and not only on the PC itself (for example `--host 0.0.0.0`). SwarmUI has no login by default, so only do this on a network you trust.

## Develop

```sh
SWARM_URL=http://localhost:7801 npm run dev
```

This starts Vite's dev server with hot reload and forwards API calls to the SwarmUI server at `SWARM_URL`.

- `npm run lint` runs Oxlint.
- `npx tsc -b` type-checks.

## Layout

- `src/api/`: typed calls to the SwarmUI API.
- `src/*-store.ts`, `src/store.ts`: app state (Zustand). Generation settings are saved in the browser.
- `src/screens/`: the Generate and Gallery screens.
- `src/components/`: sheets and pickers. `components/ui/` holds the basic button, slider and sheet.
- `src/lib/`: small helpers.

Built with React, TypeScript, Vite and Tailwind CSS.

## Server side

The app relies on three small built-in extensions in this fork, under `src/BuiltinExtensions/`:

- `Profiles`: profile accounts and PINs.
- `BatchJobs`: background batches.
- `ModelTags`: negative tags per model (positive tags use SwarmUI's own trigger phrase metadata).

Without them the app still generates and browses images; those three features are unavailable.
