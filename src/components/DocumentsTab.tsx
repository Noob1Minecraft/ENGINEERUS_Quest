import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, LockKeyhole, Paperclip, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import type { Language } from '../types';
import { ApiError } from '../utils/api';
import { deleteDocument, listDocuments, uploadDocument, validateDocumentSelection, type AiDocument } from '../documents/documentApi';
import type { AiImage } from '../images/imageApi';
import { ImagesPanel } from './ImagesPanel';
import { LibraryDeleteDialog } from './LibraryDeleteDialog';

type Props = { authenticated: boolean; lang: Language; onRequireAuth: () => void; onUseWithTutor: (document: AiDocument) => void; onUseImagesWithTutor: (images: AiImage[]) => void };

const COPY = {
  ru: {
    title: 'Частная библиотека', subtitle: 'Инженерные документы и визуальные материалы для AI Tutor.', documents: 'Документы', documentHint: 'PDF, DOCX, TXT или Markdown до 10 МБ · до 20 документов.',
    private: 'Приватно — файлы доступны только вашему аккаунту и передаются AI Tutor лишь по вашему выбору.', upload: 'Загрузить документ', uploading: 'Загрузка…', loading: 'Загружаем документы…', retry: 'Повторить',
    emptyTitle: 'Здесь будут ваши инженерные документы', empty: 'Загрузите PDF, DOCX, TXT или Markdown и используйте материал как контекст в AI Tutor.', attach: 'Добавить в AI Tutor', remove: 'Удалить', login: 'Войдите, чтобы открыть частную библиотеку.', signIn: 'Войти',
    loadError: 'Не удалось загрузить документы. Проверьте соединение и попробуйте снова.', uploadError: 'Не удалось загрузить документ. Попробуйте ещё раз.', unsupported: 'Выберите PDF, DOCX, TXT или Markdown.', tooLarge: 'Файл больше 10 МБ. Выберите документ меньшего размера.', quota: 'Достигнут лимит: в библиотеке может быть до 20 документов.', parseError: 'Не удалось обработать файл. Попробуйте другой документ или загрузите его повторно.',
    deleteTitle: 'Удалить документ?', deleteDescription: 'Файл будет удалён из частной библиотеки вместе с обработанным контекстом. Существующие ответы AI Tutor останутся в истории.', cancel: 'Отмена', deleting: 'Удаление…', deleteConfirm: 'Удалить документ', deleteError: 'Не удалось удалить документ. Файл остался в библиотеке — попробуйте снова.', deleted: 'Документ удалён из частной библиотеки.',
    ready: 'Готов', processing: 'Обработка', failed: 'Ошибка', ocr: 'Нужен текстовый PDF', uploaded: 'Загружен', uploadSuccess: 'Документ добавлен в частную библиотеку.', pages: 'стр.', safety: 'Перед инженерным решением сверяйте ответ AI Tutor с исходным документом.',
  },
  kk: {
    title: 'Жеке кітапхана', subtitle: 'AI Tutor үшін инженерлік құжаттар мен көрнекі материалдар.', documents: 'Құжаттар', documentHint: 'PDF, DOCX, TXT немесе Markdown, 10 МБ-қа дейін · 20 құжатқа дейін.',
    private: 'Құпия — файлдар тек аккаунтыңызға қолжетімді және AI Tutor-ға тек өз таңдауыңызбен жіберіледі.', upload: 'Құжат жүктеу', uploading: 'Жүктелуде…', loading: 'Құжаттар жүктелуде…', retry: 'Қайталау', emptyTitle: 'Инженерлік құжаттарыңыз осында болады', empty: 'PDF, DOCX, TXT немесе Markdown жүктеп, оны AI Tutor контексті ретінде пайдаланыңыз.', attach: 'AI Tutor-ға қосу', remove: 'Жою', login: 'Жеке кітапхананы ашу үшін кіріңіз.', signIn: 'Кіру',
    loadError: 'Құжаттар жүктелмеді. Байланысты тексеріп, қайталап көріңіз.', uploadError: 'Құжат жүктелмеді. Қайталап көріңіз.', unsupported: 'PDF, DOCX, TXT немесе Markdown таңдаңыз.', tooLarge: 'Файл 10 МБ-тан үлкен. Кішірек құжат таңдаңыз.', quota: 'Кітапханадағы 20 құжат лимитіне жеттіңіз.', parseError: 'Файл өңделмеді. Басқа құжатты қолданып көріңіз немесе қайта жүктеңіз.',
    deleteTitle: 'Құжат жойылсын ба?', deleteDescription: 'Файл жеке кітапханадан өңделген контекстімен бірге жойылады. AI Tutor-дың бұрынғы жауаптары тарихта қалады.', cancel: 'Бас тарту', deleting: 'Жойылуда…', deleteConfirm: 'Құжатты жою', deleteError: 'Құжат жойылмады. Файл кітапханада қалды — қайталап көріңіз.', deleted: 'Құжат жеке кітапханадан жойылды.', ready: 'Дайын', processing: 'Өңделуде', failed: 'Қате', ocr: 'Мәтіндік PDF қажет', uploaded: 'Жүктелді', uploadSuccess: 'Құжат жеке кітапханаға қосылды.', pages: 'бет', safety: 'Инженерлік шешім алдында AI Tutor жауабын бастапқы құжатпен салыстырыңыз.',
  },
  en: {
    title: 'Private library', subtitle: 'Engineering documents and visual references for AI Tutor.', documents: 'Documents', documentHint: 'PDF, DOCX, TXT, or Markdown up to 10 MB · up to 20 documents.', private: 'Private — files are visible only to your account and sent to AI Tutor only when you attach them.', upload: 'Upload document', uploading: 'Uploading…', loading: 'Loading documents…', retry: 'Retry', emptyTitle: 'Your engineering documents will appear here', empty: 'Upload a PDF, DOCX, TXT, or Markdown file and use it as context in AI Tutor.', attach: 'Add to AI Tutor', remove: 'Delete', login: 'Sign in to open your private library.', signIn: 'Sign in',
    loadError: 'Documents could not be loaded. Check your connection and try again.', uploadError: 'The document could not be uploaded. Try again.', unsupported: 'Choose a PDF, DOCX, TXT, or Markdown file.', tooLarge: 'The file is larger than 10 MB. Choose a smaller document.', quota: 'You have reached the 20-document library limit.', parseError: 'The file could not be processed. Try another document or upload it again.', deleteTitle: 'Delete document?', deleteDescription: 'The file and its processed context will be removed from your private library. Existing AI Tutor answers remain in conversation history.', cancel: 'Cancel', deleting: 'Deleting…', deleteConfirm: 'Delete document', deleteError: 'The document could not be deleted. It remains in your library — try again.', deleted: 'Document deleted from your private library.', ready: 'Ready', processing: 'Processing', failed: 'Failed', ocr: 'Text-based PDF needed', uploaded: 'Uploaded', uploadSuccess: 'Document added to your private library.', pages: 'pages', safety: 'Verify AI Tutor answers against the source document before making engineering decisions.',
  },
} satisfies Record<Language, Record<string, string>>;

