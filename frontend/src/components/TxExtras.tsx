import { useState } from "react";
import { toast } from "sonner";
import { Download, Paperclip, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { uid } from "@/lib/format";
import type { Attachment } from "@/lib/types";

export const DEFAULT_TAGS = ["vacances", "vélo", "projet", "remboursable"];
const MAX_SIZE = 3 * 1024 * 1024;

export function TagEditor({ value, onChange, known }: { value: string[]; onChange: (v: string[]) => void; known: string[] }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/^#/, "");
    if (!t || value.includes(t)) return setDraft("");
    onChange([...value, t]);
    setDraft("");
  };
  const suggestions = [...new Set([...DEFAULT_TAGS, ...known])].filter((t) => !value.includes(t)).slice(0, 8);
  return (
    <div data-testid="tag-editor">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5">
        {value.map((t) => (
          <span key={t} data-testid="tag-chip" className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-200">
            #{t}
            <button type="button" aria-label={`Retirer ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          data-testid="tag-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : "Ajouter une étiquette…"}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestions.map((t) => (
            <button key={t} type="button" data-testid={`tag-suggestion-${t}`} onClick={() => add(t)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-900">
              <Tag className="size-3" /> {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Envoie le fichier au serveur (collection attachments) : seules les métadonnées restent dans les données. */
// ponytail: un fichier retiré d'une opération reste en base ; nettoyage à ajouter si la place devient un sujet.
async function upload(f: File): Promise<string> {
  const res = await fetch("/api/attachments", { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { url: string }).url;
}

export function AttachmentEditor({ value, onChange }: { value: Attachment[]; onChange: (v: Attachment[]) => void }) {
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next = [...value];
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) {
        toast.error(`« ${f.name} » dépasse 3 Mo`);
        continue;
      }
      try {
        next.push({ id: uid(), name: f.name, type: f.type, size: f.size, dataUrl: await upload(f) });
      } catch {
        toast.error(`« ${f.name} » n'a pas pu être envoyé`);
      }
    }
    onChange(next);
  };
  return (
    <div data-testid="attachment-editor" className="space-y-1.5">
      {value.map((a) => (
        <div key={a.id} data-testid="attachment-item" className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs">
          {a.type.startsWith("image/") ? <img src={a.dataUrl} alt="" className="size-8 rounded-lg object-cover" /> : <Paperclip className="size-4 text-slate-400" />}
          <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{a.name}</span>
          <span className="text-slate-400">{Math.ceil(a.size / 1024)} Ko</span>
          <a href={a.dataUrl} download={a.name} aria-label="Télécharger" className="text-slate-500 hover:text-slate-900">
            <Download className="size-3.5" />
          </a>
          <button type="button" aria-label="Retirer" data-testid="attachment-remove" onClick={() => onChange(value.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-rose-600">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800">
        <Paperclip className="size-3.5" /> Joindre une facture, un reçu, une capture (3 Mo max.)
        <Input data-testid="attachment-input" type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => onFiles(e.target.files)} />
      </label>
    </div>
  );
}
