import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useLiveData, unwrapList } from './useLiveData';

/**
 * The hook every derived-figure surface now shares.
 *
 * It exists because five of them each had their own hand-rolled setInterval,
 * and the figures they showed went stale as soon as anyone recorded a status
 * change. The behaviours worth pinning down are the ones a naive interval gets
 * wrong: overlapping requests, out-of-order responses, wiping good data on a
 * failed poll, and hammering the server from a background tab.
 */

/** A component that exercises the hook and exposes what it returned. */
function Probe({ fetcher, options }) {
    const result = useLiveData(fetcher, options);
    return (
        <div>
            <span data-testid="value">{result.data === null ? 'null' : JSON.stringify(result.data)}</span>
            <span data-testid="loading">{String(result.loading)}</span>
            <span data-testid="refreshing">{String(result.refreshing)}</span>
            <span data-testid="has-updated">{String(Boolean(result.lastUpdatedAt))}</span>
            <button onClick={result.refresh}>refresh</button>
        </div>
    );
}

describe('useLiveData', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('fetches once on mount and exposes the result', async () => {
        const fetcher = vi.fn().mockResolvedValue({ n: 1 });
        render(<Probe fetcher={fetcher} />);
        await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('{"n":1}'));
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('polls again on the interval, so another user\'s change appears', async () => {
        const fetcher = vi.fn().mockResolvedValue({ n: 1 });
        render(<Probe fetcher={fetcher} options={{ intervalMs: 1000 }} />);
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    });

    it('does not fetch at all when disabled', async () => {
        const fetcher = vi.fn().mockResolvedValue({ n: 1 });
        render(<Probe fetcher={fetcher} options={{ enabled: false }} />);
        await act(async () => {
            vi.advanceTimersByTime(10000);
        });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('polls only once when disabled mid-life', async () => {
        const fetcher = vi.fn().mockResolvedValue({ n: 1 });
        const { rerender } = render(<Probe fetcher={fetcher} options={{ intervalMs: 1000 }} />);
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

        rerender(<Probe fetcher={fetcher} options={{ intervalMs: 1000, enabled: false }} />);
        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        // One further poll may already be in flight from the enable->disable
        // transition, but the interval itself must be gone.
        expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('skips a tick rather than overlapping requests', async () => {
        // A slow request that outlives the interval is the case a bare
        // setInterval handles worst: it starts a second request while the first
        // is still running, and both responses race.
        let resolveFirst;
        const fetcher = vi
            .fn()
            .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
            .mockResolvedValue({ n: 2 });

        render(<Probe fetcher={fetcher} options={{ intervalMs: 1000 }} />);
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

        // Two ticks pass while the first request is still outstanding.
        await act(async () => {
            vi.advanceTimersByTime(2500);
        });
        expect(fetcher).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveFirst({ n: 1 });
        });
        await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('{"n":1}'));
    });

    it('keeps the last good data when a poll fails', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce({ n: 'good' })
            .mockRejectedValue(new Error('network down'));

        render(<Probe fetcher={fetcher} options={{ intervalMs: 1000 }} />);
        await waitFor(() =>
            expect(screen.getByTestId('value')).toHaveTextContent('{"n":"good"}')
        );

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        // Blanking working figures because one request timed out is worse than
        // briefly stale numbers.
        expect(screen.getByTestId('value')).toHaveTextContent('{"n":"good"}');
    });

    it('recovers once a later poll succeeds', async () => {
        const fetcher = vi
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValue({ n: 'recovered' });

        render(<Probe fetcher={fetcher} options={{ intervalMs: 1000 }} />);
        // Let the first (failing) request settle before advancing, otherwise
        // the tick is counted from mount rather than from after the request.
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
        await act(async () => {
            await Promise.resolve();
        });

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        await waitFor(() =>
            expect(screen.getByTestId('value')).toHaveTextContent('{"n":"recovered"}')
        );
    });

    it('refetches when the fetcher identity changes, because its inputs did', async () => {
        const first = vi.fn().mockResolvedValue({ range: '30d' });
        const second = vi.fn().mockResolvedValue({ range: '90d' });

        const { rerender } = render(<Probe fetcher={first} options={{ intervalMs: 0 }} />);
        await waitFor(() => expect(first).toHaveBeenCalledTimes(1));

        rerender(<Probe fetcher={second} options={{ intervalMs: 0 }} />);
        await waitFor(() =>
            expect(screen.getByTestId('value')).toHaveTextContent('{"range":"90d"}')
        );
    });

    it('refresh() refetches on demand', async () => {
        const fetcher = vi.fn().mockResolvedValue({ n: 1 });
        render(<Probe fetcher={fetcher} options={{ intervalMs: 0 }} />);
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

        screen.getByText('refresh').click();
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    });

    it('records when the figures were last confirmed', async () => {
        const fetcher = vi.fn().mockResolvedValue({ n: 1 });
        render(<Probe fetcher={fetcher} options={{ intervalMs: 0 }} />);
        // A reader has to be able to tell current figures from figures held
        // since the last poll.
        await waitFor(() => expect(screen.getByTestId('has-updated')).toHaveTextContent('true'));
    });
});

describe('unwrapList', () => {
    it('reads a DRF paginated envelope', () => {
        expect(unwrapList({ count: 1, results: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    });

    it('reads a bare array', () => {
        expect(unwrapList([{ id: 1 }])).toEqual([{ id: 1 }]);
    });

    it('returns an empty list rather than throwing on an unexpected shape', () => {
        // Copy-pasting the "results or array" ternary into each call site is how
        // one endpoint ends up rendering an empty table.
        expect(unwrapList(null)).toEqual([]);
        expect(unwrapList(undefined)).toEqual([]);
        expect(unwrapList({})).toEqual([]);
        expect(unwrapList({ results: null })).toEqual([]);
    });
});
