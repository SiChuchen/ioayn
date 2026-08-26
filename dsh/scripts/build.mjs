import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'lib/index.js',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/cordis/*', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tools/*'],
})
