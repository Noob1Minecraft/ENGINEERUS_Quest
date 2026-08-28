import React, { useEffect, useRef, useState } from "react";
import { FileText, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { Language } from "../types";
import { ApiError } from "../utils/api";
import { deleteDocument, listDocuments, uploadDocument, type AiDocument } from "../documents/documentApi";
import type { AiImage } from "../images/imageApi";
import { ImagesPanel } from "./ImagesPanel";

type Props = {
  authenticated: boolean;
  lang: Language;
  onRequireAuth: () => void;
  onUseWithTutor: (document: AiDocument) => void;
  onUseImagesWithTutor: (images: AiImage[]) => void;
};

function copy(lang: Language) {
  if (lang === "kk") return {
    title: "Құжаттар", upload: "Құжат жүктеу", empty: "Әзірге құжат жоқ.",
    use: "ЖИ-Тьютормен пайдалану", remove: "Жою", loading: "Құжаттар жүктелуде…",
    note: "PDF, DOCX, TXT немесе Markdown, ең көбі 10 МБ. OCR қолдау таппайды.",
    safety: "Инженерлік шешімдер үшін ЖИ жауабын бастапқы құжатпен тексеріңіз.", login: "Құжаттар үшін жүйеге кіріңіз.",
  };
  if (lang === "en") return {
    title: "Documents", upload: "Upload document", empty: "No documents yet.",
    use: "Use with AI Tutor", remove: "Delete", loading: "Loading documents…",
    note: "PDF, DOCX, TXT, or Markdown up to 10 MB. OCR is not supported.",
    safety: "Verify AI answers against the source document before engineering decisions.", login: "Sign in to use documents.",
  };
  return {
    title: "Документы", upload: "Загрузить документ", empty: "Документов пока нет.",
    use: "Использовать с ИИ-Тьютором", remove: "Удалить", loading: "Загрузка документов…",
    note: "PDF, DOCX, TXT или Markdown до 10 МБ. OCR не поддерживается.",
    safety: "Проверяйте ответы ИИ по исходному документу перед инженерными решениями.", login: "Войдите, чтобы использовать документы.",
  };
}

function statusLabel(document: AiDocument, lang: Language): string {
  if (document.status === "ready") return lang === "en" ? "Ready" : lang === "kk" ? "Дайын" : "Готов";
  if (document.status === "failed") {
    if (document.issue === "ocr_required") return lang === "en" ? "OCR required" : lang === "kk" ? "OCR қажет" : "Нужен OCR";
    return lang === "en" ? "Extraction failed" : lang === "kk" ? "Өңдеу қатесі" : "Ошибка обработки";
  }
  return lang === "en" ? "Processing" : lang === "kk" ? "Өңделуде" : "Обработка";
}

export const DocumentsTab: React.FC<Props> = ({ authenticated, lang, onRequireAuth, onUseWithTutor, onUseImagesWithTutor }) => {
  const t = copy(lang);
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<AiDocument[]>([]);
  const [loading, setLoading] = useState(authenticated);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) { setDocuments([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    listDocuments().then((items) => { if (active) setDocuments(items); })
      .catch(() => { if (active) setError(lang === "en" ? "Documents could not be loaded." : lang === "kk" ? "Құжаттар жүктелмеді." : "Не удалось загрузить документы."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authenticated, lang]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const document = await uploadDocument(file);
      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : (lang === "en" ? "Upload failed." : lang === "kk" ? "Жүктеу сәтсіз болды." : "Не удалось загрузить документ."));
      listDocuments().then(setDocuments).catch(() => undefined);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(documentId: string) {
    setError(null);
    try {
      await deleteDocument(documentId);
      setDocuments((current) => current.filter((item) => item.id !== documentId));
    } catch {
      setError(lang === "en" ? "Document could not be deleted." : lang === "kk" ? "Құжат жойылмады." : "Не удалось удалить документ.");
    }
  }

  if (!authenticated) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><p className="font-bold text-slate-700">{t.login}</p><button onClick={onRequireAuth} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">{lang === "en" ? "Sign in" : lang === "kk" ? "Кіру" : "Войти"}</button></div>;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-2xl font-black text-slate-900">{t.title}</h2><p className="mt-1 text-sm text-slate-600">{t.note}</p></div>
        <input ref={inputRef} className="hidden" type="file" accept=".pdf,.docx,.txt,.md,.markdown" onChange={(event) => void onFile(event.target.files?.[0])} />
        <button disabled={uploading} onClick={() => inputRef.current?.click()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{t.upload}</button>
      </div>
      <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900"><ShieldCheck className="h-4 w-4 shrink-0" />{t.safety}</p>
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
    </section>
    {loading ? <p className="text-sm font-semibold text-slate-500">{t.loading}</p> : documents.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">{t.empty}</p> : <div className="grid gap-3">
      {documents.map((document) => <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3"><FileText className="mt-1 h-5 w-5 text-blue-600" /><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900">{document.original_filename}</p><p className="text-xs text-slate-500">{document.file_type.toUpperCase()} · {(document.size_bytes / 1024).toFixed(0)} KB · {statusLabel(document, lang)}{document.page_count ? ` · ${document.page_count} p.` : ""}</p></div></div>
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={document.status !== "ready"} onClick={() => onUseWithTutor(document)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40">{t.use}</button><button onClick={() => void remove(document.id)} className="flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"><Trash2 className="h-3.5 w-3.5" />{t.remove}</button></div>
      </article>)}
    </div>}
    <ImagesPanel lang={lang} onUseWithTutor={onUseImagesWithTutor} />
  </div>;
};
