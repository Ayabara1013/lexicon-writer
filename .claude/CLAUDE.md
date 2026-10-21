# Lexicon Writer — Claude Memory

## What this is
A desktop writing suite for fiction authors (specifically LitRPG). Part of the "Lexicon" ecosystem.
Built with: **Electron 31 + electron-vite + React 18 + TypeScript + TipTap v2 + better-sqlite3 + DaisyUI v4**.

## Project path
`E:/Google Drive/Code Shit/lexicon-writer/`

## Stack summary
- **Electron 31** — desktop shell
- **electron-vite 2** — build tool (NOT webpack, NOT plain vite)
- **React 18 + TypeScript**
- **TipTap v2** (ProseMirror) — rich text editor (`@tiptap/react ^2.4`, `@tiptap/starter-kit ^2.4`)
- **better-sqlite3** — local SQLite DB (native module, rebuilt for Electron via electron-rebuild)
- **DaisyUI v4 + Tailwind CSS 3** — UI components, custom `lexicon` dark theme
- **@tailwindcss/typography** — for `prose` class (headings, body text)
- **@xyflow/react ^12.3** — React Flow canvas (corkboard + future canvas features)
- **simple-git** — git operations from main process
- **Inter font** — loaded via Google Fonts in index.html

## Critical constraints
- NO `"type": "module"` in package.json — breaks Electron preload (outputs .mjs instead of .js)
- Preload forced to CJS in electron.vite.config.ts: `{ format: 'cjs', entryFileNames: '[name].js' }`
- better-sqlite3 must be rebuilt: `npx electron-rebuild -f -w better-sqlite3`
- TipTap is v2 — do NOT use v3-only packages (e.g. `@tiptap/extension-drag-handle-react` v3 requires TipTap v3)
- `npm install` needs `--legacy-peer-deps` for some packages

## IPC pattern
```
Main process (ipc.ts) → ipcMain.handle('channel', handler)
Preload (index.ts) → contextBridge.exposeInMainWorld('api', { ... ipcRenderer.invoke })
Renderer → window.api.namespace.method()
```

## Database location
`app.getPath('userData')/lexicon-writer.db`

## DB schema
```sql
documents (id, title, type, content, created_at, updated_at, pos_x, pos_y, parent_id, sort_order)
settings  (key TEXT PRIMARY KEY, value TEXT)
canvases     (id, title, created_at, updated_at, deleted_at)
canvas_nodes (id, canvas_id, label, type, color, linked_doc_id, pos_x, pos_y, parent_id, group_id, collapsed, icon, shape,
              width, height, description, max_rank, point_cost, requirements /*JSON*/, prereq_mode, deleted_at)
canvas_edges (id, from_id, to_id, color, label, animated, edge_style, kind, min_rank, deleted_at)
```
- `parent_id` — sub-chapters (one level nesting, chapters only)
- `sort_order` — ordering, backfilled with rowid on migration
- `pos_x/pos_y` — corkboard canvas position
- Settings defaults: `is_pro=1`, `git_auto_commit=1`, `ollama_url=http://localhost:11434`, `ollama_model=qwen2.5`

## Git integration
- Repo lives at `app.getPath('userData')/repo/`
- Documents exported as markdown to `repo/chapters/` and `repo/notes/` before each commit (filename = doc.id, title/content inside)
- Auto-commit fires on launch + daily at 3am
- AI commit messages via Ollama/Qwen (if `is_pro=1` and `git_auto_commit=1`)
- Falls back to `"Writing session MM/DD/YYYY"` if Ollama unavailable
- `git` variable in git.ts is null until `initGit()` resolves — all functions call `assertReady()`
- `getStatus()` includes `repoPath` (shown in GitPanel + Settings)

