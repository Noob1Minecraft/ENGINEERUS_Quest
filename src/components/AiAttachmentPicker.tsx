import React, { useEffect, useRef, useState } from 'react';
import { FileText, Image, Loader2, Paperclip, Plus, Upload, X } from 'lucide-react';
import type { Language } from '../types';
import { listDocuments, uploadDocument, type AiDocument } from '../documents/documentApi';
import { listImages, uploadImage, type AiImage } from '../images/imageApi';

type AttachmentRef = { id: string; name: string };

interface AiAttachmentPickerProps {
  lang: Language;
  disabled: boolean;
  document: AttachmentRef | null;
  images: AttachmentRef[];
  onSelectDocument: (document: AttachmentRef | null) => void;
  onSelectImages: (images: AttachmentRef[]) => void;
}

const copy = {
  ru: { attach: 'Добавить контекст', document: 'Документ', image: 'Изображение', library: 'Готовые файлы из частной библиотеки', upload: 'Загрузить новый', empty: 'Готовых файлов пока нет. Загруженный файл появится после обработки.', loading: 'Загрузка…', failed: 'Не удалось загрузить файлы. Закройте меню и попробуйте снова.', uploadFailed: 'Не удалось загрузить файл. Проверьте формат и размер.', processing: 'Файл загружен и обрабатывается. Выберите его после завершения обработки.', maxImages: 'К сообщению можно прикрепить не более трёх изображений.', selected: 'выбрано', close: 'Закрыть' },
  kk: { attach: 'Контекст қосу', document: 'Құжат', image: 'Сурет', library: 'Жеке кітапханадағы дайын файлдар', upload: 'Жаңасын жүктеу', empty: 'Дайын файлдар әлі жоқ. Жүктелген файл өңдеуден кейін көрінеді.', loading: 'Жүктелуде…', failed: 'Файлдар жүктелмеді. Мәзірді жауып, қайталап көріңіз.', uploadFailed: 'Файл жүктелмеді. Форматы мен өлшемін тексеріңіз.', processing: 'Файл жүктелді және өңделуде. Өңдеу аяқталғаннан кейін таңдаңыз.', maxImages: 'Хабарламаға үш суреттен артық тіркеуге болмайды.', selected: 'таңдалды', close: 'Жабу' },
  en: { attach: 'Add context', document: 'Document', image: 'Image', library: 'Ready files from your private library', upload: 'Upload new', empty: 'No ready files yet. An uploaded file appears after processing.', loading: 'Loading…', failed: 'Files could not be loaded. Close the menu and try again.', uploadFailed: 'The file could not be uploaded. Check its format and size.', processing: 'The file was uploaded and is processing. Select it after processing completes.', maxImages: 'Up to three images can be attached to one message.', selected: 'selected', close: 'Close' },
} satisfies Record<Language, Record<string, string>>;

