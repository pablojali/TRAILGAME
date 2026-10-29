#!/usr/bin/env node
/**
 * M4.2 race simulation — reference prototype (proposal only, NOT production code).
 *
 * Implements exactly the formulas of docs/RACE_SIMULATION_PROPOSAL.md (revision 2, approved with
 * D1–D10 on 29 October 2026, including variant V1) and prints every
 * table used there, plus the verification checks requested by the PM. No dependencies.
 *
 *   node docs/race-simulation/prototype.mjs            # prints results (Markdown) to stdout
 *   node docs/race-simulation/prototype.mjs --check    # also exits 1 if any check fails
 *
 * The data below is a copy of the repository data. When run inside the repository with Node 22.18+
 * (TypeScript type stripping), the script also compares the copy with src/ and reports mismatches.
 */

// ---------------------------------------------------------------------------------------------
// Data (copies of src/domain/races/races.ts, categories.ts and src/domain/athlete/profiles.ts)
// ---------------------------------------------------------------------------------------------

export const RACES = [
  { id: 'RACE-001', name: 'Forest First Steps', category: 'open', distanceKm: 5, elevationGainM: 120, recommendedLevel: 1 },
  { id: 'RACE-002', name: 'Riverside Trail', category: 'open', distanceKm: 8, elevationGainM: 220, recommendedLevel: 4 },
  { id: 'RACE-003', name: 'Pine Loop Challenge', category: 'open', distanceKm: 10, elevationGainM: 350, recommendedLevel: 8 },
  { id: 'RACE-004', name: 'Ridge Runner', category: 'trail', distanceKm: 12, elevationGainM: 550, recommendedLevel: 11 },
  { id: 'RACE-005', name: 'Stone Path Classic', category: 'trail', distanceKm: 15, elevationGainM: 750, recommendedLevel: 14 },
  { id: 'RACE-006', name: 'Wildwood Ascent', category: 'trail', distanceKm: 18, elevationGainM: 950, recommendedLevel: 18 },
  { id: 'RACE-007', name: 'Summit Quest', category: 'mountain', distanceKm: 22, elevationGainM: 1300, recommendedLevel: 21 },
  { id: 'RACE-008', name: 'Alpine Traverse', category: 'mountain', distanceKm: 28, elevationGainM: 1700, recommendedLevel: 25 },
  { id: 'RACE-009', name: 'Sky Ridge Ultra', category: 'mountain', distanceKm: 35, elevationGainM: 2200, recommendedLevel: 28 },
  { id: 'RACE-010', name: 'High Peaks Challenge', category: 'elite', distanceKm: 42, elevationGainM: 2800, recommendedLevel: 31 },
  { id: 'RACE-011', name: 'Legends of the Crest', category: 'elite', distanceKm: 55, elevationGainM: 3600, recommendedLevel: 40 },
  { id: 'RACE-012', name: 'Beyond the Skyline', category: 'elite', distanceKm: 70, elevationGainM: 4800, recommendedLevel: 50 },
]

/** Proposed new catalog field (§3.2 of the proposal). */
export const TECHNICALITY = {
  'RACE-001': 0, 'RACE-002': 0, 'RACE-003': 1, 'RACE-004': 1, 'RACE-005': 2, 'RACE-006': 1,
  'RACE-007': 2, 'RACE-008': 3, 'RACE-009': 2, 'RACE-010': 3, 'RACE-011': 3, 'RACE-012': 3,
}

export const PROFILES = {
  climber: { endurance: 16, climbing: 20, speed: 13, technical: 18, recovery: 14, consistency: 15 },
  sprinter: { endurance: 13, climbing: 12, speed: 20, technical: 17, recovery: 16, consistency: 18 },
  'all-rounder': { endurance: 16, climbing: 16, speed: 16, technical: 16, recovery: 16, consistency: 16 },
  endurance: { endurance: 20, climbing: 15, speed: 14, technical: 13, recovery: 18, consistency: 16 },
}
const PROFILE_LABELS = { climber: 'Climber', sprinter: 'Sprinter', 'all-rounder': 'All-rounder', endurance: 'Endurance' }
const ATTRS = ['endurance', 'climbing', 'speed', 'technical', 'recovery', 'consistency']

export const CATEGORY_FEES = {
  open: { standard: 0, early: 0 },
  trail: { standard: 50, early: 125 },
  mountain: { standard: 125, early: 300 },
  elite: { standard: 300, early: 700 },
}
export const GROSS_PRIZES = {
  open: [100, 70, 50, 25, 10],
  trail: [300, 210, 150, 75, 30],
  mountain: [700, 490, 350, 175, 70],
  elite: [1500, 1050, 750, 375, 150],
}
const BAND_LABELS = ['1st', '2nd', '3rd', '4th–10th', '11th or lower']
/** Anti-farming multipliers in whole percent, by level difference 0 (or below), 1, 2, 3+. */
export const MULTIPLIER_PCT = [100, 75, 40, 0]
/** Levels 1–50: each level costs 50 XP more than the one before. */
export const LEVEL_THRESHOLDS = Array.from({ length: 50 }, (_, i) => 100 * i + 25 * i * (i - 1))

// ---------------------------------------------------------------------------------------------
// Constants (§5.6 of the proposal)
// ---------------------------------------------------------------------------------------------

