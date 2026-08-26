import type { Context } from '@deepseek-ai/cordis'
import { registerIoaynTools } from './tools.js'
import { attachJournal } from './journal.js'
export { IOAYN_TOOL_PARAMS } from './tools.js'
export { IOAYN_TOOLS } from '../../server/src/core/tools.js'
export { captureEvent, deferCapture } from './journal.js'

export const name = 'ioayn-tools'
export const inject = ['tools']

export function apply(ctx: Context): void {
  registerIoaynTools(ctx)
  attachJournal(ctx)
}
