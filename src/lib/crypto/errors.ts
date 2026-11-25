/**
 * Errores del módulo de criptografía.
 *
 * Los mensajes son deliberadamente genéricos: la interfaz no debe revelar
 * si falló la frase, la etiqueta GCM o el formato de los datos.
 */

export class CryptoModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** La frase secreta o la clave de recuperación no abren el diario. */
export class WrongSecretError extends CryptoModuleError {
  constructor() {
    super("No se ha podido desbloquear el diario.");
  }
}

/** Una entrada no se puede descifrar (manipulada, movida o corrupta). */
export class DecryptionError extends CryptoModuleError {
  constructor() {
    super("No se ha podido descifrar la entrada.");
  }
}

/** La clave de recuperación no tiene un formato válido (palabras o suma de control). */
export class InvalidRecoveryPhraseError extends CryptoModuleError {
  constructor() {
    super("La clave de recuperación no es válida.");
  }
}

/** La frase secreta no cumple la política mínima de longitud. */
export class WeakPassphraseError extends CryptoModuleError {
  constructor() {
    super("La frase secreta no cumple los requisitos mínimos.");
  }
}

/** El contenido de la entrada supera el tamaño máximo permitido. */
export class PayloadTooLargeError extends CryptoModuleError {
  constructor() {
    super("La entrada es demasiado grande.");
  }
}

/** Datos de entrada con formato inválido (identificadores, parámetros, base64…). */
export class InvalidInputError extends CryptoModuleError {
  constructor(what: string) {
    super(`Dato no válido: ${what}.`);
  }
}
