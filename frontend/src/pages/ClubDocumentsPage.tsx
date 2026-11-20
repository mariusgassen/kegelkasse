/**
 * Vereinsdokumente — every member reads and downloads the club's PDFs (Satzung, Geschäftsordnung,
 * ...); admins upload new versions with metadata. Members confirm "Kenntnis genommen" or
 * "Zugestimmt" per version, with the count and their own answer shown on the card.
 *
 * Admins can additionally start a review request with a Frist. Members get push/email, see the
 * deadline here and answer with the same confirmations; admins see progress and can remind.
 */
import {useEffect, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {FileText, Sparkles, X} from 'lucide-react'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {useAiEnabled} from '@/hooks/useAiEnabled.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {Button} from '@/components/ui/Button.tsx'
import {Field} from '@/components/ui/Field.tsx'
import {Markdown} from '@/components/ui/Markdown.tsx'
import {MarkdownField} from '@/components/ui/MarkdownField.tsx'
import {CardActionMenu} from '@/components/ui/ActionSheet.tsx'
import {nextVersion} from '@/lib/documentVersion.ts'
import {useDeepLinkVersion, flashDeepLinkTarget} from '@/hooks/useDeepLink.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ConfirmSheet} from '@/components/ui/ConfirmSheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {SkeletonRows} from '@/components/ui/Skeleton.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {aiErrorKey} from '@/lib/aiErrors.ts'
import {toDateInput, todayDateInput} from '@/lib/datetime.ts'
import type {
    ClubDocument, ClubDocumentResponse, ClubDocumentType, DocumentReviewRequest,
} from '@/types.ts'

const TYPE_ICON: Record<ClubDocumentType, string> = {
    satzung: '📜', geschaeftsordnung: '📋', protokoll: '🗓️', sonstiges: '📄',
}
const TYPES: ClubDocumentType[] = ['satzung', 'geschaeftsordnung', 'protokoll', 'sonstiges']
/** Decisions are agreed to; minutes and other documents are only taken note of — one button, the label follows the type. */
const DECISION_TYPES: ClubDocumentType[] = ['satzung', 'geschaeftsordnung']

function fDate(iso: string | null): string {
    if (!iso) return '–'
    return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
        .toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'})
}

function fDateTime(iso: string | null): string {
    if (!iso) return '–'
    return new Date(iso).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    })
}