export const C = {
  climbShare: { open: 0.2, trail: 0.3, mountain: 0.35, elite: 0.38 },
  maxGainPerClimbM: 600,
  maxAverageGradient: 0.4,
  basePaceMinPerEffortKm: 6.0,
  abilityReference: 20,
  abilityExponent: 0.35,
  climbWeightFullGradient: 0.2,
  technicalPenaltyPerLevel: 0.12,
  slowdownRate: 0.25,
  slowdownReferenceEffortKm: 50,
  fitnessSlope: 0.2,
  fatigueSlope: 0.3,
  fieldSize: 50,
  rivalFastest: 0.85,
  rivalSpread: 0.4,
  rivalExponent: 1.3,
  referenceFatigue: 20,
  /** D9 (V1): approved 29 October 2026. Set to false only to reproduce revision 2 numbers. */
  consistencySoftensFatigue: true,
  dayFormMax: 0.04,
  raceFatigueBase: 6,
  raceFatiguePerEffortKm: 0.6,
  xpBase: { open: 30, trail: 60, mountain: 100, elite: 180 },
  /** Band factor in whole percent (same ratios as the coin prizes). */
  xpBandPct: [100, 70, 50, 25, 10],
}

// ---------------------------------------------------------------------------------------------
// Course generation (§3)
// ---------------------------------------------------------------------------------------------

