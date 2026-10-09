import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';

/**
 * Loads data from the API and re-loads when `deps` change. Responses that arrive after a newer
 * request was started are discarded, so fast filter changes never show stale results.
 *
 *   const { data, loading, error, reload } = useApi((signal) => incidentsApi.list(query, signal), [query]);
 *
 * Pass `enabled: false` to skip loading (e.g. while a required value is missing).
 */
export default function useApi(fetcher, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const controllerRef = useRef(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    controllerRef.current?.abort(); // a newer request supersedes the previous one
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcherRef.current(controller.signal);
      if (!controller.signal.aborted) setState({ data, loading: false, error: null });
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') return;
      setState((s) => ({ ...s, loading: false, error: err, message: errorMessage(err) }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    load();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const setData = useCallback((data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })), []);

  return { ...state, reload: load, setData };
}

/** Returns `value` after it has stopped changing for `ms` (search boxes). */
export function useDebounced(value, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
