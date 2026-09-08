import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";

export type PersistentStateValidator<T> = (value: unknown) => value is T;
export type PersistentStateSetter<T> = (value: SetStateAction<T>) => boolean;

interface PersistentStateOptions {
  allowEphemeralOnError?: boolean;
}

const pendingRecoveries = new Set<string>();

export function consumePersistentRecoveries() {
  const keys = [...pendingRecoveries];
  pendingRecoveries.clear();
  return keys;
}

export function hasCompatiblePersistentShape<T>(value: unknown, initialValue: T): value is T {
  if (initialValue === null) return value === null || typeof value === "string";
  if (Array.isArray(initialValue)) return Array.isArray(value);
  if (typeof initialValue === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === typeof initialValue;
}

export function usePersistentState<T>(
  key: string,
  initialValue: T,
  validate: PersistentStateValidator<T> = (value): value is T =>
    hasCompatiblePersistentShape(value, initialValue),
  options: PersistentStateOptions = {}
): [T, PersistentStateSetter<T>] {
  const [value, setValue] = useState<T>(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(key);
      if (!stored) return initialValue;
      const parsed: unknown = JSON.parse(stored);
      if (validate(parsed)) return parsed;
      throw new Error("Le format des données enregistrées est invalide.");
    } catch (error) {
      pendingRecoveries.add(key);
      if (stored) {
        try {
          const recoveryKey = `${key}.recovery`;
          if (!localStorage.getItem(recoveryKey)) localStorage.setItem(recoveryKey, stored);
          localStorage.setItem(key, JSON.stringify(initialValue));
        } catch {
          // Le stockage peut être plein : le retour aux valeurs sûres reste prioritaire.
        }
      }
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("etude:persistence-recovery", {
        detail: {
          key,
          message: error instanceof Error ? error.message : String(error)
        }
      })), 0);
      return initialValue;
    }
  });
  const valueRef = useRef(value);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const setPersistentValue = useCallback<PersistentStateSetter<T>>((nextValue) => {
    if (!mountedRef.current) return false;
    const next = typeof nextValue === "function"
      ? (nextValue as (previous: T) => T)(valueRef.current)
      : nextValue;
    try {
      const serialized = JSON.stringify(next);
      if (serialized === undefined) throw new Error("La valeur ne peut pas être sérialisée.");
      if (localStorage.getItem(key) !== serialized) {
        localStorage.setItem(key, serialized);
      }
      window.dispatchEvent(new CustomEvent("etude:persistence-success", { detail: { key } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("etude:persistence-error", {
        detail: {
          key,
          message: error instanceof Error ? error.message : String(error)
        }
      }));
      if (options.allowEphemeralOnError) {
        valueRef.current = next;
        setValue(next);
      }
      return false;
    }
    valueRef.current = next;
    setValue(next);
    return true;
  }, [key, options.allowEphemeralOnError]);

  return [value, setPersistentValue];
}
