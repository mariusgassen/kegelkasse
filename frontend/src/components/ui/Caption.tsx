import type {ElementType, ReactNode} from 'react'

const BASE = 'text-xs font-bold text-muted uppercase tracking-wider'

/**
 * Small uppercase caption above a block of content (a section inside a card or sheet).
 * For a label that belongs to a form control use `<Field>` instead.
 * `className` adds layout (margins, flex, nowrap); `as` switches the element.
 */
export function Caption({as: Tag = 'div', className, children}: {
    as?: ElementType
    className?: string
    children?: ReactNode
}) {
    return <Tag className={className ? `${BASE} ${className}` : BASE}>{children}</Tag>
}
