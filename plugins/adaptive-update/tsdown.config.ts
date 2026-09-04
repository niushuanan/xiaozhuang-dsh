import { clientBundle } from '../../packages/client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-client-ui-adaptive-update',
  ['src/index.ts', 'src/invariant.ts'],
  {
    companions: [{
      entry: { 'worker-entry': 'src/worker-entry.ts' },
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
