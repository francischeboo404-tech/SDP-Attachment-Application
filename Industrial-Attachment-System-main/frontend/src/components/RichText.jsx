import React from 'react';

/**
 * RichText
 *
 * Renders Admin- or Director-authored rich text (a vacancy description, a
 * requisition justification) as HTML in a consistent, readable way.
 *
 * Why a component rather than `dangerouslySetInnerHTML` at each call site:
 * every place that displayed this content previously invented its own
 * wrapper and class, so the same authored document looked different depending
 * on where it was shown -- some places stripped the markup entirely, some
 * showed raw tags. Routing all of them through one component is what makes the
 * formatting actually consistent across the system.
 *
 * SECURITY: the markup is inserted as HTML, so it is only safe because the
 * server allowlist-sanitizes it on write and again on read
 * (`jobs/sanitizers.py`, via `SanitizedRichTextField` in `jobs/serializers.py`,
 * which covers both vacancy descriptions and department mandates). This
 * component performs no sanitizing of its own, and must never be pointed at
 * untrusted, non-sanitized input. Plain text belongs in a normal element, not
 * here.
 *
 * A `rich_text_to_plain_text` equivalent lives in `utils/richText.js` and
 * server-side; anything that feeds logic (ATS keyword matching, CSV, print)
 * must use the server version, not that helper.
 */
export default function RichText({
    html,
    className = '',
    placeholder = 'No content provided.',
    'data-testid': testId,
}) {
    const markup = typeof html === 'string' ? html.trim() : '';

    // Empty, or plain text with no markup at all: render it as text. This keeps
    // legacy vacancies -- authored before the editor existed -- reading exactly
    // as their author typed them, with no stray paragraph spacing, and it means
    // unwrapped text is never interpreted as markup.
    if (!markup || !/<[a-z][\s\S]*>/i.test(markup)) {
        if (!markup) {
            return (
                <p className={`text-slate-400 italic text-sm font-medium ${className}`}>{placeholder}</p>
            );
        }
        return <p className={`whitespace-pre-line ${className}`}>{markup}</p>;
    }

    return (
        <div
            className={`rich-prose ${className}`}
            data-testid={testId}
            dangerouslySetInnerHTML={{ __html: markup }}
        />
    );
}
