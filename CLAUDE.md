# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server (hot reload) — runs on localhost:5174
npm run build      # Build production → www/
npm run preview    # Preview production build
npm run cap:sync   # Sync build to Capacitor Android
npm run cap:open   # Open Android project in Android Studio

# Sync backend
node server/index.js                    # 启动后端 :3001 (局域网)
bash server/tunnel.sh                   # 启动后端 + 公网穿透隧道
npm run cap:sync   # Sync build to Capacitor Android
npm run cap:open   # Open Android project in Android Studio
```

## Project Overview

**刷题通 (ShuaTiTong)** — Pure frontend interactive quiz app. No backend. Runs in browser or as Android APK (Capacitor).

Data flow: User action → Store mutation → `renderQuestion()` → `updateStats()` + `store.save()`.

## Architecture

### Entry Points

- `index.html` — Vite dev entry, loads `src/main.ts`
- `shuatitong.html` — Standalone single-file version (self-contained, may be outdated)

### Source Structure

```
src/
├── main.ts           # DOM refs, event binding, render orchestration, dev mode login
├── types.ts          # Core types: Question, ContentBlock, AppState, ExamState, AISettings
├── state.ts          # Singleton Store — all app state, persistence save/restore
├── storage.ts        # localStorage persistence (4 keys)
├── filter.ts         # Question filtering by type / wrong / exam-review / adapted / search
├── format.ts         # ContentBlock → HTML rendering (text, formula/katex, code, image)
├── ai.ts             # AI: fetch explanation (detailed drawer + simple inline), grade fill answers
├── icons.ts          # SVG icon set (feather-style, 20×20, 1.5px stroke)
├── styles.css        # All styles with CSS custom properties (light/dark)
├── renderers/        # Strategy pattern question renderers
│   ├── index.ts      # Dispatcher — selects renderer by type, manages lifecycle
│   ├── single.ts     # SingleRenderer — handles both single and judge types
│   ├── multi.ts      # MultiRenderer — checkboxes + submit button
│   └── fill.ts       # FillRenderer — text inputs + local/AI grading
├── ui/
│   ├── theme.ts      # Dark/light theme toggle
│   ├── settings.ts   # Settings modal: remote + local model config, feature-to-model mapping
│   ├── editor.ts     # Dev mode: edit questions, insert new, image upload, export JSON
│   ├── adapt.ts      # AI adaptation: convert question types (single→multi, any→fill)
│   ├── aidebug.ts    # AI debug chat interface (dev mode)
│   ├── errorBook.ts  # Error review list with click-to-jump
│   ├── examMode.ts   # Exam setup, results, record saving
│   └── questionGrid.ts # Thumbnail navigation grid
└── parsers/
    └── index.ts      # File upload parser: Excel/Word → text → AI → JSON
```

### ContentBlock Format

Questions use structured content blocks for rich rendering:

```typescript
type ContentBlock =
  | { t: 'text';  c: string }                    // Plain text
  | { t: 'f';     c: string; d?: boolean }        // LaTeX formula (d=true → display mode)
  | { t: 'code';  c: string }                     // Code block
  | { t: 'image'; c: string; alt?: string };      // Image (base64 data URL or file path)
```

`Question.question` and `Question.options` accept both `ContentBlock[]` and legacy `string` (backward compatible).

### AI Integration

All AI calls use OpenAI-compatible API (DeepSeek default, configurable). Two model profiles:

- **Remote** — cloud API (DeepSeek, OpenAI, etc.)
- **Local** — local model (Ollama, etc.)

Each feature has its own model assignment via settings:

| Feature | Setting | Files |
|---------|---------|-------|
| AI 解析/纠错 | `modelForAI` | `ai.ts` |
| AI 改编 | `modelForAdapt` | `ui/adapt.ts` |
| AI 解析导入 | `modelForParse` | `parsers/index.ts` |

AI functions use `store.getApiConfig(preference)` to get the correct API parameters.

### Dev Mode

Protected by password (default root/linux). Toggle via header button. Enables:

- ✏️ Edit question: text/option editing, image upload (file + clipboard paste)
- ＋ Insert new question: form with type selector, options editor, image upload, JSON import
- ✕ Delete question
- 🤖 AI adaptation (single→multi, any→fill)
- 📥 Export modified JSON
- `</>` AI debug chat

### File Upload (Excel/Word)

Non-JSON files go through a 5-step pipeline:

1. Extract raw text (xlsx via `xlsx` library, docx via `mammoth`)
2. User reviews/edits text in a modal
3. AI converts text to structured JSON
4. User previews the result
5. Import to app

### State (localStorage)

- `shuatitong_state` — Full AppState (questions, progress, filter, search query)
- `shuatitong_ai_settings` — API key, base URL, model names, feature-to-model mapping, dev mode credentials
- `shuatitong_recent` — Recently loaded files (max 10)
- `shuatitong_exam_records` — Exam history (max 5)

### Key Design Details

- **Renderers**: Strategy pattern. `SingleRenderer` handles both `single` and `judge`. Dispatcher destroys previous renderer before rendering new question.
- **Exam mode**: Questions grouped by type, shuffled within type, options re-labeled. `answerDisplay` tracks shuffled labels for user-facing display. Grading uses original keys.
- **Filters**: all / single / multi / judge / fill / wrong / exam-review / adapted. Search query filters by text content across questions and options.
- **No test framework** configured.
- **Capacitor**: Build output in `www/` (base `'./'`). APK auto-built by GitHub Actions on push.
