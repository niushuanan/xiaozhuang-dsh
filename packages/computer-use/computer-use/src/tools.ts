import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool, type ParameterSchemaSpec, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type { BrowserRuntime } from './browsers.ts'
import type { DesktopRuntime } from './desktop.ts'
import type { BrowserMode, ComputerUseResult } from './types.ts'

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: {
      type: 'string',
      required: true,
      enum: ['qwen-open-computer-use', 'playwright', 'dsh-browser-bridge'],
    },
    text: { type: 'string', required: true },
    screenshot: {
      type: 'object',
      additionalProperties: false,
      properties: {
        attachmentId: { type: 'string', required: true },
        mediaType: { type: 'string', required: true, enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
        bytes: { type: 'integer', required: true },
        width: { type: 'integer', required: true },
        height: { type: 'integer', required: true },
        name: { type: 'string' },
      },
    },
  },
} as const

function renderResult(_args: unknown, value: ComputerUseResult): ContentBlock[] {
  return [
    { type: 'text', text: value.text },
    ...value.screenshot === undefined ? [] : [{ type: 'image' as const, attachment: value.screenshot }],
  ]
}

async function imageCapable(ctx: Context, exec: ToolExecution): Promise<boolean> {
  const agent = exec.agent
  const llm = ctx.get('llm')
  if (agent === undefined || llm === undefined) return false
  const routed = agent.session.requestHeader()?.config
  const provider = routed?.provider ?? agent.options.provider
  const model = routed?.model ?? agent.options.model
  if (provider === undefined || model === undefined) return false
  const info = await llm.resolveModelInfo(provider, model, exec.signal)
  return info.inputModalities?.includes('image') === true
}

async function saveScreenshot(
  ctx: Context,
  exec: ToolExecution,
  data: Buffer,
  mediaType: ImageMediaType,
  name: string,
): Promise<ImageAttachmentRef | undefined> {
  const attachments = ctx.get('attachments')
  if (attachments === undefined || !(await imageCapable(ctx, exec))) return undefined
  if (!attachments.imageLimits.mediaTypes.includes(mediaType)) return undefined
  return attachments.saveImage({ data, mediaType, name })
}

interface DesktopSpec {
  publicName: string
  upstreamName: string
  title: string
  description: string
  parameters: ParameterSchemaSpec
}

const DESKTOP_TOOLS: readonly DesktopSpec[] = [
  {
    publicName: 'computer_list_apps', upstreamName: 'list_apps', title: 'List desktop apps',
    description: 'List macOS applications that Qwen Open Computer Use can inspect and control.', parameters: {},
  },
  {
    publicName: 'computer_get_state', upstreamName: 'get_app_state', title: 'Inspect desktop app',
    description: 'Read one application accessibility tree and screenshot. Use its element indices in later actions.',
    parameters: { app: { type: 'string', required: true } },
  },
  {
    publicName: 'computer_click', upstreamName: 'click', title: 'Click desktop',
    description: 'Click a live accessibility element. DSH re-resolves its stable identity against the current app window before acting.',
    parameters: {
      app: { type: 'string', required: true }, element_index: { type: 'string', required: true },
      click_count: { type: 'integer' },
      mouse_button: { type: 'string', enum: ['left', 'right', 'middle'] },
    },
  },
  {
    publicName: 'computer_secondary_action', upstreamName: 'perform_secondary_action', title: 'Use desktop action',
    description: 'Perform an accessibility secondary action exposed by an indexed desktop element.',
    parameters: {
      app: { type: 'string', required: true }, element_index: { type: 'string', required: true },
      action: { type: 'string', required: true },
    },
  },
  {
    publicName: 'computer_scroll', upstreamName: 'scroll', title: 'Scroll desktop',
    description: 'Scroll an application or indexed desktop element, then return refreshed state.',
    parameters: {
      app: { type: 'string', required: true }, element_index: { type: 'string' },
      direction: { type: 'string', required: true }, pages: { type: 'number' },
    },
  },
  {
    publicName: 'computer_drag', upstreamName: 'drag', title: 'Drag desktop',
    description: 'Drag between coordinates from the latest screenshot. Use only when an accessibility element action cannot express the gesture.',
    parameters: {
      app: { type: 'string', required: true }, from_x: { type: 'number', required: true },
      from_y: { type: 'number', required: true }, to_x: { type: 'number', required: true },
      to_y: { type: 'number', required: true },
    },
  },
  {
    publicName: 'computer_type_text', upstreamName: 'type_text', title: 'Type on desktop',
    description: 'Type text into the currently focused control in an application.',
    parameters: { app: { type: 'string', required: true }, text: { type: 'string', required: true } },
  },
  {
    publicName: 'computer_press_key', upstreamName: 'press_key', title: 'Press desktop key',
    description: 'Press a key or key chord in an application.',
    parameters: { app: { type: 'string', required: true }, key: { type: 'string', required: true } },
  },
  {
    publicName: 'computer_set_value', upstreamName: 'set_value', title: 'Set desktop value',
    description: 'Set the value of an indexed accessibility element directly.',
    parameters: {
      app: { type: 'string', required: true }, element_index: { type: 'string', required: true },
      value: { type: 'string', required: true },
    },
  },
]

