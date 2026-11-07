interface TabItem<T extends string> { id: T; label: string }

interface TabsProps<T extends string> {
    items: readonly TabItem<T>[]
    value: T
    onChange: (id: T) => void
    /** Margin/layout for the strip, e.g. "mb-3". */
    className?: string
}

/** Horizontally scrolling pill tab strip used for page and sheet sections. */
export function Tabs<T extends string>({items, value, onChange, className = 'mb-3'}: TabsProps<T>) {
    return (
        <div className={`flex gap-1 overflow-x-auto pb-1 min-w-0 ${className}`}>
            {items.map(tb => (
                <button key={tb.id} type="button"
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${value === tb.id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                        onClick={() => onChange(tb.id)}>
                    {tb.label}
                </button>
            ))}
        </div>
    )
}
