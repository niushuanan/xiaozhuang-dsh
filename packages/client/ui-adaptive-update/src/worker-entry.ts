/** Self-executing detached worker entry. */

import { runUpdateJobFile } from './worker-runtime.ts'

const jobPath = process.argv[2]
if (jobPath === undefined) throw new Error('continuous adaptation worker requires a job path')
await runUpdateJobFile(jobPath)