function formatBytes(bytes: number, lang: Language): string { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toLocaleString(lang, { maximumFractionDigits: 1 })} MB`; }
function formatDate(value: string, lang: Language): string { return new Intl.DateTimeFormat(lang === 'kk' ? 'kk-KZ' : lang === 'ru' ? 'ru-KZ' : 'en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function documentStatus(document: AiDocument, lang: Language): { label: string; tone: string } {
  const labels = COPY[lang];
  if (document.status === 'ready') return { label: labels.ready, tone: 'bg-emerald-50 text-emerald-700' };
  if (document.status === 'failed') return { label: document.issue === 'ocr_required' ? labels.ocr : labels.failed, tone: 'bg-rose-50 text-rose-700' };
  return { label: document.status === 'uploaded' ? labels.uploaded : labels.processing, tone: 'bg-amber-50 text-amber-800' };
}
function uploadError(error: unknown, lang: Language): string {
  const labels = COPY[lang];
  if (!(error instanceof ApiError)) return labels.uploadError;
  if (error.code === 'document_quota_exceeded') return labels.quota;
  if (error.code === 'document_too_large') return labels.tooLarge;
  if (['unsupported_document', 'invalid_document_type', 'invalid_upload'].includes(error.code)) return labels.unsupported;
  if (['ocr_required', 'processing_failed', 'document_processing_failed'].includes(error.code)) return labels.parseError;
  return labels.uploadError;
}

export const DocumentsTab: React.FC<Props> = ({ authenticated, lang, onRequireAuth, onUseWithTutor, onUseImagesWithTutor }) => {
  const labels = COPY[lang];
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<AiDocument[]>([]);
  const [loading, setLoading] = useState(authenticated);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AiDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true); setError(null);
    try { setDocuments(await listDocuments()); setListFailed(false); } catch { setError(labels.loadError); setListFailed(true); } finally { setLoading(false); }
  }, [authenticated, labels.loadError]);

  useEffect(() => { if (!authenticated) { setDocuments([]); setLoading(false); return; } void load(); }, [authenticated, load]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const validationError = validateDocumentSelection(file, lang);
    if (validationError) { setError(validationError); if (inputRef.current) inputRef.current.value = ''; return; }
    setUploading(true); setError(null); setNotice(null); setListFailed(false);
    try { const document = await uploadDocument(file); setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]); setNotice(labels.uploadSuccess); }
    catch (caught) { setError(uploadError(caught, lang)); void load(); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true); setError(null); setNotice(null); setListFailed(false);
    try { await deleteDocument(pendingDelete.id); setDocuments((current) => current.filter((item) => item.id !== pendingDelete.id)); setPendingDelete(null); setNotice(labels.deleted); }
    catch { setError(labels.deleteError); }
    finally { setDeleting(false); }
  }

  if (!authenticated) return <section className="eq-library-guest"><LockKeyhole aria-hidden="true" /><p>{labels.login}</p><button type="button" onClick={onRequireAuth} className="eq-button eq-button--primary">{labels.signIn}</button></section>;

  return <div className="eq-library-workspace space-y-7">
    <header className="eq-library-heading border-b border-slate-200 pb-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">{labels.title}</p><h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{labels.subtitle}</h1><p className="mt-3 flex max-w-3xl items-start gap-2 text-sm leading-relaxed text-slate-600"><LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{labels.private}</p></header>
    <section aria-labelledby="documents-heading" className="eq-library-section space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="documents-heading" className="text-xl font-black text-slate-950">{labels.documents}</h2><p className="mt-1 text-sm text-slate-500">{labels.documentHint}</p></div><input ref={inputRef} aria-label={labels.upload} className="sr-only" type="file" accept=".pdf,.docx,.txt,.md,.markdown" onChange={(event) => void onFile(event.target.files?.[0])} /><button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">{uploading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}{uploading ? labels.uploading : labels.upload}</button></div>
      <p className="flex items-start gap-2 border-l-2 border-amber-400 pl-3 text-xs leading-relaxed text-slate-600"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />{labels.safety}</p>
      {notice ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}
      {error ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-start gap-2"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>{listFailed ? <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 font-bold underline decoration-rose-300 underline-offset-4"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{labels.retry}</button> : null}</div> : null}
      {loading ? <div role="status" className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-blue-600" />{labels.loading}</div> : documents.length === 0 ? <div className="border-y border-dashed border-slate-300 py-10 text-center"><FileText aria-hidden="true" className="mx-auto h-8 w-8 text-blue-500" /><h3 className="mt-3 text-base font-black text-slate-800">{labels.emptyTitle}</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{labels.empty}</p></div> : <div className="divide-y divide-slate-200 border-y border-slate-200">
        {documents.map((document) => { const status = documentStatus(document, lang); return <article key={document.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700"><FileText aria-hidden="true" className="h-5 w-5" /></div><div className="min-w-0"><h3 className="break-words text-sm font-black text-slate-900 [overflow-wrap:anywhere]">{document.original_filename}</h3><div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500"><span>{document.file_type.toUpperCase()}</span><span aria-hidden="true">·</span><span>{formatBytes(document.size_bytes, lang)}</span><span aria-hidden="true">·</span><time dateTime={document.created_at}>{formatDate(document.created_at, lang)}</time>{document.page_count ? <><span aria-hidden="true">·</span><span>{document.page_count} {labels.pages}</span></> : null}<span className={`rounded-md px-2 py-0.5 font-bold ${status.tone}`}>{status.label}</span></div>{document.status === 'failed' ? <p className="mt-2 text-xs leading-relaxed text-rose-700">{labels.parseError}</p> : null}</div></div><div className="flex flex-wrap gap-2 sm:justify-end"><button type="button" disabled={document.status !== 'ready'} onClick={() => onUseWithTutor(document)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-45"><Paperclip aria-hidden="true" className="h-3.5 w-3.5" />{labels.attach}</button><button type="button" onClick={() => setPendingDelete(document)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />{labels.remove}</button></div></article>; })}
      </div>}
    </section>
    <ImagesPanel lang={lang} onUseWithTutor={onUseImagesWithTutor} />
    <LibraryDeleteDialog open={Boolean(pendingDelete)} title={labels.deleteTitle} description={labels.deleteDescription} cancelLabel={labels.cancel} confirmLabel={labels.deleteConfirm} deletingLabel={labels.deleting} deleting={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void confirmDelete()} />
  </div>;
};
