# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (hot reload)
npm run dev

# Build for production (outputs to www/)
npm run build

# Preview production build
npm run preview

# Sync build to Capacitor Android
npm run cap:sync

# Open Android project in Android Studio
npm run cap:open
```

## Project Overview

刷题通 (ShuaTiTong) is a pure frontend interactive quiz app. It supports four question types: single-choice, multiple-choice, true/false (judge), and fill-in-the-blank.

**Two distribution modes:**
- **Standalone HTML** (`shuatitong.html` + `merged_questions.json`): Double-click to open in browser, upload JSON to start. No build step, self-contained.
- **Vite-built app** (`index.html` + `src/`): Full TypeScript development setup with Capacitor for Android APK packaging. Run `npm run dev` for development.

## Architecture

### Entry Point
- [index.html](index.html) — Vite entry, loads `src/main.ts`
- [shuatitong.html](shuatitong.html) — Standalone single-file version (self-contained, no build step)

### Source Structure (`src/`)
```
src/
├── main.ts           # Entry: DOM refs, event binding, render orchestration
├── types.ts          # Core types (Question, AppState, ExamState, RenderConfig, etc.)
├── state.ts          # Singleton Store class — all app state, pub/sub
├── storage.ts        # localStorage persistence layer
├── filter.ts         # Question filtering by type / wrong-questions
├── format.ts         # Markdown→HTML conversion, auto-explanation generation
├── ai.ts             # AI integration (fetch AI explanation, grade fill answers)
├── styles.css        # All styles with CSS custom properties (light/dark)
├── renderers/        # Strategy-pattern question renderers
│   ├── index.ts      # Renderer dispatcher (selects renderer by question type)
│   ├── single.ts     # SingleRenderer — also handles judge questions
│   ├── multi.ts      # MultiRenderer — checkbox-style with submit button
│   └── fill.ts       # FillRenderer — text inputs + optional AI grading
└── ui/               # UI components
    ├── theme.ts      # Dark/light theme toggle
    ├── settings.ts   # AI API settings modal (API key, model, base URL)
    ├── errorBook.ts  # Error review list with click-to-jump
    ├── examMode.ts   # Exam setup modal, exam results display
    └── questionGrid.ts # Thumbnail navigation grid
```

### Data Flow
```
User action → Store mutation (state.ts) → renderQuestion() (main.ts) → updateStats() + store.save()
```

The `Store` class in [state.ts](src/state.ts) is a singleton managing:
- `AppState`: questions, currentIndex, filterType, counts, answeredMap, errorBook
- `ExamState`: exam questions, answers, current index (separate from practice mode)
- `AISettings`: API key, base URL, model name
- `recentFiles`: Recently loaded question files (persisted)

All persistence goes through [storage.ts](src/storage.ts) using localStorage.

### Key Design Details
- **Undo**: Single-level undo (last answer) tracked via `undoInfo` in main.ts
- **Renderers**: Each renderer implements `QuestionRenderer` interface (render, showAnswer, destroy). `SingleRenderer` handles both `single` and `judge` types.
- **Exam mode**: Separate state path in `Store` — doesn't interfere with practice progress. Questions are shuffled, results shown as scorecard.
- **AI integration**: OpenAI-compatible API (DeepSeek default). Used for: generating explanations (`fetchAIExplanation`) and grading fill-in-the-blank answers (`gradeFillAnswer`).
- **Thumbnail grid**: Numbered question grid for quick navigation, color-coded by answer status.
- **No test framework** is currently configured.

### Capacitor / APK
- Config: [capacitor.config.json](capacitor.config.json) — appId `com.shuatitong.app`, versionCode 2
- Build output directory: `www/` (vite.config.ts base: `'./'`)
- CI: [.github/workflows/build-apk.yml](.github/workflows/build-apk.yml) — GitHub Actions auto-builds APK on push

### Question JSON Format
See [README.md](README.md) for full schema. Four question types:
- `single` — single choice with A/B/C/D options, click to answer
- `judge` — true/false, options fixed as A(正确)/B(错误)
- `multi` — multiple choice, select then submit (answer is concatenated string e.g. "ACD")
- `fill` — fill-in-the-blank, supports local exact-match grading or AI grading
