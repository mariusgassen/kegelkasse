import {useId, useState} from 'react'
import {X} from 'lucide-react'
import {useT} from '@/i18n'

interface Props {
    id?: string
    value: string[]
    onChange: (next: string[]) => void
    /** Existing values offered as autocomplete. */
    suggestions?: string[]
    /** Maximum number of pills; with 1 a new entry replaces the current one. */
    max?: number
    maxLength?: number
    placeholder?: string
    renderLabel?: (v: string) => string
}

/** Pill list with an autocomplete input. Enter or comma commits the typed value. */
export function TagInput({id, value, onChange, suggestions = [], max = 8, maxLength = 30, placeholder, renderLabel}: Props) {
    const t = useT()
    const listId = useId()
    const [text, setText] = useState('')
    const label = renderLabel ?? ((v: string) => v)

    const commit = (raw: string) => {
        const v = raw.trim().replace(/^#/, '').slice(0, maxLength)
        setText('')
        if (!v) return
        if (value.some(x => x.toLowerCase() === v.toLowerCase())) return
        if (max === 1) onChange([v])
        else if (value.length < max) onChange([...value, v])
    }

    return (
        <div className="w-full bg-surface-2 border border-line rounded-xl px-2 py-1.5 flex flex-wrap items-center gap-1.5 focus-within:border-accent">
            {value.map(v => (
                <span key={v} className="inline-flex items-center gap-1 rounded-full bg-accent-tint text-accent-tint-fg text-xs font-bold pl-2.5 pr-1 py-1">
                    {label(v)}
                    <button type="button" aria-label={`${label(v)} – ${t('action.clear')}`}
                            onClick={() => onChange(value.filter(x => x !== v))}
                            className="p-0.5 rounded-full">
                        <X size={12} aria-hidden/>
                    </button>
                </span>
            ))}
            {(max === 1 || value.length < max) && (
                <>
                    <input
                        id={id}
                        type="text"
                        list={listId}
                        value={text}
                        maxLength={maxLength}
                        placeholder={value.length === 0 || max === 1 ? placeholder : undefined}
                        onChange={e => {
                            const v = e.target.value
                            // A datalist pick arrives as a full value without Enter.
                            if (v.endsWith(',')) commit(v.slice(0, -1))
                            else if (suggestions.includes(v)) commit(v)
                            else setText(v)
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commit(text) }
                            else if (e.key === 'Backspace' && !text && value.length > 0 && max !== 1) onChange(value.slice(0, -1))
                        }}
                        onBlur={() => commit(text)}
                        className="flex-1 min-w-[6rem] bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none px-1 py-1"
                    />
                    <datalist id={listId}>
                        {suggestions.filter(s => !value.includes(s)).map(s => <option key={s} value={s}>{label(s)}</option>)}
                    </datalist>
                </>
            )}
        </div>
    )
}
