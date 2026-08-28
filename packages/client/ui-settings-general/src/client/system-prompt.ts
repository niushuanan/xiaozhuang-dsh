/** Browser transport for the General Settings SYSTEM.md editor. */

const SYSTEM_PROMPT_API_ROUTE = '/plugins/ui-settings-general/api/system-prompt'

export interface SystemPromptDocument {
  path: string
  displayPath: string
  exists: boolean
  content: string
  revision: string
}

export class SystemPromptRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function responseDocument(response: Response): Promise<SystemPromptDocument> {
  const body = await response.json() as Partial<SystemPromptDocument> & { error?: unknown }
  if (!response.ok) {
    throw new SystemPromptRequestError(
      response.status,
      typeof body.error === 'string' ? body.error : `HTTP ${String(response.status)}`,
    )
  }
  if (typeof body.path !== 'string' || typeof body.displayPath !== 'string'
    || typeof body.exists !== 'boolean' || typeof body.content !== 'string'
    || typeof body.revision !== 'string') {
    throw new SystemPromptRequestError(502, 'invalid system prompt response')
  }
  return body as SystemPromptDocument
}

export async function loadSystemPrompt(signal?: AbortSignal): Promise<SystemPromptDocument> {
  const response = await fetch(
    SYSTEM_PROMPT_API_ROUTE,
    signal === undefined ? undefined : { signal },
  )
  return responseDocument(response)
}

export async function saveSystemPrompt(
  document: Pick<SystemPromptDocument, 'revision'> & { content: string },
): Promise<SystemPromptDocument> {
  const response = await fetch(SYSTEM_PROMPT_API_ROUTE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  })
  return responseDocument(response)
}
