import { cp, rm } from 'node:fs/promises'

const source = new URL('../src/', import.meta.url)
const output = new URL('../lib/', import.meta.url)

await rm(output, { recursive: true, force: true })
await cp(source, output, { recursive: true })
