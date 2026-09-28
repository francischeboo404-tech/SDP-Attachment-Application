"""
Completed Industrial Attachment records.

An attachee is considered to have *successfully completed* their Industrial
Attachment when all three of these are true:

1. the application was ``SUCCESSFUL`` — they were selected onto the attachment;
2. the deployment is ``EXITED`` — the attachment period itself has concluded;
3. the clearance is ``CLEARED`` — HR granted institutional clearance.

This module owns that definition in one place so the System Archives, the
attachee report and the auto-archiving signal can never drift apart.  It also
owns the row shape used for archived attachees, so the on-screen archive, the
archive CSV export and the archive print output all render the same columns.

A deployment is deliberately required.  A ``Clearance`` may hang directly off an
``Application`` for legacy rows that predate deployments, but without a
deployment there is no evidence the attachee was ever placed or that an
attachment period actually ran, so those rows are not treated as completions.
"""
import logging

from django.db.models import Exists, F, OuterRef, Q
from django.db.models.functions import Coalesce

from .models import Application, RecommendationLetter

logger = logging.getLogger(__name__)


#: The single source of truth for "this attachee finished their attachment".
#: Expressed as a Q object so callers can AND it into an existing queryset or
#: use it as a standalone filter.
COMPLETED_ATTACHMENT_CONDITION = Q(
    status="SUCCESSFUL",
    deployment__status="EXITED",
    clearance__status="CLEARED",
)


def is_completed_attachment(application):
    """
    Single-record completion test.

    Reads the already-loaded relations when they are present, and falls back to
    targeted queries otherwise, so this is safe to call on a bare instance.
    """
    if application.status != "SUCCESSFUL":
        return False

    # ``deployment`` and ``clearance`` are the OneToOne reverse accessors on
    # Application, so attribute access is correct whether or not the caller
    # select_related them: Django returns None for a missing nullable reverse
    # OneToOne, issuing a single lazy query when it is not already cached.
    deployment = getattr(application, "deployment", None)
    if deployment is None or deployment.status != "EXITED":
        return False

    clearance = getattr(application, "clearance", None)
    if clearance is None:
        return False

    return clearance.status == "CLEARED"


def completed_attachment_queryset():
    """
    Every successfully completed attachment, newest completion first.

    Deliberately NOT filtered on ``is_archived``.  Completion is the criterion
    that makes an attachee an archival record, so attachees who finished before
    this feature existed still appear — which is the entire point of a records
    archive.  ``archive_completed_attachment`` additionally stamps the
    ``is_archived`` flag so the rest of the system agrees.
    """
    return (
        Application.objects.filter(COMPLETED_ATTACHMENT_CONDITION)
        .select_related(
            "user",
            "user__profile",
            "job",
            "job__department",
            "deployment",
            "clearance",
            "clearance__hr_cleared_by",
            "clearance__department_cleared_by",
            "archived_by",
        )
        .annotate(
            # The moment the attachment became institutionally complete is the
            # HR clearance decision, not the application date, so that is what
            # the archive date range filters on. The later fallbacks cover
            # legacy rows with a missing clearance stamp.
            _completion_date=Coalesce(
                F("clearance__hr_cleared_at"),
                F("archived_at"),
                F("applied_at"),
            ),
            _has_recommendation_letter=Exists(
                RecommendationLetter.objects.filter(
                    deployment=OuterRef("deployment")
                )
            ),
        )
        .order_by("-_completion_date", "-applied_at")
    )


def attachment_completion_date(application):
    """The effective archive date for a completed attachee."""
    annotated = getattr(application, "_completion_date", None)
    if annotated is not None:
        return annotated
    clearance = getattr(application, "clearance", None)
    if clearance is not None and clearance.hr_cleared_at:
        return clearance.hr_cleared_at
    if application.archived_at:
        return application.archived_at
    return application.applied_at


