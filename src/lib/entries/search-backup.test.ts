import { describe, expect, it } from "vitest";
import { createKeyring, encryptEntry, WrongSecretError, type EntryPayload } from "@/lib/crypto";
import { argon2idKdf } from "@/lib/crypto/kdf-argon2id";
import { PASSPHRASE, testOptions } from "@/lib/crypto/test-utils";
import {
  BackupFormatError,
  buildDecryptedBackup,
  buildEncryptedBackup,
  openEncryptedBackup,
  parseBackup,
  plainEntriesOf,
  splitDuplicates,
  toMarkdown,
  type EncryptedBackup,
} from "./backup";
import { countByDate, monthGrid, shiftMonth } from "./calendar";
import { collectTags, EMPTY_FILTERS, filterEntries, normalizeForSearch } from "./filter";
import type { DecryptedEntry, EncryptedEntryRow } from "./types";

const entry = (id: string, entryDate: string, payload: Partial<EntryPayload>): DecryptedEntry => ({
  id,
  entryDate,
  createdAt: `${entryDate}T10:00:00Z`,
  updatedAt: `${entryDate}T10:00:00Z`,
  payload: { title: "", body: "", mood: null, tags: [], ...payload },
});

const ENTRIES = [
  entry("a", "2026-11-25", {
    title: "Café con Lucía",
    body: "Hablamos del viaje a Lisboa",
    tags: ["Amigos", "viaje"],
    mood: "bien",
  }),
  entry("b", "2026-11-20", { title: "Examen", body: "Nervios y café frío", tags: ["estudio"], mood: "mal" }),
  entry("c", "2026-10-02", { title: "Paseo", body: "Otoño en el parque", tags: ["amigos"], mood: "muy-bien" }),
];

const ids = (list: DecryptedEntry[]) => list.map((e) => e.id);

describe("búsqueda y filtros", () => {
  it("sin filtros devuelve todo", () => {
    expect(ids(filterEntries(ENTRIES, EMPTY_FILTERS))).toEqual(["a", "b", "c"]);
  });

  it("busca sin distinguir mayúsculas ni tildes, en título, texto y etiquetas", () => {
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, text: "CAFE" }))).toEqual(["a", "b"]);
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, text: "lucia" }))).toEqual(["a"]);
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, text: "estudio" }))).toEqual(["b"]);
  });

  it("exige todas las palabras", () => {
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, text: "café viaje" }))).toEqual(["a"]);
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, text: "café parque" }))).toEqual([]);
  });

  it("filtra por etiqueta (sin mayúsculas), ánimo y rango de fechas", () => {
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, tag: "amigos" }))).toEqual(["a", "c"]);
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, mood: "mal" }))).toEqual(["b"]);
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, from: "2026-11-01", to: "2026-11-20" }))).toEqual(["b"]);
    expect(ids(filterEntries(ENTRIES, { ...EMPTY_FILTERS, from: "2026-11-25", to: "2026-11-25" }))).toEqual(["a"]);
  });

  it("lista las etiquetas sin repetir y ordenadas", () => {
    expect(collectTags(ENTRIES)).toEqual(["Amigos", "estudio", "viaje"]);
    expect(normalizeForSearch("Ñandú Árbol")).toBe("nandu arbol");
  });
});

