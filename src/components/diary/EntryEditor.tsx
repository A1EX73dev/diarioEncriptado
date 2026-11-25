"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  encryptEntry,
  ENTRY_LIMITS,
  entryPayloadSchema,
  MOODS,
  PayloadTooLargeError,
  type EntryPayload,
  type Mood,
} from "@/lib/crypto";
import { createEntryAction, updateEntryAction } from "@/lib/dal/entry-actions";
import { MOOD_LABELS, parseTags, todayIso } from "@/lib/entries/client";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";
import { MarkdownView } from "./MarkdownView";

export interface EditableEntry {
  id: string;
  entryDate: string;
  updatedAt: string;
  payload: EntryPayload;
}

type Format = {
  label: string;
  shortcut?: string;
  apply: (selected: string) => { text: string; caret: [number, number] };
};

/** Formatos de la barra: envuelven la selección o añaden un prefijo de línea. */
const FORMATS: Format[] = [
  { label: "Negrita", shortcut: "b", apply: (s) => wrap(s, "**", "texto") },
  { label: "Cursiva", shortcut: "i", apply: (s) => wrap(s, "_", "texto") },
  { label: "Título", apply: (s) => prefix(s, "## ", "Título") },
  { label: "Lista", apply: (s) => prefix(s, "- ", "elemento") },
  { label: "Cita", apply: (s) => prefix(s, "> ", "cita") },
  {
    label: "Enlace",
    shortcut: "k",
    apply: (s) => {
      const label = s || "texto";
      const text = `[${label}](https://)`;
      return { text, caret: [label.length + 3, text.length - 1] };
    },
  },
];

function wrap(selected: string, mark: string, placeholder: string) {
  const inner = selected || placeholder;
  return { text: `${mark}${inner}${mark}`, caret: [mark.length, mark.length + inner.length] as [number, number] };
}

function prefix(selected: string, mark: string, placeholder: string) {
  const lines = (selected || placeholder).split("\n").map((line) => `${mark}${line}`);
  const text = lines.join("\n");
  return { text, caret: [mark.length, text.length] as [number, number] };
}

/**
 * Editor de una entrada. Todo ocurre en memoria: no hay borradores en
 * almacenamiento local. Al guardar, el contenido se cifra en el navegador
 * (IV nuevo en cada guardado) y solo el bloque cifrado viaja al servidor.
 */
