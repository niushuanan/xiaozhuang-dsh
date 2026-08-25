import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-client-ui-adaptive-update',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  {
    companions: [{
      entry: { 'worker-entry': 'lib/types/worker-entry.js' },
      outDir: 'lib',
      format: ['esm'],
      platform: 'node',
      target: 'es2024',
      fixedExtension: false,
      dts: false,
      clean: false,
    }],
  },
)
