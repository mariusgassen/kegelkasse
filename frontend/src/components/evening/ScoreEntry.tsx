import {type KeyboardEvent, useState} from 'react'
import {ArrowDown, Delete} from 'lucide-react'
import {useT} from '@/i18n'

interface ScoreEntryProps {
    /** One line per player or team, in the order they are filled in. */
    rows: Array<{ key: string; label: string }>
    values: Record<string, string>
    onChange: (key: string, value: string) => void
}

const MAX_LENGTH = 7  // "Hausnummer" scores run to several digits

/**
 * Game results with a number pad of their own (new design): no system keyboard covering half the
 * tablet, and one key moves on to the next person. A physical keyboard works too.
 */
export function ScoreEntry({rows, values, onChange}: ScoreEntryProps) {
    const t = useT()
    const [index, setIndex] = useState(0)
    /** Until the first key, typing replaces the value that is already there. */
    const [untouched, setUntouched] = useState(true)
    const current = rows[Math.min(index, rows.length - 1)]
    if (!current) return null

    const select = (next: number) => {
        setIndex(next)
        setUntouched(true)
    }

    function type(key: string) {
        const before = untouched ? '' : values[current.key] ?? ''
        if (key === ',' && (before.includes('.') || !before)) return
        const next = before + (key === ',' ? '.' : key)
        if (next.length > MAX_LENGTH) return
        onChange(current.key, next)
        setUntouched(false)
    }

    function erase() {
        onChange(current.key, untouched ? '' : (values[current.key] ?? '').slice(0, -1))
        setUntouched(false)
    }

    const next = () => select((rows.indexOf(current) + 1) % rows.length)

    function onKeyDown(e: KeyboardEvent) {
        if (/^[0-9]$/.test(e.key)) type(e.key)
        else if (e.key === ',' || e.key === '.') type(',')
        else if (e.key === 'Backspace') erase()
        else if (e.key === 'Enter') next()
        else return
        e.preventDefault()  // Enter must not submit the surrounding sheet
    }

    const keyClass = 'grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-lg font-extrabold transition-transform active:scale-[.97] lg:h-16 lg:w-20 lg:text-2xl'

    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3" onKeyDown={onKeyDown}>
            <ul className="flex flex-col gap-1">
                {rows.map((row, i) => {
                    const on = row.key === current.key
                    return (
                        <li key={row.key}>
                            <button type="button" aria-pressed={on} onClick={() => select(i)}
                                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg border-2 px-3 text-left ${on ? 'border-accent bg-accent-tint' : 'border-transparent'}`}>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold">{row.label}</span>
                                <span className={`font-display text-lg font-bold ${values[row.key] ? '' : 'text-muted'}`}>
                                    {(values[row.key] || '0').replace('.', ',')}
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>
            <div role="group" aria-label={t('game.scores')} className="sticky top-1 grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'].map(k => (
                    <button key={k} type="button" className={keyClass} onClick={() => type(k)}>{k}</button>
                ))}
                <button type="button" className={keyClass} aria-label={t('score.erase')} onClick={erase}>
                    <Delete size={22} strokeWidth={2} aria-hidden="true"/>
                </button>
                <button type="button" onClick={next}
                        className="col-span-3 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line font-extrabold transition-transform active:scale-[.97]">
                    <ArrowDown size={18} strokeWidth={2.5} aria-hidden="true"/> {t('score.next')}
                </button>
            </div>
        </div>
    )
}
