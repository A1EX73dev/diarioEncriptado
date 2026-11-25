"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { autoLockStore } from "./autolock";

/**
 * Estado de desbloqueo del diario.
 *
 * - La DEK vive solo aquí, en memoria, como CryptoKey NO extraíble. No se
 *   guarda en localStorage, sessionStorage, IndexedDB ni cookies, ni se envía
 *   al servidor. Al recargar o cerrar la página, desaparece: el diario se bloquea.
 * - Se bloquea a mano, por inactividad, al cerrar sesión o cuando otra pestaña
 *   se bloquea (BroadcastChannel, que solo transmite el aviso "lock").
 * - `generation` cambia en cada bloqueo para que los componentes que tengan
 *   texto descifrado lo descarten.
 */

export type LockReason = "manual" | "inactividad" | "otra-pestana" | "sesion";

interface VaultContextValue {
  userId: string;
  dek: CryptoKey | null;
  isUnlocked: boolean;
  generation: number;
  lastLockReason: LockReason | null;
  /** Milisegundos hasta el bloqueo automático (null si está bloqueado). */
  remainingMs: number | null;
  autoLockMinutes: number;
  setAutoLockMinutes: (minutes: number) => void;
  unlock: (dek: CryptoKey) => void;
  lock: (reason?: LockReason) => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const CHANNEL_NAME = "diario-vault";
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function VaultProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [generation, setGeneration] = useState(0);
  const [lastLockReason, setLastLockReason] = useState<LockReason | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const autoLockMinutes = useSyncExternalStore(
    autoLockStore.subscribe,
    autoLockStore.getSnapshot,
    autoLockStore.getServerSnapshot,
  );
  const lastActivity = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  const lockLocal = useCallback((reason: LockReason) => {
    setDek(null);
    setRemainingMs(null);
    setLastLockReason(reason);
    setGeneration((g) => g + 1);
  }, []);

  const lock = useCallback(
    (reason: LockReason = "manual") => {
      lockLocal(reason);
      channel.current?.postMessage("lock");
    },
    [lockLocal],
  );

  const unlock = useCallback((key: CryptoKey) => {
    if (key.extractable) throw new Error("La DEK en memoria debe ser no extraíble.");
    lastActivity.current = Date.now();
    setLastLockReason(null);
    setDek(key);
  }, []);

  const setAutoLockMinutes = useCallback((minutes: number) => {
    autoLockStore.write(String(minutes));
    lastActivity.current = Date.now();
  }, []);

  // Bloqueo coordinado entre pestañas.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (event) => {
      if (event.data === "lock") lockLocal("otra-pestana");
    };
    channel.current = bc;
    return () => {
      bc.close();
      channel.current = null;
    };
  }, [lockLocal]);

  // Bloqueo automático por inactividad.
  useEffect(() => {
    if (!dek) return;
    const limitMs = autoLockMinutes * 60_000;
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    const tick = () => {
      const remaining = limitMs - (Date.now() - lastActivity.current);
      if (remaining <= 0) lock("inactividad");
      else setRemainingMs(remaining);
    };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true });
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(interval);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
    };
  }, [dek, autoLockMinutes, lock]);

  // Al desmontarse (p. ej. al cerrar sesión y salir de la zona privada) se suelta la clave.
  useEffect(() => () => setDek(null), []);

  const value = useMemo<VaultContextValue>(
    () => ({
      userId,
      dek,
      isUnlocked: dek !== null,
      generation,
      lastLockReason,
      remainingMs,
      autoLockMinutes,
      setAutoLockMinutes,
      unlock,
      lock,
    }),
    [userId, dek, generation, lastLockReason, remainingMs, autoLockMinutes, setAutoLockMinutes, unlock, lock],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault debe usarse dentro de <VaultProvider>.");
  return context;
}
