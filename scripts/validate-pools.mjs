#!/usr/bin/env node
// Validates the character generator pools. Run with: npm run validate:pools
// Used by the nightly pool-expansion routine as a gate before anything is committed.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const poolDir = join(root, 'src/shared/character/pools')

const SCHEMAS = {
  'races.json': { required: ['id', 'name', 'source', 'description'], optional: ['tags', 'genres'] },
  'genders.json': { required: ['id', 'name', 'source', 'pronouns', 'description'], optional: ['tags', 'genres'] },
  'jobs.json': { required: ['id', 'name', 'source', 'category', 'description'], optional: ['tags', 'genres'] },
  'traits.json': { required: ['id', 'name', 'kind', 'description'], optional: ['tags', 'genres'] }
}

const TRAIT_KINDS = ['personality', 'lore']
const MIN_TRAITS_PER_KIND = 10
// Keep in sync with GENERIC_GENRE / DEFAULT_GENRE in src/shared/character/pools/index.ts.
const GENERIC_GENRE = 'generic'
const DEFAULT_GENRE = 'fantasy'

const errors = []
const summary = []

let GENRES = []
try {
  GENRES = JSON.parse(readFileSync(join(poolDir, 'genres.json'), 'utf-8'))
  if (!Array.isArray(GENRES) || !GENRES.every(isNonEmptyString) || new Set(GENRES).size !== GENRES.length) {
    errors.push('genres.json: must be an array of unique non-empty strings')
  }
  for (const required of [GENERIC_GENRE, DEFAULT_GENRE]) {
    if (!GENRES.includes(required)) errors.push(`genres.json: must include "${required}"`)
  }
} catch (e) {
  errors.push(`genres.json: not valid JSON — ${e.message}`)
}

function fail(file, index, message) {
  errors.push(`${file}[${index}]: ${message}`)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

for (const [file, schema] of Object.entries(SCHEMAS)) {
  let items
  try {
    items = JSON.parse(readFileSync(join(poolDir, file), 'utf-8'))
  } catch (e) {
    errors.push(`${file}: not valid JSON — ${e.message}`)
    continue
  }

  if (!Array.isArray(items)) {
    errors.push(`${file}: top level must be an array`)
    continue
  }

  const ids = new Map()
  const names = new Map()
  const kindCounts = {}
  const sourceCounts = {}
  const genreCounts = {}

  items.forEach((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      fail(file, i, 'entry must be an object')
      return
    }

    for (const key of schema.required) {
      if (!(key in item)) fail(file, i, `missing required field "${key}"`)
    }
    for (const key of Object.keys(item)) {
      if (!schema.required.includes(key) && !schema.optional.includes(key)) {
        fail(file, i, `unknown field "${key}"`)
      }
    }

    for (const key of ['id', 'name', 'source', 'category', 'description']) {
      if (key in item && !isNonEmptyString(item[key])) fail(file, i, `"${key}" must be a non-empty string`)
    }

    if ('id' in item && isNonEmptyString(item.id)) {
      if (!/^[a-z0-9-]+$/.test(item.id)) fail(file, i, `id "${item.id}" must be lowercase kebab-case`)
      if (ids.has(item.id)) fail(file, i, `duplicate id "${item.id}" (also at index ${ids.get(item.id)})`)
      else ids.set(item.id, i)
    }

    if ('name' in item && isNonEmptyString(item.name)) {
      const key = item.name.toLowerCase()
      if (names.has(key)) fail(file, i, `duplicate name "${item.name}" (also at index ${names.get(key)})`)
      else names.set(key, i)
    }

    if ('description' in item && isNonEmptyString(item.description) && item.description.length > 200) {
      fail(file, i, 'description should stay under 200 characters')
    }

    if ('tags' in item && (!Array.isArray(item.tags) || !item.tags.every(isNonEmptyString))) {
      fail(file, i, 'tags must be an array of non-empty strings')
    }

    if ('genres' in item) {
      const genres = item.genres
      if (!Array.isArray(genres) || genres.length === 0 || !genres.every(isNonEmptyString)) {
        fail(file, i, 'genres must be a non-empty array of strings')
      } else {
        for (const genre of genres) {
          if (!GENRES.includes(genre)) fail(file, i, `unknown genre "${genre}" — add it to genres.json first`)
        }
        if (new Set(genres).size !== genres.length) fail(file, i, 'genres lists the same genre twice')
        if (genres.includes(GENERIC_GENRE) && genres.length > 1) {
          fail(file, i, `"${GENERIC_GENRE}" already means every genre, so list it alone`)
        }
      }
    }
    for (const genre of Array.isArray(item.genres) ? item.genres : [DEFAULT_GENRE]) {
      genreCounts[genre] = (genreCounts[genre] ?? 0) + 1
    }

    if (file === 'genders.json') {
      if (!Array.isArray(item.pronouns) || item.pronouns.length === 0 || !item.pronouns.every(isNonEmptyString)) {
        fail(file, i, 'pronouns must be a non-empty array of strings')
      }
    }

    if (file === 'traits.json') {
      if (!TRAIT_KINDS.includes(item.kind)) {
        fail(file, i, `kind must be one of ${TRAIT_KINDS.join(', ')}`)
      } else {
        kindCounts[item.kind] = (kindCounts[item.kind] ?? 0) + 1
      }
    }

    if (isNonEmptyString(item.source)) sourceCounts[item.source] = (sourceCounts[item.source] ?? 0) + 1
  })

  if (file === 'traits.json') {
    for (const kind of TRAIT_KINDS) {
      if ((kindCounts[kind] ?? 0) < MIN_TRAITS_PER_KIND) {
        errors.push(`${file}: needs at least ${MIN_TRAITS_PER_KIND} "${kind}" traits, found ${kindCounts[kind] ?? 0}`)
      }
    }
  }

  const detail =
    file === 'traits.json'
      ? TRAIT_KINDS.map((k) => `${k} ${kindCounts[k] ?? 0}`).join(', ')
      : Object.entries(sourceCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([source, count]) => `${source} ${count}`)
          .join(', ')

  summary.push(`${file.padEnd(14)} ${String(items.length).padStart(4)} entries  (${detail})`)
  const genreDetail = GENRES.map((g) => `${g} ${genreCounts[g] ?? 0}`).join(', ')
  summary.push(`${''.padEnd(14)}      genres   (${genreDetail})`)
}

console.log(summary.join('\n'))

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) found:`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log('\nAll pools valid.')
