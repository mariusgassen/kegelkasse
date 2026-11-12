import type {ComponentProps} from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
export type ButtonSize = 'md' | 'sm' | 'xs'

interface ButtonProps extends ComponentProps<'button'> {
    variant?: ButtonVariant
    size?: ButtonSize
    /** Full width (`w-full`). */
    block?: boolean
}

/**
 * The one button. Wraps the `btn-*` CSS classes so variants and sizes live in one place.
 * Like a native <button>, `type` is not defaulted: inside a <Sheet onSubmit> a plain button submits.
 * An icon-only Button needs an `aria-label` (enforced by iconAffordance.test).
 */
export function Button({variant = 'secondary', size = 'md', block, className, ...rest}: ButtonProps) {
    const cls = [
        `btn-${variant}`,
        size !== 'md' && `btn-${size}`,
        block && 'w-full',
        className,
    ].filter(Boolean).join(' ')
    return <button className={cls} {...rest}/>
}
