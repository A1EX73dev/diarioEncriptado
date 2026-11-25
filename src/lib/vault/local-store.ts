/**
 * Valor pequeño y NO sensible guardado en localStorage, legible desde React
 * con useSyncExternalStore (se sincroniza entre componentes y pestañas).
 * Si el almacenamiento no está disponible (modo privado, bloqueado), se
 * mantiene en memoria mientras dure la página.
 */
export interface LocalStore<T> {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  write: (raw: string | null) => void;
}

export function createLocalStore<T>(key: string, parse: (raw: string | null) => T, fallback: T): LocalStore<T> {
  const listeners = new Set<() => void>();
  let memoryRaw: string | null = null;
  let cachedRaw: string | null | undefined;
  let cachedValue = fallback;

  function read(): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryRaw;
    }
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot() {
      const raw = read();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = parse(raw);
      }
      return cachedValue;
    },
    getServerSnapshot: () => fallback,
    write(raw) {
      memoryRaw = raw;
      try {
        if (raw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, raw);
      } catch {
        // Sin almacenamiento: queda en memoria.
      }
      for (const listener of listeners) listener();
    },
  };
}
