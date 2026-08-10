# Character generator pools

The fantasy character generator rolls from four JSON pools in
`src/shared/character/pools/`. They are plain data — adding entries needs no code changes.

| File            | What it holds                                              |
| --------------- | ---------------------------------------------------------- |
| `races.json`    | Races / ancestries / species                                |
| `genders.json`  | Gender identities, each with the pronoun sets that suit it  |
| `jobs.json`     | Classes, trades, and professions                            |
| `traits.json`   | Personality traits and lore hooks                           |

`src/shared/character/generator.ts` picks one race, one gender identity (plus one of its
pronoun sets), one job, and 3–5 traits. Trait rolls always include at least one `lore` entry,
so every character comes with a history rather than just a mood.

## Entry format

Every file is a JSON array with **one entry per line**, so nightly additions produce clean diffs.

```jsonc
// races.json
{ "id": "wood-elf", "name": "Wood Elf", "source": "D&D 5e", "tags": ["elf", "wilderness"], "description": "Quiet-footed forest dwellers who trust the treeline more than any road." }

// genders.json — pronouns is a list; the generator picks one per character
{ "id": "genderfluid", "name": "Genderfluid", "source": "Contemporary", "pronouns": ["they/them", "she/he/they"], "tags": ["nonbinary"], "description": "Their gender shifts over days or seasons, and they'll tell you where it's landed." }

// jobs.json — category drives the job-category filter in the UI
{ "id": "job-curse-breaker", "name": "Curse-breaker", "source": "Fantasy trade", "category": "occult", "description": "Unpicks other people's bad bargains, one clause at a time." }

// traits.json — kind is either "personality" or "lore"
{ "id": "l-hag-debt", "name": "Owes a debt to a hag", "kind": "lore", "tags": ["debt"], "description": "The favour was granted. The price hasn't been named yet." }
```

Rules the validator enforces:

- `id` is unique within its file and lowercase kebab-case.
- `name` is unique within its file (case-insensitive).
- `description` is a non-empty string under 200 characters.
- `tags` is optional; when present it's an array of non-empty strings.
- No fields beyond the ones shown above.
- `traits.json` keeps at least 10 entries of each `kind`.

Run it with:

```
npm run validate:pools
```

## Style guide for new entries

Write for a novelist, not a rulebook. Each description should be one sentence that gives a
writer something to work with — a tension, a habit, a consequence. Prefer the specific
("counts the copper twice") to the abstract ("frugal").

- **Races** — say what they are and one thing about how they move through the world.
  Keep the mechanics out; this is flavour, not stat blocks.
- **Gender identities** — treat them plainly and respectfully. Contemporary identities get
  contemporary descriptions; fantasy-native ones (`source: "Original"`) should be grounded in
  a culture, a body, or a magic rather than being a joke. Give each entry pronoun sets that
  a person with that identity might actually use, and include more than one where it fits.
- **Jobs** — mix adventuring classes with ordinary trades. A tavernkeep is as useful to a
  writer as a warlock.
- **Traits** — `personality` traits are how someone behaves day to day; `lore` traits are
  hooks with a story already attached and, ideally, an unresolved question.

`source` values currently in use: `D&D 5e`, `Pathfinder 1e`, `Pathfinder 2e`, `Folklore`,
`Original` (races); `Contemporary`, `Original` (genders); `D&D 5e`, `Pathfinder 1e`,
`Pathfinder 2e`, `Mundane`, `Fantasy trade` (jobs). Reuse an existing value where one fits,
since each distinct source becomes a filter chip in the UI.

Only add material you can describe in your own words. Don't copy statblock text or
descriptions verbatim from published books.

## Nightly expansion

A scheduled routine adds a handful of entries to each pool every night — see
[`nightly-pool-expansion.md`](./nightly-pool-expansion.md).
