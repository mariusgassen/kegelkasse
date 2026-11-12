import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Mail} from 'lucide-react'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ExpandableCard} from '@/components/ui/ExpandableCard.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {flashDeepLinkTarget, useDeepLinkVersion} from '@/hooks/useDeepLink.ts'
import {nowDateTimeInput} from '@/lib/datetime.ts'
import type {GuestRequest} from '@/types.ts'
import {Button} from '@/components/ui/Button.tsx'

export const GUEST_REQUESTS_ANCHOR = 'guest-requests'

/** "Sa., 14.11.2026 · 20:00" — scheduled_at is the club's wall-clock time, shown as stored. */
function formatEvening(scheduledAt: string | null): string {
    if (!scheduledAt) return ''
    const day = new Date(scheduledAt.slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    })
    return `${day} · ${scheduledAt.slice(11, 16)}`
}

type Decision = {request: GuestRequest; action: 'approve' | 'reject'}

function PendingCard({req, onDecide}: {req: GuestRequest; onDecide: (d: Decision) => void}) {
    const t = useT()
    const isOnline = useOnline()
    return (
        <div className="kce-card p-3 mb-2" data-testid="guest-request-pending">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-ink">{req.name}</div>
                    <div className="text-xs text-muted mt-0.5">
                        📅 {formatEvening(req.scheduled_at)}{req.venue ? ` · ${req.venue}` : ''}
                    </div>
                    <a href={`mailto:${req.email}`}
                       className="text-xs text-accent-fg mt-0.5 inline-flex items-center gap-1 break-all">
                        <Mail size={12} strokeWidth={2} aria-hidden="true"/>{req.email}
                    </a>
                </div>
                {req.evening_cancelled && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-danger/15 text-danger-fg flex-shrink-0">
                        {t('guestRequests.cancelled')}
                    </span>
                )}
            </div>
            {req.message && (
                <p className="text-sm text-ink italic mt-2 pl-2.5 border-l-2 border-line whitespace-pre-line break-words">
                    {req.message}
                </p>
            )}
            <div className="flex gap-2 mt-2.5">
                <Button variant="secondary" size="sm" className="flex-1" disabled={!isOnline}
                        onClick={() => onDecide({request: req, action: 'reject'})}>
                    {t('guestRequests.reject')}
                </Button>
                {!req.evening_cancelled && (
                    <Button variant="primary" size="sm" className="flex-1" disabled={!isOnline}
                            onClick={() => onDecide({request: req, action: 'approve'})}>
                        ✓ {t('guestRequests.approve')}
                    </Button>
                )}
            </div>
        </div>
    )
}

/**
 * Guest requests from the club website: pending ones up front with approve/reject; decided and expired
 * ones only as a plain "+ N settled" line (same style as the treasury accounts). Any member may decide; both decisions mail the requester, so each goes through
 * a confirmation sheet. Renders nothing until the club has received its first request.
 */
