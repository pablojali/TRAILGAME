import type { CareerOpRequest, CareerOpResponse } from '../../server/careerOps'

/** A server operation failed to reach a decision: no connection, or a server-side failure. */
export type ServerError = 'offline' | 'server-error'

export type CareerOpsCall = (request: CareerOpRequest) => Promise<CareerOpResponse | { ok: false; error: ServerError }>

/** The parts of the Supabase client used here. */
export interface FunctionsClient {
  functions: {
    invoke(
      name: string,
      options: { body: unknown },
    ): Promise<{ data: unknown; error: (Error & { context?: unknown }) | null }>
  }
}

/**
 * Calls the `career-ops` Edge Function (Phase 3B.1) with the player's session. A refusal from the
 * server (a game rule, a conflict) comes back as its own error; no answer at all is 'offline'.
 */
export function createCareerOpsCall(load: () => Promise<FunctionsClient>): CareerOpsCall {
  return async (request) => {
    let client: FunctionsClient
    try {
      client = await load()
    } catch {
      return { ok: false, error: 'offline' }
    }
    const { data, error } = await client.functions.invoke('career-ops', { body: request })
    if (!error) return data as CareerOpResponse
    // An HTTP error from the function carries its JSON answer in the response.
    const context = error.context
    if (context instanceof Response) {
      try {
        const body = (await context.json()) as CareerOpResponse
        if (body && typeof body === 'object' && 'ok' in body) return body
      } catch {
        // Not our JSON: a gateway or deployment problem.
      }
      return { ok: false, error: 'server-error' }
    }
    return { ok: false, error: 'offline' }
  }
}
