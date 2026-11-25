import { beforeAll, describe, expect, it } from "vitest";
import {
  changePassphrase,
  createKeyring,
  regenerateRecoveryKey,
  unlockKeyring,
  type CreatedKeyring,
  type KeyringRecord,
} from "./keyring";
import { decryptEntry, encryptEntry, type EncryptedEntry } from "./entry";
import { InvalidInputError, InvalidRecoveryPhraseError, WeakPassphraseError, WrongSecretError } from "./errors";
import { argon2idKdf } from "./kdf-argon2id";
import { DEFAULT_KDF_COST } from "./kdf";
import { newId, OTHER_PASSPHRASE, PASSPHRASE, samplePayload, tamper, testOptions } from "./test-utils";

const pass = (passphrase: string) => ({ kind: "passphrase", passphrase }) as const;
const rec = (recoveryPhrase: string) => ({ kind: "recovery", recoveryPhrase }) as const;

describe("llavero", () => {
  const userId = newId();
  const entryId = newId();
  let created: CreatedKeyring;
  let entry: EncryptedEntry;

  beforeAll(async () => {
    created = await createKeyring(userId, PASSPHRASE, testOptions);
    entry = await encryptEntry(created.dek, { userId, entryId }, samplePayload);
  });

  const canRead = async (dek: CryptoKey) => {
    expect(await decryptEntry(dek, { userId, entryId }, entry)).toEqual(samplePayload);
  };

  describe("creación", () => {
    it("devuelve una DEK no extraíble", async () => {
      expect(created.dek.extractable).toBe(false);
      await expect(crypto.subtle.exportKey("raw", created.dek)).rejects.toThrow();
    });

    it("genera una clave de recuperación de 24 palabras", () => {
      expect(created.recoveryPhrase.split(" ")).toHaveLength(24);
    });

    it("el registro no contiene la frase ni la clave de recuperación", () => {
      const serialized = JSON.stringify(created.record);
      expect(serialized).not.toContain(PASSPHRASE);
      for (const word of created.recoveryPhrase.split(" ")) {
        expect(serialized).not.toContain(` ${word} `);
      }
    });

    it("usa sal e IV nuevos en cada diario", async () => {
      const other = await createKeyring(userId, PASSPHRASE, testOptions);
      expect(other.record.kdf.salt).not.toBe(created.record.kdf.salt);
      expect(other.record.passphrase.iv).not.toBe(created.record.passphrase.iv);
      expect(other.record.recovery.iv).not.toBe(created.record.recovery.iv);
      expect(other.recoveryPhrase).not.toBe(created.recoveryPhrase);
    });

    it("rechaza frases demasiado cortas", async () => {
      await expect(createKeyring(userId, "corta", testOptions)).rejects.toBeInstanceOf(WeakPassphraseError);
    });

    it("usa por defecto Argon2id con 64 MiB, t=3, p=1", async () => {
      const { record } = await createKeyring(userId, PASSPHRASE, { kdf: argon2idKdf });
      expect(record.kdf).toMatchObject(DEFAULT_KDF_COST);
    });
  });

  describe("desbloqueo con la frase", () => {
    it("abre el diario con la frase correcta", async () => {
      await canRead(await unlockKeyring(created.record, userId, pass(PASSPHRASE), testOptions));
    });

    it("normaliza Unicode: la misma frase en NFD también abre", async () => {
      const accented = "canción de cuna perdida";
      const { record } = await createKeyring(userId, accented.normalize("NFC"), testOptions);
      await expect(unlockKeyring(record, userId, pass(accented.normalize("NFD")), testOptions)).resolves.toBeDefined();
    });

    it("falla con una frase incorrecta", async () => {
      await expect(unlockKeyring(created.record, userId, pass(OTHER_PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
    });

    it("distingue mayúsculas y espacios", async () => {
      await expect(
        unlockKeyring(created.record, userId, pass(PASSPHRASE.toUpperCase()), testOptions),
      ).rejects.toBeInstanceOf(WrongSecretError);
      await expect(unlockKeyring(created.record, userId, pass(`${PASSPHRASE} `), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
    });

    it("falla si se manipula la DEK envuelta", async () => {
      const record: KeyringRecord = {
        ...created.record,
        passphrase: { ...created.record.passphrase, wrappedDek: tamper(created.record.passphrase.wrappedDek) },
      };
      await expect(unlockKeyring(record, userId, pass(PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
    });

    it("falla si se manipulan los parámetros o la sal (ligados por el AAD)", async () => {
      const otherCost = { ...created.record, kdf: { ...created.record.kdf, iterations: 3 } };
      await expect(unlockKeyring(otherCost, userId, pass(PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
      const otherSalt = { ...created.record, kdf: { ...created.record.kdf, salt: tamper(created.record.kdf.salt, 0) } };
      await expect(unlockKeyring(otherSalt, userId, pass(PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
    });

    it("falla si el llavero se asigna a otro usuario", async () => {
      await expect(unlockKeyring(created.record, newId(), pass(PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
    });

    it("rechaza parámetros fuera de los límites antes de derivar", async () => {
      const huge = { ...created.record, kdf: { ...created.record.kdf, memoryKiB: 4 * 1024 * 1024 } };
      await expect(unlockKeyring(huge, userId, pass(PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        InvalidInputError,
      );
      const weak = { ...created.record, kdf: { ...created.record.kdf, iterations: 1 } };
      await expect(unlockKeyring(weak, userId, pass(PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        InvalidInputError,
      );
    });
  });

  describe("clave de recuperación", () => {
    it("abre el diario y permite leer las entradas", async () => {
      await canRead(await unlockKeyring(created.record, userId, rec(created.recoveryPhrase), testOptions));
    });

    it("tolera mayúsculas, guiones y espacios de más", async () => {
      const messy = `  ${created.recoveryPhrase.toUpperCase().split(" ").join(" - ")}\n`;
      await canRead(await unlockKeyring(created.record, userId, rec(messy), testOptions));
    });

    it("rechaza una clave con una palabra cambiada (suma de control BIP39)", async () => {
      const words = created.recoveryPhrase.split(" ");
      words[3] = words[3] === "abandon" ? "ability" : "abandon";
      await expect(unlockKeyring(created.record, userId, rec(words.join(" ")), testOptions)).rejects.toBeInstanceOf(
        InvalidRecoveryPhraseError,
      );
    });

    it("rechaza una clave válida de otro diario", async () => {
      const other = await createKeyring(userId, PASSPHRASE, testOptions);
      await expect(
        unlockKeyring(created.record, userId, rec(other.recoveryPhrase), testOptions),
      ).rejects.toBeInstanceOf(WrongSecretError);
    });

    it("recupera el diario y fija una frase nueva sin conocer la anterior", async () => {
      const recovered = await changePassphrase(
        created.record,
        userId,
        rec(created.recoveryPhrase),
        OTHER_PASSPHRASE,
        testOptions,
      );
      await canRead(await unlockKeyring(recovered, userId, pass(OTHER_PASSPHRASE), testOptions));
      await expect(unlockKeyring(recovered, userId, pass(PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
      // La clave de recuperación sigue sirviendo.
      await canRead(await unlockKeyring(recovered, userId, rec(created.recoveryPhrase), testOptions));
    });

    it("al regenerarla, la anterior deja de servir y la nueva funciona", async () => {
      const { record, recoveryPhrase } = await regenerateRecoveryKey(
        created.record,
        userId,
        pass(PASSPHRASE),
        testOptions,
      );
      expect(recoveryPhrase).not.toBe(created.recoveryPhrase);
      await canRead(await unlockKeyring(record, userId, rec(recoveryPhrase), testOptions));
      await expect(unlockKeyring(record, userId, rec(created.recoveryPhrase), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
      // La frase no cambia.
      await canRead(await unlockKeyring(record, userId, pass(PASSPHRASE), testOptions));
    });

    it("no se puede regenerar sin un secreto válido", async () => {
      await expect(
        regenerateRecoveryKey(created.record, userId, pass(OTHER_PASSPHRASE), testOptions),
      ).rejects.toBeInstanceOf(WrongSecretError);
    });
  });

  describe("cambio de frase", () => {
    it("mantiene el acceso a las entradas existentes sin recifrarlas", async () => {
      const updated = await changePassphrase(created.record, userId, pass(PASSPHRASE), OTHER_PASSPHRASE, testOptions);
      // Las entradas cifradas antes del cambio se leen con la DEK desbloqueada con la frase nueva.
      await canRead(await unlockKeyring(updated, userId, pass(OTHER_PASSPHRASE), testOptions));
    });

    it("la frase antigua deja de funcionar y se usan sal e IV nuevos", async () => {
      const updated = await changePassphrase(created.record, userId, pass(PASSPHRASE), OTHER_PASSPHRASE, testOptions);
      expect(updated.kdf.salt).not.toBe(created.record.kdf.salt);
      expect(updated.passphrase.iv).not.toBe(created.record.passphrase.iv);
      expect(updated.recovery).toEqual(created.record.recovery);
      await expect(unlockKeyring(updated, userId, pass(PASSPHRASE), testOptions)).rejects.toBeInstanceOf(
        WrongSecretError,
      );
    });

    it("exige la frase actual correcta", async () => {
      await expect(
        changePassphrase(created.record, userId, pass("no es la frase actual"), OTHER_PASSPHRASE, testOptions),
      ).rejects.toBeInstanceOf(WrongSecretError);
    });

    it("aplica la política a la frase nueva", async () => {
      await expect(
        changePassphrase(created.record, userId, pass(PASSPHRASE), "corta", testOptions),
      ).rejects.toBeInstanceOf(WeakPassphraseError);
    });

    it("actualiza el coste de derivación al vigente", async () => {
      const updated = await changePassphrase(created.record, userId, pass(PASSPHRASE), OTHER_PASSPHRASE, {
        kdf: argon2idKdf,
      });
      expect(updated.kdf).toMatchObject(DEFAULT_KDF_COST);
      await canRead(await unlockKeyring(updated, userId, pass(OTHER_PASSPHRASE), { kdf: argon2idKdf }));
    });
  });
});
