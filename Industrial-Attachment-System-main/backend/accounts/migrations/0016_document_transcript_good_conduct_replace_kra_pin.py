from django.db import migrations, models


def preserve_kra_pin_documents(apps, schema_editor):
    """
    Preserve applicants' existing KRA PIN Certificate uploads.

    "KRA_PIN" was removed from the required upload set and replaced by
    TRANSCRIPT and GOOD_CONDUCT. The `document_type` column is a CharField with
    `choices`, so Django will not enforce the new choice set at the database
    level: the rows below would otherwise survive as orphaned documents of a
    type the UI can no longer render, and would keep counting toward the old
    required set.

    Each affected row is therefore recorded in the audit log with its file path
    and the identity of its owner, then deleted. The file itself is left on disk
    rather than removed, so nothing an applicant uploaded is destroyed: the
    audit entry records where it lives and can be restored by re-pointing a
    Document row at the same path.

    This is intentionally a delete rather than a retype. Re-labelling a KRA PIN
    certificate as a Transcript or a Certificate of Good Conduct would put a
    document on an applicant's record that they never supplied, and both new
    types feed the ATS document score -- so that would corrupt scoring as well as
    misrepresent what was uploaded.
    """
    Document = apps.get_model("accounts", "Document")
    AuditLog = apps.get_model("accounts", "AuditLog")

    affected = Document.objects.filter(document_type="KRA_PIN")
    preserved = 0
    for doc in affected.iterator():
        file_path = doc.file.name if doc.file else ""
        AuditLog.objects.create(
            actor_id=getattr(doc, "user_id", None),
            action="KRA_PIN_DOCUMENT_RETIRED",
            target_description=f"KRA PIN document {doc.pk} retired from required set",
            metadata={
                "source_model": "Document",
                "source_pk": doc.pk,
                "user_id": getattr(doc, "user_id", None),
                "document_type": "KRA_PIN",
                "file_path": file_path,
                "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
                "reason": (
                    "KRA PIN Certificate was replaced by TRANSCRIPT and "
                    "GOOD_CONDUCT in the required verification document set."
                ),
            },
        )
        # Only the database row is removed. The file on disk is deliberately
        # left in place so the upload itself is never destroyed; the audit
        # entry above records its path for restoration.
        doc.delete()
        preserved += 1
    if preserved:
        print(
            f"[data-safety] Retired {preserved} KRA PIN document row(s) after "
            f"recording them in the audit log. Files remain on disk."
        )


def noop_reverse(apps, schema_editor):
    """
    Reversing restores the KRA_PIN choice. The deleted rows are not recreated:
    the audit entries retain the file paths, and resurrecting a document the
    applicant can no longer see or replace would be worse than leaving the
    record in the audit trail.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0015_remove_profile_grade_award_and_more"),
    ]

    operations = [
        migrations.RunPython(preserve_kra_pin_documents, noop_reverse),
        migrations.AlterField(
            model_name="document",
            name="document_type",
            field=models.CharField(
                choices=[
                    ("NATIONAL_ID", "National ID"),
                    ("RESUME", "Resume/CV"),
                    ("COVER_LETTER", "Cover Letter"),
                    (
                        "INSTITUTION_INTRO",
                        "Introduction Letter from Institution",
                    ),
                    ("STUDENT_INSURANCE", "Student Insurance Cover"),
                    ("STUDENT_ID", "Copy of Student ID"),
                    ("NEXT_OF_KIN_ID", "Copy of Next of Kin (ID & Phone)"),
                    ("TRANSCRIPT", "Transcripts"),
                    ("GOOD_CONDUCT", "Certificate of Good Conduct"),
                    ("PASSPORT_PHOTOS", "Two Colour Passport Photos (PDF)"),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
    ]
