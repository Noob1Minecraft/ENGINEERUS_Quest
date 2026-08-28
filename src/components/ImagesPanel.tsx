import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { Language } from "../types";
import { ApiError } from "../utils/api";
import { deleteImage, listImages, uploadImage, type AiImage } from "../images/imageApi";

type Props = {
  lang: Language;
  onUseWithTutor: (images: AiImage[]) => void;
};

function copy(lang: Language) {
  if (lang === "kk") return {
    title: "Инженерлік суреттер", upload: "Сурет жүктеу", empty: "Әзірге сурет жоқ.",
    use: "ЖИ-Тьютормен пайдалану", remove: "Жою", loading: "Суреттер жүктелуде…", more: "Тағы жүктеу",
    note: "JPEG, PNG немесе WebP, ең көбі 8 МиБ және 24 Мп. Бір сұрауға 3 суретке дейін.",
    safety: "Көрнекі талдау өлшемдерді, материалды немесе қауіпсіздікті сертификаттамайды.",
  };
  if (lang === "en") return {
    title: "Engineering images", upload: "Upload image", empty: "No images yet.",
    use: "Use with AI Tutor", remove: "Delete", loading: "Loading images…", more: "Load more",
    note: "JPEG, PNG, or WebP up to 8 MiB and 24 MP. Select up to 3 images per request.",
    safety: "Visual analysis does not certify dimensions, materials, integrity, or safety.",
  };
  return {
    title: "Инженерные изображения", upload: "Загрузить изображение", empty: "Изображений пока нет.",
    use: "Использовать с ИИ-Тьютором", remove: "Удалить", loading: "Загрузка изображений…", more: "Загрузить ещё",
    note: "JPEG, PNG или WebP до 8 МиБ и 24 Мп. До 3 изображений на один запрос.",
    safety: "Визуальный анализ не подтверждает точные размеры, материал, прочность или безопасность.",
  };
}

export const ImagesPanel: React.FC<Props> = ({ lang, onUseWithTutor }) => {
  const t = copy(lang);
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<AiImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listImages().then((page) => {
      if (!active) return;
      setImages(page.items);
      setCursor(page.next_cursor);
    }).catch(() => {
      if (active) setError(lang === "en" ? "Images could not be loaded." : lang === "kk" ? "Суреттер жүктелмеді." : "Не удалось загрузить изображения.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lang]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const image = await uploadImage(file);
      setImages((current) => [image, ...current.filter((item) => item.id !== image.id)]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : (lang === "en" ? "Upload failed." : lang === "kk" ? "Жүктеу сәтсіз болды." : "Не удалось загрузить изображение."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(imageId: string) {
    setError(null);
    try {
      await deleteImage(imageId);
      setImages((current) => current.filter((item) => item.id !== imageId));
      setSelected((current) => current.filter((id) => id !== imageId));
    } catch {
      setError(lang === "en" ? "Image could not be deleted." : lang === "kk" ? "Сурет жойылмады." : "Не удалось удалить изображение.");
    }
  }

  function toggle(image: AiImage) {
    if (image.status !== "ready") return;
    setSelected((current) => current.includes(image.id)
      ? current.filter((id) => id !== image.id)
      : current.length < 3 ? [...current, image.id] : current);
  }

  async function loadMore() {
    if (!cursor) return;
    const page = await listImages(cursor);
    setImages((current) => [...current, ...page.items.filter((item) => !current.some(({ id }) => id === item.id))]);
    setCursor(page.next_cursor);
  }

  const selectedImages = selected.map((id) => images.find((image) => image.id === id)).filter((image): image is AiImage => Boolean(image));

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-black text-slate-900">{t.title}</h2><p className="mt-1 text-sm text-slate-600">{t.note}</p></div>
      <input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onFile(event.target.files?.[0])} />
      <button disabled={uploading} onClick={() => inputRef.current?.click()} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{t.upload}</button>
    </div>
    <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900"><ShieldCheck className="h-4 w-4 shrink-0" />{t.safety}</p>
    {error ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p> : null}
    {selectedImages.length > 0 ? <button type="button" onClick={() => onUseWithTutor(selectedImages)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">{t.use} ({selectedImages.length})</button> : null}
    {loading ? <p className="text-sm font-semibold text-slate-500">{t.loading}</p> : images.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-slate-500">{t.empty}</p> : <div className="grid gap-3 sm:grid-cols-2">
      {images.map((image) => <article key={image.id} className={`rounded-xl border p-4 ${selected.includes(image.id) ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
        <button type="button" onClick={() => toggle(image)} disabled={image.status !== "ready"} className="flex w-full items-start gap-3 text-left disabled:opacity-50">
          <ImageIcon className="mt-1 h-5 w-5 shrink-0 text-indigo-600" />
          <span className="min-w-0"><span className="block truncate font-bold text-slate-900">{image.original_filename}</span><span className="text-xs text-slate-500">{image.width}×{image.height} · {(image.size_bytes / 1024).toFixed(0)} KB · {image.status}</span></span>
        </button>
        <button type="button" onClick={() => void remove(image.id)} className="mt-3 flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" />{t.remove}</button>
      </article>)}
    </div>}
    {cursor ? <button type="button" onClick={() => void loadMore()} className="text-sm font-bold text-blue-700">{t.more}</button> : null}
  </section>;
};
