"""
Rules for dates that mark the beginning of a future event.

An attachment, a requisition and a deployment all describe something that has
not happened yet, so none of them may begin on a date that has already passed.
A backdated start is a data-quality problem rather than a scheduling
convenience: it silently inflates attachment duration, misreports months
served, and puts a deployment start before the requisition that funded it.

This module is the SINGLE SOURCE OF TRUTH for that rule. The three call sites
(profile ``joining_date``, requisition ``duration_start``, deployment
``start_date``) each get their own message wording, but they are all refusing
the same underlying thing and must not disagree about what counts as "past".

The rule deliberately lives in ``accounts`` for the same structural reason
``document_limits`` does: ``jobs`` imports from ``accounts``, so a shared helper
cannot live in ``jobs`` without creating a circular import.
"""

from datetime import timedelta

from django.utils import timezone

# Tolerance for clock skew and for a server whose local calendar day differs
# from the user's. One day means a user in a timezone ahead of the server is
# not told their legitimate "today" is in the past.
SKEW_TOLERANCE_DAYS = 1


def earliest_allowed_date():
    """
    The first date a start may be set to, as an aware ``date`` in the current
    timezone. A start one day ahead of today is always allowed so that
    timezones and clock skew cannot reject a genuine today.
    """
    return (timezone.localdate() - timedelta(days=SKEW_TOLERANCE_DAYS))


def is_backdated(value):
    """
    True when ``value`` is a real date earlier than :func:`earliest_allowed_date`.

    ``None``, empty strings and unparseable values return False: this answers
    only "is this a past date", never "is this missing or malformed", and
    leaving those to field validation keeps error messages accurate.
    """
    if not value:
        return False
    try:
        return value < earliest_allowed_date()
    except TypeError:
        # A datetime compared against a date, or a string that slipped past
        # field validation. Neither is a backdating problem.
        return False


def backdated_error(field_label):
    """
    The message shown when a start date is refused for being in the past.
    ``field_label`` names the field as the user sees it, so the message reads
    the same way in the modal, the inline field error and the API response.
    """
    return (
        f"{field_label} cannot be earlier than "
        f"{earliest_allowed_date().strftime('%d %B %Y')}. "
        "Please choose today or a future date."
    )


def changed_to_backdated(stored_value, incoming_value):
    """
    True when ``incoming_value`` replaces ``stored_value`` with a past date.

    Unchanged values are never treated as new backdating. That distinction
    matters for records created before this rule existed: the holder of an
    old requisition, deployment or profile must still be able to edit an
    unrelated field, and must not be locked out by a date this validation did
    not cause. Moving the date to a new past value is still refused.
    """
    if incoming_value == stored_value:
        return False
    return is_backdated(incoming_value)
