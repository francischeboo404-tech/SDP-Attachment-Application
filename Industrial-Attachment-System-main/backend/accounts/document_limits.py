"""
Applicant document upload size limits.

This module is the SINGLE SOURCE OF TRUTH for how large each verification
document may be. The frontend renders "National ID (Max 2MB)" style labels
directly from the values served by ``/api/accounts/document-limits/``, so a
label can never drift from the limit the server actually enforces.

Before this module existed the server applied a flat 10 MB cap to every
document type while the browser enforced 5 MB for seven of the nine types.
An applicant was therefore told "Max 5MB", blocked at 5 MB in the browser,
and would still have been accepted at 9 MB had the request gone through
directly. The limits below restore agreement by defining the real limits in
one place and enforcing them server-side.

Every document now shares one 2 MB ceiling. The previous mix of 2/5/10 MB
served no purpose: the 10 MB types were long prose documents that are
comfortably under 2 MB once compressed, and a uniform cap means an applicant
never has to work out which of several numbers applies to the file in front of
them. The per-type map is kept -- rather than collapsed to a single constant --
because the type keying is what the API, the enforcement layer and the tests
are all written against, so the structure survives the simplification.
"""

# Limits are expressed in bytes. The frontend divides by 1024**2 to build the
# "Max NMB" label, so these must stay byte values.
_DOCUMENT_MAX_MB = 2
_MAX_BYTES = _DOCUMENT_MAX_MB * 1024 * 1024

DOCUMENT_MAX_BYTES = {
    "NATIONAL_ID": _MAX_BYTES,
    "RESUME": _MAX_BYTES,
    "COVER_LETTER": _MAX_BYTES,
    "INSTITUTION_INTRO": _MAX_BYTES,
    "STUDENT_INSURANCE": _MAX_BYTES,
    "STUDENT_ID": _MAX_BYTES,
    "TRANSCRIPT": _MAX_BYTES,
    "GOOD_CONDUCT": _MAX_BYTES,
    "PASSPORT_PHOTOS": _MAX_BYTES,
    "NEXT_OF_KIN_ID": _MAX_BYTES,
}

# Applied to any document type not listed above. Equal to the uniform per-type
# limit, so an unlisted type can never be used to slip in a larger file.
DEFAULT_MAX_BYTES = _MAX_BYTES

# Hard ceiling for any upload regardless of type. This is the value Django's
# DATA_UPLOAD_MAX_MEMORY_SIZE / FILE_UPLOAD_MAX_MEMORY_SIZE must be set to, so
# the framework-level guard never rejects a file the per-type limit allows.
# Kept above the per-type cap so the per-type check is what actually decides;
# this is only a backstop against a pathological multi-megabyte request.
ABSOLUTE_MAX_BYTES = 10 * 1024 * 1024


def max_bytes_for(document_type):
    """The enforced byte limit for ``document_type``."""
    return DOCUMENT_MAX_BYTES.get(document_type, DEFAULT_MAX_BYTES)


def human_size(num_bytes):
    """Render a byte count the way the UI labels it, e.g. ``5MB``/``10MB``."""
    if num_bytes % (1024 * 1024) == 0:
        return f"{num_bytes // (1024 * 1024)}MB"
    return f"{num_bytes / (1024 * 1024):.1f}MB"


def label_for(document_type):
    """The user-facing size label, e.g. ``Max 5MB``."""
    return f"Max {human_size(max_bytes_for(document_type))}"


def as_payload():
    """
    The API representation consumed by the frontend.

    Both representations are sent deliberately: ``max_bytes`` is what the
    browser validates against, and ``label`` is what it renders. Deriving one
    from the other in two places is how they drift apart in the first place.
    """
    return {
        document_type: {
            "max_bytes": max_bytes_for(document_type),
            "label": label_for(document_type),
        }
        for document_type in DOCUMENT_MAX_BYTES
    }
