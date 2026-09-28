import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useIsClamped
 *
 * Reports whether an element's content is actually being visually clipped, by
 * measuring the rendered node rather than guessing from a character count.
 *
 * A character threshold is wrong in both directions. It flags a short message as
 * overflowing when it happens to contain a long department name, and misses a
 * longer message that fits comfortably because the container is wide. Measuring
 * `scrollHeight > clientHeight` is accurate, and the ResizeObserver re-runs it
 * when the element reflows -- a window resize, a sidebar collapsing, a different
 * card landing in a narrower column.
 *
 * Returns `[ref, clamped]`. Attach `ref` to the scrolling element and render
 * `clamped` to decide whether a "Read more" control is needed at all.
 *
 * The first measurement is deferred by one animation frame: reading layout
 * properties forces a synchronous reflow, and calling setState from that inside
 * the effect body cascades a render on every mount. One frame is imperceptible
 * and the value corrects itself immediately after.
 */
export function useIsClamped(deps, { disabled = false } = {}) {
    const ref = useRef(null);
    const [clamped, setClamped] = useState(false);

    const measure = useCallback(() => {
        const node = ref.current;
        if (!node || disabled) {
            setClamped(false);
            return;
        }
        // The +1 absorbs sub-pixel rounding, which otherwise reports a
        // single-line box as clipped on high-DPI screens.
        setClamped(node.scrollHeight > node.clientHeight + 1);
    }, [disabled]);

    useEffect(() => {
        const frame = requestAnimationFrame(measure);

        let observer;
        if (typeof ResizeObserver !== 'undefined' && ref.current) {
            observer = new ResizeObserver(measure);
            observer.observe(ref.current);
        }
        // Without ResizeObserver the clamp state is still correct for the
        // initial layout, which is the case that decides whether the control is
        // shown; it just will not re-measure on a later reflow.

        return () => {
            cancelAnimationFrame(frame);
            if (observer) observer.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [measure, ...deps]);

    return [ref, clamped];
}

export default useIsClamped;
