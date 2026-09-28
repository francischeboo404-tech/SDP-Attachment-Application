import React, { useEffect, useRef, useState } from 'react';
import RichText from './RichText';

/**
 * VacancyMarquee
 *
 * A right-to-left, continuously looping strip of advertised vacancies.
 *
 * How the seamless loop works
 * --------------------------
 * The track holds the vacancy list twice, side by side, and is translated by
 * exactly -50% over the animation's duration. Since the second copy starts
 * precisely where the first ends, the position at the end of one cycle is
 * pixel-identical to the start of the next, so the restart is invisible and the
 * strip appears to loop forever. The alternative -- translating by the track's
 * measured pixel width -- would need a resize observer and a recomputed
 * duration on every layout change, and would drift on each cycle because the
 * width depends on the number of vacancies and the viewport size.
 *
 * The consequence of holding two copies is that every card exists twice in the
 * DOM. The duplicate is `aria-hidden` and `inert`: without that, a screen reader
 * would announce each vacancy twice and a keyboard user would tab through a
 * second, invisible set of "Apply" buttons.
 *
 * When it does not animate
 * ------------------------
 * When one set of cards fits the available width there is nothing to scroll, and
 * animating anyway would slide the last card off the left edge and expose blank
 * space on the right. That case renders as an ordinary wrapping grid instead.
 * It is measured rather than counted, because the same number of cards can
 * overflow a phone and sit in the middle of a wide desktop.
 */

/** Cards per cycle second. Fixed so adding vacancies widens the loop rather
 *  than accelerating it, which is what a fixed duration would do. */
const PIXELS_PER_SECOND = 34;

/** Floor and ceiling so the duration stays legible at both extremes. */
const MIN_DURATION_SECONDS = 24;
const MAX_DURATION_SECONDS = 90;

/** Matches the card width declared in the JSX, used only to seed the duration
 *  before the real track width has been measured. */
const APPROX_CARD_WIDTH_PX = 380;

/** Gap between cards, matching the `gap-6` on the track. */
const CARD_GAP_PX = 24;

/** One cycle travels half the track: one full set of cards plus its gap. */
function durationFor(count) {
    const distancePx = count * (APPROX_CARD_WIDTH_PX + CARD_GAP_PX);
    return Math.min(
        MAX_DURATION_SECONDS,
        Math.max(MIN_DURATION_SECONDS, distancePx / PIXELS_PER_SECOND),
    );
}

function VacancyCard({ job, onApply }) {
    return (
        <article
            className="bg-white rounded-2xl p-7 border border-slate-200 shadow-sm hover:shadow-xl hover:border-primary-600 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden w-[320px] sm:w-[380px] shrink-0"
        >
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/70 rounded-bl-full -z-10 group-hover:bg-amber-100/80 transition-colors" />

            <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--color-primary-on)] bg-primary-600 px-2.5 py-1 rounded-md border border-primary-200 truncate">
                        {job.department_name}
                    </span>
                    <span className="text-xs font-black uppercase text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200 shrink-0">
                        {job.slots_required} Slot{job.slots_required > 1 ? 's' : ''}
                    </span>
                </div>

                <h3 className="text-xl font-black text-slate-900 group-hover:text-primary-700 transition-colors leading-tight mb-2">
                    {job.title}
                </h3>

                {/* rich-prose--compact: the shared prose rules set body copy to
                    1.125rem, which is a step too large for a card whose other
                    text is text-xs. */}
                <RichText
                    html={job.description}
                    className="rich-prose--compact text-xs text-slate-700 font-medium line-clamp-3 mb-4"
                />

                {job.requirements && (
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-4">
                        <div className="text-2xs font-black uppercase tracking-wider text-slate-800 mb-1.5 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Key Requirements &amp; Academic Focus
                        </div>
                        <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                            {job.requirements}
                        </p>
                    </div>
                )}

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-800 font-bold space-y-1.5 mb-6">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate">{job.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-red-700">Deadline: {new Date(job.deadline).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>

            <button
                type="button"
                onClick={() => onApply(job.id)}
                className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2 group-hover:shadow-lg text-sm"
            >
                <span>Apply for Attachment</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
            </button>
        </article>
    );
}

/**
 * Whether the list is actually long enough to scroll.
 *
 * A count threshold cannot answer this. Three cards overflow a phone but leave
 * a wide desktop mostly empty, and animating a track that is narrower than its
 * container slides the last cards off the left edge and exposes blank space on
 * the right -- visibly broken rather than merely subtle. So the real question is
 * measured: does one set of cards exceed the available width?
 *
 * The width is computed from the first card's own width plus the gaps, rather
 * than read from the track, because the track only exists in the animating
 * layout. Measuring the single-row width this way also distinguishes "wraps onto
 * a second row" from "overflows horizontally", which a grid's scrollWidth cannot
 * tell apart.
 */
function useOverflowsViewport(cardCount) {
    const containerRef = useRef(null);
    const setRef = useRef(null);
    const [overflows, setOverflows] = useState(false);

    useEffect(() => {
        const container = containerRef.current;
        const set = setRef.current;
        if (!container || !set) return undefined;

        const measure = () => {
            const card = set.firstElementChild;
            if (!card || cardCount === 0) {
                setOverflows(false);
                return;
            }
            const gap = parseFloat(window.getComputedStyle(set).columnGap) || 0;
            const setWidth = cardCount * card.offsetWidth + (cardCount - 1) * gap;
            setOverflows(setWidth > container.clientWidth + 1);
        };

        measure();

        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        const card = set.firstElementChild;
        if (card) observer.observe(card);
        return () => observer.disconnect();
        // `overflows` is a dependency because switching layouts replaces the
        // measured element; React bails out of an identical setState, so this
        // converges after one extra measurement rather than looping.
    }, [cardCount, overflows]);

    return [containerRef, setRef, overflows];
}

export default function VacancyMarquee({ jobs, onApply }) {
    const list = Array.isArray(jobs) ? jobs : [];
    const [containerRef, setRef, overflows] = useOverflowsViewport(list.length);

    if (list.length === 0) return null;

    const cards = (isClone) =>
        list.map((job) => (
            <VacancyCard key={`${isClone ? 'clone' : 'real'}-${job.id}`} job={job} onApply={onApply} />
        ));

    return (
        <div
            ref={containerRef}
            data-testid="vacancy-marquee"
            className={overflows ? 'vacancy-marquee' : undefined}
        >
            {overflows ? (
                <div
                    className="vacancy-marquee__track"
                    style={{ '--marquee-duration': `${durationFor(list.length)}s` }}
                >
                    <div ref={setRef} className="flex gap-6 shrink-0">
                        {cards(false)}
                    </div>
                    {/* The duplicate that makes the loop seamless. aria-hidden keeps
                        it out of the accessibility tree; inert additionally removes
                        its buttons from the tab order, which aria-hidden alone does
                        not do. */}
                    <div className="vacancy-marquee__clone flex gap-6 shrink-0" aria-hidden="true" inert>
                        {cards(true)}
                    </div>
                </div>
            ) : (
                <div ref={setRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {cards(false)}
                </div>
            )}
        </div>
    );
}