export const AiAttachmentPicker: React.FC<AiAttachmentPickerProps> = ({
  lang, disabled, document: selectedDocument, images, onSelectDocument, onSelectImages,
}) => {
  const labels = copy[lang];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'document' | 'image' | null>(null);
  const [documents, setDocuments] = useState<AiDocument[]>([]);
  const [availableImages, setAvailableImages] = useState<AiImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const closePicker = (restoreFocus = false) => {
    setOpen(false);
    setMode(null);
    if (restoreFocus) window.requestAnimationFrame(() => trigger.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker(true);
    };
    const closeOutside = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) closePicker();
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOutside);
    };
  }, [open]);

  async function load(kind: 'document' | 'image') {
    setMode(kind);
    setLoading(true);
    setError(null);
    try {
      if (kind === 'document') setDocuments((await listDocuments()).filter((item) => item.status === 'ready'));
      else setAvailableImages((await listImages()).items.filter((item) => item.status === 'ready'));
    } catch {
      setError(labels.failed);
    } finally {
      setLoading(false);
    }
  }

  async function upload(kind: 'document' | 'image', file?: File) {
    if (!file) return;
    if (kind === 'image' && images.length >= 3) {
      setError(labels.maxImages);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (kind === 'document') {
        const result = await uploadDocument(file);
        if (result.status === 'ready') onSelectDocument({ id: result.id, name: result.original_filename });
        else setError(labels.processing);
      } else {
        const result = await uploadImage(file);
        if (result.status === 'ready') onSelectImages([...images, { id: result.id, name: result.original_filename }].slice(0, 3));
        else setError(labels.processing);
      }
    } catch {
      setError(labels.uploadFailed);
    } finally {
      setLoading(false);
      if (documentInput.current) documentInput.current.value = '';
      if (imageInput.current) imageInput.current.value = '';
    }
  }

  const items = mode === 'document' ? documents : availableImages;

  return (
    <div className="relative shrink-0" ref={panel}>
      <input ref={documentInput} aria-label={`${labels.upload}: ${labels.document}`} className="sr-only" type="file" accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void upload('document', event.target.files?.[0])} />
      <input ref={imageInput} aria-label={`${labels.upload}: ${labels.image}`} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload('image', event.target.files?.[0])} />
      <button ref={trigger} type="button" aria-label={labels.attach} aria-expanded={open} aria-haspopup="dialog" disabled={disabled} onClick={() => { setOpen((current) => !current); setMode(null); setError(null); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50">
        <Plus aria-hidden="true" className="h-5 w-5" />
      </button>
      {open && (
        <div role="dialog" aria-label={labels.attach} className="absolute bottom-14 left-0 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <strong className="flex items-center gap-2 text-sm text-slate-900"><Paperclip className="h-4 w-4 text-blue-600" />{labels.attach}</strong>
            <button type="button" aria-label={labels.close} onClick={() => closePicker(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          {!mode ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void load('document')} className="rounded-xl border border-slate-200 p-3 text-left text-sm font-bold text-slate-800 hover:border-blue-300 hover:bg-blue-50"><FileText className="mb-2 h-5 w-5 text-blue-600" />{labels.document}</button>
              <button type="button" onClick={() => void load('image')} className="rounded-xl border border-slate-200 p-3 text-left text-sm font-bold text-slate-800 hover:border-violet-300 hover:bg-violet-50"><Image className="mb-2 h-5 w-5 text-violet-600" />{labels.image}</button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-600">{labels.library}{mode === 'image' && images.length > 0 ? ` · ${images.length}/3 ${labels.selected}` : ''}</span><button type="button" onClick={() => (mode === 'document' ? documentInput : imageInput).current?.click()} className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"><Upload className="h-3.5 w-3.5" />{labels.upload}</button></div>
              {loading ? <div className="flex items-center gap-2 py-4 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{labels.loading}</div> : error ? <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p> : items.length === 0 ? <p className="py-4 text-xs text-slate-500">{labels.empty}</p> : (
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {items.map((item) => {
                    const name = item.original_filename;
                    const selected = mode === 'document' ? selectedDocument?.id === item.id : images.some((image) => image.id === item.id);
                    const atImageLimit = mode === 'image' && !selected && images.length >= 3;
                    return <button type="button" key={item.id} aria-pressed={selected} disabled={atImageLimit} onClick={() => {
                      if (mode === 'document') { onSelectDocument(selected ? null : { id: item.id, name }); closePicker(true); }
                      else onSelectImages(selected ? images.filter((image) => image.id !== item.id) : [...images, { id: item.id, name }]);
                    }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                      {mode === 'document' ? <FileText className="h-4 w-4 shrink-0" /> : <Image className="h-4 w-4 shrink-0" />}<span className="min-w-0 flex-1 truncate" title={name}>{name}</span>{selected ? <span className="shrink-0 text-[10px] font-black uppercase tracking-wide">✓</span> : null}
                    </button>;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