def archive_completed_attachment(application, actor=None):
    """
    Stamp an attachee's completed application as archived. Idempotent.

    Returns ``True`` only when this call performed the transition, so callers
    (and the signal) can avoid duplicate audit entries on every subsequent save.

    ``archived_at`` is set to the completion date rather than "now", so an
    attachment finished last year is ordered and filtered by when it actually
    ended, not by when the flag happened to be written.
    """
    if not is_completed_attachment(application):
        return False

    if application.is_archived and application.archived_at:
        return False

    completion_date = attachment_completion_date(application)
    clearance = getattr(application, "clearance", None)
    if actor is None and clearance is not None:
        actor = clearance.hr_cleared_by

    application.is_archived = True
    application.archived_at = completion_date
    application.archived_by = actor
    application.save(
        update_fields=["is_archived", "archived_at", "archived_by"]
    )
    logger.info(
        f"Auto-archived completed attachment: application #{application.id} "
        f"({application.user_id}) completed on {completion_date}."
    )
    return True


def _iso(value):
    return value.isoformat() if value else None


def _fmt_date(value):
    return value.isoformat() if value else None


def _fmt_datetime(value):
    return value.strftime("%Y-%m-%d %H:%M") if value else None


def serialize_attachment_archive_row(app):
    """
    One completed attachee, shaped for the System Archives explorer.

    The base keys (``id``, ``entity_type``, ``title``, ``department_id``,
    ``department_name``, ``slots``, ``archived_at``, ``archived_by``,
    ``details``) match every other archive entity so the archives table, its
    CSV export and its print output can render all record types with one
    column set.  The remaining keys are the attachee-specific record fields the
    detail view and the exports surface.
    """
    user = app.user
    profile = getattr(user, "profile", None)
    job = app.job
    department = job.department if job else None
    clearance = getattr(app, "clearance", None)
    deployment = getattr(app, "deployment", None)

    attachee_name = user.get_full_name() or user.username
    completion_date = attachment_completion_date(app)

    duration_weeks = job.duration_weeks if job else None
    if duration_weeks is None and deployment and deployment.start_date and deployment.actual_end_date:
        duration_weeks = round(
            (deployment.actual_end_date - deployment.start_date).days / 7
        ) or None

    department_label = department.name if department else "General"
    has_final_report = bool(clearance and clearance.final_report_file)
    has_letter = bool(getattr(app, "_has_recommendation_letter", False))

    details = (
        f"Attachment Completed & Cleared — {job.title if job else 'General Attachment'}"
        f" ({department_label}, {duration_weeks} weeks)"
    )

    return {
        # Base keys shared with every other archive entity.
        "id": app.id,
        "entity_type": "ATTACHMENT",
        "title": f"{attachee_name} - {job.title if job else 'General Attachment'}",
        "department_id": department.id if department else None,
        "department_name": department_label,
        "slots": None,
        "archived_at": _iso(completion_date),
        "archived_by": (
            app.archived_by.username
            if app.archived_by
            else (
                clearance.hr_cleared_by.username
                if (clearance and clearance.hr_cleared_by)
                else "System"
            )
        ),
        "details": details,
        # Attachee record fields.
        "application_id": app.id,
        "attachee_name": attachee_name,
        "username": user.username,
        "email": user.email or "",
        "phone_number": (profile.phone_number if profile else "") or "",
        "id_number": (profile.id_number if profile else "") or "",
        "institution_name": (profile.institution_name if profile else "") or "",
        "qualification": (profile.qualification if profile else "") or "",
        "field_of_study": (profile.field_of_study if profile else "") or "",
        "job_title": job.title if job else "",
        "department_label": department_label,
        "opportunity_type": job.get_job_type_display() if job else "Industrial Attachment",
        "duration_weeks": duration_weeks,
        "ats_score": str(app.ats_score) if app.ats_score is not None else "",
        "application_date": _fmt_date(app.applied_at.date() if app.applied_at else None),
        "deployment_start_date": _fmt_date(deployment.start_date if deployment else None),
        "deployment_end_date": _fmt_date(deployment.actual_end_date if deployment else None),
        "department_cleared_at": _fmt_datetime(
            clearance.department_cleared_at if clearance else None
        ),
        "clearance_date": _fmt_datetime(clearance.hr_cleared_at if clearance else None),
        "completion_date": _fmt_date(
            completion_date.date() if completion_date else None
        ),
        "completion_year": completion_date.year if completion_date else None,
        "final_report_submitted": "Yes" if has_final_report else "No",
        "recommendation_letter": "Yes" if has_letter else "No",
        "is_archived": bool(app.is_archived),
    }
