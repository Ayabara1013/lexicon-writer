# lexicon-writer

A writing suite and knowledge base tool — part of the Lexicon ecosystem.

```
npm install
npm run dev
```

## Character generator

Open **🎲 Character Generator** in the sidebar to roll a fantasy character: race, gender identity
(with pronouns), job, and 3–5 personality and lore traits, drawn from D&D, Pathfinder, folklore,
and original material.

- Lock any field and reroll the rest
- Filter by source (D&D 5e, Pathfinder, Folklore, Original…) and job category
- Copy as Markdown, or save straight into your Notes

The pools live in `src/shared/character/pools/` as plain JSON and are grown nightly by a scheduled
routine. See [`docs/character-pools.md`](docs/character-pools.md) to add entries by hand.

## Scripts

| Command                  | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `npm run dev`            | Run the app in development                    |
| `npm run build`          | Build main, preload, and renderer bundles      |
| `npm run typecheck`      | Type-check both TypeScript projects            |
| `npm run validate:pools` | Check the character generator pools are valid  |