### Git viewer (diff / word-count / changes / per-chapter history)
All diffs use `git --word-diff=plain` so prose is tracked at the WORD level (not lines). Output markers: additions `{+...+}`, deletions `[-...-]` — parsed in `git.ts` by `segmentsFromBody`/`parseWordDiff` into `{type:'context'|'add'|'del'|'hunk', text}` segments.
- `getCommitDiff(hash)` — per-file word-diff for one commit (`git show <hash> --word-diff=plain --format=%H%n%an%n%aI%n%s`)
- `getWordDeltas()` — short-hash → net word delta for recent commits, ONE `git log` call using `__LXW_COMMIT__%H` delimiter (do NOT use null-byte `%x00` format specifiers — they don't round-trip through the tooling)
- `getChanges()` — runs `exportDocs()` then returns changed files (new/modified/deleted) + working-tree diff (`git diff HEAD --word-diff`); uses `git add -N` so brand-new chapters appear. NOTE: opening the Changes tab writes markdown to disk (the export) — idempotent but a side effect.
- `getDocHistory(docId)` — commit log filtered to one doc's file (`chapters|notes/<id>.md`) with per-commit word deltas
- IPC: `git:commitDiff`, `git:wordDeltas`, `git:changes`, `git:docHistory`

## Canvas / talent tree builder (🌐 Canvas view)
Canvas types live ONCE in `shared/types.ts` (imported by main via relative path, by renderer via `@shared`).
- **Node types**: `skill | passive | stat | keystone` (talents) + `note` (links a doc) + `group` (container; members store pos relative to it via `group_id`)
- **Ranks**: `max_rank` (e.g. 5 → shows 0/5 pips), `point_cost` per rank, `requirements` JSON (`points_spent` tree/group, `level`, `custom` = not enforced), `prereq_mode` all/any
- **Sub-nodes** = `parent_id` (drives collapse, colour inheritance, layout). Creating one (Tab / drag link to empty space) also makes a prereq link. Drawing a link between existing nodes does NOT re-parent.
- **Link kinds** (`canvas_edges.kind`): `prereq` (from must reach `min_rank` before to), `exclusive` (only one side), `synergy`, `related` (no rules)
- **Rules** — `talent/rules.ts` (pure): `evaluate` / `allocate` / `refund` / `validate` (loops, impossible ranks, never-unlockable nodes). Tests: `npm test` (vitest, `talent/rules.test.ts`).
- **Preview mode** — ▶ Preview: budget + level, click = +1 rank, right-click = −1 (refund blocked if something depends on it). Allocations are NOT saved. Budget/level saved per canvas in settings `canvas_preview:<id>`.
- **Layout** — `talent/useForceLayout.ts` (🧲 Auto-arrange, d3-force live physics; persists positions once on settle via batch `canvas:updatePositions`; per-canvas setting `canvas_layout:<id>`), `talent/layout.ts` (⇵ Tidy = dagre one-shot, groups as clusters; `resolveLayout` refits groups + carries collapsed subtrees).
- **DB helpers**: `writeRow`/`updateRow` in db.ts are driven by `PRAGMA table_info`, so new columns automatically round-trip through undo snapshots (`restoreCanvasSnapshot`) and cloud upserts. Add a column = migration in `initDb` + type in `shared/types.ts` + (if editable) `NODE_EDITABLE`/`EDGE_EDITABLE`.
- **Cloud**: `supabase/migrations/*_talent_tree.sql` must be applied to the Supabase project before pushing canvases with the new columns.

## Key files
```
src/main/
  index.ts          — app entry, calls initDb, setupIpc, initGit, scheduleDailyCommit
  db.ts             — SQLite CRUD + settings + migrations
  ipc.ts            — all ipcMain.handle registrations
  git.ts            — simple-git wrapper (autoCommit, manualCommit, getStatus, branches, word-diff/changes/docHistory)

src/preload/
  index.ts          — contextBridge exposing window.api (docs, settings, git)

src/renderer/src/
  App.tsx           — root, manages docs state, view toggle (editor/corkboard/history)
  env.d.ts          — DocMeta, DocRow, GitStatus types + window.api global declaration
  components/
    Sidebar.tsx         — collapsible chapter tree with sub-chapters, tabs
    Editor.tsx          — TipTap editor with toolbar + SystemWindow extension
    Corkboard.tsx       — @xyflow/react canvas, doc cards, drag-to-reposition
    TalentCanvas.tsx    — talent tree / mind-map canvas (toolbar, context menus, preview mode, layout wiring)
    TalentNode.tsx      — node renderer (shapes per type, rank pips, cost badge, tooltip, preview states)
    CanvasInspector.tsx — right panel: node fields (ranks, cost, requirements…) / link kind + min rank
    FloatingEdge.tsx    — edge renderer (straight / spline / step, label)
    CorkboardNode.tsx   — custom XYFlow node (chapter/note cards)
    GitPanel.tsx        — two-pane: left = repo/GitHub config + branches + snapshot + History/Changes tabs + commit-graph list w/ word-delta badges; right = word-diff viewer. Props: filterDocId/onClearFilter (per-chapter history mode)
    SystemWindowView.tsx — React NodeView for LitRPG system windows
  extensions/
    SystemWindow.ts     — TipTap v2 node extension for LitRPG windows
  talent/
    model.ts            — node-type / link-kind metadata, requirement helpers
    rules.ts            — talent rules engine (+ rules.test.ts)
    layout.ts           — tree tidy (dagre) + shared group-fitting
    useForceLayout.ts   — live force layout hook (d3-force)

tailwind.config.js    — lexicon DaisyUI theme (base-100 #13111e, primary #7c6af7)
src/renderer/index.html — data-theme="lexicon", Inter font Google Fonts link
src/renderer/src/assets/index.css — prose colour overrides, font-family: Inter
```

## Views (App.tsx)
Three views toggled via buttons in main area header:
- `✏️ Editor` — TipTap manuscript editor
- `🗂 Corkboard` — XYFlow canvas with doc cards
- `🌐 Canvas` — talent tree / mind-map builder (see Canvas section)
- `⎇ History` — Git panel (branches, commits, AI snapshot, word-diff viewer, Changes tab, per-chapter history)

## Sidebar structure
- Two tabs: Chapters / Notes
- Chapters support one level of sub-chapters via `parent_id`
- Collapse/expand via chevron, shows `+N` badge when collapsed
- Hover actions: `⎇` (view version history — opens History filtered to this doc) + `+` (add sub-chapter, chapters only) + `✕` (delete)
- Double-click to rename inline
- `onViewHistory(id)` prop → App's `openDocHistory` → sets `historyFilterDoc` + navigates to history view. NavRail's History button clears the filter (shows all).

## LitRPG System Windows
Custom TipTap v2 node (`systemWindow`) insertable via `⚡ System` toolbar dropdown.
Types: status (blue), achievement (gold), quest (green), item (purple), skill (cyan), notification (slate).
Header (non-editable): type badge, title input, type switcher dropdown.
Content area: fully editable via NodeViewContent.

## Monetization flag
`settings.is_pro = '1'` (default ON — free during early access).
Feature gates wrap with `if (getSetting('is_pro') === '1')`.
Future: license key validation via server — gates already in place.

## Test data
Spellshot (user's own LitRPG novel) seeded from `C:/Users/jalla/Downloads/Spellshot(1).md` on first launch if DB is empty. Chapters parsed by regex, notes for key characters added.

## NEXT PRIORITIES (in order)
1. **Paragraph drag handles** — Notion-style block reordering in manuscript editor
   - TipTap v2 compatible approach needed (v3 extension won't work)

2. **Notion-style block editor for Notes tab**

3. **Talent tree follow-ups** (MVP done): saved builds per character (link to a doc), per-rank descriptions/costs, apply the Supabase migration, canvas in the web app

## BACKLOG (not started)
- Slash command menu (`/` triggers block picker)
- Text alignment, color, highlight
- H3/H4 headings, blockquote, code block, tables, image embed
- More LitRPG window types (level-up, inventory)
- Word/chapter target goals + progress bar
- Focus/typewriter mode
- Export to .docx and .pdf
- Scene metadata (status, POV, location tags)
- Revision snapshots (named point-in-time saves) — git-backed
- Inline comments and markup
- Automatic local backup copies
- Auto-closing pairs (VS Code-style) — type `"`/`'`/`(`/`[` and get the closing char auto-inserted with cursor between; press the closing char or Tab to skip past it. Custom TipTap v3 extension intercepting keypresses. NOT the same as smart-typography curly-quote substitution.
