import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runStableAgent } from '../src/agent-runner.ts'
import { createShadowHome } from '../src/shadow-home.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function root(prefix: string): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), prefix))
  roots.push(value)
  return value
}

describe('stable Agent isolation', () => {
  it('copies only the minimal configuration and never copies user conversations', async () => {
    const realHome = await root('dsh-adaptive-real-home-')
    const controlRoot = await root('dsh-adaptive-shadow-root-')
    const files = {
      '.env': 'DEEPSEEK_API_KEY=secret\n',
      '.credentials.yaml': 'credentials: {}\n',
      'settings.yaml': 'model: deepseek\n',
      'AGENTS.md': '# Owner\n',
      'SYSTEM.md': 'You are stable.\n',
    }
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(realHome, name), content, 'utf8')
      await chmod(join(realHome, name), 0o644)
    }
    await mkdir(join(realHome, 'sessions'), { recursive: true })
    await mkdir(join(realHome, 'attachments'), { recursive: true })
    await writeFile(join(realHome, 'sessions', 'conversation.jsonl'), 'private\n', 'utf8')

    const shadow = await createShadowHome(realHome, controlRoot, 'job-1')

    for (const [name, content] of Object.entries(files)) {
      expect(await readFile(join(shadow, name), 'utf8')).toBe(content)
      expect((await stat(join(shadow, name))).mode & 0o777).toBe(0o600)
    }
    await expect(stat(join(shadow, 'sessions'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(join(shadow, 'attachments'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('runs the stable CLI in the candidate directory with the shadow home', async () => {
    const directory = await root('dsh-adaptive-agent-cwd-')
    const shadow = await root('dsh-adaptive-agent-home-')
    const script = join(directory, 'fake-agent.mjs')
    await writeFile(script, [
      'process.stdout.write(JSON.stringify({',
      '  args: process.argv.slice(2),',
      '  cwd: process.cwd(),',
      '  home: process.env.DSH_HOME,',
      '}))',
    ].join('\n'), 'utf8')

    const output = await runStableAgent({
      command: process.execPath,
      argsPrefix: [script],
      cwd: await realpath(directory),
      shadowHome: shadow,
      task: '只审查，不改文件',
      timeoutMs: 5_000,
    })

    expect(JSON.parse(output)).toEqual({
      args: ['--profile', 'headless', '只审查，不改文件'],
      cwd: await realpath(directory),
      home: shadow,
    })
  })
})
