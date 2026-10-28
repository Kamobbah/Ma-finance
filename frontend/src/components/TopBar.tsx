import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Moon, Rows3, Rows4, Search, Sun, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPrefs, undo, usePrefs } from "@/lib/store";

/** Applique thème et densité sur <html>. */
export function useAppearance() {
  const prefs = usePrefs();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", prefs.theme === "dark");
    document.documentElement.classList.toggle("compact", prefs.density === "compact");
  }, [prefs.theme, prefs.density]);
}

const doUndo = () => {
  const label = undo();
  if (label) toast.info(`Annulé : ${label}`);
  else toast("Rien à annuler");
};

/** Recherche globale (opérations, marchands, catégories, notes, étiquettes), annuler, thème, densité. */
export default function TopBar() {
  const prefs = usePrefs();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useAppearance();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        doUndo();
      } else if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const submit = () => {
    const v = q.trim();
    if (!v) return;
    navigate(`/operations?q=${encodeURIComponent(v)}`);
    setQ("");
    ref.current?.blur();
  };
  return (
    <div className="mb-5 flex items-center gap-2" data-testid="top-bar">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={ref}
          data-testid="global-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Rechercher une opération, un marchand, une catégorie, une note, #étiquette…  ( / )"
          className="h-10 w-full rounded-2xl border border-slate-200/70 bg-white/80 pl-10 pr-3 text-sm outline-none transition-[box-shadow,border-color] focus:border-slate-300 focus:shadow-[0_0_0_4px_rgba(15,23,42,0.06)]"
        />
      </div>
      <Button variant="outline" size="icon" className="rounded-xl" aria-label="Annuler la dernière action" title="Annuler (Ctrl+Z)" data-testid="undo-button" onClick={doUndo}>
        <Undo2 />
      </Button>
      <Button variant="outline" size="icon" className="rounded-xl" aria-label="Densité" title={prefs.density === "compact" ? "Affichage confortable" : "Affichage compact"} data-testid="density-toggle" onClick={() => setPrefs({ density: prefs.density === "compact" ? "comfortable" : "compact" })}>
        {prefs.density === "compact" ? <Rows3 /> : <Rows4 />}
      </Button>
      <Button variant="outline" size="icon" className="rounded-xl" aria-label="Thème" title={prefs.theme === "dark" ? "Mode clair" : "Mode sombre"} data-testid="theme-toggle" onClick={() => setPrefs({ theme: prefs.theme === "dark" ? "light" : "dark" })}>
        {prefs.theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}
