import type { MajorBand, MajorConfig, MajorEventInput, MajorPlan, MajorStatus } from '../domain/major/major'
import type { AidStop, Intensity } from '../domain/races/strategyConfig'
import type { MajorRunnerState } from '../game-engine/majorRace'
import { careerRunnerRow, MajorStoreError, type MajorEvent, type RunnerRow, type MajorRegistration, type MajorStore, type MajorReport, type PlayerMajor, type RaceView } from './majorOps'
import type { DueCategory, GridRow, RaceStore, StoredDecision } from './majorOrchestrator'
import type { ServerConfig } from './supabaseRest'

/**
 * Supabase access for `major-ops` over plain HTTP, with the service role key that exists only in
 * the function's environment. Publishing and cancelling go through the database functions
 * `major_publish` and `major_cancel`, which apply the state machine atomically.
 */
interface EventRow {
  id: string
  name: string
  description: string
  race_id: string
  scheduled_start_at: string
  status: MajorStatus
  registration_open_at: string | null
  ready_open_at: string | null
  decision_window_s: number | null
  running_s: number | null
  participant_limit: number | null
  bands_snapshot: MajorBand[] | null
  published_at: string | null
  cancel_reason: string | null
  banner_path: string | null
  clips: Record<string, string> | null
  major_categories?: { idx: number; name: string; min_level: number; max_level: number | null }[]
}

/** The Storage bucket of the Majors' banners and clips (public to read). */
export const MEDIA_BUCKET = 'major-media'

const EVENT_SELECT = 'select=*,major_categories(idx,name,min_level,max_level)'

function toEvent(row: EventRow): MajorEvent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    raceId: row.race_id,
    scheduledStartAt: row.scheduled_start_at,
    status: row.status,
    registrationOpenAt: row.registration_open_at,
    readyOpenAt: row.ready_open_at,
    decisionWindowS: row.decision_window_s,
    runningS: row.running_s,
    participantLimit: row.participant_limit,
    bands: row.bands_snapshot,
    publishedAt: row.published_at,
    cancelReason: row.cancel_reason,
    bannerPath: row.banner_path,
    clips: row.clips ?? {},
    categories: [...(row.major_categories ?? [])]
      .sort((a, b) => a.idx - b.idx)
      .map((c) => ({ idx: c.idx, name: c.name, minLevel: c.min_level, maxLevel: c.max_level })),
  }
}

/** The refusal behind a database error raised by the Major functions or the event guard. */
export function refusalOf(message: string): MajorStoreError | null {
  if (/decision window is closed/.test(message)) return new MajorStoreError('window-closed')
  if (/not on the grid/.test(message)) return new MajorStoreError('not-on-grid')
  if (/ready window is closed/.test(message)) return new MajorStoreError('ready-closed')
  if (/registration is closed/.test(message)) return new MajorStoreError('closed')
  if (/already registered/.test(message)) return new MajorStoreError('already-registered')
  if (/not registered/.test(message)) return new MajorStoreError('not-registered')
  if (/has no category for level/.test(message)) return new MajorStoreError('no-category')
  if (/not found/.test(message)) return new MajorStoreError('not-found')
  if (/is not a draft|only its status can change/.test(message)) return new MajorStoreError('not-draft')
  if (/too soon/.test(message)) return new MajorStoreError('too-soon')
  if (/cannot change|is not allowed/.test(message)) return new MajorStoreError('final')
  return null
}

