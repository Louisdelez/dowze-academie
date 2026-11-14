import { appStorage } from "../lib/appStorage";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";

export type PersistentStateValidator<T> = (value: unknown) => value is T;
export type PersistentStateSetter<T> = (value: SetStateAction<T>) => boolean;
/** Read the committed value into React without writing it back to storage. */
export type PersistentStateRefresh = () => Promise<boolean>;

interface PersistentStateOptions {
  allowEphemeralOnError?: boolean;
  /** Functional edits include a same-window CAS committed before React refreshed. */
  readCurrentCacheForUpdates?: boolean;
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
): [T, PersistentStateSetter<T>, PersistentStateRefresh] {
  const readValue = ():T => {
    let stored: string | null = null;
    try {
      stored = appStorage.getItem(key);
      if (!stored) return initialValue;
      const parsed: unknown = JSON.parse(stored);
      if (validate(parsed)) return parsed;
      throw new Error("Le format des données enregistrées est invalide.");
    } catch (error) {
      pendingRecoveries.add(key);
      if (stored) {
        try {
          const recoveryKey = `${key}.recovery`;
          if (!appStorage.getItem(recoveryKey)) appStorage.setItem(recoveryKey, stored);
          appStorage.setItem(key, JSON.stringify(initialValue));
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
  };
  const [storedState,setStoredState]=useState(()=>({key,value:readValue()}));
  let active=storedState;
  // Changing year/account reads that namespace before any child can save the previous value there.
  if(active.key!==key){active={key,value:readValue()};setStoredState(active);}
  const valueRef=useRef(active);valueRef.current=active;
  const setValue=(value:T)=>setStoredState({key,value});
  const mountedRef = useRef(true);
  const sourceRef = useRef({key});
  if(sourceRef.current.key!==key)sourceRef.current={key};
  const source=sourceRef.current;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const setPersistentValue = useCallback<PersistentStateSetter<T>>((nextValue) => {
    if (!mountedRef.current || valueRef.current.key!==key) return false;
    let next=valueRef.current.value;
    try {
      let previous=valueRef.current.value;
      if(options.readCurrentCacheForUpdates&&typeof nextValue==='function'){
        const raw=appStorage.getItem(key),committed:unknown=raw===null?initialValue:JSON.parse(raw);
        if(!validate(committed))throw new Error('Le carnet enregistré doit être récupéré avant sa modification.');
        previous=committed;
      }
      next=typeof nextValue==='function'?(nextValue as (previous:T)=>T)(previous):nextValue;
      const serialized = JSON.stringify(next);
      if (serialized === undefined) throw new Error("La valeur ne peut pas être sérialisée.");
      if (appStorage.getItem(key) !== serialized) {
        appStorage.setItem(key, serialized);
      }
      void appStorage.flush().then(() => window.dispatchEvent(new CustomEvent("etude:persistence-success", { detail: { key } }))).catch(() => {});
    } catch (error) {
      window.dispatchEvent(new CustomEvent("etude:persistence-error", {
        detail: {
          key,
          message: error instanceof Error ? error.message : String(error)
        }
      }));
      if (options.allowEphemeralOnError) {
        valueRef.current = {key,value:next};
        setValue(next);
      }
      return false;
    }
    valueRef.current = {key,value:next};
    setValue(next);
    return true;
  }, [key, options.allowEphemeralOnError,options.readCurrentCacheForUpdates,options.readCurrentCacheForUpdates?validate:undefined,options.readCurrentCacheForUpdates?initialValue:undefined]);

  const refreshPersistentValue=useCallback<PersistentStateRefresh>(async()=>{
    const observed=valueRef.current;
    const current=()=>mountedRef.current&&sourceRef.current===source&&valueRef.current===observed;
    if(!current())return false;
    const raw=await appStorage.readCurrentItem(key);
    if(!current())return false;
    const next:unknown=raw===null?initialValue:JSON.parse(raw);
    if(!validate(next))throw new Error('Le carnet enregistré doit être récupéré avant son ouverture.');
    valueRef.current={key,value:next};setStoredState({key,value:next});
    return true;
  },[key,source,initialValue,validate]);

  return [active.value, setPersistentValue, refreshPersistentValue];
}