function fileSize(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function defaultDeadline(): string {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return toDateInput(d)
}

function daysLeft(deadline: string): number {
    const target = new Date(`${deadline}T00:00:00`).getTime()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((target - today.getTime()) / 86_400_000)
}

/**
 * Upload sheet with two modes: a new document / new version (`group`), or `edit` to correct the
 * metadata of an existing version. Editing never touches the PDF — that only changes via a new version.
 */
function UploadSheet({group, edit, onClose, onUploaded}: {
    group: ClubDocument | null
    edit?: ClubDocument
    onClose: () => void
    onUploaded: () => void
}) {
    const t = useT()
    const isOnline = useOnline()
    const user = useAppStore(s => s.user)
    const canUploadDecisions = isAdmin(user)
    const availableTypes = canUploadDecisions ? TYPES : TYPES.filter(v => !DECISION_TYPES.includes(v))
    // A new version starts from the next number after the current one; the admin can overwrite it.
    const suggestedVersion = nextVersion(group?.version)
    const [title, setTitle] = useState(edit?.title ?? group?.title ?? '')
    const [type, setType] = useState<ClubDocumentType>(
        edit?.document_type ?? group?.document_type ?? (canUploadDecisions ? 'satzung' : 'protokoll')
    )
    const [version, setVersion] = useState(edit ? edit.version ?? '' : suggestedVersion)
    const [decisionDate, setDecisionDate] = useState(edit?.decision_date ?? '')
    const [effectiveDate, setEffectiveDate] = useState(edit?.effective_date ?? '')
    const [summary, setSummary] = useState(edit?.summary ?? '')
    const [changeSummary, setChangeSummary] = useState(edit?.change_summary ?? '')
    const [aiHint, setAiHint] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [busy, setBusy] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const aiOn = useAiEnabled('suggestions')
    const fileInput = useRef<HTMLInputElement>(null)

    // The PDF only leaves the server for the Claude API when the admin asks for it explicitly.
    async function analyze() {
        if (!file) return
        setAnalyzing(true)
        try {
            const s = await api.analyzeClubDocument(file, group?.group_id, aiHint.trim() || undefined)
            if (s.title && !title.trim()) setTitle(s.title)
            if (s.document_type && !group && (canUploadDecisions || !DECISION_TYPES.includes(s.document_type))) {
                setType(s.document_type)
            }
            if (s.version) setVersion(s.version)
            if (s.decision_date) setDecisionDate(s.decision_date)
            if (s.effective_date) setEffectiveDate(s.effective_date)
            if (s.summary) setSummary(s.summary)
            if (s.change_summary) setChangeSummary(s.change_summary)
        } catch (e) {
            const key = aiErrorKey(e)
            if (key) showToast(t(key), 'error')
            else toastError(e)
        } finally {
            setAnalyzing(false)
        }
    }

    async function submit() {
        if (!title.trim() || (!edit && !file)) return
        setBusy(true)
        try {
            if (edit) {
                await api.updateClubDocument(edit.id, {
                    title: title.trim(), document_type: type, version: version.trim() || null,
                    decision_date: decisionDate || null, effective_date: effectiveDate || null,
                    summary: summary.trim() || null, change_summary: changeSummary.trim() || null,
                })
                showToast(t('document.edit.saved'), 'success')
                onUploaded()
                onClose()
                return
            }
            await api.uploadClubDocument({
                file: file!, title: title.trim(), document_type: type,
                version: version.trim() || undefined,
                decision_date: decisionDate || undefined,
                effective_date: effectiveDate || undefined,
                group_id: group?.group_id,
                summary: summary.trim() || undefined,
                change_summary: changeSummary.trim() || undefined,
            })
            showToast(t('document.upload.submit'), 'success')
            onUploaded()
            onClose()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Sheet open onClose={onClose}
               title={edit ? t('document.edit.title') : group ? t('document.upload.newVersion') : t('document.upload')}
               onSubmit={submit}>
            <div className="flex flex-col gap-3" data-testid="document-upload-sheet">
                {edit && <p className="text-xs text-muted">{t('document.edit.hint')}</p>}
                {!edit && <>
                {/* Hidden native input + our own button/chip: the native control prints its own
                    "Keine Datei ausgewählt" text next to the name and looks different on every device. */}
                <Field label={t('document.upload.file')} htmlFor="doc-file" hint={t('document.upload.hint')}>
                    <input ref={fileInput} id="doc-file" type="file" accept="application/pdf" className="hidden"
                           data-testid="document-file-input"
                           onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }}/>
                    {file ? (
                        <div className="kce-card p-2.5 flex items-center gap-2" data-testid="document-file-chip">
                            <FileText size={18} className="text-muted flex-shrink-0" aria-hidden="true"/>
                            <span className="text-sm flex-1 min-w-0 truncate">{file.name}</span>
                            <span className="text-xs text-muted flex-shrink-0">{fileSize(file.size)}</span>
                            <button type="button" aria-label={t('document.upload.removeFile')}
                                    className="flex-shrink-0 p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-2"
                                    data-testid="document-file-remove" onClick={() => setFile(null)}>
                                <X size={16} aria-hidden="true"/>
                            </button>
                        </div>
                    ) : (
                        <Button variant="secondary" block data-testid="document-file-pick"
                                onClick={() => fileInput.current?.click()}>
                            <FileText size={16} aria-hidden="true"/>
                            {t('document.upload.pick')}
                        </Button>
                    )}
                </Field>
                {aiOn && file && (
                    <div className="kce-card p-3 flex flex-col gap-2">
                        <Field label={t('document.ai.hintLabel')} htmlFor="doc-ai-hint">
                            <input id="doc-ai-hint" className="kce-input w-full" value={aiHint} maxLength={500}
                                   placeholder={t('document.ai.hintPlaceholder')}
                                   onChange={e => setAiHint(e.target.value)}/>
                        </Field>
                        <Button variant="secondary" block data-testid="document-ai-fill"
                                disabled={analyzing || busy || !isOnline} onClick={analyze}>
                            <Sparkles size={14} aria-hidden="true"/>
                            {analyzing ? t('document.ai.filling') : t('document.ai.fill')}
                        </Button>
                        <p className="text-xs text-muted">{t('document.ai.hint')}</p>
                    </div>
                )}
                </>}
                <Field label={t('document.upload.title')} htmlFor="doc-title">
                    <input id="doc-title" className="kce-input w-full" value={title}
                           onChange={e => setTitle(e.target.value)} autoFocus/>
                </Field>
                <div className="flex gap-2">
                    <Field label={t('document.upload.type')} htmlFor="doc-type" className="flex-1">
                        <select id="doc-type" className="kce-input w-full" value={type}
                                onChange={e => setType(e.target.value as ClubDocumentType)}>
                            {TYPES.map(v => <option key={v} value={v}>{t(`document.type.${v}` as never)}</option>)}
                        </select>
                    </Field>
                    <Field label={t('document.upload.version')} htmlFor="doc-version" className="flex-1"
                           hint={group && suggestedVersion && version === suggestedVersion
                               ? t('document.upload.versionAuto').replace('{prev}', group.version ?? '') : undefined}>
                        <input id="doc-version" className="kce-input w-full" value={version}
                               onChange={e => setVersion(e.target.value)} placeholder="1.0"/>
                    </Field>
                </div>
                <div className="flex gap-2">
                    <Field label={t('document.upload.decisionDate')} htmlFor="doc-decision" className="flex-1">
                        <input id="doc-decision" type="date" className="kce-input w-full" value={decisionDate}
                               onChange={e => setDecisionDate(e.target.value)}/>
                    </Field>
                    <Field label={t('document.upload.effectiveDate')} htmlFor="doc-effective" className="flex-1">
                        <input id="doc-effective" type="date" className="kce-input w-full" value={effectiveDate}
                               onChange={e => setEffectiveDate(e.target.value)}/>
                    </Field>
                </div>
                <MarkdownField id="doc-summary" label={t('document.summary')} value={summary} onChange={setSummary} rows={5} maxLength={4000}/>
                {(group || edit) && (
                    <MarkdownField id="doc-changes" label={t('document.changeSummary')}
                                   value={changeSummary} onChange={setChangeSummary} rows={5} maxLength={4000}/>
                )}
                <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="flex-1" data-testid="document-cancel"
                            disabled={busy} onClick={onClose}>
                        {t('action.cancel')}
                    </Button>
                    <Button type="submit" variant="primary" className="flex-1"
                            disabled={busy || !isOnline || (!edit && !file) || !title.trim()}>
                        {edit ? t('document.edit.save') : t('document.upload.submit')}
                    </Button>
                </div>
            </div>
        </Sheet>
    )
}

