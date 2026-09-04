/**
 * vision-local — DSH 0.1.1 双通道视觉插件（本机 dsh web profile）。
 *
 * Host 半部分：
 *  - 注册全局模型工具 image_vision（qwen3-vl-plus 代看图片；多轮追问历史由脚本维护，
 *    与 ZCode 的 image-vision skill 共享同一份 state/）；
 *  - 注册全局 skill `image-vision` 与常驻提示段（强调"迭代看图直到理解"）；
 *  - 工具解析 `attachment:<id>` 引用：先查本地映射（缓存），未命中则从该会话日志里
 *    找到附件 ref → attachments.readImage 读字节 → 落盘 ~/.dsh/vision-uploads/ → 调用脚本。
 *
 * 配套改动（仓库内）：纯文本适配器把图片块投影成 `【图片 attachment:<id>】` 注记，
 * 支持图片的模型则保留 DSH 0.1.1 的原生图片链路；api-proxy 允许两类模型接收同一附件。
 * 用户经产品原生附件栏发送图片即可。
 *
 * 本包不 publish 任何 service（纯消费 host 服务），可以安全地以行形式插在 profile composition 里。
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'vision-local'

export const inject = ['subprocess', 'tools', 'systemPrompt', 'skills', 'attachments', 'sessionPersistence']

const SCRIPT = '/Users/zhuanghongkai/.zcode/skills/image-vision/scripts/qwen_vision.py'
const CWD = '/Users/zhuanghongkai/.zcode/skills/image-vision'
const UPLOAD_DIR = '/Users/zhuanghongkai/.dsh/vision-uploads'
const MAP_FILE = UPLOAD_DIR + '/attachment-map.json'
// subprocess 服务的子进程环境是清洗过的：脚本用 expanduser('~') 找配置、用 PATH 找 curl，必须显式补上
const CHILD_ENV = { HOME: '/Users/zhuanghongkai', PATH: '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin' }
const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const SKILL_CONTENT = [
  '# Image Vision —— 纯文本模型的视觉后备',
  '',
  '当主模型（如 GLM-5.3、DeepSeek-V4-Pro）是纯文本模型、消息中出现 `【图片 attachment:<id>】` 注记时，本 skill 通过阿里云百炼的 **qwen3-vl-plus** 视觉模型代看图片，把图片内容翻译成文字，并支持对同一张图连续追问。若当前模型已经原生收到图片（如 DeepSeek-V4-Flash-Vision-Exp），直接理解图片，不要仅为看图调用本工具。',
  '',
  '## 在 DSH 中怎么用',
  '',
  '直接调用 `image_vision` 工具（不要用 bash 手动跑脚本）：',
  '',
  '- `images`：本地路径 / http(s) URL / zcode-artifact:// 引用 / `attachment:<id>` 附件引用，可一次多张对比',
  '- `question`：对图片的任何疑问（内容、细节、文字、位置、布局、风格、错误原因……），不设限制，原样提问；省略则默认"详细描述图片内容"',
  '- `reset`：清空该图历史重新开始；`no_history`：单轮；`history`：只看历史',
  '',
  '纯文本模型会把用户经附件栏发送的图片看到为文字注记 `【图片 attachment:<id> —— 请用 image_vision 工具查看这张图片】`，直接用该 id 调用工具即可。原生视觉模型不会收到这个注记，而会直接收到图片。',
  '',
  '## 迭代看图（重点）',
  '',
  '**不要指望一次调用就完事，要自主迭代直到完全理解：**',
  '',
  '1. 第一轮：不带问题调用，拿到整张图的总览描述；',
  '2. 第二轮起：针对局部区域、控件、文字、报错信息等继续追问（同一张图再次调用自动携带历史，视觉模型记得之前的上下文）；',
  '3. 对 UI 截图：先整体布局，再逐块问清每个模块；对报错截图：先读报错文字，再问上下文线索；',
  '4. 直到对图片内容有足够把握，再动手改代码、写报告或做决策。',
  '',
  '**核心原则：想问什么就问什么。** 一旦任务涉及图片内容，主动调用工具获取描述，不要凭文件名或用户话术猜测图片内容。',
  '',
  '## 故障处理',
  '',
  '调用失败会返回 `[image-vision]` 开头的错误原因：',
  '',
  '- **429 限流/余额不足**：稍等片刻重试；反复失败则如实告知用户视觉服务暂不可用，不要编造图片内容。',
  '- **路径/格式问题**：本地图片上限 10MB，仅支持 png/jpg/jpeg/webp/gif。',
  '- `attachment:<id>` 解析失败：如实告知用户该附件找不到对应文件，请用户重新发送图片。',
  '',
  '## API Key',
  '',
  'key 保存在用户本机 `~/.config/image-vision/config.json`（权限 0600），由后端脚本读取，不进任何聊天记录/仓库；如需覆盖可设置环境变量 `DASHSCOPE_API_KEY`。申请地址：阿里云百炼控制台（https://bailian.console.aliyun.com/）→ API-KEY 管理。',
].join('\n')

/** attachmentId → 文件路径 映射（跨重启持久化的缓存）。 */
function loadAttachmentMap() {
  try {
    if (!existsSync(MAP_FILE)) return {}
    const raw = JSON.parse(readFileSync(MAP_FILE, 'utf8'))
    return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

/** 递归扫描 content blocks 里的图片附件 ref（读叶子字段，不拷贝活对象）。 */
function imageRefsIn(content) {
  const refs = []
  if (!Array.isArray(content)) return refs
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    if (value.type === 'image' && value.attachment !== null && typeof value.attachment === 'object') {
      refs.push(value.attachment)
    }
    if (value.type === 'tool-result') refs.push(...imageRefsIn(value.content))
  }
  return refs
}

/** 遍历会话事件，找到指定 attachmentId 的图片 ref（移植自 api-proxy 的 imageInEvent）。 */
function findRefInEvent(event, id) {
  const data = event !== null && typeof event === 'object' ? event.data : undefined
  if (data === undefined || data === null) return undefined
  const direct = imageRefsIn(data.content)
  for (const ref of direct) if (String(ref.attachmentId) === id) return ref
  if (data.message !== null && typeof data.message === 'object' && data.message !== undefined) {
    const wrapped = imageRefsIn(data.message.content)
    for (const ref of wrapped) if (String(ref.attachmentId) === id) return ref
  }
  if (Array.isArray(data.inserted)) {
    for (const message of data.inserted) {
      const inserted = imageRefsIn(message !== null && typeof message === 'object' ? message.content : undefined)
      for (const ref of inserted) if (String(ref.attachmentId) === id) return ref
    }
  }
  return undefined
}

export function apply(ctx) {
  async function spawnPython(pythonArgs, signal, stdinData) {
    let python
    try {
      python = await ctx.subprocess.resolveExecutable('python3', undefined, signal)
    } catch (error) {
      return { exitCode: null, out: '', err: 'python3 不可用：' + String(error && error.message ? error.message : error) }
    }
    const handle = ctx.subprocess.spawn({
      argv: [python].concat(pythonArgs),
      cwd: CWD,
      stdio: {
        stdin: stdinData === undefined ? 'ignore' : { data: stdinData },
        stdout: { maxBytes: 1048576, spill: { maxBytes: 8388608 } },
        stderr: { maxBytes: 65536 },
      },
      graceMs: 8000,
      signal,
      env: CHILD_ENV,
    })
    const outcome = await handle.done
    const stdoutReader = handle.collected.stdout
    const stderrReader = handle.collected.stderr
    return {
      exitCode: outcome.exitCode,
      out: stdoutReader === undefined ? '' : stdoutReader.readFrom(0).text,
      err: stderrReader === undefined ? '' : stderrReader.readFrom(0).text,
    }
  }

  const runScript = (args, signal) => spawnPython([SCRIPT].concat(args), signal, undefined)

  const attachmentMap = loadAttachmentMap()

  function saveAttachmentMap() {
    try {
      writeFileSync(MAP_FILE, JSON.stringify(attachmentMap))
    } catch (error) {
      console.error('[vision-local] 保存 attachment-map 失败:', String(error && error.message ? error.message : error))
    }
  }

  /** 从会话日志找 ref，读出字节落盘并写映射；返回路径或 null。 */
  async function materializeAttachment(agent, id, signal) {
    if (agent === undefined || typeof agent.id !== 'string') return null
    try {
      const { events } = await ctx.sessionPersistence.readFrom(agent.id, 0, signal)
      for (const event of events) {
        const ref = findRefInEvent(event, id)
        if (ref === undefined) continue
        const stored = await ctx.attachments.readImage(ref, signal)
        const mediaType = typeof ref.mediaType === 'string' ? ref.mediaType : ''
        const suffix = MIME_EXT[mediaType] === undefined ? 'png' : MIME_EXT[mediaType]
        const target = UPLOAD_DIR + '/vision-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.' + suffix
        await mkdir(UPLOAD_DIR, { recursive: true })
        await writeFile(target, stored.data)
        attachmentMap[id] = target
        saveAttachmentMap()
        return target
      }
    } catch (error) {
      console.error('[vision-local] materializeAttachment 失败:', String(error && error.message ? error.message : error))
    }
    return null
  }

  async function describeImages(input, signal, agent) {
    const safe = input === undefined || input === null ? {} : input
    const images = safe.images
    if (!Array.isArray(images) || images.length === 0) {
      return { ok: false, error: 'images 不能为空：请提供本地路径、http(s) URL、zcode-artifact:// 或 attachment:<id> 引用' }
    }
    // attachment:<id> → 落盘路径（映射缓存，未命中则从会话日志按需物化）；其余原样传给脚本
    const resolved = []
    for (const image of images) {
      if (typeof image === 'string' && image.startsWith('attachment:')) {
        const id = image.slice('attachment:'.length)
        let path = attachmentMap[id]
        if (path === undefined || typeof path !== 'string') {
          path = await materializeAttachment(agent, id, signal)
        }
        if (path === null || path === undefined) {
          return { ok: false, error: 'attachment:' + id + ' 未找到对应文件，请让用户重新发送这张图片' }
        }
        resolved.push(path)
      } else {
        resolved.push(image)
      }
    }
    const args = resolved.slice()
    if (safe.history === true) {
      args.push('--history')
    } else {
      if (safe.reset === true) args.push('--reset')
      if (safe.no_history === true) args.push('--no-history')
      if (typeof safe.question === 'string' && safe.question.trim() !== '') {
        args.push('-q', safe.question)
      }
    }
    const result = await runScript(args, signal)
    if (result.exitCode !== 0) {
      const reason = (result.err || result.out || '').trim() || '未知错误'
      return { ok: false, exitCode: result.exitCode, error: reason }
    }
    return { ok: true, answer: result.out.trim() }
  }

  // 1) 全局模型工具
  const tool = defineTool({
    name: 'image_vision',
    description:
      '用 qwen3-vl-plus 视觉模型为纯文本主模型代看图片并返回文字描述。当消息含 `【图片 attachment:<id>】` 注记时，凡涉及图片内容的一切疑问'
      + '（图里有什么、文字/表格/界面/报错、布局、风格、下一步怎么操作）都不要自己猜，调用本工具把问题交给视觉模型。'
      + '支持本地路径、http(s) URL、zcode-artifact:// 引用与 attachment:<id> 附件引用（用户发送的图片会以'
      + '【图片 attachment:<id>】注记出现在消息里），可一次传多张对比。同一张图再次调用会自动携带此前的问答历史'
      + '（多轮追问）；用 reset 清空历史、no_history 单轮、history 只看历史。原生视觉模型已经直接收到图片时无需为看图调用本工具。失败时返回 [image-vision] 开头的错误原因，不要编造图片内容。',
    parameters: {
      images: {
        type: 'array',
        items: { type: 'string' },
        required: true,
        description: '要看的图片：本地绝对/相对路径、http(s):// URL、zcode-artifact:// 或 attachment:<id> 引用；可一次传多张对比。',
      },
      question: {
        type: 'string',
        description: '对图片的任何疑问，原样提问（内容/文字/表格/布局/报错原因/接下来怎么做……），不设限制；省略则默认详细描述图片内容。',
      },
      reset: { type: 'boolean', description: '清空该图的历史对话，从头开始问。' },
      no_history: { type: 'boolean', description: '单轮模式：本次不携带、也不写入历史。' },
      history: { type: 'boolean', description: '只查看该图之前的多轮问答历史，不提问。' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => {
        if (value !== null && typeof value === 'object' && value.ok === true) {
          return [{ type: 'text', text: String(value.answer) }]
        }
        return [{ type: 'text', text: 'image_vision 调用失败：' + JSON.stringify(value) }]
      },
    },
    execute: (args, exec) => describeImages(args, exec.signal, exec.agent),
    timeoutMs: 120000,
  })
  ctx.tools.register(tool)

  // 2) 常驻提示段落：只在纯文本模型收到 attachment 注记时启用视觉后备
  ctx.systemPrompt.section({
    name: 'tool:image-vision',
    order: 118,
    text:
      '当消息里出现【图片 attachment:<id>】注记时，说明当前纯文本模型没有原生收到图片：图片相关问题都不要猜，'
      + '必须调用 image_vision 工具把对应 attachment:<id> 交给 qwen3-vl-plus。'
      + '直接传 attachment:<id> 给工具即可。要自主迭代看图：先让工具总览描述，再针对局部/控件/细节继续追问'
      + '（同一张图多次调用自动携带历史），直到完全理解图片内容，再动手改代码或做决策。若当前模型已原生收到图片而没有 attachment 注记，直接理解图片，不要仅为看图调用本工具。',
  })

  // 3) DSH 原生 skill 注册（skill 工具可加载）
  ctx.skills.register({
    name: 'image-vision',
    description: '给纯文本主模型（如 GLM-5.3、DeepSeek-V4-Pro）做视觉后备：当消息出现 attachment 图片注记时，用 qwen3-vl-plus 代看并支持多轮追问；原生视觉模型直接看图。',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'runtime',
    content: SKILL_CONTENT,
  })
}
