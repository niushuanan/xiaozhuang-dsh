/** Browser half of native Skill Management Settings. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ManagedSkillDetail, ManagedSkillSummary, SkillImportRequest, SkillInstallResult } from '../types.ts'
import { SkillManagerSection, type SkillManagerInjected } from './SkillManagerSection.tsx'

const API_PATH = '/plugins/skill-manager/api'
export const inject = ['slots', 'sessions']
const PLAIN_CHAT_AGENT_PRESET = 'chat'

function sessionQuery(sessionId: string | undefined): string {
  return sessionId === undefined ? '' : `&sessionId=${encodeURIComponent(sessionId)}`
}

async function jsonResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? fallback)
  return body
}

async function listSkills(sessionId?: string): Promise<{ readonly skills: readonly ManagedSkillSummary[] }> {
  const suffix = sessionId === undefined ? '' : `?sessionId=${encodeURIComponent(sessionId)}`
  return jsonResponse(await fetch(`${API_PATH}/skills${suffix}`, { cache: 'no-store' }), '无法读取 Skill 列表')
}

async function loadSkill(name: string, sessionId?: string): Promise<ManagedSkillDetail> {
  return jsonResponse(await fetch(`${API_PATH}/skill?name=${encodeURIComponent(name)}${sessionQuery(sessionId)}`, { cache: 'no-store' }), '无法读取 Skill')
}

async function importSource(request: SkillImportRequest, sessionId?: string): Promise<SkillInstallResult> {
  const suffix = sessionId === undefined ? '' : `?sessionId=${encodeURIComponent(sessionId)}`
  return jsonResponse(await fetch(`${API_PATH}/import${suffix}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  }), 'Skill 导入失败')
}

/** Contribute the native Skill manager as one Settings section. */
export function apply(ctx: ClientContext): void {
  const currentSessionId = (): string | undefined => {
    const list = ctx.sessions.list.getSnapshot()
    const current = list.current
    if (current === undefined || list.byId[current]?.agentPreset !== PLAIN_CHAT_AGENT_PRESET) return current
    return list.ids.find(id => list.byId[id]?.agentPreset !== PLAIN_CHAT_AGENT_PRESET)
  }
  const injected = (): SkillManagerInjected => ({
    listSkills: () => listSkills(currentSessionId()),
    loadSkill: name => loadSkill(name, currentSessionId()),
    importSource: request => importSource(request, currentSessionId()),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill',
    order: 2,
    label: () => 'Skill 管理',
    inject: injected,
  }, SkillManagerSection))
}