export function GuestRequestsSection() {
    const t = useT()
    const qc = useQueryClient()
    const {data: requests = []} = useQuery({
        queryKey: ['guest-requests'],
        queryFn: api.listGuestRequests,
        staleTime: 30000,
    })
    const [decision, setDecision] = useState<Decision | null>(null)
    const [busy, setBusy] = useState(false)

    // Deep link from the notification mail/push: ?requests=1 → scroll to and flash the section.
    // Waits for the data: until it arrives the section isn't rendered, so there is nothing to scroll to.
    const hashVersion = useDeepLinkVersion()
    const loaded = requests.length > 0
    useEffect(() => {
        if (!loaded || !getHashParams().get('requests')) return
        clearHashParams()
        return flashDeepLinkTarget(GUEST_REQUESTS_ANCHOR)
    }, [hashVersion, loaded])

    // A request for an evening that already took place can no longer be approved: it is not an open
    // request any more, so it only shows up (as "expired") in the small archive line below.
    const now = nowDateTimeInput()
    const isStale = (r: GuestRequest) => !!r.scheduled_at && r.scheduled_at.slice(0, 16) < now
    const pending = requests.filter(r => r.status === 'pending' && !isStale(r))
    const archive = requests
        .filter(r => r.status !== 'pending' || isStale(r))
        .map(r => ({req: r, status: r.status === 'pending' ? 'expired' as const : r.status}))

    async function confirm() {
        if (!decision) return
        const {request, action} = decision
        setBusy(true)
        try {
            const result = action === 'approve'
                ? await api.approveGuestRequest(request.id)
                : await api.rejectGuestRequest(request.id)
            await qc.invalidateQueries({queryKey: ['guest-requests']})
            if (action === 'approve') {
                // Approval adds a planned guest to the evening and eagerly saves it as a
                // known guest — refresh both so each shows up immediately.
                qc.invalidateQueries({queryKey: ['schedule']})
                api.listRegularMembers().then(d => useAppStore.getState().setRegularMembers(d))
            }
            if (result.guest_notified) {
                showToast(t(action === 'approve' ? 'guestRequests.approved' : 'guestRequests.rejected'))
            } else {
                showToast(t('guestRequests.notNotified').replace('{email}', request.email), 'info')
            }
            setDecision(null)
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    if (requests.length === 0) return null

    return (
        <div id={GUEST_REQUESTS_ANCHOR} className="mb-4">
            <div className="sec-heading flex items-center gap-2">
                🙋 {t('guestRequests.title')}
                {pending.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-accent text-on-accent text-xs font-bold"
                          aria-label={t('guestRequests.pendingCount').replace('{n}', String(pending.length))}>
                        {pending.length}
                    </span>
                )}
            </div>

            {pending.map(r => <PendingCard key={r.id} req={r} onDecide={setDecision}/>)}

            {archive.length > 0 && (
                <ExpandableCard bare
                                headerClassName="justify-center gap-1 text-xs text-muted"
                                title={<>+ {archive.length} {t('guestRequests.settledCount')}</>}>
                    <div className="mt-1.5 space-y-1.5">
                        {archive.map(({req: r, status}) => (
                            <div key={r.id} className="flex items-center gap-2 text-sm" data-testid="guest-request-decided">
                                <span className="flex-1 min-w-0 truncate text-ink">
                                    {r.name} <span className="text-muted text-xs">· {formatEvening(r.scheduled_at)}</span>
                                </span>
                                <span className={[
                                    'text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0',
                                    status === 'approved' ? 'bg-positive/15 text-positive-fg'
                                        : status === 'rejected' ? 'bg-danger/15 text-danger-fg' : 'bg-surface-2 text-muted',
                                ].join(' ')}>
                                    {t(`guestRequests.status.${status}`)}
                                </span>
                            </div>
                        ))}
                    </div>
                </ExpandableCard>
            )}

            {decision && (
                <Sheet open onClose={() => setDecision(null)}
                       title={t(decision.action === 'approve' ? 'guestRequests.approveTitle' : 'guestRequests.rejectTitle')}>
                    <p className="text-sm text-ink mb-1">
                        <strong>{decision.request.name}</strong> · {formatEvening(decision.request.scheduled_at)}
                    </p>
                    <p className="text-sm text-muted mb-4">
                        {t(decision.action === 'approve' ? 'guestRequests.approveHint' : 'guestRequests.rejectHint')
                            .replace('{email}', decision.request.email)}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setDecision(null)}>
                            {t('action.cancel')}
                        </Button>
                        <button className={`${decision.action === 'approve' ? 'btn-primary' : 'btn-danger'} flex-1`}
                                disabled={busy} onClick={confirm}>
                            {busy ? t('action.loading')
                                : t(decision.action === 'approve' ? 'guestRequests.approve' : 'guestRequests.reject')}
                        </button>
                    </div>
                </Sheet>
            )}
        </div>
    )
}
