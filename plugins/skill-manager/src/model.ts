import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { parseNormalizationOutput, type NormalizedSkill } from './import.ts'

/** Fixed provider route used only for imported Skill normalization. */
export const NORMALIZER_PROVIDER = 'deepseek-official'
/** Fixed vision-capable model used only for imported Skill normalization. */
export const NORMALIZER_MODEL = 'deepseek-v4-flash-vision-exp'

interface LlmStreamContext {
  readonly llm: {
    readonly stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>
  }
}

function finishFailure(kind: string, message?: string): Error | undefined {
  if (kind === 'stop') return undefined
  if (kind === 'tool-calls') return new Error('Skill normalizer unexpectedly requested a tool')
  if (kind === 'max-tokens') return new Error('Skill normalizer output reached its token limit')
  return new Error(message ?? `Skill normalizer stopped with ${kind}`)
}

/**
 * Normalize one inert staged-file request through the fixed no-tool LLM route.
 * @param ctx - LLM streaming service.
 * @param request - fixed system instruction and inert serialized input.
 * @param signal - optional caller cancellation.
 * @returns validated model proposal.
 */
export async function generateNormalizedSkill(
  ctx: LlmStreamContext,
  request: { readonly system: string; readonly input: string },
  signal?: AbortSignal,
): Promise<NormalizedSkill> {
  const assembler = new BlockAssembler()
  const options: GenerateOptions = {
    provider: NORMALIZER_PROVIDER,
    model: NORMALIZER_MODEL,
    system: request.system,
    messages: [createUserMessage({
      content: [{ type: 'text', text: request.input }],
      source: { kind: 'plugin', plugin: 'ui-skill-manager' },
    })],
    tools: [],
    maxTokens: 6_000,
    ...signal === undefined ? {} : { signal },
  }
  for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
  const finish = assembler.finish
  const failure = finishFailure(finish.kind, 'failure' in finish ? finish.failure.message : undefined)
  if (failure !== undefined) throw failure
  const blocks = assembler.blocks()
  if (blocks.some(block => block.type === 'tool-call')) throw new Error('Skill normalizer output must contain text only')
  const output = blocks
    .filter((block): block is Extract<(typeof blocks)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
  return parseNormalizationOutput(output)
}
