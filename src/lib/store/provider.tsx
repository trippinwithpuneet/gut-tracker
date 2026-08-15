'use client';

/**
 * Chooses the storage backend and exposes it, plus the library, to the whole app.
 *
 * Signed out (or with no Supabase configured) you get LocalStore and the app is
 * fully usable. Signing in swaps in CloudStore and, if there is local data waiting,
 * raises `pendingLocalMigration` so the UI can offer to carry it across. The
 * migration itself is one line — that is the whole point of the DataStore interface.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { CURATED_FOOD_TAGS, CURATED_SYMPTOM_TYPES } from '../library';
import { getSupabaseBrowserClient } from '../supabase/client';
import { isSupabaseConfigured } from '../supabase/env';
import type { FoodTag, ImportResult, SymptomType } from '../types';
import { CloudStore } from './cloud';
import { LocalStore, localStoreHasData } from './local';
import type { DataStore } from './types';

export interface StoreContextValue {
  /** False until the backend and library have loaded. Render a skeleton until then. */
  ready: boolean;
  store: DataStore | null;
  mode: 'local' | 'cloud';
  user: User | null;
  /** Whether sign-in can be offered at all. False on a self-host with no Supabase. */
  authAvailable: boolean;
  authError: string | null;

  symptomTypes: SymptomType[];
  foodTags: FoodTag[];
  reloadLibrary: () => Promise<void>;

  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;

  pendingLocalMigration: boolean;
  migrateLocalData: () => Promise<ImportResult | null>;
  dismissMigration: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<DataStore | null>(null);
  const [symptomTypes, setSymptomTypes] = useState<SymptomType[]>(CURATED_SYMPTOM_TYPES);
  const [foodTags, setFoodTags] = useState<FoodTag[]>(CURATED_FOOD_TAGS);
  const [pendingLocalMigration, setPendingLocalMigration] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // LocalStore touches IndexedDB, so it is only ever constructed in the browser.
  const localRef = useRef<LocalStore | null>(null);
  const getLocal = useCallback(() => {
    if (!localRef.current) localRef.current = new LocalStore();
    return localRef.current;
  }, []);

  const loadLibraryFrom = useCallback(async (target: DataStore) => {
    const [symptoms, tags] = await Promise.all([
      target.listSymptomTypes(),
      target.listFoodTags(),
    ]);
    setSymptomTypes(symptoms);
    setFoodTags(tags);
  }, []);

  // Track auth state and swap the backend to match.
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function activate(nextUser: User | null) {
      const nextStore: DataStore =
        nextUser && supabase ? new CloudStore(supabase, nextUser.id) : getLocal();

      try {
        await loadLibraryFrom(nextStore);
      } catch (err) {
        // A library read failure means the backend is unreachable or misconfigured.
        // Falling back to local keeps the app usable instead of showing a dead screen.
        console.error('Falling back to local storage:', err);
        setAuthError(err instanceof Error ? err.message : 'Could not reach the server');
        if (cancelled) return;
        const fallback = getLocal();
        await loadLibraryFrom(fallback);
        setStore(fallback);
        setUser(null);
        setReady(true);
        return;
      }

      if (cancelled) return;
      setStore(nextStore);
      setUser(nextUser);
      setReady(true);

      if (nextUser) setPendingLocalMigration(await localStoreHasData());
    }

    if (!supabase) {
      void activate(null);
      return () => {
        cancelled = true;
      };
    }

    void supabase.auth.getUser().then(({ data }) => activate(data.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void activate(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [getLocal, loadLibraryFrom]);

  // Surface an OAuth failure passed back on the query string by the callback route,
  // then strip it from the URL so a refresh doesn't resurrect a stale error. Reading
  // and clearing window.location is an external-system sync; it cannot run during
  // render without breaking hydration.
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get('auth_error');
    if (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthError(error === 'not_configured' ? 'Sign-in is not configured on this instance.' : error);
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const reloadLibrary = useCallback(async () => {
    if (store) await loadLibraryFrom(store);
  }, [store, loadLibraryFrom]);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthError('Sign-in is not configured on this instance.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          window.location.pathname
        )}`,
      },
    });
    if (error) setAuthError(error.message);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setPendingLocalMigration(false);
  }, []);

  const migrateLocalData = useCallback(async (): Promise<ImportResult | null> => {
    if (!store || store.kind !== 'cloud') return null;
    const snapshot = await getLocal().exportAll();
    const result = await store.importAll(snapshot, 'merge');
    // Only clear the device copy once the server has accepted everything.
    await getLocal().clearAll();
    setPendingLocalMigration(false);
    await loadLibraryFrom(store);
    return result;
  }, [store, getLocal, loadLibraryFrom]);

  const dismissMigration = useCallback(() => setPendingLocalMigration(false), []);

  const value = useMemo<StoreContextValue>(
    () => ({
      ready,
      store,
      mode: store?.kind ?? 'local',
      user,
      authAvailable: isSupabaseConfigured,
      authError,
      symptomTypes,
      foodTags,
      reloadLibrary,
      signInWithGoogle,
      signOut,
      pendingLocalMigration,
      migrateLocalData,
      dismissMigration,
    }),
    [
      ready,
      store,
      user,
      authError,
      symptomTypes,
      foodTags,
      reloadLibrary,
      signInWithGoogle,
      signOut,
      pendingLocalMigration,
      migrateLocalData,
      dismissMigration,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
