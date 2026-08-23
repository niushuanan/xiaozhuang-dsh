/** Native fallback for the composer add seat: opens the existing command directory. */
import type { MouseEvent } from 'react'
import { IconPlusOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComposerAddOwnerProps, ComposerAddProps } from '../contract/slots.ts'
import css from './InputBar.module.css'

type ComposerCommandActionProps = ComposerAddOwnerProps & Pick<ComposerAddProps, 't'>

export function ComposerCommandAction({
  disabled, commandMenuOpen, onToggleCommandMenu, focusInput, t,
}: ComposerCommandActionProps) {
  const keepFocus = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    focusInput()
  }
  return (
    <Tooltip label={t('input.commands')} side="top" delayMs={500}>
      <button
        type="button"
        className={css.add}
        aria-label={t('input.commands')}
        aria-haspopup="listbox"
        aria-expanded={commandMenuOpen}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={onToggleCommandMenu}
      >
        <IconPlusOutline16 size={14} />
      </button>
    </Tooltip>
  )
}