export function EntryEditor({ initial, onCancel }: { initial?: EditableEntry; onCancel?: () => void }) {
  const router = useRouter();
  const { dek, userId } = useVault();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [entryDate, setEntryDate] = useState(() => initial?.entryDate ?? todayIso());
  const [title, setTitle] = useState(initial?.payload.title ?? "");
  const [body, setBody] = useState(initial?.payload.body ?? "");
  const [mood, setMood] = useState<Mood | null>(initial?.payload.mood ?? null);
  const [tagsInput, setTagsInput] = useState(initial?.payload.tags.join(", ") ?? "");
  const [tab, setTab] = useState<"escribir" | "vista">("escribir");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [errorEvent, setErrorEvent] = useState<object | null>(null);
  useFocusFirstError(formRef, errorEvent);
  const fail = (message: string) => {
    setError(message);
    setErrorEvent({});
  };
  const ids = { body: useId(), date: useId(), mood: useId(), tabs: useId() };

  // Aviso del navegador si se intenta salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const touch =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };

  function applyFormat(format: Format) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end } = textarea;
    const { text, caret } = format.apply(body.slice(start, end));
    setBody(body.slice(0, start) + text + body.slice(end));
    setDirty(true);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + caret[0], start + caret[1]);
    });
  }

  function onBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const format = FORMATS.find((f) => f.shortcut === event.key.toLowerCase());
    if (format) {
      event.preventDefault();
      applyFormat(format);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dek) return;
    setError(null);
    const parsed = entryPayloadSchema.safeParse({ title: title.trim(), body, mood, tags: parseTags(tagsInput) });
    if (!parsed.success) {
      fail("Revisa los campos: hay algún valor demasiado largo.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      fail("Elige una fecha válida.");
      return;
    }

    setBusy(true);
    try {
      const encrypted = await encryptEntry(dek, { userId, entryId: id }, parsed.data);
      const input = { id, entryDate, encrypted, ...(initial ? { expectedUpdatedAt: initial.updatedAt } : {}) };
      const result = initial ? await updateEntryAction(input) : await createEntryAction(input);
      if (!result.ok) {
        fail(
          result.reason === "conflict"
            ? "Esta entrada ha cambiado en otra pestaña o dispositivo. Copia tu texto, recarga e inténtalo de nuevo."
            : "No se ha podido guardar. Inténtalo de nuevo.",
        );
        return;
      }
      setDirty(false);
      router.replace(`/diario/entrada/${id}?aviso=guardada`);
      router.refresh();
      onCancel?.();
    } catch (e) {
      fail(
        e instanceof PayloadTooLargeError
          ? "La entrada es demasiado grande para guardarla."
          : "No se ha podido cifrar la entrada. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={save} className="flex flex-col gap-6" noValidate>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.date} className="text-sm font-medium">
            Fecha
          </label>
          <input
            id={ids.date}
            type="date"
            required
            value={entryDate}
            min="1900-01-01"
            max="2999-12-31"
            onChange={(e) => touch(setEntryDate)(e.target.value)}
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-base"
          />
        </div>
        <TextField
          label="Título"
          name="title"
          value={title}
          maxLength={ENTRY_LIMITS.titleMaxLength}
          onChange={(e) => touch(setTitle)(e.target.value)}
          className="font-serif"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Estado de ánimo</legend>
        <div className="flex flex-wrap gap-2">
          {[null, ...MOODS].map((value) => (
            <label
              key={value ?? "ninguno"}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-surface-sunken has-[:checked]:font-medium"
            >
              <input
                type="radio"
                name={ids.mood}
                checked={mood === value}
                onChange={() => touch(setMood)(value)}
                className="accent-[var(--accent)]"
              />
              {value ? MOOD_LABELS[value] : "Sin indicar"}
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        label="Etiquetas"
        name="tags"
        value={tagsInput}
        onChange={(e) => touch(setTagsInput)(e.target.value)}
        hint={`Separadas por comas. Hasta ${ENTRY_LIMITS.maxTags}.`}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id={ids.body} className="text-sm font-medium">
            Texto
          </span>
          <div role="tablist" aria-label="Modo del editor" className="flex gap-1">
            {(["escribir", "vista"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`${ids.tabs}-${value}`}
                aria-selected={tab === value}
                aria-controls={`${ids.tabs}-panel`}
                onClick={() => setTab(value)}
                className="min-h-11 rounded-md px-3 text-sm aria-selected:bg-surface-sunken aria-selected:font-medium"
              >
                {value === "escribir" ? "Escribir" : "Vista previa"}
              </button>
            ))}
          </div>
        </div>
        <div id={`${ids.tabs}-panel`} role="tabpanel" aria-labelledby={`${ids.tabs}-${tab}`}>
          {tab === "escribir" ? (
            <div className="rounded-md border border-border-strong bg-surface">
              <div role="toolbar" aria-label="Formato" className="flex flex-wrap gap-1 border-b border-border p-1">
                {FORMATS.map((format) => (
                  <button
                    key={format.label}
                    type="button"
                    onClick={() => applyFormat(format)}
                    className="min-h-9 rounded px-2.5 text-sm text-text-muted hover:bg-surface-sunken hover:text-text"
                    title={format.shortcut ? `${format.label} (Ctrl+${format.shortcut.toUpperCase()})` : format.label}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                aria-labelledby={ids.body}
                aria-describedby={`${ids.body}-hint`}
                value={body}
                maxLength={ENTRY_LIMITS.bodyMaxLength}
                onChange={(e) => touch(setBody)(e.target.value)}
                onKeyDown={onBodyKeyDown}
                rows={14}
                spellCheck
                className="block min-h-72 w-full resize-y rounded-b-md bg-transparent p-4 font-serif text-lg leading-relaxed outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                placeholder="Querido diario…"
              />
            </div>
          ) : (
            <div className="min-h-72 rounded-md border border-border bg-surface p-4">
              {body.trim() ? (
                <MarkdownView source={body} />
              ) : (
                <p className="text-text-muted">Nada que mostrar todavía.</p>
              )}
            </div>
          )}
        </div>
        <p id={`${ids.body}-hint`} className="text-sm text-text-muted">
          Markdown básico: **negrita**, _cursiva_, ## títulos, - listas, &gt; citas y [enlaces](https://…). No se guarda
          ningún borrador: el texto solo existe aquí hasta que lo guardes cifrado.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={busy} pendingLabel="Cifrando y guardando…">
          Guardar entrada
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (dirty && !window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
            if (onCancel) onCancel();
            else router.push("/diario");
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
