import { useCallback, useEffect, useMemo, useState } from 'react'
import { pools, jobCategories, jobSources, raceSources } from '@shared/character/pools'
import {
  TRAIT_MAX,
  TRAIT_MIN,
  characterTitle,
  generateCharacter,
  pickPronouns,
  toHtml,
  toMarkdown
} from '@shared/character/generator'
import type { GenerateOptions, KeptFields } from '@shared/character/generator'
import type { Character, CharacterField } from '@shared/character/types'

type Props = {
  onSaveNote: (title: string, html: string) => Promise<void>
}

type Locks = Record<'race' | 'gender' | 'job' | 'traits', boolean>

const LOCKABLE: (keyof Locks)[] = ['race', 'gender', 'job', 'traits']
const TRAIT_COUNTS = ['auto', ...Array.from({ length: TRAIT_MAX - TRAIT_MIN + 1 }, (_, i) => String(TRAIT_MIN + i))]

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function FilterRow({
  label,
  values,
  selected,
  onToggle
}: {
  label: string
  values: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-base-content/60">{label}</span>
        {selected.length === 0 && <span className="text-[10px] text-base-content/30">any</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <button
            key={value}
            onClick={() => onToggle(value)}
            className={`px-2 py-1 rounded-md text-xs border transition-colors ${
              selected.includes(value)
                ? 'bg-primary/20 border-primary/50 text-primary'
                : 'border-base-300 text-base-content/50 hover:text-base-content hover:border-base-content/30'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  )
}

function LockButton({ locked, onClick }: { locked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={locked ? 'Unlock — this will reroll' : 'Lock — keep this when rerolling'}
      className={`w-7 h-7 rounded text-xs transition-colors ${
        locked ? 'bg-primary/20 text-primary' : 'text-base-content/30 hover:bg-base-300 hover:text-base-content/70'
      }`}
    >
      {locked ? '🔒' : '🔓'}
    </button>
  )
}

function RerollButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded text-xs text-base-content/30 hover:bg-base-300 hover:text-base-content/70 transition-colors"
    >
      ⟳
    </button>
  )
}

function Field({
  label,
  locked,
  onLock,
  onReroll,
  children
}: {
  label: string
  locked?: boolean
  onLock?: () => void
  onReroll: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-base-300 bg-base-200/40 p-4">
      <header className="flex items-center gap-1 mb-2">
        <h3 className="flex-1 text-[11px] uppercase tracking-wider text-base-content/40 font-semibold">{label}</h3>
        <RerollButton onClick={onReroll} title={`Reroll ${label.toLowerCase()}`} />
        {onLock && <LockButton locked={!!locked} onClick={onLock} />}
      </header>
      {children}
    </section>
  )
}

export default function CharacterGenerator({ onSaveNote }: Props) {
  const [raceFilter, setRaceFilter] = useState<string[]>([])
  const [jobSourceFilter, setJobSourceFilter] = useState<string[]>([])
  const [jobCategoryFilter, setJobCategoryFilter] = useState<string[]>([])
  const [traitCount, setTraitCount] = useState<string>('auto')
  const [showFilters, setShowFilters] = useState(false)

  const [locks, setLocks] = useState<Locks>({ race: false, gender: false, job: false, traits: false })
  const [character, setCharacter] = useState<Character | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const options: GenerateOptions = useMemo(
    () => ({
      raceSources: raceFilter,
      jobSources: jobSourceFilter,
      jobCategories: jobCategoryFilter,
      traitCount: traitCount === 'auto' ? undefined : Number(traitCount)
    }),
    [raceFilter, jobSourceFilter, jobCategoryFilter, traitCount]
  )

  const roll = useCallback(
    (only?: CharacterField) => {
      setStatus(null)
      const keep: KeptFields = {}
      if (character) {
        for (const field of LOCKABLE) {
          const keepThis = only ? field !== only : locks[field]
          if (!keepThis) continue
          if (field === 'gender') {
            keep.gender = character.gender
            keep.pronouns = character.pronouns
          } else if (field === 'race') keep.race = character.race
          else if (field === 'job') keep.job = character.job
          else keep.traits = character.traits
        }
      }
      try {
        setCharacter(generateCharacter(options, keep))
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [character, locks, options]
  )

  // Roll once on mount so the panel is never empty.
  useEffect(() => {
    try {
      setCharacter(generateCharacter(options))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    if (!character) return
    try {
      await onSaveNote(`Character: ${characterTitle(character)}`, toHtml(character))
      setStatus('Saved to Notes')
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleCopy() {
    if (!character) return
    try {
      await navigator.clipboard.writeText(toMarkdown(character))
      setStatus('Copied as Markdown')
    } catch {
      setStatus('Clipboard unavailable')
    }
  }

  const poolTotal = pools.races.length + pools.genders.length + pools.jobs.length + pools.traits.length

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-base-300 bg-base-200">
        <h2 className="text-sm font-semibold text-base-content/80 flex-1">Character Generator</h2>
        <button onClick={() => setShowFilters((s) => !s)} className="btn btn-xs btn-ghost">
          {showFilters ? 'Hide filters' : 'Filters'}
        </button>
        <button onClick={handleCopy} disabled={!character} className="btn btn-xs btn-ghost">
          Copy
        </button>
        <button onClick={handleSave} disabled={!character} className="btn btn-xs btn-ghost">
          Save as Note
        </button>
        <button onClick={() => roll()} className="btn btn-xs btn-primary">
          Reroll
        </button>
      </div>

      {showFilters && (
        <div className="px-6 py-4 border-b border-base-300 bg-base-200/50 space-y-4">
          <FilterRow
            label="Race source"
            values={raceSources}
            selected={raceFilter}
            onToggle={(v) => setRaceFilter((prev) => toggle(prev, v))}
          />
          <FilterRow
            label="Job source"
            values={jobSources}
            selected={jobSourceFilter}
            onToggle={(v) => setJobSourceFilter((prev) => toggle(prev, v))}
          />
          <FilterRow
            label="Job category"
            values={jobCategories}
            selected={jobCategoryFilter}
            onToggle={(v) => setJobCategoryFilter((prev) => toggle(prev, v))}
          />
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-base-content/60">Traits</span>
            <div className="flex flex-wrap gap-1.5">
              {TRAIT_COUNTS.map((value) => (
                <button
                  key={value}
                  onClick={() => setTraitCount(value)}
                  className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                    traitCount === value
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'border-base-300 text-base-content/50 hover:text-base-content hover:border-base-content/30'
                  }`}
                >
                  {value === 'auto' ? `auto (${TRAIT_MIN}–${TRAIT_MAX})` : value}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-2xl mx-auto space-y-3">
          {error && (
            <div className="rounded-lg border border-error/40 bg-error/10 text-error text-sm px-4 py-3">{error}</div>
          )}

          {character && (
            <>
              <h1 className="text-2xl font-semibold text-base-content mb-4">{characterTitle(character)}</h1>

              <Field label="Race" locked={locks.race} onLock={() => setLocks((l) => ({ ...l, race: !l.race }))} onReroll={() => roll('race')}>
                <p className="text-base-content font-medium">
                  {character.race.name}
                  <span className="ml-2 text-xs text-base-content/40">{character.race.source}</span>
                </p>
                <p className="text-sm text-base-content/60 mt-1">{character.race.description}</p>
              </Field>

              <Field label="Gender identity" locked={locks.gender} onLock={() => setLocks((l) => ({ ...l, gender: !l.gender }))} onReroll={() => roll('gender')}>
                <p className="text-base-content font-medium flex items-center gap-2">
                  {character.gender.name}
                  <span className="text-xs px-1.5 py-0.5 rounded bg-base-300 text-base-content/60">
                    {character.pronouns}
                  </span>
                  <button
                    onClick={() => setCharacter({ ...character, pronouns: pickPronouns(character.gender) })}
                    title="Reroll pronouns only"
                    className="text-xs text-base-content/30 hover:text-base-content/70"
                  >
                    ⟳
                  </button>
                </p>
                <p className="text-sm text-base-content/60 mt-1">{character.gender.description}</p>
              </Field>

              <Field label="Job" locked={locks.job} onLock={() => setLocks((l) => ({ ...l, job: !l.job }))} onReroll={() => roll('job')}>
                <p className="text-base-content font-medium">
                  {character.job.name}
                  <span className="ml-2 text-xs text-base-content/40">
                    {character.job.source} · {character.job.category}
                  </span>
                </p>
                <p className="text-sm text-base-content/60 mt-1">{character.job.description}</p>
              </Field>

              <Field
                label={`Traits (${character.traits.length})`}
                locked={locks.traits}
                onLock={() => setLocks((l) => ({ ...l, traits: !l.traits }))}
                onReroll={() => roll('traits')}
              >
                <ul className="space-y-2">
                  {character.traits.map((trait) => (
                    <li key={trait.id}>
                      <p className="text-base-content font-medium text-sm">
                        {trait.name}
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-base-content/30">
                          {trait.kind}
                        </span>
                      </p>
                      <p className="text-sm text-base-content/60">{trait.description}</p>
                    </li>
                  ))}
                </ul>
              </Field>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-base-300 bg-base-200 text-xs text-base-content/40">
        <span>{pools.races.length} races</span>
        <span>{pools.genders.length} identities</span>
        <span>{pools.jobs.length} jobs</span>
        <span>{pools.traits.length} traits</span>
        <span className="text-base-content/25">({poolTotal} entries)</span>
        {status && <span className="ml-auto text-primary">{status}</span>}
      </div>
    </div>
  )
}
