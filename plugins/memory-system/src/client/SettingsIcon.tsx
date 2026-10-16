/** The memory plugin's original two-hemisphere navigation artwork. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export function MemorySettingsIcon({ size, className }: PropsRuntime<'settings.section.icon'>) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.7 3.45A2.2 2.2 0 0 0 3.65 4.6A2.45 2.45 0 0 0 3 8.95a2.4 2.4 0 0 0 2.2 3.55c1.2 0 2.2-.9 2.5-2.05v-7ZM8.3 3.45a2.2 2.2 0 0 1 4.05 1.15A2.45 2.45 0 0 1 13 8.95a2.4 2.4 0 0 1-2.2 3.55c-1.2 0-2.2-.9-2.5-2.05v-7Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.05 6.35c1.35 0 2.45 1.1 2.45 2.45M10.95 6.35c-1.35 0-2.45 1.1-2.45 2.45M5.35 9.7c.95-.1 1.75.4 2.1 1.15M10.65 9.7c-.95-.1-1.75.4-2.1 1.15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
