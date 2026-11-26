import racesJson from './races.json'
import gendersJson from './genders.json'
import jobsJson from './jobs.json'
import traitsJson from './traits.json'
import genresJson from './genres.json'
import type { Gender, Job, Pools, Race, Trait } from '../types'

export const pools: Pools = {
  races: racesJson as Race[],
  genders: gendersJson as Gender[],
  jobs: jobsJson as Job[],
  traits: traitsJson as Trait[]
}

/** Matches every genre; never offered as a choice itself. */
export const GENERIC_GENRE = 'generic'
/** What an entry without a `genres` field counts as. */
export const DEFAULT_GENRE = 'fantasy'

/** Genres a character can be generated for. */
export const genres: string[] = (genresJson as string[]).filter((g) => g !== GENERIC_GENRE)

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}
