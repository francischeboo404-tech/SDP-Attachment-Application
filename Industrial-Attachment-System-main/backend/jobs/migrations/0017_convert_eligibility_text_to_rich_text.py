"""
Converts legacy plain-text eligibility content to rich-text HTML.

Before the landing page rendered the eligibility statement as rich HTML, the
content was stored as plain text. Any statement saved before this migration
would otherwise render as one unspaced wall of text, because browsers collapse
the newlines in plain text when it is inserted as HTML.

This wraps each existing plain-text statement in paragraph tags (honouring blank
line paragraph breaks) and passes it through the rich-text sanitizer, so every
row ends up as valid, safely-rendered rich content. Statements that already
contain rich-text markup are left untouched.
"""
import re

from django.db import migrations

BLOCK_TAG_RE = re.compile(r"<\s*(p|br|h2|h3|h4|ul|ol|li|strong|b|em|i|u|a)\b", re.IGNORECASE)


def plain_text_to_rich_html(value):
    """Wraps a legacy plain-text statement in paragraphs, then sanitizes it."""
    from jobs.sanitizers import sanitize_rich_text

    if not value:
        return value

    # Already rich text: leave it alone.
    if BLOCK_TAG_RE.search(value):
        return sanitize_rich_text(value)

    # Split on blank lines into paragraphs, preserving single newlines as breaks.
    paragraphs = [block.strip() for block in re.split(r"\n\s*\n", value.strip()) if block.strip()]
    html = "".join(
        "<p>{}</p>".format(block.replace("\n", "<br />"))
        for block in paragraphs
    )
    return sanitize_rich_text(html)


def forwards(apps, schema_editor):
    EligibilitySetting = apps.get_model("jobs", "EligibilitySetting")
    for setting in EligibilitySetting.objects.all().iterator():
        converted = plain_text_to_rich_html(setting.general_statement)
        if converted != setting.general_statement:
            setting.general_statement = converted
            setting.save(update_fields=["general_statement"])


def backwards(apps, schema_editor):
    """
    No-op. Rich text is a superset of the previous plain-text rendering, and
    destroying Admin-authored formatting on rollback would lose real content.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0016_alter_eligibilitysetting_general_statement_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
