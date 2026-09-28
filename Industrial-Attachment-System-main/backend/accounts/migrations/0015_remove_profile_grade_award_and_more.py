from django.db import migrations


def archive_non_empty_grade_award(apps, schema_editor):
    """
    Preserve any real grade-award data before the columns are dropped.

    The field was removed because it is not part of the attachment programme's
    biodata and, importantly, it never contributed to the ATS score. Dropping a
    column discards whatever it held, so this step first copies every non-empty
    value into the audit trail as a data-safety record. If this migration runs
    against a database where applicants had actually filled the field in, the
    values are still recoverable from AuditLog instead of vanishing.

    On a database with no such data -- the normal case here -- this is a no-op
    that simply records that the check ran and found nothing to preserve.
    """
    Profile = apps.get_model("accounts", "Profile")
    Education = apps.get_model("accounts", "Education")
    AuditLog = apps.get_model("accounts", "AuditLog")

    for model, label in ((Profile, "Profile"), (Education, "Education")):
        rows = model.objects.exclude(grade_award="").exclude(grade_award=None)
        preserved = 0
        for row in rows.iterator():
            AuditLog.objects.create(
                actor_id=getattr(row, "user_id", None),
                action="GRADE_AWARD_DATA_PRESERVED",
                target_description=f"{label} {row.pk} grade_award",
                metadata={
                    "source_model": label,
                    "source_pk": row.pk,
                    "user_id": getattr(row, "user_id", None),
                    "grade_award": row.grade_award,
                },
            )
            preserved += 1
        if preserved:
            print(
                f"[data-safety] Preserved {preserved} non-empty grade_award "
                f"value(s) from {label} into the audit log."
            )


def noop_reverse(apps, schema_editor):
    """
    Reversing restores the columns, but the archived values are NOT written
    back: the audit-log records remain the record of truth, because rewriting
    historical applicant data during a rollback is riskier than leaving the
    columns empty and the values traceable.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0014_profile_next_of_kin_address_and_more"),
    ]

    operations = [
        migrations.RunPython(archive_non_empty_grade_award, noop_reverse),
        migrations.RemoveField(
            model_name="profile",
            name="grade_award",
        ),
        migrations.RemoveField(
            model_name="education",
            name="grade_award",
        ),
    ]
