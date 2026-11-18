/**
 * Vereinsdokumente — every member reads and downloads the club's PDFs (Satzung, Geschäftsordnung,
 * ...); admins upload new versions with metadata. Members confirm "Kenntnis genommen" or
 * "Zugestimmt" per version, with the count and their own answer shown on the card.
 */
import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Sparkles} from 'lucide-react'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {useAiEnabled} from '@/hooks/useAiEnabled.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {Button} from '@/components/ui/Button.tsx'
import {Field} from '@/components/ui/Field.tsx'
import {Markdown} from '@/components/ui/Markdown.tsx'
import {CardActionMenu} from '@/components/ui/ActionSheet.tsx'
import {nextVersion} from '@/lib/documentVersion.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ConfirmSheet} from '@/components/ui/ConfirmSheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {SkeletonRows} from '@/components/ui/Skeleton.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {aiErrorKey} from '@/lib/aiErrors.ts'
import type {ClubDocument, ClubDocumentResponse, ClubDocumentType} from '@/types.ts'

const TYPE_ICON: Record<ClubDocumentType, string> = {
    satzung: '📜', geschaeftsordnung: '📋', protokoll: '🗓️', sonstiges: '📄',
}
const TYPES: ClubDocumentType[] = ['satzung', 'geschaeftsordnung', 'protokoll', 'sonstiges']

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

/** Textarea with a Markdown preview toggle (summaries are rendered as Markdown on the card). */
function MarkdownField({id, label, value, onChange}: {
    id: string
    label: string
    value: string
    onChange: (v: string) => void
}) {
    const t = useT()
    const [preview, setPreview] = useState(false)
    const tab = (active: boolean) =>
        `px-2 py-0.5 rounded-md text-xs font-bold ${active ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`
    return (
        <Field label={label} htmlFor={id} hint={t('document.markdownHint')}>
            <div className="flex gap-1 mb-1">
                <button type="button" aria-pressed={!preview} className={tab(!preview)}
                        onClick={() => setPreview(false)}>{t('document.edit')}</button>
                <button type="button" aria-pressed={preview} className={tab(preview)}
                        data-testid={`${id}-preview-tab`}
                        onClick={() => setPreview(true)}>{t('document.preview')}</button>
            </div>
            {preview ? (
                <div className="kce-input w-full min-h-24 text-sm" data-testid={`${id}-preview`}>
                    {value.trim() ? <Markdown text={value}/> : <span className="text-muted">–</span>}
                </div>
            ) : (
                <textarea id={id} className="kce-input w-full" rows={5} value={value}
                          maxLength={4000} onChange={e => onChange(e.target.value)}/>
            )}
        </Field>
    )
}

