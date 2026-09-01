import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Image as ImageIcon, Loader2, LockKeyhole, Paperclip, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import type { Language } from '../types';
import { ApiError } from '../utils/api';
import { deleteImage, listImages, uploadImage, validateImageSelection, type AiImage } from '../images/imageApi';
import { LibraryDeleteDialog } from './LibraryDeleteDialog';

type Props = { lang: Language; onUseWithTutor: (images: AiImage[]) => void };

const COPY = {
  ru: {
    title: 'Изображения', subtitle: 'Чертежи, схемы и фотографии инженерных объектов.', note: 'JPEG, PNG или WebP до 8 МиБ и 24 Мп · до 30 изображений.', private: 'Приватно — изображение используется AI Tutor только после вашего выбора.',
    upload: 'Загрузить изображение', uploading: 'Загрузка…', emptyTitle: 'Добавьте визуальный контекст', empty: 'Загрузите схему, чертёж или фотографию и выберите до трёх изображений для запроса в AI Tutor.', attach: 'Добавить в AI Tutor', selected: 'выбрано', remove: 'Удалить', loading: 'Загружаем изображения…', more: 'Показать ещё', retry: 'Повторить',
    loadError: 'Не удалось загрузить изображения. Проверьте соединение и попробуйте снова.', uploadError: 'Не удалось загрузить изображение. Попробуйте ещё раз.', unsupported: 'Выберите изображение JPEG, PNG или WebP.', tooLarge: 'Файл больше 8 МиБ. Выберите изображение меньшего размера.', dimensions: 'Изображение слишком большое по размерам. Уменьшите его и попробуйте снова.', malformed: 'Файл не удалось распознать как корректное изображение.', quota: 'Достигнут лимит: в библиотеке может быть до 30 изображений.', maxSelected: 'Для одного запроса можно выбрать не более трёх изображений.',
    deleteTitle: 'Удалить изображение?', deleteDescription: 'Изображение будет удалено из частной библиотеки. Существующие ответы AI Tutor останутся в истории.', cancel: 'Отмена', deleting: 'Удаление…', deleteConfirm: 'Удалить изображение', deleteError: 'Не удалось удалить изображение. Оно осталось в библиотеке — попробуйте снова.', deleted: 'Изображение удалено из частной библиотеки.', uploadSuccess: 'Изображение добавлено в частную библиотеку.', ready: 'Готово', processing: 'Обработка', failed: 'Ошибка', safety: 'Визуальный анализ не подтверждает точные размеры, материал, прочность или безопасность.',
  },
  kk: {
    title: 'Суреттер', subtitle: 'Сызбалар, схемалар және инженерлік нысандардың фотосуреттері.', note: 'JPEG, PNG немесе WebP, 8 МиБ және 24 Мп-қа дейін · 30 суретке дейін.', private: 'Құпия — сурет AI Tutor-да тек өз таңдауыңыздан кейін пайдаланылады.',
    upload: 'Сурет жүктеу', uploading: 'Жүктелуде…', emptyTitle: 'Көрнекі контекст қосыңыз', empty: 'Схема, сызба немесе фото жүктеп, AI Tutor сұрауына үш суретке дейін таңдаңыз.', attach: 'AI Tutor-ға қосу', selected: 'таңдалды', remove: 'Жою', loading: 'Суреттер жүктелуде…', more: 'Тағы көрсету', retry: 'Қайталау',
    loadError: 'Суреттер жүктелмеді. Байланысты тексеріп, қайталап көріңіз.', uploadError: 'Сурет жүктелмеді. Қайталап көріңіз.', unsupported: 'JPEG, PNG немесе WebP суретін таңдаңыз.', tooLarge: 'Файл 8 МиБ-тан үлкен. Кішірек сурет таңдаңыз.', dimensions: 'Суреттің өлшемі тым үлкен. Оны кішірейтіп, қайталап көріңіз.', malformed: 'Файл дұрыс сурет ретінде танылмады.', quota: 'Кітапханадағы 30 сурет лимитіне жеттіңіз.', maxSelected: 'Бір сұрауға үш суреттен артық таңдауға болмайды.',
    deleteTitle: 'Сурет жойылсын ба?', deleteDescription: 'Сурет жеке кітапханадан жойылады. AI Tutor-дың бұрынғы жауаптары тарихта қалады.', cancel: 'Бас тарту', deleting: 'Жойылуда…', deleteConfirm: 'Суретті жою', deleteError: 'Сурет жойылмады. Ол кітапханада қалды — қайталап көріңіз.', deleted: 'Сурет жеке кітапханадан жойылды.', uploadSuccess: 'Сурет жеке кітапханаға қосылды.', ready: 'Дайын', processing: 'Өңделуде', failed: 'Қате', safety: 'Көрнекі талдау нақты өлшемдерді, материалды, беріктікті немесе қауіпсіздікті растамайды.',
  },
  en: {
    title: 'Images', subtitle: 'Drawings, diagrams, and photos of engineering objects.', note: 'JPEG, PNG, or WebP up to 8 MiB and 24 MP · up to 30 images.', private: 'Private — an image is used by AI Tutor only after you select it.',
    upload: 'Upload image', uploading: 'Uploading…', emptyTitle: 'Add visual context', empty: 'Upload a diagram, drawing, or photo, then select up to three images for an AI Tutor request.', attach: 'Add to AI Tutor', selected: 'selected', remove: 'Delete', loading: 'Loading images…', more: 'Load more', retry: 'Retry',
    loadError: 'Images could not be loaded. Check your connection and try again.', uploadError: 'The image could not be uploaded. Try again.', unsupported: 'Choose a JPEG, PNG, or WebP image.', tooLarge: 'The file is larger than 8 MiB. Choose a smaller image.', dimensions: 'The image dimensions are too large. Resize it and try again.', malformed: 'The file could not be recognized as a valid image.', quota: 'You have reached the 30-image library limit.', maxSelected: 'Up to three images can be selected for one request.',
    deleteTitle: 'Delete image?', deleteDescription: 'The image will be removed from your private library. Existing AI Tutor answers remain in conversation history.', cancel: 'Cancel', deleting: 'Deleting…', deleteConfirm: 'Delete image', deleteError: 'The image could not be deleted. It remains in your library — try again.', deleted: 'Image deleted from your private library.', uploadSuccess: 'Image added to your private library.', ready: 'Ready', processing: 'Processing', failed: 'Failed', safety: 'Visual analysis does not certify dimensions, materials, integrity, or safety.',
  },
} satisfies Record<Language, Record<string, string>>;