function ReviewSheet({doc, onClose, onCreated}: {
    doc: ClubDocument
    onClose: () => void
    onCreated: () => void
}) {
    const t = useT()
    const isOnline = useOnline()
    const [title, setTitle] = useState(doc.title)
    const [message, setMessage] = useState('')
    const [deadline, setDeadline] = useState(defaultDeadline)
    const [reminderDays, setReminderDays] = useState(2)
    const [autoReminders, setAutoReminders] = useState(true)
    const [busy, setBusy] = useState(false)

    async function submit() {
        if (!deadline) return
        setBusy(true)
        try {
            await api.createDocumentReviewRequest({
                document_id: doc.id, deadline, title: title.trim(),
                message: message.trim() || undefined,
                reminder_days_before: autoReminders ? reminderDays : 0,
                auto_reminders: autoReminders,
            })
            showToast(t('document.review.sent'), 'success')
            onCreated()
            onClose()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Sheet open onClose={onClose} title={t('document.review.new')} onSubmit={submit}>
            <div className="flex flex-col gap-3" data-testid="document-review-sheet">
                <p className="text-xs text-muted">{t('document.review.hint')}</p>
                <div className="text-xs text-muted">
                    {doc.title}{doc.version ? ` · v${doc.version}` : ''}
                </div>
                <Field label={t('document.review.title')} htmlFor="review-title">
                    <input id="review-title" className="kce-input w-full" value={title}
                           onChange={e => setTitle(e.target.value)} autoFocus/>
                </Field>
                <Field label={t('document.review.message')} htmlFor="review-message">
                    <textarea id="review-message" className="kce-input w-full" rows={3} value={message}
                              onChange={e => setMessage(e.target.value)}/>
                </Field>
                <Field label={t('document.review.deadline')} htmlFor="review-deadline">
                    <input id="review-deadline" type="date" className="kce-input w-full" min={todayDateInput()}
                           value={deadline} onChange={e => setDeadline(e.target.value)}/>
                </Field>
                <div className="flex items-center justify-between gap-2">
                    <label className="text-xs text-ink" htmlFor="review-auto">
                        {t('document.review.autoReminders')}
                    </label>
                    <input id="review-auto" type="checkbox" checked={autoReminders}
                           onChange={e => setAutoReminders(e.target.checked)}/>
                </div>
                {autoReminders && (
                    <Field label={t('document.review.reminderDays')} htmlFor="review-days">
                        <input id="review-days" type="number" min={0} max={30} className="kce-input w-full"
                               value={reminderDays}
                               onChange={e => setReminderDays(Math.max(0, Math.min(30, parseInt(e.target.value) || 0)))}/>
                    </Field>
                )}
                <p className="text-xs text-muted">{t('document.review.recipientsHint')}</p>
                <Button type="submit" variant="primary" block disabled={busy || !isOnline || !deadline || !title.trim()}>
                    {t('document.review.submit')}
                </Button>
            </div>
        </Sheet>
    )
}

function ReviewRequestCard({req, doc, canEdit, busy, expanded, highlight, onAck, onWithdraw,
                            onDownload, onRemind, onClose, onCancel, onToggleDetail}: {
    req: DocumentReviewRequest
    doc?: ClubDocument
    canEdit: boolean
    busy: boolean
    expanded: boolean
    highlight: boolean
    onAck: (req: DocumentReviewRequest, response: ClubDocumentResponse) => void
    onWithdraw: (req: DocumentReviewRequest) => void
    onDownload: (doc: ClubDocument) => void
    onRemind: (req: DocumentReviewRequest) => void
    onClose: (req: DocumentReviewRequest) => void
    onCancel: (req: DocumentReviewRequest) => void
    onToggleDetail: () => void
}) {
    const t = useT()
    const isOnline = useOnline()
    const pct = req.recipient_count > 0
        ? Math.min(100, Math.round(req.responded_count / req.recipient_count * 100)) : 0
    const left = daysLeft(req.deadline)
    const due = left < 0 ? t('document.review.overdue') : left === 0 ? t('document.review.today')
        : t('document.review.dueIn').replace('{n}', String(left))
    return (
        <div id={`document-review-${req.document_id}`}
             className={`kce-card p-3 ${highlight ? 'border-accent' : ''}`}
             data-testid="document-review-card" data-doc-id={req.document_id}>
            <div className="flex items-start gap-2">
                <span className="text-xl" aria-hidden="true">📣</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{req.title}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-2 text-muted">
                            {t(`document.review.status.${req.status}` as never)}
                        </span>
                        {req.status === 'open' && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${left < 0 ? 'bg-danger-tint text-danger-fg' : 'bg-surface-2 text-muted'}`}>
                                {due}
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-muted mt-1 space-y-0.5">
                        <div>{req.document_title}{req.document_version ? ` · v${req.document_version}` : ''}</div>
                        <div>{t('document.review.due').replace('{date}', fDate(req.deadline))} · {t('document.review.by').replace('{name}', req.created_by_name)}</div>
                    </div>
                    {req.message && <p className="text-xs text-ink mt-2">{req.message}</p>}
                </div>
            </div>

            <div className="mt-2">
                <div className="flex justify-between text-xs text-muted mb-1">
                    <span>{t('document.review.progress')}</span>
                    <span data-testid="document-review-progress">{req.responded_count}/{req.recipient_count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-positive" style={{width: `${pct}%`}}/>
                </div>
                {req.is_recipient && (
                    <p className="text-xs text-muted mt-1" data-testid="document-review-my-response">
                        {t('document.myResponse')}: {t(req.my_response ? `document.${req.my_response}` as never : 'document.review.response.pending')}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
                {doc && (
                    <Button variant="primary" className="flex-1" data-testid="document-review-download"
                            disabled={busy} onClick={() => onDownload(doc)}>
                        ⬇️ {t('document.download')}
                    </Button>
                )}
                {req.is_recipient && req.status === 'open' && !req.my_response && (
                    <>
                        <Button variant="secondary" className="flex-1" data-testid="document-review-ack"
                                disabled={busy || !isOnline} onClick={() => onAck(req, 'acknowledged')}>
                            {t('document.acknowledged')}
                        </Button>
                        <Button variant="secondary" className="flex-1" data-testid="document-review-agree"
                                disabled={busy || !isOnline} onClick={() => onAck(req, 'agreed')}>
                            {t('document.agreed')}
                        </Button>
                    </>
                )}
                {req.is_recipient && req.my_response && (
                    <Button variant="secondary" className="flex-1" data-testid="document-review-withdraw"
                            disabled={busy || !isOnline} onClick={() => onWithdraw(req)}>
                        {t('document.withdraw')}
                    </Button>
                )}
                {canEdit && req.status === 'open' && (
                    <>
                        <Button variant="secondary" data-testid="document-review-remind"
                                disabled={busy || !isOnline} onClick={() => onRemind(req)}>
                            {t('document.review.remind')}
                        </Button>
                        <Button variant="secondary" data-testid="document-review-close"
                                disabled={busy} onClick={() => onClose(req)}>
                            {t('document.review.close')}
                        </Button>
                    </>
                )}
                {canEdit && (
                    <Button variant="danger" data-testid="document-review-cancel"
                            disabled={busy} onClick={() => onCancel(req)}>
                        {t('document.review.cancel')}
                    </Button>
                )}
            </div>

            {canEdit && (req.recipients?.length ?? 0) > 0 && (
                <div className="mt-3 border-t border-line pt-2">
                    <button type="button" className="text-xs text-accent" data-testid="document-review-detail"
                            onClick={onToggleDetail}>
                        {t('document.review.detail').replace('{n}', String(req.recipients?.length ?? 0))}
                    </button>
                    {expanded && (
                        <ul className="mt-2 space-y-1" data-testid="document-review-recipients">
                            {req.recipients?.map(r => (
                                <li key={`${r.user_id ?? r.responder_name}`} className="flex justify-between text-xs text-muted">
                                    <span>{r.responder_name}</span>
                                    <span>{t(r.response ? `document.${r.response}` as never : 'document.review.response.pending')}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}

function DocumentCard({doc, memberCount, canEdit, busy, history, onDownload, onAck, onWithdraw,
                       onNewVersion, onEdit, onDelete, onReview, onToggleHistory}: {
    doc: ClubDocument
    memberCount: number
    canEdit: boolean
    busy: boolean
    history: ClubDocument[]
    onDownload: (d: ClubDocument) => void
    onAck: (d: ClubDocument, response: ClubDocumentResponse) => void
    onWithdraw: (d: ClubDocument) => void
    onNewVersion: (d: ClubDocument) => void
    onEdit: (d: ClubDocument) => void
    onDelete: (d: ClubDocument) => void
    onReview: (d: ClubDocument) => void
    onToggleHistory: () => void
}) {
    const t = useT()
    const isOnline = useOnline()
    const pct = memberCount > 0 ? Math.min(100, Math.round(doc.acknowledged_count / memberCount * 100)) : 0
    return (
        <div id={`document-${doc.id}`} className="kce-card p-3" data-testid="document-card">
            <div className="flex items-start gap-2">
                <span className="text-xl" aria-hidden="true">{TYPE_ICON[doc.document_type]}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{doc.title}</span>
                        {doc.version && <span className="text-xs text-muted">v{doc.version}</span>}
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-2 text-muted">
                            {t(`document.type.${doc.document_type}` as never)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-2 text-muted">
                            {t(doc.decision_date ? 'document.status.decided' : 'document.status.draft')}
                        </span>
                    </div>
                    <div className="text-xs text-muted mt-1 space-y-0.5">
                        <div>{t('document.upload.decisionDate')}: {fDate(doc.decision_date)} · {t('document.upload.effectiveDate')}: {fDate(doc.effective_date)}</div>
                        <div>{t('document.uploadedAt')}: {fDateTime(doc.uploaded_at)} · {t('document.uploadedBy')}: {doc.uploaded_by_name}</div>
                    </div>
                    {doc.summary && (
                        <div className="text-xs mt-2" data-testid="document-summary">
                            <Markdown text={doc.summary}/>
                        </div>
                    )}
                    {doc.change_summary && (
                        <div className="text-xs mt-2" data-testid="document-change-summary">
                            <span className="font-bold">{t('document.changeSummary')}</span>
                            <Markdown text={doc.change_summary}/>
                        </div>
                    )}
                </div>
                {canEdit && (
                    <CardActionMenu title={doc.title} actions={[
                        {icon: '✏️', label: t('document.editAction'), disabled: busy, onClick: () => onEdit(doc)},
                        {icon: '📤', label: t('document.upload.newVersion'), disabled: busy, onClick: () => onNewVersion(doc)},
                        {icon: '📣', label: t('document.review.new'), disabled: busy, onClick: () => onReview(doc)},
                        {icon: '🗑️', label: t('document.delete'), danger: true, disabled: busy, onClick: () => onDelete(doc)},
                    ]}/>
                )}
            </div>

            <div className="mt-2">
                <div className="flex justify-between text-xs text-muted mb-1">
                    <span>{t('document.progress')}</span>
                    <span data-testid="document-progress">{doc.acknowledged_count}/{memberCount}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-positive" style={{width: `${pct}%`}}/>
                </div>
                {doc.my_response && (
                    <p className="text-xs text-muted mt-1" data-testid="document-my-response">
                        {t('document.myResponse')}: {t(`document.${doc.my_response}` as never)}
                    </p>
                )}
            </div>

            {/* One fixed row: both buttons share the width equally and never wrap, so the row keeps
                its size when the right button switches between confirm and withdraw. */}
            <div className="flex gap-2 mt-3">
                <Button variant="primary" className="flex-1 min-w-0 whitespace-nowrap" data-testid="document-download"
                        disabled={busy} onClick={() => onDownload(doc)}>
                    ⬇️ {t('document.download')}
                </Button>
                {doc.my_response ? (
                    <Button variant="secondary" className="flex-1 min-w-0 whitespace-nowrap" data-testid="document-withdraw"
                            disabled={busy || !isOnline} onClick={() => onWithdraw(doc)}>
                        {t('document.withdraw')}
                    </Button>
                ) : (
                    <Button variant="secondary" className="flex-1 min-w-0 whitespace-nowrap" data-testid="document-confirm"
                            disabled={busy || !isOnline} onClick={() => onAck(doc, DECISION_TYPES.includes(doc.document_type) ? 'agreed' : 'acknowledged')}>
                        {t(DECISION_TYPES.includes(doc.document_type) ? 'document.action.agree' : 'document.action.acknowledge')}
                    </Button>
                )}
            </div>

            {history.length > 0 && (
                <div className="mt-3 border-t border-line pt-2">
                    <button type="button" className="text-xs text-accent" data-testid="document-history"
                            onClick={onToggleHistory}>
                        {t('document.history')} ({history.length})
                    </button>
                </div>
            )}
        </div>
    )
}

export function ClubDocumentsPage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const canEdit = isAdmin(user)
    const [uploadGroup, setUploadGroup] = useState<ClubDocument | null | undefined>(undefined)
    const [editDoc, setEditDoc] = useState<ClubDocument | null>(null)
    const [reviewDoc, setReviewDoc] = useState<ClubDocument | null>(null)
    const [toDelete, setToDelete] = useState<ClubDocument | null>(null)
    const [toCancelRequest, setToCancelRequest] = useState<DocumentReviewRequest | null>(null)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [expandedRequest, setExpandedRequest] = useState<number | null>(null)
    const [busyId, setBusyId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [target, setTarget] = useState<number | null>(null)
    const [highlightDocId, setHighlightDocId] = useState<number | null>(null)
    const deepLinkVersion = useDeepLinkVersion()
    const stopFlash = useRef<(() => void) | null>(null)

    useEffect(() => () => stopFlash.current?.(), [])

    // Deep link (`?item=ID`, from search or a review notification): jump to the document. An older
    // version opens its group's history first; a matching request card is additionally highlighted.
    useEffect(() => {
        const item = getHashParams().get('item')
        if (!item) return
        const id = parseInt(item, 10)
        if (!Number.isFinite(id)) return
        setTarget(id)
        setHighlightDocId(id)
        clearHashParams()
    }, [deepLinkVersion])

    const {data, isLoading} = useQuery({queryKey: ['club-documents'], queryFn: api.listClubDocuments})
    const {data: mineData} = useQuery({
        queryKey: ['document-review-requests-mine'], queryFn: api.listMyDocumentReviewRequests,
    })
    const {data: allData} = useQuery({
        queryKey: ['document-review-requests'], queryFn: api.listDocumentReviewRequests, enabled: canEdit,
    })
    const docs = data?.documents ?? []
    const memberCount = data?.member_count ?? 0
    const current = docs.filter(d => d.is_current).sort((a, b) =>
        (b.decision_date ?? b.uploaded_at ?? '').localeCompare(a.decision_date ?? a.uploaded_at ?? ''))
    const historyOf = (d: ClubDocument) => docs.filter(x => x.group_id === d.group_id && !x.is_current)
    const docById = (id: number) => docs.find(d => d.id === id)
    const requests = canEdit ? (allData?.requests ?? []) : (mineData?.requests ?? [])

    const invalidate = async () => {
        await qc.invalidateQueries({queryKey: ['club-documents']})
        await qc.invalidateQueries({queryKey: ['document-review-requests']})
        await qc.invalidateQueries({queryKey: ['document-review-requests-mine']})
    }

    useEffect(() => {
        if (target === null || isLoading) return
        const doc = docs.find(d => d.id === target)
        if (doc && !doc.is_current) setExpanded(doc.group_id)
        stopFlash.current?.()
        if (doc) stopFlash.current = flashDeepLinkTarget(`document-${doc.id}`)
        setTarget(null)
    }, [target, isLoading, data]) // eslint-disable-line react-hooks/exhaustive-deps

    async function download(d: ClubDocument) {
        try { await api.downloadClubDocument(d.id, d.file_name) } catch (e) { toastError(e) }
    }

    async function ack(d: ClubDocument, response: ClubDocumentResponse) {
        setBusyId(d.id)
        try {
            await api.acknowledgeClubDocument(d.id, response)
            await invalidate()
        } catch (e) { toastError(e) } finally { setBusyId(null) }
    }

    async function ackRequest(req: DocumentReviewRequest, response: ClubDocumentResponse) {
        const doc = docById(req.document_id)
        if (doc) await ack(doc, response)
    }

    async function withdraw(d: ClubDocument) {
        setBusyId(d.id)
        try {
            await api.withdrawClubDocumentAcknowledgement(d.id)
            await invalidate()
        } catch (e) { toastError(e) } finally { setBusyId(null) }
    }

    async function withdrawRequest(req: DocumentReviewRequest) {
        const doc = docById(req.document_id)
        if (doc) await withdraw(doc)
    }

    async function remind(req: DocumentReviewRequest) {
        setBusyId(req.id)
        try {
            const res = await api.remindDocumentReviewRequest(req.id)
            showToast(t('document.review.reminded').replace('{n}', String(res.sent)), 'success')
            await invalidate()
        } catch (e) { toastError(e) } finally { setBusyId(null) }
    }

    async function close(req: DocumentReviewRequest) {
        setBusyId(req.id)
        try {
            await api.closeDocumentReviewRequest(req.id)
            showToast(t('document.review.closed'), 'success')
            await invalidate()
        } catch (e) { toastError(e) } finally { setBusyId(null) }
    }

    async function confirmCancel() {
        if (!toCancelRequest) return
        setDeleting(true)
        try {
            await api.cancelDocumentReviewRequest(toCancelRequest.id)
            showToast(t('document.review.cancelled'), 'success')
            setToCancelRequest(null)
            await invalidate()
        } catch (e) { toastError(e) } finally { setDeleting(false) }
    }

    async function confirmDelete() {
        if (!toDelete) return
        setDeleting(true)
        try {
            await api.deleteClubDocument(toDelete.id)
            showToast(t('document.delete'), 'success')
            setToDelete(null)
            await invalidate()
        } catch (e) { toastError(e) } finally { setDeleting(false) }
    }

    return (
        <div className="page-scroll p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h1 className="sec-heading">📄 {t('document.title')}</h1>
                    <p className="text-xs text-muted">{t('document.subtitle')}</p>
                </div>
                {(data?.can_upload ?? Boolean(user)) && (
                    <Button variant="primary" className="flex-shrink-0" data-testid="document-add-button"
                            onClick={() => setUploadGroup(null)}>
                        + {t('document.upload')}
                    </Button>
                )}
            </div>

            <h2 className="text-sm font-bold pt-1">{t('document.review.open')}</h2>
            {requests.length === 0
                ? <p className="text-xs text-muted" data-testid="document-review-empty">{t('document.review.none')}</p>
                : (
                    <div className="space-y-2" data-testid="document-review-list">
                        {requests.map(req => (
                            <ReviewRequestCard key={req.id} req={req} doc={docById(req.document_id)}
                                               canEdit={canEdit} busy={busyId === req.id}
                                               expanded={expandedRequest === req.id}
                                               highlight={highlightDocId === req.document_id}
                                               onAck={ackRequest} onWithdraw={withdrawRequest}
                                               onDownload={download} onRemind={remind} onClose={close}
                                               onCancel={setToCancelRequest}
                                               onToggleDetail={() => setExpandedRequest(expandedRequest === req.id ? null : req.id)}/>
                        ))}
                    </div>
                )}

            {isLoading ? <SkeletonRows rows={4}/> : current.length === 0
                ? <Empty icon="📄" text={t('document.empty')}/>
                : (
                    <div className="space-y-2" data-testid="document-list">
                        {current.map(doc => (
                            <div key={doc.id} id={`document-${doc.id}`}>
                                <DocumentCard doc={doc} memberCount={memberCount} canEdit={doc.can_edit ?? canEdit}
                                              busy={busyId === doc.id} history={historyOf(doc)}
                                              onDownload={download} onAck={ack} onWithdraw={withdraw}
                                              onNewVersion={setUploadGroup} onEdit={setEditDoc} onDelete={setToDelete}
                                              onReview={setReviewDoc}
                                              onToggleHistory={() => setExpanded(expanded === doc.group_id ? null : doc.group_id)}/>
                                {expanded === doc.group_id && historyOf(doc).map(old => (
                                    <div key={old.id} id={`document-${old.id}`} className="kce-card p-2 mt-1 ml-4 flex items-center gap-2">
                                        <span className="text-sm flex-1 truncate">v{old.version ?? '–'} · {fDate(old.decision_date)}</span>
                                        <Button variant="secondary" className="text-xs"
                                                onClick={() => download(old)}>
                                            ⬇️ {t('document.download')}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

            <p className="text-xs text-muted">{t('document.legalHint')}</p>

            {uploadGroup !== undefined && (
                <UploadSheet group={uploadGroup} onClose={() => setUploadGroup(undefined)}
                             onUploaded={invalidate}/>
            )}
            {editDoc && (
                <UploadSheet group={null} edit={editDoc} onClose={() => setEditDoc(null)} onUploaded={invalidate}/>
            )}
            {reviewDoc && (
                <ReviewSheet doc={reviewDoc} onClose={() => setReviewDoc(null)} onCreated={invalidate}/>
            )}
            <ConfirmSheet open={toDelete !== null} onClose={() => setToDelete(null)}
                          title={t('document.delete')} message={t('document.deleteConfirm')}
                          onConfirm={confirmDelete} busy={deleting} withCancel/>
            <ConfirmSheet open={toCancelRequest !== null} onClose={() => setToCancelRequest(null)}
                          title={t('document.review.cancel')} message={t('document.review.cancelConfirm')}
                          onConfirm={confirmCancel} busy={deleting} withCancel/>
        </div>
    )
}
