export type PoolItem = {
  id: string
  name: string
  description: string
  tags?: string[]
}

export type Race = PoolItem & {
  /** Where the race comes from, e.g. "D&D 5e", "Pathfinder 2e", "Folklore", "Original". */
  source: string
}

export type Gender = PoolItem & {
  source: string
  /** Pronoun sets that suit this identity; one is chosen per character. */
  pronouns: string[]
}

export type Job = PoolItem & {
  source: string
  /** Loose grouping: martial, arcane, divine, criminal, artisan, maritime… */
  category: string
}

export type TraitKind = 'personality' | 'lore'

export type Trait = PoolItem & {
  kind: TraitKind
}

export type Pools = {
  races: Race[]
  genders: Gender[]
  jobs: Job[]
  traits: Trait[]
}

export type Character = {
  race: Race
  gender: Gender
  pronouns: string
  job: Job
  traits: Trait[]
}

export type CharacterField = keyof Character
