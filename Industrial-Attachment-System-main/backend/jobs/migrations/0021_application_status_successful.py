"""
Collapse the SHORTLISTED and HIRED statuses into a single SUCCESSFUL outcome.

Selection is now binary: an application is either SUCCESSFUL (the opportunity
is granted) or REJECTED. SHORTLISTED and HIRED were both ways of recording that
same success at different points in the workflow, so every consumer of the
status had to test for both.

Mapping applied here
--------------------
* HIRED      -> SUCCESSFUL  (an exact rename of the terminal success state)
* SHORTLISTED -> SUCCESSFUL (chosen deliberately: shortlisting was the step
  immediately before hiring, so those applicants were already selected)

Data safety
-----------
Every remapped row is written to the audit log with its previous status before
the update, so the original value is recoverable and the reason for the change
is traceable.

Deliberately uses ``QuerySet.update()`` rather than iterating and calling
``save()``. ``save()`` fires the ``post_save`` receiver that dispatches the
applicant outcome email, which would have sent a "you have successfully been
granted the opportunity" message to every remapped applicant as a side effect of
a schema migration. A migration must not send email. Remapped applications are
listed in the migration output so HR can review them and notify deliberately via
the normal status endpoint if that is wanted.
"""
from django.db import migrations, models

#: old status -> new status
STATUS_MAP = {
    "HIRED": "SUCCESSFUL",
    "SHORTLISTED": "SUCCESSFUL",
}


def remap_statuses(apps, schema_editor):
    Application = apps.get_model("jobs", "Application")
    AuditLog = apps.get_model("accounts", "AuditLog")

    for old_status, new_status in STATUS_MAP.items():
        affected = Application.objects.filter(status=old_status)
        total = affected.count()
        if not total:
            print(f"[data-safety] No applications with status {old_status}.")
            continue

        affected_users = []
        for app in affected.select_related("user", "job").iterator():
            AuditLog.objects.create(
                actor=None,
                action="APPLICATION_STATUS_REMAPPED",
                target_description=(
                    f"Application #{app.pk} status {old_status} -> {new_status}"
                ),
                metadata={
                    "application_id": app.pk,
                    "user_id": app.user_id,
                    "username": app.user.username,
                    "job_id": app.job_id,
                    "previous_status": old_status,
                    "new_status": new_status,
                    "reason": (
                        "Applicant selection is now binary. SHORTLISTED and "
                        "HIRED were both success states and are represented by "
                        "SUCCESSFUL."
                    ),
                },
            )
            affected_users.append(f"{app.user.username} (application #{app.pk})")

        # update() does not fire post_save, so no outcome email is dispatched.
        affected.update(status=new_status)

        print(
            f"[data-safety] Remapped {total} application(s) from {old_status} to "
            f"{new_status}. Archived to the audit log. No email was sent."
        )
        for entry in affected_users:
            print(f"    review and notify manually if required: {entry}")


def noop_reverse(apps, schema_editor):
    """
    Reversing restores the original choices but cannot reconstruct which rows
    were HIRED versus SHORTLISTED before the migration, because SUCCESSFUL is a
    single merged value.

    The distinction is preserved in the audit log, so it is recoverable, but this
    is intentionally not automated: guessing that every restored row was HIRED
    would fabricate a history that the data no longer supports.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0020_archive_completed_attachments"),
        ("accounts", "0016_document_transcript_good_conduct_replace_kra_pin"),
    ]

    operations = [
        migrations.RunPython(remap_statuses, noop_reverse),
        migrations.AlterField(
            model_name="application",
            name="status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("REVIEWED", "Reviewed"),
                    ("SUCCESSFUL", "Successful"),
                    ("REJECTED", "Rejected"),
                ],
                db_index=True,
                default="PENDING",
                max_length=20,
            ),
        ),
    ]
