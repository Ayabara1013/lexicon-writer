# Character generator pools

The character generator rolls from four JSON pools in
`src/shared/character/pools/`. They are plain data — adding entries needs no code changes.
Each entry says which genres it fits (see [Genres](#genres)); the generator only rolls entries
for the genre the user picked.

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

// any file — genres is optional; see "Genres" below
{ "id": "p-blunt", "name": "Blunt to a fault", "kind": "personality", "tags": ["social"], "genres": ["generic"], "description": "Says the true thing first and considers the damage afterwards." }
```

Rules the validator enforces:

- `id` is unique within its file and lowercase kebab-case.
- `name` is unique within its file (case-insensitive).
- `description` is a non-empty string under 200 characters.
- `tags` is optional; when present it's an array of non-empty strings.
- `genres` is optional; when present it's a non-empty list of values from `genres.json`, with
  no repeats, and `generic` only ever appears on its own.
- No fields beyond the ones shown above.
- `traits.json` keeps at least 10 entries of each `kind`.

Run it with:

```
npm run validate:pools
```

## Genres

The genres that exist are listed in `src/shared/character/pools/genres.json`. An entry's
`genres` field lists every genre it fits:

| `genres`                  | Meaning                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| _(field omitted)_         | Fantasy only. Every entry written before genres existed is this.   |
| `["scifi"]`               | Sci-fi only.                                                       |
| `["fantasy", "scifi"]`    | Fits both, but not every genre.                                    |
| `["generic"]`             | Fits any setting, including genres added later.                    |

`generic` means the entry would read naturally in *any* setting — no swords, starships,
coppers, gods by name, or other furniture that ties it to one world. "Trusts slowly" is generic;
"Splits every bill to the exact copper" is not, because of the copper. If an entry fits several
genres but not all of them (a chimney sweep fits fantasy and a future steampunk genre, not
sci-fi), list them explicitly instead.

A realistic present-day setting will be its own genre (`modern`) when it's added — it is not the
same thing as `generic`.

To add a genre, add one line to `genres.json`. The generator only offers a genre once every pool
— races, gender identities, jobs, personality traits, and lore traits — has at least 5 entries
that fit it, so a genre can be seeded gradually without the UI showing a half-empty mode.

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

- **Sci-fi entries** — same voice: dry, specific, novelist-facing. A species is a people with
  habits, not a planet's stat block; a job is something a person does on a shift, not a rank in a
  fleet. Don't lift named species or ships from existing franchises; invent, or describe a
  published one in your own words.

`source` values currently in use: `D&D 5e`, `Pathfinder 1e`, `Pathfinder 2e`, `Folklore`,
`Original` (races); `Contemporary`, `Original` (genders); `D&D 5e`, `Pathfinder 1e`,
`Pathfinder 2e`, `Mundane`, `Fantasy trade` (jobs). For sci-fi, use `Original` or `Starfinder`
for races and `Mundane` or `Sci-fi trade` for jobs. Reuse an existing value where one fits,
since each distinct source becomes a filter chip in the UI (chips only show for the chosen genre).

Only add material you can describe in your own words. Don't copy statblock text or
descriptions verbatim from published books.

## Nightly expansion

A scheduled routine adds a handful of entries to each pool every night — see
[`nightly-pool-expansion.md`](./nightly-pool-expansion.md).
