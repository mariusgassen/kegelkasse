import {useEffect, useMemo} from 'react'
import {Sheet} from '@/components/ui/Sheet'
import {useI18n, useT} from '@/i18n'
import {compareVersions, itemText, latestVersion, visibleReleases, type Release} from '@/lib/changelog'
import {useWhatsNewStore} from '@/store/whatsNew'
import releasesData from '@/whatsNew/releases.json'

export const ALL_RELEASES = (releasesData as {releases: Release[]}).releases

function formatDate(date: string | undefined, locale: string): string {
    if (!date) return ''
    // Anchor to local midnight so the day can't shift across the UTC boundary.
    return new Date(`${date}T00:00:00`).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
    })
}

export function WhatsNewSheet({open, onClose, releases = ALL_RELEASES}: {
    open: boolean
    onClose: () => void
    releases?: Release[]
}) {
    const t = useT()
    const {locale} = useI18n()
    const markSeen = useWhatsNewStore(s => s.markSeen)
    const lastSeen = useWhatsNewStore(s => s.lastSeen)
    const visible = useMemo(() => visibleReleases(releases), [releases])
    const latest = latestVersion(releases)

    // Capture what was new when the sheet opened, so the "New" pills survive markSeen below.
    const seenAtOpen = useMemo(() => lastSeen, [open]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (open && latest) markSeen(latest)
    }, [open, latest, markSeen])

    const isNew = (v: string) => !seenAtOpen || compareVersions(v, seenAtOpen) > 0

    return (
        <Sheet open={open} onClose={onClose} title={t('whatsNew.title')}>
            {visible.length === 0 ? (
                <p className="text-sm text-muted text-center py-6">{t('whatsNew.empty')}</p>
            ) : (
                <div className="flex flex-col gap-3" data-testid="whats-new">
                    {visible.map(r => (
                        <section key={r.version} className="kce-card p-3 flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-extrabold text-sm text-ink">
                                    {t('whatsNew.version').replace('{v}', r.version)}
                                </h3>
                                {r.version === latest && (
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent-tint text-accent-tint-fg">
                                        {t('whatsNew.current')}
                                    </span>
                                )}
                                {isNew(r.version) && (
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-positive-tint text-positive-tint-fg"
                                          data-testid="whats-new-pill">
                                        {t('whatsNew.new')}
                                    </span>
                                )}
                                <span className="text-xs text-muted ml-auto">{formatDate(r.date, locale)}</span>
                            </div>
                            {r.sections.map(s => (
                                <div key={s.type}>
                                    <p className="text-xs font-bold text-muted mb-1">
                                        {t(`whatsNew.section.${s.type}` as 'whatsNew.section.feat')}
                                    </p>
                                    <ul className="flex flex-col gap-1 list-disc pl-5">
                                        {s.items.map(i => (
                                            <li key={i.key} className="text-sm text-ink">{itemText(i, locale)}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </section>
                    ))}
                </div>
            )}
        </Sheet>
    )
}