interface BrowserSpec {
  name: string
  action: string
  title: string
  description: string
  parameters: ParameterSchemaSpec
}

const BROWSER_TOOLS: readonly BrowserSpec[] = [
  {
    name: 'browser_open', action: 'open', title: 'Open browser',
    description: 'Open a URL in the active DSH browser session and return a ref-addressable DOM snapshot plus screenshot.',
    parameters: { url: { type: 'string', required: true } },
  },
  {
    name: 'browser_snapshot', action: 'snapshot', title: 'Inspect browser',
    description: 'Read the active browser page as compact DOM refs and a screenshot.', parameters: {},
  },
  {
    name: 'browser_click', action: 'click', title: 'Click browser',
    description: 'Click a DOM ref from browser_snapshot, or an explicit CSS selector.',
    parameters: { ref: { type: 'string' }, selector: { type: 'string' } },
  },
  {
    name: 'browser_fill', action: 'fill', title: 'Fill browser field',
    description: 'Fill a form control addressed by DOM ref or CSS selector.',
    parameters: { ref: { type: 'string' }, selector: { type: 'string' }, text: { type: 'string', required: true } },
  },
  {
    name: 'browser_press_key', action: 'press_key', title: 'Press browser key',
    description: 'Press a keyboard key or chord in the active browser tab.',
    parameters: { key: { type: 'string', required: true } },
  },
  {
    name: 'browser_scroll', action: 'scroll', title: 'Scroll browser',
    description: 'Scroll the active browser page.',
    parameters: {
      direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number' },
    },
  },
  {
    name: 'browser_tabs', action: 'tabs', title: 'List browser tabs',
    description: 'List tabs owned by the current DSH browser session.', parameters: {},
  },
  {
    name: 'browser_use_tab', action: 'use_tab', title: 'Switch browser tab',
    description: 'Switch the current DSH browser session to a listed tab.',
    parameters: { index: { type: 'integer', required: true } },
  },
  {
    name: 'browser_close', action: 'close', title: 'Close browser session',
    description: 'Close only the tabs/context owned by the current DSH browser session.', parameters: {},
  },
]

/**
 * Register Qwen's nine actions in one agent-local tool layer.
 * @param agent Agent activated by `/computer`.
 * @param root Host context providing attachments and model metadata.
 * @param runtime Lazy Qwen desktop provider.
 */
export function registerDesktopTools(agent: Agent, root: Context, runtime: DesktopRuntime): void {
  for (const spec of DESKTOP_TOOLS) {
    agent.ctx.tools.register(defineTool({
      name: spec.publicName,
      description: spec.description,
      parameters: spec.parameters,
      output: { schema: RESULT_SCHEMA, render: renderResult },
      async execute(args, exec) {
        if (exec.agent === undefined) throw new Error(`${spec.publicName} requires an owning DSH session`)
        const result = await runtime.call(exec.agent.session, spec.upstreamName, args, exec.signal)
        let screenshot: ImageAttachmentRef | undefined
        if (result.image !== undefined) {
          const mediaType = result.image.mimeType as ImageMediaType
          screenshot = await saveScreenshot(root, exec, Buffer.from(result.image.data, 'base64'), mediaType, `${spec.publicName}.png`)
        }
        return {
          provider: 'qwen-open-computer-use' as const,
          text: result.text,
          ...screenshot === undefined ? {} : { screenshot },
        }
      },
      presentCall: () => ({ card: 'generic', title: spec.title, kind: 'other' }),
    }))
  }
}

/**
 * Register the browser action set in one agent-local tool layer.
 * @param agent Agent activated by `/browser`.
 * @param root Host context providing attachments and model metadata.
 * @param runtime Browser-provider router.
 * @param modeOf Resolver for the current Agent browser mode.
 */
export function registerBrowserTools(
  agent: Agent,
  root: Context,
  runtime: BrowserRuntime,
  modeOf: (agent: Agent) => BrowserMode,
): void {
  for (const spec of BROWSER_TOOLS) {
    agent.ctx.tools.register(defineTool({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      output: { schema: RESULT_SCHEMA, render: renderResult },
      async execute(args, exec) {
        if (exec.agent === undefined) throw new Error(`${spec.name} requires an owning DSH session`)
        const mode = modeOf(exec.agent)
        const action = await runtime.act(mode, spec.action, String(exec.agent.session.id), args, exec.signal)
        const screenshot = action.screenshot === undefined
          ? undefined
          : await saveScreenshot(root, exec, action.screenshot, 'image/png', `${spec.name}.png`)
        return {
          provider: mode === 'isolated' ? 'playwright' as const : 'dsh-browser-bridge' as const,
          text: action.text,
          ...screenshot === undefined ? {} : { screenshot },
        }
      },
      presentCall: () => ({ card: 'generic', title: spec.title, kind: 'other' }),
    }))
  }
}
