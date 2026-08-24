/** Browser-side transport for the companion-owned project AGENTS.md editor. */

const PROJECT_RULES_API_ROUTE = '/plugins/ui-product-companion/api/project-rules'

export interface ProjectRulesDocument {
  cwd: string
  path: string
  exists: boolean
  content: string
  revision: string
}

export class ProjectRulesRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function responseDocument(response: Response): Promise<ProjectRulesDocument> {
  const body = await response.json() as Partial<ProjectRulesDocument> & { error?: unknown }
  if (!response.ok) {
    throw new ProjectRulesRequestError(
      response.status,
      typeof body.error === 'string' ? body.error : `HTTP ${String(response.status)}`,
    )
  }
  if (typeof body.cwd !== 'string' || typeof body.path !== 'string'
    || typeof body.exists !== 'boolean' || typeof body.content !== 'string'
    || typeof body.revision !== 'string') {
    throw new ProjectRulesRequestError(502, 'invalid project rules response')
  }
  return body as ProjectRulesDocument
}

/** Load the fixed AGENTS.md in one absolute project directory. */
export async function loadProjectRules(cwd: string, signal?: AbortSignal): Promise<ProjectRulesDocument> {
  const response = await fetch(
    `${PROJECT_RULES_API_ROUTE}?cwd=${encodeURIComponent(cwd)}`,
    signal === undefined ? undefined : { signal },
  )
  return responseDocument(response)
}

/** Save an AGENTS.md only when the revision the editor loaded is still current. */
export async function saveProjectRules(
  document: Pick<ProjectRulesDocument, 'cwd' | 'revision'> & { content: string },
): Promise<ProjectRulesDocument> {
  const response = await fetch(PROJECT_RULES_API_ROUTE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  })
  return responseDocument(response)
}
