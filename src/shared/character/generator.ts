import { pools } from './pools'
import type { Character, Gender, Job, Race, Trait } from './types'

export const TRAIT_MIN = 3
export const TRAIT_MAX = 5

export type GenerateOptions = {
  /** Restrict races to these sources. Empty or omitted means "any". */
  raceSources?: string[]
  /** Restrict jobs to these sources. Empty or omitted means "any". */
  jobSources?: string[]
  /** Restrict jobs to these categories. Empty or omitted means "any". */
  jobCategories?: string[]
  /** How many traits to roll. Omitted means a random count between TRAIT_MIN and TRAIT_MAX. */
  traitCount?: number
  /** Injectable randomness, mostly so tests and the CLI can be deterministic. */
  random?: () => number
}

/** Fields carried over from a previous roll — this is how the UI implements locks. */
export type KeptFields = Partial<Pick<Character, 'race' | 'gender' | 'pronouns' | 'job' | 'traits'>>

export class EmptyPoolError extends Error {
  constructor(what: string) {
    super(`No ${what} match the current filters — widen them and try again.`)
    this.name = 'EmptyPoolError'
  }
}

function pick<T>(items: T[], what: string, random: () => number): T {
  if (items.length === 0) throw new EmptyPoolError(what)
  return items[Math.floor(random() * items.length)]
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function matchesAny(value: string, allowed?: string[]): boolean {
  return !allowed || allowed.length === 0 || allowed.includes(value)
}

export function filterRaces(options: GenerateOptions = {}): Race[] {
  return pools.races.filter((race) => matchesAny(race.source, options.raceSources))
}

export function filterJobs(options: GenerateOptions = {}): Job[] {
  return pools.jobs.filter(
    (job) => matchesAny(job.source, options.jobSources) && matchesAny(job.category, options.jobCategories)
  )
}

function clampTraitCount(count: number): number {
  return Math.min(TRAIT_MAX, Math.max(TRAIT_MIN, Math.round(count)))
}

/**
 * Rolls 3–5 traits with a deliberate mix: mostly personality, always at least one
 * lore hook, so a character reads as a person with a history rather than a list of moods.
 */
export function pickTraits(options: GenerateOptions = {}): Trait[] {
  const random = options.random ?? Math.random
  const total =
    options.traitCount === undefined
      ? TRAIT_MIN + Math.floor(random() * (TRAIT_MAX - TRAIT_MIN + 1))
      : clampTraitCount(options.traitCount)

  const personality = shuffle(pools.traits.filter((t) => t.kind === 'personality'), random)
  const lore = shuffle(pools.traits.filter((t) => t.kind === 'lore'), random)

  const wantedLore = Math.min(lore.length, Math.max(1, Math.round(total * 0.4)))
  const chosen = [...personality.slice(0, total - wantedLore), ...lore.slice(0, wantedLore)]

  // If one kind ran short, top up from whatever is left rather than returning too few.
  if (chosen.length < total) {
    const taken = new Set(chosen.map((t) => t.id))
    chosen.push(...shuffle(pools.traits, random).filter((t) => !taken.has(t.id)).slice(0, total - chosen.length))
  }

  if (chosen.length === 0) throw new EmptyPoolError('traits')
  return shuffle(chosen, random)
}

export function pickPronouns(gender: Gender, random: () => number = Math.random): string {
  return gender.pronouns.length > 0 ? pick(gender.pronouns, 'pronoun sets', random) : 'they/them'
}

/**
 * Builds a character. Anything passed in `keep` is carried over untouched, which is
 * how "lock this field and reroll the rest" works.
 */
export function generateCharacter(options: GenerateOptions = {}, keep: KeptFields = {}): Character {
  const random = options.random ?? Math.random

  const race = keep.race ?? pick(filterRaces(options), 'races', random)
  const gender = keep.gender ?? pick(pools.genders, 'gender identities', random)
  const pronouns = keep.gender && keep.pronouns ? keep.pronouns : pickPronouns(gender, random)
  const job = keep.job ?? pick(filterJobs(options), 'jobs', random)
  const traits = keep.traits ?? pickTraits(options)

  return { race, gender, pronouns, job, traits }
}

export function characterTitle(character: Character): string {
  return `${character.race.name} ${character.job.name}`
}

export function toMarkdown(character: Character): string {
  const lines = [
    `# ${characterTitle(character)}`,
    '',
    `**Race:** ${character.race.name} _(${character.race.source})_ — ${character.race.description}`,
    `**Gender identity:** ${character.gender.name} (${character.pronouns}) — ${character.gender.description}`,
    `**Job:** ${character.job.name} _(${character.job.source}, ${character.job.category})_ — ${character.job.description}`,
    '',
    '## Traits',
    ''
  ]
  for (const trait of character.traits) {
    lines.push(`- **${trait.name}** _(${trait.kind})_ — ${trait.description}`)
  }
  return lines.join('\n')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** TipTap-friendly HTML, so a generated character can be saved straight into a note. */
export function toHtml(character: Character): string {
  const e = escapeHtml
  const traits = character.traits
    .map((t) => `<li><strong>${e(t.name)}</strong> <em>(${e(t.kind)})</em> — ${e(t.description)}</li>`)
    .join('')

  return [
    `<h1>${e(characterTitle(character))}</h1>`,
    `<p><strong>Race:</strong> ${e(character.race.name)} <em>(${e(character.race.source)})</em> — ${e(character.race.description)}</p>`,
    `<p><strong>Gender identity:</strong> ${e(character.gender.name)} (${e(character.pronouns)}) — ${e(character.gender.description)}</p>`,
    `<p><strong>Job:</strong> ${e(character.job.name)} <em>(${e(character.job.source)}, ${e(character.job.category)})</em> — ${e(character.job.description)}</p>`,
    `<h2>Traits</h2>`,
    `<ul>${traits}</ul>`
  ].join('\n')
}
