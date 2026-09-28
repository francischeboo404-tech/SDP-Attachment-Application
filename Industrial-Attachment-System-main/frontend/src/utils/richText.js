/**
 * Text utilities for Admin- and Director-authored rich text.
 *
 * Deliberately separate from the rendering component: these are pure string
 * functions, and mixing them into a module that also exports a component is
 * what makes a bundler unable to hot-reload that component independently.
 */

/**
 * NAMED_ENTITIES
 *
 * The named references that actually show up in sanitized institutional copy.
 * Kept as a lookup rather than a regex so a stray unknown entity is left
 * escaped instead of being silently dropped.
 */
const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…',
    rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
    bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
    deg: '°', times: '×', pound: '£', euro: '€',
};

/**
 * decodeHtmlEntities
 *
 * Reverses the entity escaping that the server sanitizer and the browser apply.
 * The sanitizer turns "R&D" into "R&amp;D", and that is what the stored and
 * rendered markup actually contains -- so anything that searches or measures
 * the *visible* text has to decode it first, or it will look for "&" in a
 * string that spells it "&amp;" and find nothing.
 *
 * This is a display concern only, not a security boundary: the rendered HTML
 * is already sanitized server-side, and nothing here is ever assigned to
 * innerHTML.
 */
export function decodeHtmlEntities(text) {
    if (typeof text !== 'string' || text.indexOf('&') === -1) return text;

    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body) => {
        if (body[0] === '#') {
            const isHex = body[1] === 'x' || body[1] === 'X';
            const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
            if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
            // Lone surrogates are not valid characters; leave them escaped
            // rather than putting an unpaired surrogate in the string.
            if (code >= 0xd800 && code <= 0xdfff) return match;
            try {
                return String.fromCodePoint(code);
            } catch {
                return match;
            }
        }
        const named = NAMED_ENTITIES[body.toLowerCase()];
        return named === undefined ? match : named;
    });
}

/**
 * richTextToPlainText
 *
 * Strips markup so callers can reason about the *visible* length of rich text
 * rather than its source length. Used for decisions like "is this long enough
 * to warrant a Read more control?" -- measuring the raw string would count
 * every tag and attribute, so a short three-word description written as
 * "<p><strong>Short</strong> role</p>" would measure 37 characters and wrongly
 * appear to be a long description.
 *
 * Entities are decoded so the result is what a reader actually sees.
 *
 * This mirrors the server-side `rich_text_to_plain_text` helper closely enough
 * for display decisions. Anything that affects scoring or stored output -- ATS
 * keyword matching, CSV, print -- must use the server version instead.
 */
export function richTextToPlainText(html) {
    if (typeof html !== 'string') return '';
    return decodeHtmlEntities(
        html
            .replace(/<\s*br\s*\/?\s*>/gi, ' ')
            .replace(/<\s*\/\s*(p|div|li|ul|ol|h[1-6])\s*>/gi, ' ')
            .replace(/<[^>]+>/g, ' '),
    )
        .replace(/\s+/g, ' ')
        .trim();
}
