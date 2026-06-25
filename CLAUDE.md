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

刷题通 (ShuaTiTong) is a pure frontend interactive quiz app.

## Architecture

### Entry Point
- [index.html](index.html) — Vite entry, loads `src/main.ts`
- [shuatitong.html](shuatitong.html) — Standalone single-file version (self-contained, no build step, may be outdated)

### Source Structure (`src/`)
```
src/
├── main.ts           # Entry: DOM refs, event binding, render orchestration, exam history UI
├── types.ts          # Core types (Question, AppState, ExamState, RenderConfig, ExamRecord, AISettings)
├── state.ts          # Singleton Store class — all app state, pub/sub
├── storage.ts        # localStorage persistence layer (4 keys: state, AI settings, recent files, exam records)
├── filter.ts         # Question filtering by type / wrong / exam-review
├── format.ts         # Markdown→HTML conversion, auto-explanation generation
├── ai.ts             # AI integration (fetch AI explanation, grade fill answers)
├── icons.ts          # 20 feather-style SVG icons + helper functions
├── styles.css        # All styles with CSS custom properties (light/dark)
├── renderers/        # Strategy-pattern question renderers
│   ├── index.ts      # Renderer dispatcher (selects renderer by question type)
│   ├── single.ts     # SingleRenderer — handles both single and judge questions
│   ├── multi.ts      # MultiRenderer — checkbox-style with submit button
│   └── fill.ts       # FillRenderer — text inputs + optional AI/local grading
└── ui/               # UI components
    ├── theme.ts      # Dark/light theme toggle
    ├── settings.ts   # AI API settings modal (API key, model, base URL, AI mode toggle)
    ├── errorBook.ts  # Error review list with click-to-jump
    ├── examMode.ts   # Exam setup modal, exam results display, exam record saving
    └── questionGrid.ts # Thumbnail navigation grid
```

### Data Flow
```
User action → Store mutation (state.ts) → renderQuestion() (main.ts) → updateStats() + store.save()
```

The `Store` class in [state.ts](src/state.ts) is a singleton managing:
- `AppState`: questions, currentIndex, filterType, counts, answeredMap, errorBook, examErrorFilter
- `ExamState`: exam questions, answers (original keys), answerDisplay (shuffled display letters), current index, gradeDetails, sections
- `AISettings`: API key, base URL, model name, aiMode (detailed | simple)
- `recentFiles`: Recently loaded question files (persisted to localStorage)
- `examRecords`: Last 5 exam results with wrongIds (persisted to localStorage)

### Key Design Details
- **Renderers**: Each renderer implements `QuestionRenderer` interface (`render`, `showAnswer`, `destroy`). `SingleRenderer` handles both `single` and `judge` types. Dispatcher in `renderers/index.ts` manages lifecycle, destroying previous renderer before rendering new question.
- **Exam mode**: Separate state path in `Store`. Questions are grouped by type, shuffled within type, and presented with shuffled options (re-labeled A/B/C/D). `answerDisplay` maps question IDs to the display letters the user saw during the exam. Grading uses original keys.
- **AI integration**: OpenAI-compatible API (DeepSeek default). Two modes:
  - `detailed`: Opens side drawer (desktop) or inline (mobile) with full explanation
  - `simple`: Shows concise error-spotting inline in feedback area, per-option format with ✅/❌
  - Falls back to local `autoExplanation()` on AI failure
- **AI fill grading**: `gradeFillAnswer()` calls LLM to judge fill-in-the-blank answers, falls back to local exact match on failure.
- **Question filtering**: `filter.ts` supports 'all', 'single', 'multi', 'judge', 'fill', 'wrong' (error book), and 'exam-review' (filtered by `examErrorFilter` ID array).
- **SVG icon system**: `icons.ts` exports 20 feather-style SVG strings and helper functions (`setIcon`, `upgradeIcon`). Icons are 20×20 viewBox, 1.5px stroke.
- **Exam history**: After grading an exam, record saved to localStorage (max 5). Collapsible UI section shows date/score/"错题重练" button/"删除" button. "错题重练" starts a filtered practice session (`filterType='exam-review'`) using stored wrongIds.
- **Thumbnail grid**: Numbered question grid for quick navigation, color-coded by answer status (correct/wrong/answered).
- **Keyboard shortcuts**: ArrowLeft/Right for navigation, Space for random, A-E for option selection, Enter for submit.
- **No test framework** is currently configured.

### Persistence (localStorage)
- `shuatitong_state`: AppState (questions, progress, filter state)
- `shuatitong_ai_settings`: API key, base URL, model, aiMode
- `shuatitong_recent`: Recently loaded files (max 10)
- `shuatitong_exam_records`: Exam history records (max 5)

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
