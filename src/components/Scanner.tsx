"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Phase = "idle" | "preparing" | "uploading" | "recognising" | "done" | "error";

interface Result {
  documentKind: "receipt" | "document";
  merchant?: string | null;
  totalCents?: number | null;
  confidence?: string;
  summary?: string;
  provider?: string;
}

const PHASE_TEXT: Record<Phase, string> = {
  idle: "",
  preparing: "Готую знімок…",
  uploading: "Завантажую у сховище…",
  recognising: "Розпізнаю…",
  done: "",
  error: "",
};

/** Зменшує знімок до 1600 px по довгій стороні: менше трафіку і дешевший розбір. */
async function downscale(file: File, maxEdge = 1600): Promise<{ blob: Blob; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Браузер не дав намалювати зображення");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Не вдалося стиснути"))), "image/jpeg", 0.85),
  );

  return { blob, dataUrl };
}

async function buildPdf(pages: string[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 24;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage();
    const props = doc.getImageProperties(pages[i]);
    const ratio = Math.min(
      (pageWidth - margin * 2) / props.width,
      (pageHeight - margin * 2) / props.height,
    );
    const w = props.width * ratio;
    const h = props.height * ratio;
    doc.addImage(pages[i], "JPEG", (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
  }

  return doc.output("blob");
}

export function Scanner() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<"receipt" | "document">("receipt");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setError("");
    setResult(null);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);

    try {
      setPhase("preparing");
      const shrunk = await Promise.all(Array.from(files).map((f) => downscale(f)));
      const pdf = await buildPdf(shrunk.map((s) => s.dataUrl));

      setPhase("uploading");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Сесія завершилась — увійдіть знову");

      const storagePath = `${user.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(storagePath, pdf, { contentType: "application/pdf" });
      if (uploadError) throw new Error(uploadError.message);

      // PDF лишається доступним для збереження у Файли → iCloud Drive
      setPdfUrl(URL.createObjectURL(pdf));

      setPhase("recognising");
      const base64 = shrunk[0].dataUrl.split(",")[1];
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          imageBase64: base64,
          mime: "image/jpeg",
          kind,
          originalName: files[0].name,
          byteSize: pdf.size,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Помилка розпізнавання");

      setResult(payload as Result);
      setPhase("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Щось пішло не так");
      setPhase("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = phase === "preparing" || phase === "uploading" || phase === "recognising";

  return (
    <div className="card">
      <div className="mb-3 flex gap-2">
        {(["receipt", "document"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`chip ${k === kind ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}
          >
            {k === "receipt" ? "Чек" : "Документ"}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="btn-primary w-full py-4 text-base"
      >
        {busy ? PHASE_TEXT[phase] : kind === "receipt" ? "Сфотографувати чек" : "Сфотографувати документ"}
      </button>

      <p className="mt-2 text-center text-xs text-muted">
        Можна вибрати кілька знімків — вони стануть сторінками одного PDF
      </p>

      {error && (
        <div className="mt-3 rounded-xl border border-negative/40 bg-negative/5 p-3 text-sm text-negative">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-xl border border-positive/40 bg-positive/5 p-3 text-sm">
          {result.documentKind === "document" ? (
            <>
              <div className="font-semibold text-positive">Документ збережено</div>
              <div className="mt-0.5 text-muted">{result.summary || "Без опису"}</div>
            </>
          ) : (
            <>
              <div className="font-semibold text-positive">
                Розпізнано{result.merchant ? `: ${result.merchant}` : ""}
              </div>
              <div className="mt-0.5 text-muted">
                {result.totalCents
                  ? `${(result.totalCents / 100).toFixed(2)} €`
                  : "Суму не вдалося прочитати"}
                {result.confidence === "low" && " · знімок нечіткий, перевірте уважно"}
              </div>
              <div className="mt-1 text-xs text-muted">
                Операція нижче — звірте та збережіть.
              </div>
            </>
          )}
        </div>
      )}

      {pdfUrl && (
        <a
          href={pdfUrl}
          download={`${kind === "receipt" ? "chek" : "dokument"}-${new Date()
            .toISOString()
            .slice(0, 10)}.pdf`}
          className="btn-ghost mt-3 w-full"
        >
          Зберегти PDF у Файли (iCloud)
        </a>
      )}
    </div>
  );
}
