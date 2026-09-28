import React from 'react';
import RichText from './RichText';
import { richTextToPlainText } from '../utils/richText';
import { useIsClamped } from '../hooks/useIsClamped';

/**
 * Tailwind's line-clamp utilities, which set `display:-webkit-box`,
 * `-webkit-line-clamp` and `-webkit-box-orient` together.
 *
 * Hand-written inline styles for this are the obvious alternative, but they are
 * a single point of silent failure: if the clamp does not apply, the text is not
 * truncated, `scrollHeight` equals `clientHeight`, and the Read more button
 * never appears -- with no error anywhere. The utility class is the same one the
 * rest of the app already uses for this, so it is the variant actually known to
 * work with this build.
 *
 * Lookup rather than interpolation because Tailwind extracts class names by
 * scanning source text; `line-clamp-${lines}` would not be seen and the rule
 * would be missing from the stylesheet entirely.
 */
const CLAMP_CLASSES = {
    1: 'line-clamp-1',
    2: 'line-clamp-2',
    3: 'line-clamp-3',
    4: 'line-clamp-4',
    5: 'line-clamp-5',
    6: 'line-clamp-6',
};

/**
 * ExpandableRichText
 *
 * Renders authored rich text with a "Read more" / "Read less" control that
 * appears only when the text is genuinely being clipped.
 *
 * The control is shown on measurement, not on a character count. That matters
 * for rich text especially: a short description written as
 * "<p><strong>Short</strong> role</p>" is 37 characters of markup but four
 * words a reader can see, and a fixed threshold would offer to expand something
 * that already fits. Conversely a genuine five-paragraph mandate is long in
 * visible words and must be expandable.
 *
 * `expanded` and `onToggle` are supplied by the caller rather than owned here,
 * so a list of items (a department grid) can keep one independent open/closed
 * state per item. Expanding department A must not collapse department B, and
 * each must remember whether the reader opened it.
 *
 * Props:
 *   html      the sanitized rich text to render
 *   expanded  whether this item is currently showing its full text
 *   onToggle  called with no arguments when the control is activated
 *   lines     collapsed line count (default 4)
 *   className classes for the text region
 *   buttonClassName classes for the toggle button
 *   id        used to derive stable ids for aria-controls / aria-expanded
 *   placeholder shown when there is no content
 *   compact   render at card scale instead of full-description scale
 */
export default function ExpandableRichText({
    html,
    expanded = false,
    onToggle,
    lines = 4,
    className = '',
    buttonClassName = 'text-primary-700 hover:text-primary-800',
    id,
    compact = false,
    placeholder = 'No description has been provided for this department yet.',
}) {
    const [ref, clamped] = useIsClamped([html, lines], { disabled: expanded });

    // An out-of-range value falls back to the default rather than rendering
    // unclamped, which would hide the truncation while the button claimed it.
    const clampClass = CLAMP_CLASSES[lines] || CLAMP_CLASSES[4];

    const hasContent = richTextToPlainText(html).length > 0;
    // The control must be shown whenever the item is open, not only when it is
    // measured as clipped. While expanded there is nothing left to measure --
    // the text is no longer truncated -- so gating on `clamped` alone would
    // remove the very button the reader needs in order to collapse it again,
    // leaving the content permanently expanded with no way back.
    const canExpand = hasContent && (expanded || clamped);

    const bodyId = id ? `expandable-body-${id}` : undefined;
    const buttonId = id ? `expandable-toggle-${id}` : undefined;

    return (
        <div>
            <div
                ref={ref}
                className={expanded ? className : `${className} overflow-hidden ${clampClass}`}
                id={bodyId}
            >
                {/* `[&>*:first-child]:mt-0 [&>*:last-child]:mb-0` collapses the
                    outer paragraph spacing so a one-paragraph description does
                    not carry a stray top/bottom margin inside the clamp. */}
                <RichText
                    html={html}
                    className={[
                        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                        compact ? 'rich-prose--compact' : '',
                    ].filter(Boolean).join(' ')}
                    placeholder={placeholder}
                />
            </div>

            {canExpand && (
                <button
                    type="button"
                    id={buttonId}
                    onClick={onToggle}
                    aria-expanded={expanded}
                    aria-controls={bodyId}
                    className={`mt-2 text-xs font-black inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 rounded ${buttonClassName}`}
                >
                    {expanded ? 'Read less' : 'Read more'}
                    <svg
                        className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            )}
        </div>
    );
}
