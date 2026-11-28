import {useState} from 'react'
import {useT} from '@/i18n'
import {Field} from './Field.tsx'
import {Markdown} from './Markdown.tsx'

export interface MarkdownFieldProps {
    id: string
    label: string
    value: string
    onChange: (value: string) => void
    rows?: number
    maxLength?: number
    placeholder?: string
    hint?: string
    className?: string
    textareaClassName?: string
    previewClassName?: string
    autoFocus?: boolean
}

/** Multiline textarea with a Write / Preview Markdown toggle and formatting hint. */
export function MarkdownField({
    id,
    label,
    value,
    onChange,
    rows = 4,
    maxLength,
    placeholder,
    hint,
    className,
    textareaClassName = 'kce-input w-full',
    previewClassName = 'kce-input w-full min-h-24 text-sm',
    autoFocus,
}: MarkdownFieldProps) {
    const t = useT()
    const [preview, setPreview] = useState(false)
    const tab = (active: boolean) =>
        `px-2 py-0.5 rounded-md text-xs font-bold ${active ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`

    return (
        <Field label={label} htmlFor={id} hint={hint ?? t('markdown.hint')} className={className}>
            <div className="kce-segment flex gap-1 mb-1">
                <button type="button" aria-pressed={!preview} className={tab(!preview)}
                        data-testid={`${id}-write-tab`}
                        onClick={() => setPreview(false)}>{t('markdown.write')}</button>
                <button type="button" aria-pressed={preview} className={tab(preview)}
                        data-testid={`${id}-preview-tab`}
                        onClick={() => setPreview(true)}>{t('markdown.preview')}</button>
            </div>
            {preview ? (
                <div className={previewClassName} data-testid={`${id}-preview`}>
                    {value.trim() ? <Markdown text={value}/> : <span className="text-muted">–</span>}
                </div>
            ) : (
                <textarea id={id} className={textareaClassName} rows={rows} value={value}
                          maxLength={maxLength} placeholder={placeholder} autoFocus={autoFocus}
                          onChange={e => onChange(e.target.value)}/>
            )}
        </Field>
    )
}
