import type {ReactNode} from 'react'
import {useT} from '@/i18n'

interface Option {
    id: number | string;
    label: string
}

interface ChipSelectProps {
    options: Option[]
    selected: (number | string)[]
    onChange: (ids: (number | string)[]) => void
    onSelectAll?: () => void
    onSelectNone?: () => void
    label?: ReactNode
}

export function ChipSelect({options, selected, onChange, onSelectAll, onSelectNone, label}: ChipSelectProps) {
    const t = useT()
    const toggle = (id: number | string) =>
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])

    return (
        <div>
            {(label || onSelectAll || onSelectNone) && (
                <div className="flex items-center mb-1.5">
                    {label && <span className="field-label" style={{margin: 0}}>{label}</span>}
                    <span className="text-[10px] text-kce-amber font-bold ml-1">
            {selected.length > 0 ? `(${selected.length})` : ''}
          </span>
                    <div className="ml-auto flex gap-1.5">
                        {onSelectAll &&
                            <button type="button" className="btn-secondary btn-xs" onClick={onSelectAll}>{t('action.all')}</button>}
                        {onSelectNone && <button type="button" className="btn-secondary btn-xs"
                                                 onClick={onSelectNone}>{t('action.none')}</button>}
                    </div>
                </div>
            )}
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {options.map(o => (
                    <button key={o.id} type="button"
                            className={`chip ${selected.includes(o.id) ? 'active' : ''}`}
                            onClick={() => toggle(o.id)}>
                        {o.label}
                    </button>
                ))}
                {!options.length && <p className="text-kce-muted text-xs">–</p>}
            </div>
        </div>
    )
}
