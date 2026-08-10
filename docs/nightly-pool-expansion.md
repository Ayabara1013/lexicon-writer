# Nightly pool expansion

A scheduled Claude Code routine runs once a night and grows the character generator pools by a
handful of entries each. This file is the task definition — the routine's prompt points here, so
changing this file changes what the routine does.

## The task

1. Read [`character-pools.md`](./character-pools.md) for the entry format and style guide.
2. Read all four pool files in `src/shared/character/pools/` in full, so you know what already exists.
3. Add new entries:
   - **5** to `races.json`
   - **3** to `genders.json`
   - **5** to `jobs.json`
   - **8** to `traits.json` (roughly 5 personality, 3 lore)
4. Run `npm run validate:pools`. Fix anything it reports.
5. Run `npm run typecheck`.
6. Commit to the branch `claude/nightly-character-pools` and open (or update) a **draft** PR
   titled `Nightly character pool expansion — <date>`. If a draft PR for that branch is already
   open, push onto it rather than opening a second one.

Nothing outside `src/shared/character/pools/*.json` should change. If a pool needs a code change
to support a new idea, note it in the PR description instead of making it.

## What "new" means

Don't repeat what's there. Before adding, check the existing `name` values in the file — the
validator rejects exact duplicates, but near-duplicates ("Stubborn" vs "Stubborn to a fault")
are just as unwelcome and it won't catch those.

Each night, push into territory the pools cover thinly. Rotate deliberately:

- **Races** — the pools lean heavily on D&D 5e. Prefer Pathfinder ancestries and heritages, and
  world folklore from outside western Europe (attributed as `Folklore`), or invent something with
  `source: "Original"`. Avoid adding yet another elf variant.
- **Genders** — this pool grows slowest and should stay careful rather than large. Contemporary
  identities only where a real one is genuinely missing; otherwise add fantasy-native framings
  (`source: "Original"`) rooted in a specific culture, body, or magic, or add pronoun sets to
  existing entries where a set is plainly missing. Never write one as a punchline. Three entries
  is a ceiling, not a quota — add fewer, or only pronoun additions, if nothing good is missing.
- **Jobs** — keep the mix roughly half mundane trades, half classes and fantasy professions. Underused
  categories are worth targeting: `medical`, `courtly`, `maritime`, `elemental`.
- **Traits** — lore hooks should raise a question the writer can answer. Personality traits should
  be observable behaviour, not adjectives.

## Guardrails

- Descriptions must be original prose. Never copy text from published sourcebooks; name a race or
  class that exists in D&D or Pathfinder if you like, but describe it yourself.
- Keep the tone of the existing entries: dry, specific, novelist-facing.
- Stay under the 200-character description limit — the validator enforces it.
- If the working tree is dirty or the branch has conflicts, stop and say so in the PR rather than
  forcing anything through.
