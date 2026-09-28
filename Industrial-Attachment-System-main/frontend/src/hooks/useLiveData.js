import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Polling hook for figures that other people's actions can change.
 *
 * Several surfaces in this app report derived counts -- staffing, fill rates,
 * requisition queues, clearance buckets. Each of those used to fetch once on
 * mount, so a status change made by a colleague in another tab stayed invisible
 * until the page happened to be reloaded. Every one of them had reimplemented
 * the same `setInterval`, with a different interval and no way to tell the user
 * when the numbers were last confirmed.
 *
 * This centralises that so there is one interval, one visibility rule and one
 * "last updated" value.
 *
 * Two details that a bare setInterval gets wrong:
 *
 *  - It keeps polling a background tab. `document.visibilityState` is checked so
 *    an idle tab does not hammer the server indefinitely, and the data is
 *    refreshed as soon as the tab becomes visible again, because a user
 *    returning to a tab is exactly the moment stale figures are most visible.
 *
 *  - It can overlap requests. If a fetch is slower than the interval, the next
 *    tick starts another one and responses can arrive out of order, so an older
 *    payload can overwrite a newer one. An in-flight flag drops the tick
 *    instead, and responses are sequence-numbered so a stale reply is discarded.
 */

/** Matched to the existing 10s notification poll so the app has one cadence. */
export const DEFAULT_POLL_MS = 10000;

/**
 * @param {Function} fetcher  async function returning the value to store.
 *                            Must be referentially stable (wrap in useCallback)
 *                            or it will re-trigger the effect every render.
 * @param {Object}   options
 * @param {number}   options.intervalMs  0 or false disables polling entirely.
 * @param {boolean}  options.enabled     false skips fetching and polling.
 * @returns {{data, error, loading, refreshing, lastUpdatedAt, refresh}}
 */
export function useLiveData(fetcher, { intervalMs = DEFAULT_POLL_MS, enabled = true } = {}) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(enabled);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    const inFlight = useRef(false);
    const sequence = useRef(0);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const run = useCallback(
        async ({ silent } = { silent: true }) => {
            if (!enabled) return;
            // Drop the tick rather than run two requests at once.
            if (inFlight.current) return;
            inFlight.current = true;
            const ticket = ++sequence.current;

            if (silent) setRefreshing(true);
            else setLoading(true);

            try {
                const result = await fetcher();
                // A reply from a superseded request must not win.
                if (!mounted.current || ticket !== sequence.current) return;
                setData(result);
                setError(null);
                setLastUpdatedAt(new Date());
            } catch (err) {
                if (!mounted.current || ticket !== sequence.current) return;
                setError(err);
                // A failed poll is not allowed to wipe the last good figures.
                // Replacing working data with an empty screen because one
                // request timed out is worse than briefly stale numbers.
            } finally {
                if (mounted.current && ticket === sequence.current) {
                    inFlight.current = false;
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [fetcher, enabled]
    );

    // Initial load, and reload whenever the fetcher's inputs change.
    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }
        run({ silent: false });
    }, [run, enabled]);

    // Poll.
    useEffect(() => {
        if (!enabled || !intervalMs) return undefined;
        const id = setInterval(() => run({ silent: true }), intervalMs);
        return () => clearInterval(id);
    }, [run, enabled, intervalMs]);

    // Catch up immediately when the tab is refocused or revealed.
    useEffect(() => {
        if (!enabled || typeof document === 'undefined') return undefined;
        const onVisible = () => {
            if (document.visibilityState === 'visible') run({ silent: true });
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [run, enabled]);

    const refresh = useCallback(() => run({ silent: true }), [run]);

    return { data, error, loading, refreshing, lastUpdatedAt, refresh };
}

/**
 * DRY out the "is this a paginated envelope or a bare array" check.
 *
 * DRF returns `{count, next, previous, results}` for paginated views but a bare
 * array when pagination is switched off, and several of the endpoints this app
 * reads do exactly that. Copy-pasting the ternary into each call site is how
 * one of them ends up rendering an empty table.
 */
export function unwrapList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}
