/** Browser transport for the companion-owned user-global AGENTS.md editor. */

const GLOBAL_RULES_API_ROUTE = '/plugins/ui-product-companion/api/global-rules'

export interface GlobalRulesDocument {
  path: string
  displayPath: string
  exists: boolean
  content: string
  revision: string
}

export class GlobalRulesRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function responseDocument(response: Response): Promise<GlobalRulesDocument> {
  const body = await response.json() as Partial<GlobalRulesDocument> & { error?: unknown }
  if (!response.ok) {
    throw new GlobalRulesRequestError(
      response.status,
      typeof body.error === 'string' ? body.error : `HTTP ${String(response.status)}`,
    )
  }
  if (typeof body.path !== 'string' || typeof body.displayPath !== 'string'
    || typeof body.exists !== 'boolean' || typeof body.content !== 'string'
    || typeof body.revision !== 'string') {
    throw new GlobalRulesRequestError(502, 'invalid global rules response')
  }
  return body as GlobalRulesDocument
}

/** Load the exact user-global AGENTS.md used by the instruction loader. */
export async function loadGlobalRules(signal?: AbortSignal): Promise<GlobalRulesDocument> {
  const response = await fetch(
    GLOBAL_RULES_API_ROUTE,
    signal === undefined ? undefined : { signal },
  )
  return responseDocument(response)
}

/** Save only when the revision loaded by the editor is still current. */
export async function saveGlobalRules(
  document: Pick<GlobalRulesDocument, 'revision'> & { content: string },
): Promise<GlobalRulesDocument> {
  const response = await fetch(GLOBAL_RULES_API_ROUTE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  })
  return responseDocument(response)
}
