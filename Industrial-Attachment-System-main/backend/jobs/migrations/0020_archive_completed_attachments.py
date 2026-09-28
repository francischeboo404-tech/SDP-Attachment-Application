from django.db import migrations
from django.db.models import F
from django.db.models.functions import Coalesce


def archive_already_completed_attachments(apps, schema_editor):
    """
    Stamp attachees who finished their attachment before this feature existed.

    Without this, an attachment completed last year would be visible in the
    System Archives (completion is derived, not flag-based) but would still
    carry ``is_archived=False``, so the rest of the system would disagree with
    the archive about its status.

    ``archived_at`` is backdated to the HR clearance decision rather than the
    migration run time, so these records are ordered and date-filtered by when
    the attachment actually ended.
    """
    Application = apps.get_model("jobs", "Application")
    Clearance = apps.get_model("jobs", "Clearance")

    completed = list(
        Application.objects.filter(
            status="HIRED",
            deployment__status="EXITED",
            clearance__status="CLEARED",
        ).annotate(
            _completion_date=Coalesce(
                F("clearance__hr_cleared_at"),
                F("archived_at"),
                F("applied_at"),
            )
        )
    )
    if not completed:
        return

    # One query for every clearance signer rather than one per application.
    actor_by_application = {
        row["application"]: row["hr_cleared_by_id"]
        for row in Clearance.objects.filter(
            application__in=[app.pk for app in completed]
        ).values("application", "hr_cleared_by_id")
    }

    to_update = []
    for application in completed:
        application.is_archived = True
        application.archived_at = application._completion_date
        application.archived_by_id = actor_by_application.get(application.pk)
        to_update.append(application)

    Application.objects.bulk_update(
        to_update, ["is_archived", "archived_at", "archived_by"]
    )
    print(f"[0020] Backfilled archive flags for {len(to_update)} completed attachee(s).")


def unarchive_completed_attachments(apps, schema_editor):
    """
    Reversible: clears the flags this migration set, but only for applications
    that are still recognised as completed attachments, so an unrelated manual
    archive is never undone.
    """
    Application = apps.get_model("jobs", "Application")

    Application.objects.filter(
        status="HIRED",
        deployment__status="EXITED",
        clearance__status="CLEARED",
        is_archived=True,
    ).update(is_archived=False, archived_at=None, archived_by=None)


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0019_alter_eligibilitysetting_general_statement"),
    ]

    operations = [
        migrations.RunPython(
            archive_already_completed_attachments,
            reverse_code=unarchive_completed_attachments,
        ),
    ]