/** Splits an integer total into `parts` integers that differ by at most 1 and sum exactly to it. */
export function split(total, parts) {
  const base = Math.floor(total / parts)
  const remainder = total - base * parts
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Segments in whole metres: `{ type, lengthM, gainM, lossM, technicality }`.
 * Throws for a course that cannot be generated (non-positive segment or too steep).
 */
export function generateCourse(race, technicality = TECHNICALITY[race.id] ?? 0) {
  const distanceM = Math.round(race.distanceKm * 1000)
  const gainM = race.elevationGainM
  if (!Number.isInteger(gainM) || gainM < 0 || distanceM <= 0) throw new Error(`${race.id}: invalid distance or gain`)
  if (gainM === 0) return [{ type: 'runnable', lengthM: distanceM, gainM: 0, lossM: 0, technicality: 0 }]

  const climbs = Math.ceil(gainM / C.maxGainPerClimbM)
  const climbTotalM = Math.round(C.climbShare[race.category] * distanceM)
  const runnableTotalM = distanceM - 2 * climbTotalM
  const climbLengths = split(climbTotalM, climbs)
  const descentLengths = split(climbTotalM, climbs)
  const runnableLengths = split(runnableTotalM, climbs + 1)
  const gains = split(gainM, climbs)
  const segments = []
  for (let i = 0; i < climbs; i++) {
    segments.push({ type: 'runnable', lengthM: runnableLengths[i], gainM: 0, lossM: 0, technicality: 0 })
    segments.push({ type: 'climb', lengthM: climbLengths[i], gainM: gains[i], lossM: 0, technicality: 0 })
    segments.push({ type: 'descent', lengthM: descentLengths[i], gainM: 0, lossM: gains[i], technicality })
  }
  segments.push({ type: 'runnable', lengthM: runnableLengths[climbs], gainM: 0, lossM: 0, technicality: 0 })

  for (const s of segments) {
    if (!(s.lengthM > 0)) throw new Error(`${race.id}: non-positive ${s.type} segment`)
    if ((s.gainM + s.lossM) / s.lengthM > C.maxAverageGradient) throw new Error(`${race.id}: gradient above ${C.maxAverageGradient * 100}%`)
  }
  return segments
}

/** ITRA-style effort: 1 effort-km per km, plus 1 per 100 m of ascent. */
export function effortKm(segment) {
  return segment.lengthM / 1000 + segment.gainM / 100
}

// ---------------------------------------------------------------------------------------------
// Abilities and time model (§4, §5)
// ---------------------------------------------------------------------------------------------

export const abilities = {
  runnable: (a) => 0.75 * a.speed + 0.25 * a.endurance,
  climb: (a) => 0.7 * a.climbing + 0.3 * a.endurance,
  technicalDescent: (a) => 0.7 * a.technical + 0.3 * a.speed,
  durability: (a) => 0.6 * a.endurance + 0.4 * a.recovery,
}

export function segmentAbility(segment, a) {
  if (segment.type === 'climb') {
    const w = Math.min(1, segment.gainM / segment.lengthM / C.climbWeightFullGradient)
    return w * abilities.climb(a) + (1 - w) * abilities.runnable(a)
  }
  if (segment.type === 'descent') {
    const t = segment.technicality / 3
    return t * abilities.technicalDescent(a) + (1 - t) * abilities.runnable(a)
  }
  return abilities.runnable(a)
}

/**
 * Finishing time in seconds (unrounded) for athlete `{ attributes, fitness, fatigue }`.
 * `dayForm` is a fraction (e.g. -0.02); 0 for option A.
 */
export function raceSeconds(course, athlete, dayForm = 0) {
  const a = athlete.attributes
  const fitnessFactor = 1 + (C.fitnessSlope * (50 - athlete.fitness)) / 50
  // D9 (V1, approved): Consistency softens the effect of Fatigue.
  const fatigueScale = C.consistencySoftensFatigue ? Math.pow(C.abilityReference / a.consistency, C.abilityExponent) : 1
  const fatigueFactor = 1 + (C.fatigueSlope * athlete.fatigue * fatigueScale) / 100
  const durability = abilities.durability(a)
  let minutes = 0
  let effortBefore = 0
  for (const s of course) {
    const e = effortKm(s)
    const abilityFactor = Math.pow(C.abilityReference / segmentAbility(s, a), C.abilityExponent)
    const technicalFactor = s.type === 'descent' ? 1 + C.technicalPenaltyPerLevel * s.technicality * (1 - a.technical / 100) : 1
    const slowdown = 1 + C.slowdownRate * (effortBefore / C.slowdownReferenceEffortKm) * (C.abilityReference / durability)
    minutes += e * C.basePaceMinPerEffortKm * abilityFactor * technicalFactor * slowdown * fitnessFactor * fatigueFactor * (1 + dayForm)
    effortBefore += e
  }
  return minutes * 60
}

export function referenceAthlete(level) {
  const v = 16 + (level - 1) / 3
  return {
    attributes: Object.fromEntries(ATTRS.map((k) => [k, v])),
    fitness: Math.min(90, 25 + (65 * (level - 1)) / 29),
    fatigue: C.referenceFatigue,
  }
}

/** Rival finishing times in seconds (unrounded), fastest first. */
export function rivalSeconds(race, course = generateCourse(race)) {
  const ref = raceSeconds(course, referenceAthlete(race.recommendedLevel))
  const n = C.fieldSize - 1
  return Array.from({ length: n }, (_, i) => ref * (C.rivalFastest + C.rivalSpread * Math.pow((i + 0.5) / n, C.rivalExponent)))
}

/** Result with the time rounded to whole seconds; rivals are compared in whole seconds too. */
export function simulate(race, athlete, dayForm = 0) {
  const course = generateCourse(race)
  const timeS = Math.round(raceSeconds(course, athlete, dayForm))
  const rivals = rivalSeconds(race, course).map(Math.round)
  const position = 1 + rivals.filter((t) => t < timeS).length
  return { timeS, position, fieldSize: C.fieldSize }
}

// ---------------------------------------------------------------------------------------------
// Day form, option B (§5.4)
// ---------------------------------------------------------------------------------------------

export function fnv1a(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function mulberry32(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function dayForm(raceId, entryId, enteredAt, consistency) {
  const u = mulberry32(fnv1a(`${raceId}|${entryId}|${enteredAt}`))
  return (2 * u - 1) * C.dayFormMax * (1 - consistency / 100)
}

// ---------------------------------------------------------------------------------------------
// Rewards (§7) — integer arithmetic only
// ---------------------------------------------------------------------------------------------

export function getLevel(xp) {
  let level = 1
  LEVEL_THRESHOLDS.forEach((min, i) => { if (xp >= min) level = i + 1 })
  return level
}

export function band(position) {
  return position <= 3 ? position - 1 : position <= 10 ? 3 : 4
}

export function multiplierPct(levelAtStart, recommendedLevel) {
  const d = levelAtStart - recommendedLevel
  return MULTIPLIER_PCT[Math.max(0, Math.min(3, d))]
}

export function rewards(race, position, levelAtStart, feePaid) {
  const b = band(position)
  const pct = multiplierPct(levelAtStart, race.recommendedLevel)
  const grossPrize = GROSS_PRIZES[race.category][b]
  const coinsAwarded = Math.floor((grossPrize * pct) / 100)
  const xpAwarded = Math.floor((C.xpBase[race.category] * C.xpBandPct[b] * pct) / 10000)
  return { band: b, grossPrize, multiplierPct: pct, coinsAwarded, xpAwarded, netCoins: coinsAwarded - feePaid }
}

export function raceFatigueGain(course) {
  return Math.round(C.raceFatigueBase + C.raceFatiguePerEffortKm * course.reduce((s, x) => s + effortKm(x), 0))
}

// ---------------------------------------------------------------------------------------------
// Explanation factors (§5.5)
// ---------------------------------------------------------------------------------------------

const FACTOR_LABELS = {
  fitness: 'Fitness', fatigue: 'Fatigue', speed: 'Speed', endurance: 'Endurance', climbing: 'Climbing',
  technical: 'Technical', recovery: 'Recovery', consistency: 'Consistency',
}

/** One-at-a-time effects against the field reference athlete, in seconds (negative = faster). */
export function explain(race, athlete) {
  const course = generateCourse(race)
  const ref = referenceAthlete(race.recommendedLevel)
  const actual = raceSeconds(course, athlete)
  const reference = raceSeconds(course, ref)
  const effects = []
  for (const key of ['fitness', 'fatigue']) {
    effects.push({ key, value: athlete[key], reference: ref[key], seconds: actual - raceSeconds(course, { ...athlete, [key]: ref[key] }) })
  }
  for (const key of ATTRS) {
    const swapped = { ...athlete, attributes: { ...athlete.attributes, [key]: ref.attributes[key] } }
    effects.push({ key, value: athlete.attributes[key], reference: ref.attributes[key], seconds: actual - raceSeconds(course, swapped) })
  }
  return { actual, reference, gap: actual - reference, effects }
}

// ---------------------------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------------------------

const out = []
const failures = []
const p = (line = '') => out.push(line)
function check(ok, label) {
  if (!ok) failures.push(label)
  return ok ? 'pass' : '**FAIL**'
}
export function hms(seconds) {
  const s = Math.round(seconds)
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const pct1 = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`
const mmss = (seconds) => {
  const s = Math.round(Math.abs(seconds))
  const h = Math.floor(s / 3600)
  const text = h > 0 ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  return `${seconds <= 0 ? '−' : '+'}${text}`
}
const race = (id) => RACES.find((r) => r.id === id)
const athlete = (profile, fitness, fatigue, extra = {}) => ({ attributes: { ...PROFILES[profile], ...extra }, fitness, fatigue })

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

async function compareWithRepository() {
  p('## 0. Data copied from the repository')
  p()
  try {
    const root = new URL('../../', import.meta.url)
    const repoRaces = (await import(new URL('src/domain/races/races.ts', root))).RACES
    const repoCategories = await import(new URL('src/domain/races/categories.ts', root))
    const repoProfiles = (await import(new URL('src/domain/athlete/profiles.ts', root))).PROFILES
    const repoLevels = (await import(new URL('src/domain/athlete/levels.ts', root))).LEVEL_THRESHOLDS
    const racesOk = JSON.stringify(repoRaces.map(({ id, name, category, distanceKm, elevationGainM, recommendedLevel }) => ({ id, name, category, distanceKm, elevationGainM, recommendedLevel }))) === JSON.stringify(RACES)
    const feesOk = Object.entries(CATEGORY_FEES).every(([k, v]) => repoCategories.RACE_CATEGORY_CONFIG[k].standardFee === v.standard && repoCategories.RACE_CATEGORY_CONFIG[k].earlyEntryFee === v.early)
    const prizesOk = JSON.stringify(repoCategories.GROSS_PRIZES) === JSON.stringify(GROSS_PRIZES)
    const multOk = JSON.stringify(repoCategories.REWARD_MULTIPLIERS.map((m) => Math.round(m.coins * 100))) === JSON.stringify(MULTIPLIER_PCT) && repoCategories.REWARD_MULTIPLIERS.every((m) => m.xp === m.coins)
    const profilesOk = Object.entries(PROFILES).every(([k, v]) => JSON.stringify(repoProfiles[k].attributes) === JSON.stringify(v))
    const levelsOk = JSON.stringify(repoLevels.map((l) => l.minXp)) === JSON.stringify(LEVEL_THRESHOLDS)
    const technicalityOk = repoRaces.every((r) => r.technicality === TECHNICALITY[r.id])
    const repoSim = (await import(new URL('src/domain/races/simulationConfig.ts', root))).RACE_SIMULATION
    const constantsOk = Object.entries(repoSim).every(([k, v]) => k.startsWith('explanation') || JSON.stringify(v) === JSON.stringify(C[k]))
    p('| Data | Matches `src/` |')
    p('|---|---|')
    p(`| Race catalog (12 races) | ${check(racesOk, 'catalog copy')} |`)
    p(`| Category fees | ${check(feesOk, 'fees copy')} |`)
    p(`| Gross prizes | ${check(prizesOk, 'prizes copy')} |`)
    p(`| Anti-farming multipliers | ${check(multOk, 'multipliers copy')} |`)
    p(`| Profile attributes | ${check(profilesOk, 'profiles copy')} |`)
    p(`| Level thresholds | ${check(levelsOk, 'levels copy')} |`)
    p(`| Race technicality (D6) | ${check(technicalityOk, 'technicality copy')} |`)
    p(`| Simulation constants (\`simulationConfig.ts\`) | ${check(constantsOk, 'constants copy')} |`)
  } catch (error) {
    p(`Repository comparison skipped (${error.message.split('\n')[0]}). Run inside the repository with Node 22.18 or later.`)
  }
  p()
}

function reportProfiles() {
  p('## 1. Athletes used')
  p()
  p('Starting attributes of each profile (from `src/domain/athlete/profiles.ts`):')
  p()
  p('| Profile | Endurance | Climbing | Speed | Technical | Recovery | Consistency | Total |')
  p('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const [k, a] of Object.entries(PROFILES)) p(`| ${PROFILE_LABELS[k]} | ${ATTRS.map((x) => a[x]).join(' | ')} | ${ATTRS.reduce((s, x) => s + a[x], 0)} |`)
  p()
  p('"Best possible today" athletes (level 5 earns 8 attribute points, Fitness 95, Fatigue 0):')
  p()
  p('- **Best Climber:** Climber + 8 Climbing (Climbing 28).')
  p('- **Best Endurance:** Endurance + 4 Endurance + 4 Recovery (Endurance 24, Recovery 22).')
  p('- **Best Sprinter:** Sprinter + 8 Speed (Speed 28).')
  p()
}

function reportCourses() {
  p('## 2. Course generation')
  p()
  p('Lengths and gains are whole metres. Remainders from even splits go to the first parts, so every sum is exact.')
  p()
  p('| Race | Segments | Climbs | Runnable m (each) | Climb m (each) | Gain per climb m | Distance sum = catalog | Ascent sum = catalog | Descent = ascent | All lengths > 0 | Max gradient | Effort-km |')
  p('|---|---:|---:|---|---|---|---|---|---|---|---:|---:|')
  for (const r of RACES) {
    const c = generateCourse(r)
    const run = c.filter((s) => s.type === 'runnable').map((s) => s.lengthM)
    const climb = c.filter((s) => s.type === 'climb')
    const dist = c.reduce((s, x) => s + x.lengthM, 0)
    const asc = c.reduce((s, x) => s + x.gainM, 0)
    const desc = c.reduce((s, x) => s + x.lossM, 0)
    const maxGrad = Math.max(...c.map((s) => (s.gainM + s.lossM) / s.lengthM))
    const e = c.reduce((s, x) => s + effortKm(x), 0)
    const expectedSegments = 3 * Math.ceil(r.elevationGainM / C.maxGainPerClimbM) + 1
    p(`| ${r.id} | ${c.length} ${check(c.length === expectedSegments, `${r.id} segment count`)} | ${climb.length} | ${[...new Set(run)].join('/')} | ${[...new Set(climb.map((s) => s.lengthM))].join('/')} | ${[...new Set(climb.map((s) => s.gainM))].join('/')} | ${dist} ${check(dist === r.distanceKm * 1000, `${r.id} distance`)} | ${asc} ${check(asc === r.elevationGainM, `${r.id} ascent`)} | ${check(desc === asc, `${r.id} descent`)} | ${check(c.every((s) => s.lengthM > 0), `${r.id} lengths`)} | ${(maxGrad * 100).toFixed(1)}% | ${e.toFixed(1)} ${check(Math.abs(e - (r.distanceKm + r.elevationGainM / 100)) < 1e-9, `${r.id} effort`)} |`)
  }
  p()
  p('Effort-km check: the sum always equals `distance km + gain / 100`.')
  p()
  p('### Edge cases (synthetic courses)')
  p()
  p('| Case | Result |')
  p('|---|---|')
  const cases = [
    ['No gain (10 km, 0 m)', { id: 'X1', category: 'open', distanceKm: 10, elevationGainM: 0 }],
    ['Exactly 600 m (12 km Trail)', { id: 'X2', category: 'trail', distanceKm: 12, elevationGainM: 600 }],
    ['601 m (12 km Trail): splits into 2 climbs', { id: 'X3', category: 'trail', distanceKm: 12, elevationGainM: 601 }],
    ['1 m of gain (1 km Open)', { id: 'X4', category: 'open', distanceKm: 1, elevationGainM: 1 }],
    ['Fractional distance (5.5 km, 125 m)', { id: 'X5', category: 'open', distanceKm: 5.5, elevationGainM: 125 }],
    ['Uneven splits (7.777 km Elite, 1,001 m)', { id: 'X6', category: 'elite', distanceKm: 7.777, elevationGainM: 1001 }],
    ['Too steep (2 km Open, 1,500 m): rejected', { id: 'X7', category: 'open', distanceKm: 2, elevationGainM: 1500 }],
    ['Zero distance: rejected', { id: 'X8', category: 'open', distanceKm: 0, elevationGainM: 0 }],
  ]
  for (const [label, r] of cases) {
    const shouldFail = label.includes('rejected')
    try {
      const c = generateCourse(r, 2)
      const dist = c.reduce((s, x) => s + x.lengthM, 0)
      const asc = c.reduce((s, x) => s + x.gainM, 0)
      const ok = !shouldFail && dist === Math.round(r.distanceKm * 1000) && asc === r.elevationGainM && c.every((s) => s.lengthM > 0 && Number.isInteger(s.lengthM))
      p(`| ${label} | ${c.length} segments, ${dist} m, ${asc} m D+ — ${check(ok, label)} |`)
    } catch (error) {
      p(`| ${label} | error "${error.message}" — ${check(shouldFail, label)} |`)
    }
  }
  p()
}

const TEST_CASES = [
  ['All-rounder, F20, Fa0 (new career)', 'RACE-001', athlete('all-rounder', 20, 0)],
  ['All-rounder, F80, Fa10', 'RACE-001', athlete('all-rounder', 80, 10)],
  ['Sprinter, F60, Fa20', 'RACE-001', athlete('sprinter', 60, 20)],
  ['Climber, F60, Fa20', 'RACE-001', athlete('climber', 60, 20)],
  ['All-rounder, F60, Fa0', 'RACE-004', athlete('all-rounder', 60, 0)],
  ['All-rounder, F60, Fa80', 'RACE-004', athlete('all-rounder', 60, 80)],
  ['Climber, F60, Fa20', 'RACE-007', athlete('climber', 60, 20)],
  ['Sprinter, F60, Fa20', 'RACE-007', athlete('sprinter', 60, 20)],
  ['Endurance, F60, Fa20', 'RACE-012', athlete('endurance', 60, 20)],
  ['Climber, F60, Fa20', 'RACE-012', athlete('climber', 60, 20)],
]

/** Values published in revision 1 of the proposal (29 October 2026). */
const REVISION_1 = [
  ['0:45:41', 19], ['0:36:58', 1], ['0:40:49', 3], ['0:42:46', 11], ['1:55:17', 13],
  ['2:22:57', 39], ['4:22:26', 41], ['4:32:16', 45], ['18:13:40', 50], ['18:31:01', 50],
]

function reportTestCases() {
  p('## 3. Test cases')
  p()
  p('No day form; V1 included (approved model). "Before V1" values are those published in revisions 1 and 2. The only change is the approved variant V1.')
  p()
  p('| # | Athlete | Race | Time | Position | Before V1 | Difference |')
  p('|---|---|---|---:|---:|---|---|')
  TEST_CASES.forEach(([label, id, a], i) => {
    const r = simulate(race(id), a)
    const [t1, p1] = REVISION_1[i]
    const [h, m, s] = t1.split(':').map(Number)
    const diff = r.timeS - (h * 3600 + m * 60 + s)
    p(`| ${i + 1} | ${label} | ${id} | ${hms(r.timeS)} | ${r.position} | ${t1} / ${p1} | ${diff === 0 && r.position === p1 ? 'none' : `${diff >= 0 ? '+' : ''}${diff} s${r.position !== p1 ? `, position ${p1} → ${r.position}` : ''}`} |`)
  })
  p()
}

function reportBalance() {
  p('## 4. Balance')
  p()
  p('### 4.1 Positions out of 50 for typical and best athletes')
  p()
  const best = {
    climber: athlete('climber', 95, 0, { climbing: 28 }),
    endurance: athlete('endurance', 95, 0, { endurance: 24, recovery: 22 }),
    sprinter: athlete('sprinter', 95, 0, { speed: 28 }),
  }
  p('| Race | New career (All-rounder F20 Fa0) | All-rounder F50 Fa30 | Best Climber | Best Endurance | Best Sprinter | Field winner | Field reference | Field last |')
  p('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const r of RACES) {
    const rivals = rivalSeconds(r)
    const ref = raceSeconds(generateCourse(r), referenceAthlete(r.recommendedLevel))
    p(`| ${r.id} | ${simulate(r, athlete('all-rounder', 20, 0)).position} | ${simulate(r, athlete('all-rounder', 50, 30)).position} | ${simulate(r, best.climber).position} | ${simulate(r, best.endurance).position} | ${simulate(r, best.sprinter).position} | ${hms(rivals[0])} | ${hms(ref)} | ${hms(rivals[rivals.length - 1])} |`)
  }
  p()
  p('### 4.2 Profiles at Fitness 60, Fatigue 20 (time and position)')
  p()
  p(`| Race | ${Object.values(PROFILE_LABELS).join(' | ')} | Spread fastest–slowest |`)
  p('|---|---|---|---|---|---:|')
  for (const r of RACES) {
    const res = Object.keys(PROFILES).map((k) => simulate(r, athlete(k, 60, 20)))
    const best = Math.min(...res.map((x) => x.timeS))
    const worst = Math.max(...res.map((x) => x.timeS))
    p(`| ${r.id} | ${res.map((x) => `${x.timeS === best ? '**' : ''}${hms(x.timeS)} #${x.position}${x.timeS === best ? '**' : ''}`).join(' | ')} | ${((worst / best - 1) * 100).toFixed(1)}% |`)
  }
  p()
}

function reportSensitivity() {
  p('## 5. Sensitivity')
  p()
  p('Baseline: All-rounder (all attributes 16), Fitness 50, Fatigue 20, no day form. One input changes at a time. Each cell shows the time change and the position.')
  p()
  const races = [['Short', 'RACE-001'], ['Medium', 'RACE-004'], ['Medium technical', 'RACE-007'], ['Ultra', 'RACE-012']]
  const base = athlete('all-rounder', 50, 20)
  p(`| Input | Value | ${races.map(([l, id]) => `${l} ${id}`).join(' | ')} |`)
  p(`|---|---:|${races.map(() => '---:').join('|')}|`)
  const baseRes = races.map(([, id]) => simulate(race(id), base))
  p(`| Baseline | — | ${baseRes.map((r) => `${hms(r.timeS)} #${r.position}`).join(' | ')} |`)
  const row = (label, value, a) => {
    const cells = races.map(([, id], i) => {
      const r = simulate(race(id), a)
      return `${pct1(r.timeS / baseRes[i].timeS - 1)} #${r.position}`
    })
    p(`| ${label} | ${value} | ${cells.join(' | ')} |`)
  }
  for (const v of [0, 20, 80, 100]) row('Fitness', v, { ...base, fitness: v })
  for (const v of [0, 50, 80, 100]) row('Fatigue', v, { ...base, fatigue: v })
  for (const attr of ATTRS) for (const v of [1, 8, 24, 28, 100]) row(attr[0].toUpperCase() + attr.slice(1), v, { ...base, attributes: { ...base.attributes, [attr]: v } })
  p()
  p('### 5.1 Same budget, different inputs')
  p()
  p('Time change from the baseline for +8 points in one attribute (the whole level-5 budget) and for +10 Fitness:')
  p()
  p(`| Input | ${races.map(([l, id]) => `${l} ${id}`).join(' | ')} |`)
  p(`|---|${races.map(() => '---:').join('|')}|`)
  const budget = (label, a) => p(`| ${label} | ${races.map(([, id], i) => pct1(raceSeconds(generateCourse(race(id)), a) / raceSeconds(generateCourse(race(id)), base) - 1)).join(' | ')} |`)
  for (const attr of ATTRS) budget(`+8 ${attr}`, { ...base, attributes: { ...base.attributes, [attr]: 24 } })
  budget('+10 Fitness', { ...base, fitness: 60 })
  budget('−10 Fatigue', { ...base, fatigue: 10 })
  p()
  p('### 5.2 Weight of each attribute in each race')
  p()
  p('Share of the time change from +1 point in each attribute, at the baseline. A small change, so the effects are close to additive and the shares sum to 100%. This shows which attributes a course rewards.')
  p()
  p(`| Race | ${ATTRS.join(' | ')} |`)
  p(`|---|${ATTRS.map(() => '---:').join('|')}|`)
  for (const r of RACES) {
    const course = generateCourse(r)
    const t0 = raceSeconds(course, base)
    const deltas = ATTRS.map((k) => t0 - raceSeconds(course, { ...base, attributes: { ...base.attributes, [k]: 17 } }))
    const total = deltas.reduce((s, x) => s + x, 0)
    p(`| ${r.id} | ${deltas.map((d) => `${((d / total) * 100).toFixed(0)}%`).join(' | ')} |`)
  }
  p()
}

function reportExplanations() {
  p('## 6. Explanation example')
  p()
  const cases = [['Climber, F70, Fa30', 'RACE-004', athlete('climber', 70, 30)], ['Sprinter, F35, Fa60', 'RACE-001', athlete('sprinter', 35, 60)]]
  for (const [label, id, a] of cases) {
    const r = race(id)
    const e = explain(r, a)
    const sum = e.effects.reduce((s, x) => s + x.seconds, 0)
    p(`**${label} in ${id}** — time ${hms(e.actual)}; field reference (level ${r.recommendedLevel}) ${hms(e.reference)}; total gap ${mmss(e.gap)}.`)
    p()
    p('| Input | Athlete | Reference | Effect measured alone |')
    p('|---|---:|---:|---:|')
    for (const f of [...e.effects].sort((x, y) => Math.abs(y.seconds) - Math.abs(x.seconds))) {
      p(`| ${FACTOR_LABELS[f.key]} | ${f.value} | ${Number.isInteger(f.reference) ? f.reference : f.reference.toFixed(2)} | ${Math.abs(f.seconds) < 0.5 ? 'none' : mmss(f.seconds)} |`)
    }
    p()
    p(`Sum of single effects: ${mmss(sum)}. Real total gap: ${mmss(e.gap)}. The difference, ${mmss(e.gap - sum)}, is the interaction between the inputs, because they multiply. That is why the screen never adds the effects up.`)
    p()
  }
}

function reportRewards() {
  p('## 7. Rewards')
  p()
  p('Coins `= floor(grossPrize × multiplierPct / 100)`. XP `= floor(xpBase × bandPct × multiplierPct / 10000)`. Only integers, rounded once.')
  p()
  p('| Category | Band | Gross prize | Coins at 100 / 75 / 40 / 0 % | XP at 100 / 75 / 40 / 0 % |')
  p('|---|---|---:|---|---|')
  for (const cat of ['open', 'trail', 'mountain', 'elite']) {
    BAND_LABELS.forEach((label, b) => {
      const coins = MULTIPLIER_PCT.map((m) => Math.floor((GROSS_PRIZES[cat][b] * m) / 100))
      const xp = MULTIPLIER_PCT.map((m) => Math.floor((C.xpBase[cat] * C.xpBandPct[b] * m) / 10000))
      p(`| ${cat} | ${label} | ${GROSS_PRIZES[cat][b]} | ${coins.join(' / ')} | ${xp.join(' / ')} |`)
    })
  }
  p()
  const naive = Math.floor(180 * 0.7 * 1)
  const exact = Math.floor((180 * 70 * 100) / 10000)
  p(`Floating-point trap avoided: Elite 2nd place XP with decimal factors is \`Math.floor(180 * 0.7 * 1)\` = ${naive} in JavaScript (because 180 × 0.7 = ${180 * 0.7}). The integer formula gives ${exact}. Multipliers and band factors are therefore whole percentages. ${check(exact === 126 && naive === 125, 'integer XP rounding')}`)
  let mismatches = 0
  for (const cat of Object.keys(GROSS_PRIZES)) for (let b = 0; b < 5; b++) for (const m of MULTIPLIER_PCT) {
    const coins = Math.floor((GROSS_PRIZES[cat][b] * m) / 100)
    const xp = Math.floor((C.xpBase[cat] * C.xpBandPct[b] * m) / 10000)
    if (coins !== Math.floor(GROSS_PRIZES[cat][b] * (m / 100))) mismatches++
    if (xp !== Math.floor(C.xpBase[cat] * (C.xpBandPct[b] / 100) * (m / 100))) mismatches++
  }
  p()
  p(`Across all 80 coin and 80 XP values, the decimal-factor formula would give ${mismatches} wrong value(s); the table above uses the integer formula.`)
  p()
  p('Band boundaries: ' + [1, 2, 3, 4, 10, 11, 50].map((pos) => `${pos} → ${BAND_LABELS[band(pos)]}`).join(', ') + '. ' + check(band(1) === 0 && band(2) === 1 && band(3) === 2 && band(4) === 3 && band(10) === 3 && band(11) === 4 && band(50) === 4, 'band boundaries'))
  p()
  p('Multiplier by level difference: ' + [[1, 3], [3, 3], [4, 3], [5, 3], [5, 2], [5, 1]].map(([l, rec]) => `level ${l} in a level-${rec} race → ${multiplierPct(l, rec)}%`).join('; ') + '. ' + check(multiplierPct(1, 3) === 100 && multiplierPct(3, 3) === 100 && multiplierPct(4, 3) === 75 && multiplierPct(5, 3) === 40 && multiplierPct(5, 2) === 0 && multiplierPct(5, 1) === 0, 'multipliers'))
  p()
  p('### Worked examples (entry fee already paid at entry)')
  p()
  p('| Situation | Fee paid (entry type) | Level at start | Position | Gross | Mult. | Coins | XP | Net coins |')
  p('|---|---|---:|---:|---:|---:|---:|---:|---:|')
  const examples = [
    ['Level 1 wins Forest First Steps', 'RACE-001', 0, 'free', 1, 1],
    ['Level 3 wins Forest First Steps (too easy)', 'RACE-001', 0, 'free', 3, 1],
    ['Level 4 wins Forest First Steps (0 %)', 'RACE-001', 0, 'free', 4, 1],
    ['Level 3, 5th in Ridge Runner', 'RACE-004', 100, 'standard', 3, 5],
    ['Entered early at level 2, raced at level 3, 2nd in Wildwood Ascent', 'RACE-006', 250, 'early', 3, 2],
    ['Level 4, 1st in Ridge Runner (75 %, odd rounding)', 'RACE-004', 100, 'standard', 4, 1],
    ['Level 5, 3rd in Ridge Runner (40 %)', 'RACE-004', 100, 'standard', 5, 3],
    ['Level 5, 30th in Summit Quest (early entry)', 'RACE-007', 600, 'early', 5, 30],
  ]
  for (const [label, id, fee, type, level, pos] of examples) {
    const r = rewards(race(id), pos, level, fee)
    p(`| ${label} | ${fee} (${type}) | ${level} | ${pos} | ${r.grossPrize} | ${r.multiplierPct}% | ${r.coinsAwarded} | ${r.xpAwarded} | ${r.netCoins} |`)
  }
  p()
  p('Race Fatigue gain `round(6 + 0.6 × effort-km)`: ' + RACES.map((r) => `${r.id.slice(5)} +${raceFatigueGain(generateCourse(r))}`).join(', ') + '.')
  p()
}

function reportProperties() {
  p('## 8. Property checks')
  p()
  const results = []
  let monotoneFitness = true
  let monotoneFatigue = true
  let monotoneAttr = true
  for (const r of RACES) {
    const course = generateCourse(r)
    for (const k of Object.keys(PROFILES)) {
      for (let f = 0; f < 100; f += 5) {
        if (raceSeconds(course, athlete(k, f + 5, 20)) > raceSeconds(course, athlete(k, f, 20))) monotoneFitness = false
        if (raceSeconds(course, athlete(k, 50, f + 5)) < raceSeconds(course, athlete(k, 50, f))) monotoneFatigue = false
      }
      for (const attr of ATTRS) for (let v = 1; v < 100; v += 3) {
        if (raceSeconds(course, athlete(k, 50, 20, { [attr]: v + 3 })) > raceSeconds(course, athlete(k, 50, 20, { [attr]: v }))) monotoneAttr = false
      }
    }
  }
  results.push(['More Fitness never gives a slower time (all races, profiles, Fitness 0–100)', monotoneFitness])
  results.push(['More Fatigue never gives a faster time', monotoneFatigue])
  results.push(['Raising any attribute never gives a slower time (1–100)', monotoneAttr])
  const a = athlete('climber', 63, 17)
  results.push(['Same inputs give the same result', JSON.stringify(simulate(race('RACE-009'), a)) === JSON.stringify(simulate(race('RACE-009'), a))])
  const forms = Array.from({ length: 2000 }, (_, i) => dayForm('RACE-004', `entry-${i}`, 1767254400000 + i, 16))
  results.push(['Day form (option B) stays within ±4% × (1 − Consistency/100)', forms.every((f) => Math.abs(f) <= C.dayFormMax * 0.84)])
  results.push(['Day form is the same for the same entry', dayForm('RACE-004', 'entry-1', 1767254400000, 16) === dayForm('RACE-004', 'entry-1', 1767254400000, 16)])
  results.push(['Day form is centred (mean of 2,000 entries within ±0.2%)', Math.abs(forms.reduce((s, x) => s + x, 0) / forms.length) < 0.002])
  results.push(['With V1, more Consistency never gives a slower time, and it changes nothing at Fatigue 0', simulate(race('RACE-004'), athlete('all-rounder', 50, 20, { consistency: 30 })).timeS < simulate(race('RACE-004'), athlete('all-rounder', 50, 20, { consistency: 10 })).timeS && simulate(race('RACE-004'), athlete('all-rounder', 50, 0, { consistency: 1 })).timeS === simulate(race('RACE-004'), athlete('all-rounder', 50, 0, { consistency: 100 })).timeS])
  p('| Property | Result |')
  p('|---|---|')
  for (const [label, ok] of results) p(`| ${label} | ${check(ok, label)} |`)
  p()
  p(`Day form example (option B): RACE-004, entry-1, enteredAt 1767254400000, Consistency 16 → ${(dayForm('RACE-004', 'entry-1', 1767254400000, 16) * 100).toFixed(3)}%.`)
  p()
}

function reportApprovedV1() {
  p('## 9. Effect of the approved variant V1 (D9)')
  p()
  p('V1 is part of every table above. Useful points per profile before V1 (Consistency had no effect without day form):')
  p()
  p('| Profile | Consistency | Useful points before V1 |')
  p('|---|---:|---:|')
  for (const [k, a] of Object.entries(PROFILES)) p(`| ${PROFILE_LABELS[k]} | ${a.consistency} | ${96 - a.consistency} |`)
  p()
  const base = athlete('all-rounder', 50, 20)
  p('+8 Consistency on the baseline All-rounder: ' + ['RACE-001', 'RACE-004', 'RACE-007', 'RACE-012'].map((id) => {
    const course = generateCourse(race(id))
    return `${id} ${pct1(raceSeconds(course, { ...base, attributes: { ...base.attributes, consistency: 24 } }) / raceSeconds(course, base) - 1)}`
  }).join(', ') + ' at Fatigue 20; ' + (() => {
    const course = generateCourse(race('RACE-004'))
    const b60 = { ...base, fatigue: 60 }
    return `RACE-004 ${pct1(raceSeconds(course, { ...b60, attributes: { ...b60.attributes, consistency: 24 } }) / raceSeconds(course, b60) - 1)}`
  })() + ' at Fatigue 60.')
  p()
}

async function main() {
  p('# M4.2 race simulation — prototype results (approved model)')
  p()
  p('Generated by `node docs/race-simulation/prototype.mjs`. Do not edit by hand.')
  p()
  await compareWithRepository()
  reportProfiles()
  reportCourses()
  reportTestCases()
  reportBalance()
  reportSensitivity()
  reportExplanations()
  reportRewards()
  reportProperties()
  reportApprovedV1()
  p(`**Checks: ${failures.length === 0 ? 'all passed' : `${failures.length} failed — ${failures.join('; ')}`}.**`)
  console.log(out.join('\n'))
  if (process.argv.includes('--check') && failures.length > 0) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