export function createSupabaseMajorStore(config: ServerConfig): MajorStore {
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
  }

  async function request<T>(path: string, init: RequestInit = {}, prefer?: string): Promise<T> {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
    })
    if (!response.ok) {
      const text = await response.text()
      let message = text
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text
      } catch {
        // Not JSON: keep the text.
      }
      throw refusalOf(message) ?? new Error(`Database request failed (${response.status}): ${message}`)
    }
    return readBody<T>(response)
  }

  const iso = (ms: number) => new Date(ms).toISOString()
  const rpc = (name: string, args: Record<string, unknown>) => request(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })

  async function getEvent(id: string): Promise<MajorEvent> {
    const rows = await request<EventRow[]>(`major_events?id=eq.${id}&${EVENT_SELECT}`)
    if (!rows[0]) throw new MajorStoreError('not-found')
    return toEvent(rows[0])
  }

  const eventBody = (input: MajorEventInput) => ({
    name: input.name,
    description: input.description,
    race_id: input.raceId,
    scheduled_start_at: input.scheduledStartAt,
  })

  return {
    async isAdmin(userId) {
      const rows = await request<unknown[]>(`major_admins?user_id=eq.${encodeURIComponent(userId)}&select=user_id`)
      return rows.length > 0
    },

    async getConfig() {
      const rows = await request<
        {
          start_time_utc: string
          registration_open_days: number
          ready_minutes: number
          decision_window_s: number
          running_s: number
          participant_limit: number
          bands: MajorBand[]
        }[]
      >('major_config?select=*')
      const row = rows[0]
      if (!row) throw new Error('major_config is empty')
      return {
        startTimeUtc: row.start_time_utc.slice(0, 5),
        registrationOpenDays: row.registration_open_days,
        readyMinutes: row.ready_minutes,
        decisionWindowS: row.decision_window_s,
        runningS: row.running_s,
        participantLimit: row.participant_limit,
        bands: row.bands,
      } satisfies MajorConfig
    },

    async setConfig(value, userId) {
      await request(
        'major_config?id=eq.true',
        {
          method: 'PATCH',
          body: JSON.stringify({
            start_time_utc: value.startTimeUtc,
            registration_open_days: value.registrationOpenDays,
            ready_minutes: value.readyMinutes,
            decision_window_s: value.decisionWindowS,
            running_s: value.runningS,
            participant_limit: value.participantLimit,
            bands: value.bands.map((b) => ({ name: b.name.trim(), min: b.min, max: b.max })),
            updated_at: new Date().toISOString(),
            updated_by: userId,
          }),
        },
        'return=minimal',
      )
    },

    async listEvents() {
      const rows = await request<EventRow[]>(`major_events?${EVENT_SELECT}&order=scheduled_start_at.desc&limit=200`)
      return rows.map(toEvent)
    },

    async createEvent(input, userId) {
      const rows = await request<EventRow[]>(
        'major_events',
        { method: 'POST', body: JSON.stringify({ ...eventBody(input), created_by: userId }) },
        'return=representation',
      )
      return toEvent({ ...rows[0]!, major_categories: [] })
    },

    async updateDraft(id, input) {
      const rows = await request<EventRow[]>(
        `major_events?id=eq.${id}&status=eq.DRAFT`,
        { method: 'PATCH', body: JSON.stringify(eventBody(input)) },
        'return=representation',
      )
      return rows[0] ? toEvent({ ...rows[0], major_categories: [] }) : null
    },

    async publish(id, userId, now) {
      await request('rpc/major_publish', {
        method: 'POST',
        body: JSON.stringify({ p_event: id, p_actor: userId, p_now: new Date(now).toISOString() }),
      })
      return getEvent(id)
    },

    async cancel(id, userId, reason) {
      await request('rpc/major_cancel', {
        method: 'POST',
        body: JSON.stringify({ p_event: id, p_actor: userId, p_reason: reason }),
      })
      return getEvent(id)
    },

    getEvent,

    async signUpload(path) {
      const response = await fetch(`${config.url}/storage/v1/object/upload/sign/${MEDIA_BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...headers, 'x-upsert': 'false' },
        body: '{}',
      })
      if (!response.ok) throw new Error(`Signing the upload failed (${response.status}): ${await response.text()}`)
      const { url } = (await response.json()) as { url: string }
      const token = new URL(url, config.url).searchParams.get('token')
      if (!token) throw new Error('The signed upload has no token')
      return token
    },

    async setBanner(id, path) {
      await request(`major_events?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ banner_path: path }) }, 'return=minimal')
      return getEvent(id)
    },

    async setClip(id, segment, path) {
      const current = await getEvent(id)
      const clips = { ...current.clips }
      if (path) clips[String(segment)] = path
      else delete clips[String(segment)]
      await request(`major_events?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ clips }) }, 'return=minimal')
      return getEvent(id)
    },

    async advance(now) {
      await rpc('major_advance', { p_now: iso(now) })
    },

    async playerMajors(userId, now) {
      const since = iso(now - 2 * 86_400_000)
      const rows = await request<EventRow[]>(
        `major_events?status=neq.DRAFT&scheduled_start_at=gte.${encodeURIComponent(since)}&${EVENT_SELECT}&order=scheduled_start_at.asc&limit=20`,
      )
      if (rows.length === 0) return []
      const ids = rows.map((r) => r.id).join(',')
      const mine = await request<
        { event_id: string; level: number; list: 'main' | 'waitlist'; status: MajorRegistration['status']; registered_at: string; ready_at: string | null; plan: Record<string, unknown>; major_categories: { idx: number } }[]
      >(`major_registrations?user_id=eq.${encodeURIComponent(userId)}&event_id=in.(${ids})&select=event_id,level,list,status,registered_at,ready_at,plan,major_categories(idx)`)
      const all = await request<{ event_id: string; list: 'main' | 'waitlist'; major_categories: { idx: number } }[]>(
        `major_registrations?event_id=in.(${ids})&status=neq.WITHDRAWN&select=event_id,list,major_categories(idx)`,
      )
      return rows.map((row): PlayerMajor => {
        const reg = mine.find((r) => r.event_id === row.id)
        const entrants: PlayerMajor['entrants'] = {}
        for (const r of all.filter((a) => a.event_id === row.id)) {
          const counts = (entrants[r.major_categories.idx] ??= { main: 0, waitlist: 0 })
          counts[r.list] += 1
        }
        return {
          ...toEvent(row),
          entrants,
          registration: reg
            ? {
                categoryIdx: reg.major_categories.idx,
                level: reg.level,
                list: reg.list,
                status: reg.status,
                registeredAt: reg.registered_at,
                readyAt: reg.ready_at,
                plan: Object.keys(reg.plan ?? {}).length ? (reg.plan as unknown as MajorPlan) : null,
              }
            : null,
        }
      })
    },

    async register(eventId, userId, entry, now) {
      await rpc('major_register', { p_event: eventId, p_user: userId, p_level: entry.level, p_name: entry.name, p_country: entry.country, p_now: iso(now) })
    },

    async withdraw(eventId, userId, now) {
      await rpc('major_withdraw', { p_event: eventId, p_user: userId, p_now: iso(now) })
    },

    async savePlan(eventId, userId, plan, now) {
      await rpc('major_save_plan', { p_event: eventId, p_user: userId, p_plan: plan, p_now: iso(now) })
    },

    async setReady(eventId, userId, snapshot, now) {
      await rpc('major_set_ready', { p_event: eventId, p_user: userId, p_snapshot: snapshot, p_now: iso(now) })
    },

    async raceView(eventId, userId) {
      const mine = await request<{ id: string; category_id: string; slot: number; plan: Record<string, unknown> }[]>(
        `major_participants?event_id=eq.${eventId}&user_id=eq.${encodeURIComponent(userId)}&select=id,category_id,slot,plan`,
      )
      const me = mine[0]
      if (!me) return null
      const [categories, runners, decisions, events] = await Promise.all([
        request<{ idx: number; name: string; phase: RaceView['category']['phase']; segment: number; segments: number | null; phase_ends_at: string | null }[]>(
          `major_categories?id=eq.${me.category_id}&select=idx,name,phase,segment,segments,phase_ends_at`,
        ),
        request<{ slot: number; kind: 'PLAYER' | 'NPC'; display_name: string; country: string | null; level: number; state: MajorRunnerState | Record<string, never> }[]>(
          `major_participants?category_id=eq.${me.category_id}&select=slot,kind,display_name,country,level,state&order=slot`,
        ),
        request<{ segment: number; stop: AidStop; intensity: Intensity; source: 'PLAYER' | 'AUTO' }[]>(
          `major_decisions?participant_id=eq.${me.id}&select=segment,stop,intensity,source`,
        ),
        request<{ race_id: string; running_s: number; decision_window_s: number }[]>(`major_events?id=eq.${eventId}&select=race_id,running_s,decision_window_s`),
      ])
      const c = categories[0]!
      const open = c.phase === 'PA' ? decisions.find((d) => d.segment === c.segment) : undefined
      // Who raced the last closed aid station on their own decision, and who on their plan.
      const closedSegment = c.phase === 'RUNNING' ? c.segment - 1 : c.phase === 'PA' ? c.segment - 1 : c.phase === 'FINISHED' ? (c.segments ?? 1) - 2 : -1
      const sources: RaceView['sources'] = {}
      if (closedSegment >= 0) {
        const rows = await request<{ source: 'PLAYER' | 'AUTO'; major_participants: { slot: number } }[]>(
          `major_decisions?segment=eq.${closedSegment}&select=source,major_participants!inner(category_id,slot)&major_participants.category_id=eq.${me.category_id}`,
        )
        for (const row of rows) sources[row.major_participants.slot] = row.source
      }
      return {
        category: { idx: c.idx, name: c.name, phase: c.phase, segment: c.segment, segments: c.segments, phaseEndsAt: c.phase_ends_at },
        raceId: events[0]?.race_id ?? '',
        runners: runners.map((r) => ({
          slot: r.slot,
          kind: r.kind,
          name: r.display_name,
          country: r.country,
          level: r.level,
          state: 'progress' in r.state ? (r.state as MajorRunnerState) : null,
        })),
        mySlot: me.slot,
        myDecision: open ? { stop: open.stop, intensity: open.intensity, source: open.source } : null,
        sources,
        myPlan: me.plan && Object.keys(me.plan).length ? (me.plan as unknown as MajorPlan) : null,
        runningS: events[0]?.running_s ?? 150,
        windowS: events[0]?.decision_window_s ?? 90,
      }
    },

    async decide(eventId, userId, segment, stop, intensity) {
      await rpc('major_decide', { p_event: eventId, p_user: userId, p_segment: segment, p_stop: stop, p_intensity: intensity })
    },

    async runners() {
      // Careers are a few kilobytes each: read in pages, summarised here (no account detail kept).
      const players: RunnerRow[] = []
      for (let offset = 0; ; offset += 500) {
        const page = await request<{ game_state: unknown; created_at: string; updated_at: string }[]>(
          `careers?select=game_state,created_at,updated_at&order=created_at&limit=500&offset=${offset}`,
        )
        for (const row of page) players.push(careerRunnerRow(row.game_state, row.created_at, row.updated_at))
        if (page.length < 500) break
      }
      const npcs = await request<{ name: string; country: string; sex: 'male' | 'female'; level: number; xp: number; strength: number; races_per_week: number }[]>(
        'ranking_npcs?select=name,country,sex,level,xp,strength,races_per_week&order=list_order',
      )
      return [
        ...players,
        ...npcs.map(
          (n): RunnerRow => ({
            kind: 'NPC',
            name: n.name,
            sex: n.sex,
            country: n.country,
            level: n.level,
            xp: n.xp,
            coins: null,
            racesFinished: null,
            createdAt: null,
            lastActiveAt: null,
            strength: n.strength,
            racesPerWeek: n.races_per_week,
          }),
        ),
      ]
    },

    async report(eventId) {
      type One<T> = T | T[] | null
      const first = <T,>(value: One<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value)
      const [categories, runners] = await Promise.all([
        request<{ id: string; idx: number; name: string; phase: string }[]>(`major_categories?event_id=eq.${eventId}&select=id,idx,name,phase&order=idx`),
        request<
          {
            slot: number
            category_id: string
            kind: 'PLAYER' | 'NPC'
            display_name: string
            country: string | null
            level: number
            major_results: One<{ position: number; time_s: number }>
            major_rewards: One<{ claimed_at: string | null }>
          }[]
        >(`major_participants?event_id=eq.${eventId}&select=slot,category_id,kind,display_name,country,level,major_results(position,time_s),major_rewards(claimed_at)&order=slot`),
      ])
      const report: MajorReport = {
        categories: categories.map((c) => {
          const rows = runners
            .filter((r) => r.category_id === c.id)
            .map((r) => {
              const result = first(r.major_results)
              const reward = first(r.major_rewards)
              return {
                slot: r.slot,
                kind: r.kind,
                name: r.display_name,
                country: r.country,
                level: r.level,
                position: result?.position ?? null,
                timeS: result?.time_s ?? null,
                claimed: r.kind === 'PLAYER' ? reward !== null && reward.claimed_at !== null : null,
              }
            })
            .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.slot - b.slot)
          return {
            idx: c.idx,
            name: c.name,
            phase: c.phase,
            players: rows.filter((r) => r.kind === 'PLAYER').length,
            npcs: rows.filter((r) => r.kind === 'NPC').length,
            rows,
          }
        }),
      }
      return report
    },

    async log(eventId, userId, kind, detail) {
      await request(
        'major_log',
        { method: 'POST', body: JSON.stringify({ event_id: eventId, actor: userId, kind, detail }) },
        'return=minimal',
      )
    },
  }
}

/** The orchestrator's storage on Supabase (phase 3): reads with the service role, steps via RPC. */
export function createSupabaseRaceStore(config: ServerConfig): RaceStore {
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${config.url}/rest/v1/${path}`, { ...init, headers })
    if (!response.ok) throw new Error(`Database request failed (${response.status}): ${await response.text()}`)
    return readBody<T>(response)
  }
  const iso = (ms: number) => encodeURIComponent(new Date(ms).toISOString())
  type Row = {
    id: string
    category_id: string
    slot: number
    kind: 'PLAYER' | 'NPC'
    level: number
    runner_snapshot: GridRow['snapshot']
    plan: Record<string, unknown>
    state: Record<string, unknown>
  }
  const SELECT = 'select=id,category_id,slot,kind,level,runner_snapshot,plan,state&order=slot'
  const toRow = (r: Row): GridRow => ({
    id: r.id,
    categoryId: r.category_id,
    slot: r.slot,
    kind: r.kind,
    level: r.level,
    snapshot: r.runner_snapshot,
    plan: r.plan && Object.keys(r.plan).length ? (r.plan as unknown as GridRow['plan']) : null,
    state: r.state && 'progress' in r.state ? (r.state as unknown as MajorRunnerState) : null,
  })
  const rpc = async (name: string, args: Record<string, unknown>) =>
    request<boolean>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })

  return {
    async startableEvents(now) {
      const rows = await request<{ id: string; race_id: string }[]>(`major_events?status=eq.LOCKED&scheduled_start_at=lte.${iso(now)}&select=id,race_id`)
      return rows.map((r) => ({ id: r.id, raceId: r.race_id }))
    },
    async grid(eventId) {
      return (await request<Row[]>(`major_participants?event_id=eq.${eventId}&${SELECT}`)).map(toRow)
    },
    async start(eventId, segments, states, now) {
      return rpc('major_start', { p_event: eventId, p_segments: segments, p_states: states, p_now: new Date(now).toISOString() })
    },
    async dueCategories(now) {
      const rows = await request<
        { id: string; event_id: string; phase: 'RUNNING' | 'PA'; segment: number; segments: number; phase_ends_at: string; version: number; major_events: { name: string; race_id: string; running_s: number; decision_window_s: number } }[]
      >(
        `major_categories?phase=in.(RUNNING,PA)&phase_ends_at=lte.${iso(now)}&select=id,event_id,phase,segment,segments,phase_ends_at,version,major_events(name,race_id,running_s,decision_window_s)&order=phase_ends_at&limit=40`,
      )
      return rows.map(
        (r): DueCategory => ({
          id: r.id,
          eventId: r.event_id,
          eventName: r.major_events.name,
          raceId: r.major_events.race_id,
          phase: r.phase,
          segment: r.segment,
          segments: r.segments,
          phaseEndsAt: Date.parse(r.phase_ends_at),
          version: r.version,
          runningS: r.major_events.running_s,
          windowS: r.major_events.decision_window_s,
        }),
      )
    },
    async categoryGrid(categoryId) {
      return (await request<Row[]>(`major_participants?category_id=eq.${categoryId}&${SELECT}`)).map(toRow)
    },
    async decisions(categoryId, segment) {
      const rows = await request<{ participant_id: string; stop: StoredDecision['stop']; intensity: StoredDecision['intensity']; source: StoredDecision['source'] }[]>(
        `major_decisions?segment=eq.${segment}&select=participant_id,stop,intensity,source,major_participants!inner(category_id)&major_participants.category_id=eq.${categoryId}`,
      )
      return rows.map((r) => ({ participantId: r.participant_id, stop: r.stop, intensity: r.intensity, source: r.source }))
    },
    async commitStep(step) {
      return rpc('major_commit_step', {
        p_category: step.categoryId,
        p_version: step.version,
        p_phase: step.phase,
        p_segment: step.segment,
        p_started_at: new Date(step.startedAt).toISOString(),
        p_ends_at: step.endsAt === null ? null : new Date(step.endsAt).toISOString(),
        p_states: step.states,
        p_decisions: step.decisions,
        p_player_decisions_seen: step.playerDecisionsSeen,
        p_results: step.results ?? null,
        p_rewards: step.rewards ?? null,
      })
    },
  }
}

/**
 * A successful answer's body: JSON, or nothing. Writes with `Prefer: return=minimal` answer 201 or
 * 204 with an empty body (the log of every admin action, for one), which is not an error.
 */
export async function readBody<T>(response: Response): Promise<T> {
  const text = await response.text()
  return (text.trim() === '' ? undefined : JSON.parse(text)) as T
}

/** Whether the scheduler's secret is the one kept in Vault (`major_tick_check`). */
export async function checkTickSecret(config: ServerConfig, secret: string | null): Promise<boolean> {
  if (!secret || secret.length < 32) return false
  const response = await fetch(`${config.url}/rest/v1/rpc/major_tick_check`, {
    method: 'POST',
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: secret }),
  })
  return response.ok && (await response.json()) === true
}
