import type { ModelReasoningEffort } from '@deepseek-ai/dsh-api-remotes/client'

/**
 * Pick the strongest effort advertised by one exact model.
 *
 * Adapters expose efforts in escalation/display order, so the final row is the
 * strongest value they actually accept. Keeping this adapter-owned also works
 * for custom effort ids instead of teaching the client a closed vocabulary.
 */
export function highestReasoningEffort(
  efforts: readonly ModelReasoningEffort[] | undefined,
): string | undefined {
  return efforts === undefined || efforts.length === 0
    ? undefined
    : efforts[efforts.length - 1]?.id
}
