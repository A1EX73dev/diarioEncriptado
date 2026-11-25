"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KeyringRecord } from "@/lib/crypto";
import { decryptRows, isDecrypted, type DecryptResult } from "@/lib/entries/client";
import { collectTags, EMPTY_FILTERS, filterEntries, hasActiveFilters, type EntryFilters } from "@/lib/entries/filter";
import type { EncryptedEntryRow } from "@/lib/entries/types";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/Button";
import { LockIcon } from "@/components/ui/icons";
import { UnlockForm } from "@/components/vault/UnlockForm";
import { CalendarView } from "./CalendarView";
import { EntryList } from "./EntryList";
import { FilterBar } from "./FilterBar";
import { LockedEntryList } from "./LockedEntryList";

/** Portada del diario: bloqueada (texto cifrado + desbloqueo) o desbloqueada. */
export function DiaryHome({
  record,
  entries,
  notice,
}: {
  record: KeyringRecord;
  entries: EncryptedEntryRow[];
  notice?: string;
}) {
  const { isUnlocked } = useVault();

  if (!isUnlocked) {
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        {notice && (
          <div className="lg:col-span-2">
            <Alert tone="success">{notice}</Alert>
          </div>
        )}
        <section aria-labelledby="titulo-bloqueado" className="order-2 lg:order-1">
          <h2 id="titulo-bloqueado" className="mb-4 flex items-center gap-2 text-sm font-medium text-text-muted">
            <LockIcon width={16} height={16} />
            {entries.length} {entries.length === 1 ? "entrada cifrada" : "entradas cifradas"}
          </h2>
          <LockedEntryList entries={entries} />
        </section>
        <section
          aria-labelledby="titulo-desbloquear"
          className="order-1 h-fit rounded-lg border border-border bg-surface p-6 lg:order-2"
        >
          <h1 id="titulo-desbloquear" className="font-serif text-2xl">
            Desbloquear el diario
          </h1>
          <p className="mt-2 mb-5 text-sm text-text-muted">
            Sin la frase, tus entradas son solo texto ilegible, también para el servidor.
          </p>
          <UnlockForm record={record} />
        </section>
      </div>
    );
  }

  return <UnlockedDiary entries={entries} notice={notice} />;
}

/**
 * Se monta solo con el diario desbloqueado. Al bloquearse se desmonta y el
 * texto descifrado (estado de este componente) se descarta, igual que los
 * filtros: los términos de búsqueda tampoco se guardan en ningún sitio.
 */
function UnlockedDiary({ entries, notice }: { entries: EncryptedEntryRow[]; notice?: string }) {
  const { dek, userId } = useVault();
  const [results, setResults] = useState<DecryptResult[] | null>(null);
  const [filters, setFilters] = useState<EntryFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<"lista" | "calendario">("lista");

  useEffect(() => {
    if (!dek) return;
    let cancelled = false;
    decryptRows(dek, userId, entries).then((decrypted) => {
      if (!cancelled) setResults(decrypted);
    });
    return () => {
      cancelled = true;
    };
  }, [dek, userId, entries]);

  const decrypted = useMemo(() => (results ?? []).filter(isDecrypted), [results]);
  const tags = useMemo(() => collectTags(decrypted), [decrypted]);
  const visible = useMemo(() => {
    if (!results) return [];
    if (!hasActiveFilters(filters)) return results;
    const keep = new Set(filterEntries(decrypted, filters).map((e) => e.id));
    return results.filter((r) => keep.has(r.id));
  }, [results, decrypted, filters]);

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl">Tu diario</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Vista" className="flex rounded-md border border-border-strong p-0.5">
            {(["lista", "calendario"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className="min-h-10 rounded px-3 text-sm aria-pressed:bg-surface-sunken aria-pressed:font-medium"
              >
                {value === "lista" ? "Lista" : "Calendario"}
              </button>
            ))}
          </div>
          <Link href="/diario/entrada/nueva" className={buttonClasses("primary")}>
            Nueva entrada
          </Link>
        </div>
      </div>
      {results === null ? (
        <p className="text-text-muted" role="status">
          Descifrando entradas…
        </p>
      ) : view === "calendario" ? (
        <CalendarView
          dates={entries.map((e) => e.entryDate)}
          onSelectDay={(iso) => {
            setFilters({ ...EMPTY_FILTERS, from: iso, to: iso });
            setView("lista");
          }}
        />
      ) : (
        <>
          {entries.length > 0 && (
            <FilterBar
              filters={filters}
              onChange={setFilters}
              tags={tags}
              total={results.length}
              shown={visible.length}
            />
          )}
          {entries.length === 0 ? (
            <p className="font-serif text-text-muted">Aún no has escrito nada. Pulsa «Nueva entrada» para empezar.</p>
          ) : (
            <EntryList results={visible} rows={entries} />
          )}
        </>
      )}
    </div>
  );
}