describe("calendario", () => {
  it("noviembre de 2026 empieza en domingo: 6 semanas de lunes a domingo", () => {
    const weeks = monthGrid({ year: 2026, month: 10 });
    expect(weeks[0]![0]!.iso).toBe("2026-10-26");
    expect(weeks[0]![6]).toMatchObject({ iso: "2026-11-01", inMonth: true });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
    expect(weeks.at(-1)!.at(-1)!.iso).toBe("2026-12-06");
  });

  it("febrero de 2027 (empieza en lunes) cabe en 4 semanas", () => {
    expect(monthGrid({ year: 2027, month: 1 })).toHaveLength(4);
  });

  it("cambia de mes y de año", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("cuenta entradas por día", () => {
    expect(countByDate(["2026-11-25", "2026-11-25", "2026-11-20"]).get("2026-11-25")).toBe(2);
  });
});

describe("copias de seguridad", () => {
  it("la copia descifrada se puede volver a leer", () => {
    const text = JSON.stringify(buildDecryptedBackup(ENTRIES));
    const parsed = parseBackup(text);
    expect(parsed.kind).toBe("descifrado");
    expect(plainEntriesOf(parsed as never)[0]).toEqual({ entryDate: "2026-11-25", payload: ENTRIES[0]!.payload });
  });

  it("rechaza archivos que no son copias o están manipulados", () => {
    expect(() => parseBackup("no es json")).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ format: "otro", version: 1, kind: "descifrado" }))).toThrow(
      BackupFormatError,
    );
    const bad = buildDecryptedBackup(ENTRIES);
    (bad.entries[0] as { entryDate: string }).entryDate = "2026-13-40";
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(BackupFormatError);
  });

  it("el Markdown avisa de que no está cifrado e incluye las entradas", () => {
    const md = toMarkdown(ENTRIES);
    expect(md).toContain("NO está cifrado");
    expect(md).toContain("## Café con Lucía");
    expect(md).toContain("etiquetas: Amigos, viaje");
  });

  describe("copia cifrada", () => {
    async function makeBackup(): Promise<EncryptedBackup> {
      const userId = crypto.randomUUID();
      const { record, dek } = await createKeyring(userId, PASSPHRASE, testOptions);
      const rows: EncryptedEntryRow[] = await Promise.all(
        ENTRIES.map(async (e) => {
          const id = crypto.randomUUID();
          const encrypted = await encryptEntry(dek, { userId, entryId: id }, e.payload);
          return {
            id,
            entryDate: e.entryDate,
            ciphertextBytes: 0,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            ...encrypted,
          };
        }),
      );
      return parseBackup(JSON.stringify(buildEncryptedBackup(userId, record, rows))) as EncryptedBackup;
    }

    it("no contiene texto en claro y se abre con la frase del diario", async () => {
      const backup = await makeBackup();
      const text = JSON.stringify(backup);
      expect(text).not.toContain("Lucía");
      expect(text).not.toContain(PASSPHRASE);
      const { entries, failed } = await openEncryptedBackup(backup, PASSPHRASE, argon2idKdf);
      expect(failed).toBe(0);
      expect(entries.map((e) => e.payload.title)).toEqual(["Café con Lucía", "Examen", "Paseo"]);
    });

    it("una frase incorrecta no la abre", async () => {
      await expect(openEncryptedBackup(await makeBackup(), "otra frase distinta", argon2idKdf)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
    });

    it("una entrada manipulada se cuenta como fallida y no rompe el resto", async () => {
      const backup = await makeBackup();
      const first = backup.entries[0]!;
      backup.entries[0] = {
        ...first,
        ciphertext: (first.ciphertext[0] === "A" ? "B" : "A") + first.ciphertext.slice(1),
      };
      const { entries, failed } = await openEncryptedBackup(backup, PASSPHRASE, argon2idKdf);
      expect(failed).toBe(1);
      expect(entries).toHaveLength(2);
    });
  });

  it("detecta duplicados con las entradas existentes y dentro del propio archivo", () => {
    const candidates = [
      { entryDate: "2026-11-25", payload: ENTRIES[0]!.payload },
      { entryDate: "2026-11-26", payload: { ...ENTRIES[0]!.payload, title: "Nueva" } },
      { entryDate: "2026-11-26", payload: { ...ENTRIES[0]!.payload, title: "Nueva" } },
    ];
    const { fresh, duplicates } = splitDuplicates(candidates, ENTRIES);
    expect(fresh).toHaveLength(1);
    expect(duplicates).toBe(2);
  });
});
