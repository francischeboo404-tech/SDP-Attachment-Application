"""
Seeds the fully formatted default eligibility statement.

The rich-text feature shipped with a single-sentence default, so the formatting
machinery (headings, emphasis, bullet and numbered lists) had nothing to render
and looked broken. This replaces that placeholder with a properly structured
institutional statement.

It is deliberately conservative: a row is only overwritten when its text content
still matches one of the known legacy placeholder sentences. Any row that an
Admin has actually edited is left untouched, so this can never destroy real
content.
"""
import re

from django.db import migrations

from jobs.sanitizers import (
    DEFAULT_ELIGIBILITY_STATEMENT,
    LEGACY_ELIGIBILITY_STATEMENT,
    LEGACY_ELIGIBILITY_STATEMENT_WITH_GRADUATION,
)

LEGACY_VARIANTS = {
    LEGACY_ELIGIBILITY_STATEMENT,
    LEGACY_ELIGIBILITY_STATEMENT_WITH_GRADUATION,
}

TAG_RE = re.compile(r"<[^>]+>")


def is_untouched_placeholder(value):
    """True when ``value`` is one of the legacy placeholder statements."""
    if not value:
        return False
    # Compare on visible text so already-wrapped placeholders are recognised too.
    text = TAG_RE.sub("", value)
    text = re.sub(r"\s+", " ", text).strip()
    return text in LEGACY_VARIANTS


def forwards(apps, schema_editor):
    EligibilitySetting = apps.get_model("jobs", "EligibilitySetting")
    for setting in EligibilitySetting.objects.all().iterator():
        if is_untouched_placeholder(setting.general_statement):
            setting.general_statement = DEFAULT_ELIGIBILITY_STATEMENT
            setting.save(update_fields=["general_statement"])


def backwards(apps, schema_editor):
    """
    No-op. Reverting would strip formatting from content an Admin may have
    authored, which is worse than leaving a well-formatted document in place.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0017_convert_eligibility_text_to_rich_text"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
