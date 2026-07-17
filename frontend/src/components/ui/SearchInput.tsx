import {useT} from '@/i18n'

interface SearchInputProps {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    className?: string
}

/** A `kce-input` text field with an inline ✕ button that appears once there's text to clear. */
export function SearchInput({value, onChange, placeholder, className}: SearchInputProps) {
    const t = useT()
    return (
        <div className={`relative ${className ?? ''}`}>
            <input
                className="kce-input w-full pr-9"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label={t('action.clear')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-kce-muted active:opacity-60"
                    style={{background: 'rgba(255,255,255,0.07)', fontSize: 12, lineHeight: 1}}
                >
                    ✕
                </button>
            )}
        </div>
    )
}