function formatBytes(bytes: number, lang: Language): string { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toLocaleString(lang, { maximumFractionDigits: 1 })} MB`; }
function formatDate(value: string, lang: Language): string { return new Intl.DateTimeFormat(lang === 'kk' ? 'kk-KZ' : lang === 'ru' ? 'ru-KZ' : 'en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function statusLabel(image: AiImage, lang: Language): string { return image.status === 'ready' ? COPY[lang].ready : image.status === 'failed' ? COPY[lang].failed : COPY[lang].processing; }
function imageError(error: unknown, lang: Language): string {
  const labels = COPY[lang];
  if (!(error instanceof ApiError)) return labels.uploadError;
  if (error.code === 'image_quota_exceeded') return labels.quota;
  if (error.code === 'image_too_large') return labels.tooLarge;
  if (['image_dimensions_too_large', 'image_pixel_limit'].includes(error.code)) return labels.dimensions;
  if (['invalid_image', 'invalid_image_upload', 'unsupported_image_type'].includes(error.code)) return labels.malformed;
  return labels.uploadError;
}

export const ImagesPanel: React.FC<Props> = ({ lang, onUseWithTutor }) => {
  const labels = COPY[lang];
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<AiImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AiImage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const page = await listImages(); setImages(page.items); setCursor(page.next_cursor); setListFailed(false); }
    catch { setError(labels.loadError); setListFailed(true); }
    finally { setLoading(false); }
  }, [labels.loadError]);

  useEffect(() => { void load(); }, [load]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const validationError = validateImageSelection(file, lang);
    if (validationError) { setError(validationError); if (inputRef.current) inputRef.current.value = ''; return; }
    setUploading(true); setError(null); setNotice(null); setListFailed(false);
    try { const image = await uploadImage(file); setImages((current) => [image, ...current.filter((item) => item.id !== image.id)]); setNotice(labels.uploadSuccess); }
    catch (caught) { setError(imageError(caught, lang)); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
  }

  function toggle(image: AiImage) {
    if (image.status !== 'ready') return;
    setError(null);
    setSelected((current) => {
      if (current.includes(image.id)) return current.filter((id) => id !== image.id);
      if (current.length >= 3) { setError(labels.maxSelected); return current; }
      return [...current, image.id];
    });
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true); setError(null);
    try { const page = await listImages(cursor); setImages((current) => [...current, ...page.items.filter((item) => !current.some(({ id }) => id === item.id))]); setCursor(page.next_cursor); }
    catch { setError(labels.loadError); setListFailed(true); }
    finally { setLoadingMore(false); }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true); setError(null); setNotice(null); setListFailed(false);
    try { await deleteImage(pendingDelete.id); setImages((current) => current.filter((item) => item.id !== pendingDelete.id)); setSelected((current) => current.filter((id) => id !== pendingDelete.id)); setPendingDelete(null); setNotice(labels.deleted); }
    catch { setError(labels.deleteError); }
    finally { setDeleting(false); }
  }

  const selectedImages = selected.map((id) => images.find((image) => image.id === id)).filter((image): image is AiImage => Boolean(image));

  return <section aria-labelledby="images-heading" className="space-y-4 border-t border-slate-200 pt-7">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="images-heading" className="text-xl font-black text-slate-950">{labels.title}</h2><p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p><p className="mt-1 text-xs text-slate-500">{labels.note}</p></div><input ref={inputRef} aria-label={labels.upload} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onFile(event.target.files?.[0])} /><button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">{uploading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}{uploading ? labels.uploading : labels.upload}</button></div>
    <div className="grid gap-2 text-xs leading-relaxed text-slate-600 sm:grid-cols-2"><p className="flex items-start gap-2"><LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{labels.private}</p><p className="flex items-start gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />{labels.safety}</p></div>
    {notice ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}
    {error ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-start gap-2"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>{listFailed ? <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 font-bold underline decoration-rose-300 underline-offset-4"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{labels.retry}</button> : null}</div> : null}
    {selectedImages.length > 0 ? <div className="flex flex-col gap-3 border-l-2 border-blue-500 bg-blue-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-bold text-blue-900">{selectedImages.length}/3 {labels.selected}</span><button type="button" onClick={() => onUseWithTutor(selectedImages)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"><Paperclip aria-hidden="true" className="h-4 w-4" />{labels.attach}</button></div> : null}
    {loading ? <div role="status" className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-blue-600" />{labels.loading}</div> : images.length === 0 ? <div className="border-y border-dashed border-slate-300 py-10 text-center"><ImageIcon aria-hidden="true" className="mx-auto h-8 w-8 text-indigo-500" /><h3 className="mt-3 text-base font-black text-slate-800">{labels.emptyTitle}</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{labels.empty}</p></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {images.map((image) => { const isSelected = selected.includes(image.id); return <article key={image.id} className={`min-w-0 rounded-xl border p-4 ${isSelected ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-200' : 'border-slate-200 bg-white'}`}><button type="button" onClick={() => toggle(image)} disabled={image.status !== 'ready'} aria-pressed={isSelected} className="flex w-full min-w-0 items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-55"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-blue-600 text-white' : 'bg-indigo-50 text-indigo-700'}`}>{isSelected ? <Check aria-hidden="true" className="h-5 w-5" /> : <ImageIcon aria-hidden="true" className="h-5 w-5" />}</span><span className="min-w-0"><span className="block break-words text-sm font-black text-slate-900 [overflow-wrap:anywhere]">{image.original_filename}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">{image.width}×{image.height} · {formatBytes(image.size_bytes, lang)} · {formatDate(image.created_at, lang)}</span><span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${image.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : image.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{statusLabel(image, lang)}</span></span></button><div className="mt-3 flex justify-end border-t border-slate-100 pt-3"><button type="button" onClick={() => setPendingDelete(image)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />{labels.remove}</button></div></article>; })}
    </div>}
    {cursor ? <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60">{loadingMore ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}{labels.more}</button> : null}
    <LibraryDeleteDialog open={Boolean(pendingDelete)} title={labels.deleteTitle} description={labels.deleteDescription} cancelLabel={labels.cancel} confirmLabel={labels.deleteConfirm} deletingLabel={labels.deleting} deleting={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void confirmDelete()} />
  </section>;
};
