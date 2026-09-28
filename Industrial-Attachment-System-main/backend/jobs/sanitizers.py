"""
Server-side HTML sanitization for Admin-authored rich content.

This content is served to every public visitor (the landing page renders it as
HTML), so it is treated as untrusted input even though only Admins can author
it — defense in depth against stored XSS.

Sanitization is allowlist-based via ``bleach``: anything not explicitly listed
in ``ALLOWED_TAGS`` / ``ALLOWED_ATTRIBUTES`` / ``ALLOWED_PROTOCOLS`` is stripped,
including ``<script>``, ``<style>``, ``<iframe>``, ``<object>``, event handler
attributes (``onerror``, ``onclick``, ...) and ``javascript:`` URLs.
"""
import re

import bleach

# The exact formatting vocabulary the Admin rich-text editor can produce.
# Deliberately narrow: adding a tag here is a deliberate security decision.
ALLOWED_TAGS = [
    "p", "br",
    "strong", "b", "em", "i", "u",
    "h2", "h3", "h4",
    "ul", "ol", "li",
    "a",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

# Elements whose *contents* must be discarded outright rather than unwrapped.
# bleach drops the tags of disallowed elements but keeps their text content, so
# without this pre-pass the body of a <script> block would survive as literal,
# visible text on the public landing page.
DROP_WITH_CONTENT_RE = re.compile(
    r"<\s*(script|style|template|noscript|iframe|object|embed|applet|svg|math)\b.*?<\s*/\s*\1\s*>",
    re.IGNORECASE | re.DOTALL,
)
# Same elements left unclosed at the end of the fragment.
DROP_UNCLOSED_RE = re.compile(
    r"<\s*(script|style|template|noscript|iframe|object|embed|applet|svg|math)\b.*\Z",
    re.IGNORECASE | re.DOTALL,
)


def _drop_dangerous_blocks(value):
    previous = None
    while previous != value:
        previous = value
        value = DROP_WITH_CONTENT_RE.sub("", value)
    return DROP_UNCLOSED_RE.sub("", value)


def sanitize_rich_text(value):
    """
    Returns an allowlist-sanitized copy of ``value`` safe for public rendering.

    Tags outside the allowlist are dropped (their text content is preserved),
    attributes outside the allowlist are dropped, and disallowed protocols such
    as ``javascript:`` are stripped from surviving attributes. Script-like
    elements are removed together with their contents.
    """
    if value is None:
        return ""
    return bleach.clean(
        _drop_dangerous_blocks(str(value)),
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    ).strip()


def rich_text_to_plain_text(value):
    """
    Collapses a rich-text fragment down to the words a reader actually sees.

    Needed wherever markup-bearing text is fed to logic that assumes plain
    words. The ATS scorer builds its keyword set from the vacancy's description
    and requirements, so if a rich-text description were matched without
    stripping, every tag name and attribute in it ("strong", "href", "class",
    "http", ...) would join the job's keyword set. Those words can never appear
    in an applicant's own documents, so the keyword denominator would inflate
    and every applicant's score would be silently depressed.

    Block-level tags become spaces rather than nothing, so
    ``<li>a</li><li>b</li>`` yields "a b" and not "ab".
    """
    if not value:
        return ""
    text = str(value)
    # Terminators first so "<p>a</p><p>b</p>" cannot join into "ab".
    text = re.sub(r"<\s*br\s*/?\s*>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/\s*(p|div|li|ul|ol|h[1-6]|tr|blockquote)\s*>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = _drop_dangerous_blocks(text)
    text = re.sub(r"\s+", " ", text).strip()
    # Inline tags are replaced by spaces, which strands punctuation: the closing
    # </strong> in "<strong>basalt</strong>." becomes "basalt .". Close the gap
    # so plain-text output (CSV, print, search snippets) reads correctly.
    text = re.sub(r"\s+([.,;:!?%)\]}])", r"\1", text)
    text = re.sub(r"([(\[{])\s+", r"\1", text)
    return text.strip()


# The out-of-the-box institutional eligibility statement. It is deliberately a
# fully formatted rich-text document (headings, paragraphs, emphasis, bullet and
# numbered lists) so the formatting is immediately visible on the public landing
# page and so Admins have a working example to edit rather than a blank canvas.
#
# Lives here rather than in models.py so that both the model default and the data
# migration can reference one definition without a circular import.
DEFAULT_ELIGIBILITY_STATEMENT = (
    "<h3>Who is eligible to apply</h3>"
    "<p>Applicants must be <strong>currently enrolled</strong> as an undergraduate or diploma student "
    "at an <em>accredited tertiary institution</em>, seeking a mandatory industrial attachment as part "
    "of their programme requirements.</p>"
    "<h3>Core eligibility requirements</h3>"
    "<ul>"
    "<li>Enrolment in a recognised undergraduate or diploma programme at an accredited institution</li>"
    "<li>At least <strong>six months</strong> remaining before the expected graduation date</li>"
    "<li>All <strong>nine required verification documents</strong> uploaded and verified on your profile</li>"
    "<li>Availability for the full attachment duration advertised by the hosting department</li>"
    "<li>No prior industrial attachment already completed for the same qualification</li>"
    "</ul>"
    "<h3>How to apply</h3>"
    "<ol>"
    "<li>Complete your biodata and upload every required document.</li>"
    "<li>Browse the <strong>Available Attachment Positions</strong> section and select a vacancy.</li>"
    "<li>Submit your application and track its status from your dashboard.</li>"
    "<li>Attend any departmental screening or interview that is arranged.</li>"
    "</ol>"
    "<p>Only applicants who satisfy the criteria above are considered. For questions about "
    "eligibility, contact the Human Resource Directorate.</p>"
)

# The original plain-text statement this content replaced. Used by the data
# migration to recognise an untouched legacy row so that real Admin-authored
# content is never overwritten.
LEGACY_ELIGIBILITY_STATEMENT = (
    "Applicants must be currently enrolled undergraduate or diploma students at an accredited "
    "tertiary institution seeking mandatory industrial attachment."
)
LEGACY_ELIGIBILITY_STATEMENT_WITH_GRADUATION = (
    "Applicants must be currently enrolled undergraduate or diploma students at an accredited "
    "tertiary institution seeking mandatory industrial attachment before graduation."
)


