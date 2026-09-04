import { cp, rm } from 'node:fs/promises'

const packageNames = ['team-work', 'zcode-subagent']

for (const packageName of packageNames) {
  const source = new URL(`../packages/${packageName}/src/`, import.meta.url)
  const output = new URL(`../packages/${packageName}/lib/`, import.meta.url)
  await rm(output, { recursive: true, force: true })
  await cp(source, output, { recursive: true })
}
