# Buddy

Buddy is a general-purpose visual AI companion for Windows: press a global
hotkey, and Buddy looks at whatever is currently on your screen — a graph,
a website, a video, a game, a document — and lets you ask about it in plain
conversation, with follow-ups that stay grounded in what you were just
looking at.

This is the MVP build described in the project brief: floating companion,
global hotkeys, screen capture, a provider-agnostic vision-AI backend
(OpenAI / Anthropic / Google / local OpenAI-compatible endpoints),
conversational visual context, and local-only conversation storage.

## Tech stack

- **Electron** + **electron-vite** (main / preload / renderer split)
- **React + TypeScript** for both the main window and the floating companion
- Plain, hand-written CSS — a calm, dark, Claude-Desktop-inspired theme
- **electron-store** for local, on-disk settings + conversation persistence
  (a JSON document store — swapped in for SQLite to avoid native-module
  build friction; see `src/main/store.ts` for the note on migrating later)
- No cloud dependency beyond whichever AI provider you configure — nothing
  is sent anywhere unless you ask a question with screen capture on

## Getting started

This project's dependencies were **not** installed in the environment that
generated this code (no network access there), so the first thing to do
after extracting is:

```bash
npm install
npm run dev
```

`npm run dev` starts Electron with hot-reload for the renderer. On first
launch:

1. Open **Settings** and pick an AI provider (OpenAI, Anthropic, Google, or
   a local OpenAI-compatible endpoint like LM Studio/Ollama), then paste in
   an API key (skip this for a local endpoint).
2. Press the default hotkey **Alt+Shift+Space** anywhere on your desktop —
   the floating companion appears and captures your screen.
3. Ask it something: *"What am I looking at?"*

Default hotkeys (configurable in Settings → General):

| Action | Default |
|---|---|
| Open/focus companion | `Alt+Space` |
| Capture screen + open companion | `Alt+Shift+Space` |

## Building a Windows installer

```bash
npm run build:win
```

Produces an NSIS installer under `release/` via `electron-builder`. You'll
likely want to add a real app icon at `resources/icon.ico` and reference it
from the `build.win.icon` field in `package.json` before shipping.

## Project layout

```
src/
  main/            Electron main process
    providers/     Vision-AI provider abstraction (OpenAI/Anthropic/Google/local)
    store.ts        Local settings + conversation persistence
    contextManager.ts   In-memory "the screen is context" state
    screenCapture.ts     desktopCapturer-based screen/window capture
    hotkeys.ts       Global shortcut registration
    windows.ts       Main window + floating companion window creation
    ipcHandlers.ts    Wires renderer requests to the above
    index.ts          App bootstrap, tray icon
  preload/          contextBridge-exposed, narrowly-typed IPC surface
  renderer/         React UI — main window (index.html) + companion (companion.html)
  shared/           Types shared by all three layers (AppSettings, Conversation, …)
```

## What's implemented (MVP) vs. what's next

**Implemented:**
- Electron app with polished dark UI, main window + floating companion
- Global hotkeys (configurable)
- Full-screen and active-window capture (multi-monitor aware via Electron's
  `screen` module)
- Provider-agnostic vision chat (OpenAI, Anthropic, Google Gemini, and any
  OpenAI-compatible local endpoint)
- Persistent visual context per conversation, so follow-ups ("why?", "what
  about k?") stay grounded in the last screenshot without re-capturing
- Local conversation history: create, rename (via title-on-first-message),
  delete, search, continue
- Settings: hotkeys, capture mode, provider/model/API key, privacy
  (screenshot/conversation retention, cloud-processing toggle), appearance
- Graceful error handling surfaced as an inline chat message, never a
  frozen UI

**Deliberately deferred** (per the phased plan in the project brief — these
don't block the core experience and are the natural next milestones):
- Region-selection capture UI (currently falls back to full display)
- OCR pipeline (the provider layer already accepts `ocrText` — wiring in an
  OCR engine, e.g. Tesseract, is additive and doesn't touch anything else)
- Screen annotation / pointer overlay
- Screen-change detection / throttled proactive mode
- Voice input/output
- Computer-use ("click that button") actions
- Windows code signing / auto-update

Everything above was designed so those slot in without restructuring: the
provider interface, context manager, and IPC layer are already
shaped for them.
