import {useState} from 'react'
import {useT} from '@/i18n'
import {usePwaInstall} from '@/hooks/usePwaInstall'
import {Sheet} from '@/components/ui/Sheet'
import {showToast} from '@/components/ui/Toast'

const DISMISSED_KEY = 'kce_install_prompt_dismissed'

/** Shared iOS "Add to Home Screen" walkthrough, reused by the banner and the profile sheet. */
export function InstallHowToSheet({open, onClose}: { open: boolean; onClose: () => void }) {
    const t = useT()
    return (
        <Sheet open={open} onClose={onClose} title={t('install.ios.title')}>
            <p className="text-sm text-kce-muted mb-4">{t('install.ios.intro')}</p>
            <ol className="flex flex-col gap-3">
                {[
                    {n: 1, label: t('install.ios.step.share')},
                    {n: 2, label: t('install.ios.step.add')},
                    {n: 3, label: t('install.ios.step.confirm')},
                ].map(step => (
                    <li key={step.n} className="flex items-center gap-3">
                        <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{background: 'var(--kce-primary)', color: 'var(--kce-bg)'}}>
                            {step.n}
                        </span>
                        <span className="text-sm flex-1">
                            {step.n === 1 ? <>📤 </> : null}{step.label}
                        </span>
                    </li>
                ))}
            </ol>
        </Sheet>
    )
}

/**
 * Dismissible top banner suggesting the user install the PWA. On Chromium it triggers the native
 * install prompt; on iOS Safari it opens the manual "Add to Home Screen" walkthrough.
 */
export function InstallPrompt() {
    const t = useT()
    const {canInstall, isIos, isStandalone, promptInstall} = usePwaInstall()
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true')
    const [howToOpen, setHowToOpen] = useState(false)

    function handleDismiss() {
        localStorage.setItem(DISMISSED_KEY, 'true')
        setDismissed(true)
    }

    async function handleInstall() {
        if (isIos && !canInstall) {
            setHowToOpen(true)
            return
        }
        const outcome = await promptInstall()
        if (outcome === 'accepted') {
            showToast(t('install.done'))
            setDismissed(true)
        }
    }

    const visible = !isStandalone && !dismissed && (canInstall || isIos)

    return (
        <>
            {visible && (
                <div
                    className="install-banner flex items-center justify-center gap-2 px-3 py-1.5 flex-shrink-0"
                    style={{
                        background: 'color-mix(in srgb, var(--kce-primary) 18%, var(--kce-bg))',
                        borderBottom: '1px solid color-mix(in srgb, var(--kce-primary) 40%, transparent)',
                        color: 'var(--kce-cream)',
                    }}>
                    <span className="text-xs font-bold flex-1 min-w-0 truncate">
                        📲 {t('install.banner.body')}
                    </span>
                    <button
                        onClick={handleInstall}
                        className="text-[11px] font-bold px-3 py-1 rounded-full flex-shrink-0 active:opacity-70"
                        style={{background: 'var(--kce-primary)', color: 'var(--kce-bg)', border: 'none'}}>
                        {t('install.banner.button')}
                    </button>
                    <button
                        onClick={handleDismiss}
                        aria-label={t('install.banner.dismiss')}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-kce-muted active:opacity-60 flex-shrink-0"
                        style={{background: 'rgba(255,255,255,0.1)', fontSize: 13, lineHeight: 1}}>
                        ✕
                    </button>
                </div>
            )}
            <InstallHowToSheet open={howToOpen} onClose={() => setHowToOpen(false)}/>
        </>
    )
}
