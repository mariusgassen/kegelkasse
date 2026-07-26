import {useT} from '@/i18n'

export function Loading({text, className = 'py-4'}: { text?: string; className?: string }) {
    const t = useT()
    return <p className={`text-muted text-sm text-center ${className}`}>{text ?? t('action.loading')}</p>
}
