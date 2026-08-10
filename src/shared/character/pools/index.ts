import racesJson from './races.json'
import gendersJson from './genders.json'
import jobsJson from './jobs.json'
import traitsJson from './traits.json'
import type { Gender, Job, Pools, Race, Trait } from '../types'

export const pools: Pools = {
  races: racesJson as Race[],
  genders: gendersJson as Gender[],
  jobs: jobsJson as Job[],
  traits: traitsJson as Trait[]
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

export const raceSources = unique(pools.races.map((r) => r.source))
export const jobSources = unique(pools.jobs.map((j) => j.source))
export const jobCategories = unique(pools.jobs.map((j) => j.category))