function UploadSheet({group, onClose, onUploaded}: {
    group: ClubDocument | null
    onClose: () => void
    onUploaded: () => void
}) {
    const t = useT()
    const isOnline = useOnline()
    // A new version starts from the next number after the current one; the admin can overwrite it.
    const suggestedVersion = nextVersion(group?.version)
    const [title, setTitle] = useState(group?.title ?? '')
    const [type, setType] = useState<ClubDocumentType>(group?.document_type ?? 'satzung')
    const [version, setVersion] = useState(suggestedVersion)
    const [decisionDate, setDecisionDate] = useState('')
    const [effectiveDate, setEffectiveDate] = useState('')
    const [summary, setSummary] = useState('')
    const [changeSummary, setChangeSummary] = useState('')
    const [aiHint, setAiHint] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [busy, setBusy] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const aiOn = useAiEnabled('suggestions')

    // The PDF only leaves the server for the Claude API when the admin asks for it explicitly.
    async function analyze() {
        if (!file) return
        setAnalyzing(true)
        try {
            const s = await api.analyzeClubDocument(file, group?.group_id, aiHint.trim() || undefined)
            if (s.title && !title.trim()) setTitle(s.title)
            if (s.document_type && !group) setType(s.document_type)
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
        if (!file || !title.trim()) return
        setBusy(true)
        try {
            await api.uploadClubDocument({
                file, title: title.trim(), document_type: type,
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
        <Sheet open onClose={onClose} title={group ? t('document.upload.newVersion') : t('document.upload')}
               onSubmit={submit}>
            <div className="flex flex-col gap-3" data-testid="document-upload-sheet">
                <Field label={t('document.upload.file')} htmlFor="doc-file" hint={t('document.upload.hint')}>
                    <input id="doc-file" type="file" accept="application/pdf" className="kce-input w-full"
                           data-testid="document-file-input"
                           onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }}/>
                    {file && <p className="text-xs text-muted mt-1 truncate">📄 {file.name}</p>}
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
                <MarkdownField id="doc-summary" label={t('document.summary')} value={summary} onChange={setSummary}/>
                {group && (
                    <MarkdownField id="doc-changes" label={t('document.changeSummary')}
                                   value={changeSummary} onChange={setChangeSummary}/>
                )}
                <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="flex-1" data-testid="document-cancel"
                            disabled={busy} onClick={onClose}>
                        {t('action.cancel')}
                    </Button>
                    <Button type="submit" variant="primary" className="flex-1"
                            disabled={busy || !isOnline || !file || !title.trim()}>
                        {t('document.upload.submit')}
                    </Button>
                </div>
            </div>
        </Sheet>
    )
}

function DocumentCard({doc, memberCount, canEdit, busy, history, onDownload, onAck, onWithdraw,
                       onNewVersion, onDelete, onToggleHistory}: {
    doc: ClubDocument
    memberCount: number
    canEdit: boolean
    busy: boolean
    history: ClubDocument[]
    onDownload: (d: ClubDocument) => void
    onAck: (d: ClubDocument, response: ClubDocumentResponse) => void
    onWithdraw: (d: ClubDocument) => void
    onNewVersion: (d: ClubDocument) => void
    onDelete: (d: ClubDocument) => void
    onToggleHistory: () => void
}) {
    const t = useT()
    const isOnline = useOnline()
    const pct = memberCount > 0 ? Math.min(100, Math.round(doc.acknowledged_count / memberCount * 100)) : 0
    return (
        <div className="kce-card p-3" data-testid="document-card">
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
                        {icon: '📤', label: t('document.upload.newVersion'), disabled: busy, onClick: () => onNewVersion(doc)},
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

            <div className="flex flex-wrap gap-2 mt-3">
                <Button variant="primary" className="flex-1" data-testid="document-download"
                        disabled={busy} onClick={() => onDownload(doc)}>
                    ⬇️ {t('document.download')}
                </Button>
                {doc.my_response ? (
                    <Button variant="secondary" className="flex-1" data-testid="document-withdraw"
                            disabled={busy || !isOnline} onClick={() => onWithdraw(doc)}>
                        {t('document.withdraw')}
                    </Button>
                ) : (
                    <>
                        <Button variant="secondary" className="flex-1" data-testid="document-ack"
                                disabled={busy || !isOnline}
                                onClick={() => onAck(doc, 'acknowledged')}>
                            {t('document.acknowledged')}
                        </Button>
                        <Button variant="secondary" className="flex-1" data-testid="document-agree"
                                disabled={busy || !isOnline}
                                onClick={() => onAck(doc, 'agreed')}>
                            {t('document.agreed')}
                        </Button>
                    </>
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
    const [toDelete, setToDelete] = useState<ClubDocument | null>(null)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)

    const {data, isLoading} = useQuery({queryKey: ['club-documents'], queryFn: api.listClubDocuments})
    const docs = data?.documents ?? []
    const memberCount = data?.member_count ?? 0
    const current = docs.filter(d => d.is_current).sort((a, b) =>
        (b.decision_date ?? b.uploaded_at ?? '').localeCompare(a.decision_date ?? a.uploaded_at ?? ''))
    const historyOf = (d: ClubDocument) => docs.filter(x => x.group_id === d.group_id && !x.is_current)

    const invalidate = () => qc.invalidateQueries({queryKey: ['club-documents']})

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

    async function withdraw(d: ClubDocument) {
        setBusyId(d.id)
        try {
            await api.withdrawClubDocumentAcknowledgement(d.id)
            await invalidate()
        } catch (e) { toastError(e) } finally { setBusyId(null) }
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
                {canEdit && (
                    <Button variant="primary" className="flex-shrink-0" data-testid="document-add-button"
                            onClick={() => setUploadGroup(null)}>
                        + {t('document.upload')}
                    </Button>
                )}
            </div>

            {isLoading ? <SkeletonRows rows={4}/> : current.length === 0
                ? <Empty icon="📄" text={t('document.empty')}/>
                : (
                    <div className="space-y-2" data-testid="document-list">
                        {current.map(doc => (
                            <div key={doc.id}>
                                <DocumentCard doc={doc} memberCount={memberCount} canEdit={canEdit}
                                              busy={busyId === doc.id} history={historyOf(doc)}
                                              onDownload={download} onAck={ack} onWithdraw={withdraw}
                                              onNewVersion={setUploadGroup} onDelete={setToDelete}
                                              onToggleHistory={() => setExpanded(expanded === doc.group_id ? null : doc.group_id)}/>
                                {expanded === doc.group_id && historyOf(doc).map(old => (
                                    <div key={old.id} className="kce-card p-2 mt-1 ml-4 flex items-center gap-2">
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
            <ConfirmSheet open={toDelete !== null} onClose={() => setToDelete(null)}
                          title={t('document.delete')} message={t('document.deleteConfirm')}
                          onConfirm={confirmDelete} busy={deleting} withCancel/>
        </div>
    )
}
