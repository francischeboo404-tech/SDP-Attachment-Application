import os
from decimal import Decimal
from rest_framework import serializers
from .models import (
    Department,
    Requisition,
    Job,
    Application,
    Notification,
    Deployment,
    Clearance,
    RecommendationLetterTemplate,
    RecommendationLetter,
    EligibilitySetting,
    AtsScoringConfiguration,
)
from .sanitizers import sanitize_rich_text
from accounts.date_rules import backdated_error, changed_to_backdated


class SanitizedRichTextField(serializers.CharField):
    """
    Authored rich text, allowlist-sanitized on the way in and on the way out.

    Both directions matter. Sanitizing on write stops a script payload from ever
    being stored; sanitizing on read is what protects rows written *before* the
    field existed, or by any other code path that bypassed this serializer.
    Relying on write-time sanitizing alone would leave that legacy content
    trusted when it is rendered as HTML.
    """

    def to_internal_value(self, data):
        return sanitize_rich_text(super().to_internal_value(data))

    def to_representation(self, value):
        return sanitize_rich_text(value)


# Retained under its original name so existing references keep working.
RichTextJobDescriptionField = SanitizedRichTextField


class DepartmentSerializer(serializers.ModelSerializer):
    director_name = serializers.SerializerMethodField()
    director_email = serializers.SerializerMethodField()
    active_vacancies_count = serializers.SerializerMethodField()
    total_slots = serializers.SerializerMethodField()
    # A department description is authored with the same rich-text editor as a
    # vacancy description and is rendered as HTML, so it needs the same
    # sanitizing. It was previously a plain CharField, which was safe only
    # because nothing rendered it as markup -- it displayed as literal text.
    # The moment it became formatted content, an unsanitized value would have
    # been a stored-XSS vector on the public landing page.
    description = SanitizedRichTextField()

    class Meta:
        model = Department
        fields = (
            "id",
            "name",
            "description",
            "location",
            "contact_email",
            "contact_phone",
            "director",
            "director_name",
            "director_email",
            "typical_intake_capacity",
            "is_active",
            "created_at",
            "updated_at",
            "active_vacancies_count",
            "total_slots",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_director_name(self, obj):
        if obj.director:
            return f"{obj.director.first_name} {obj.director.last_name}".strip() or obj.director.username
        return None

    def get_director_email(self, obj):
        return obj.director.email if obj.director else None

    def get_active_vacancies_count(self, obj):
        if hasattr(obj, "annotated_active_vacancies"):
            return obj.annotated_active_vacancies
        return obj.jobs.filter(is_active=True, is_archived=False).count()

    def get_total_slots(self, obj):
        if hasattr(obj, "annotated_total_slots"):
            return obj.annotated_total_slots or 0
        from django.db.models import Sum
        total = obj.jobs.filter(is_active=True, is_archived=False).aggregate(Sum("slots_required"))["slots_required__sum"]
        return total or 0


class RequisitionSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    created_job_title = serializers.CharField(source="created_job.title", read_only=True)

    class Meta:
        model = Requisition
        fields = (
            "id",
            "department",
            "department_name",
            "requested_by",
            "requested_by_name",
            "num_candidates_requested",
            "duration_start",
            "duration_end",
            "requirements",
            "justification",
            "status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "review_notes",
            "created_job",
            "created_job_title",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "requested_by",
            "status",
            "reviewed_by",
            "reviewed_at",
            "review_notes",
            "created_job",
            "created_at",
            "updated_at",
        )

    def get_requested_by_name(self, obj):
        u = obj.requested_by
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            u = obj.reviewed_by
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return None

    def validate_duration_start(self, value):
        # A requisition asks for candidates to start an attachment that has not
        # happened yet. An existing requisition keeps whatever start HR already
        # agreed to, so editing an unrelated field is not rejected for a date
        # this validation did not cause.
        stored = self.instance.duration_start if self.instance else None
        if changed_to_backdated(stored, value):
            raise serializers.ValidationError(backdated_error("Start date"))
        return value


class JobSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    slots_filled = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    description = RichTextJobDescriptionField()

    class Meta:
        model = Job
        fields = (
            "id",
            "department",
            "department_name",
            "title",
            "description",
            "requirements",
            "job_type",
            "location",
            "slots_required",
            "duration_weeks",
            "slots_filled",
            "is_full",
            "deadline",
            "created_at",
            "is_active",
            "is_archived",
        )


class PublicJobSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", default="General Directorate", read_only=True)
    # Sanitized on output as well as input: this is the serializer that feeds
    # the public landing page, i.e. unauthenticated visitors.
    description = RichTextJobDescriptionField()

    class Meta:
        model = Job
        fields = (
            "id",
            "title",
            "description",
            "requirements",
            "job_type",
            "location",
            "department_name",
            "slots_required",
            "duration_weeks",
            "deadline",
            "created_at",
        )


def compute_derived_status(app_status_or_app, dep_status=None, clr_status=None):
    """
    Computes the authoritative derived / display-only status:
      - Before a decision: existing labels unchanged (Pending Review, Reviewed)
      - SUCCESSFUL, not yet DEPLOYED: "Successful — Awaiting Deployment"
      - DEPLOYED: "Industrial Attachment Trainee"
      - EXITED, clearance incomplete: "Attachment Completed — Clearance in Progress"
      - EXITED, CLEARED: "Attachment Completed — Cleared"

    A successful selection is described as the opportunity being granted rather
    than the applicant being "hired": an industrial attachment placement is not
    an employment contract, and the wording matters in a document the applicant
    receives.
    """
    if hasattr(app_status_or_app, "status"):
        app = app_status_or_app
        app_status = app.status
        deployment = getattr(app, "deployment", None)
        dep_status = deployment.status if deployment else None
        clearance = getattr(deployment, "clearance", None) if deployment else None
        clr_status = clearance.status if clearance else None
    else:
        app_status = app_status_or_app

    if dep_status == "DEPLOYED":
        return "Industrial Attachment Trainee"
    if dep_status == "EXITED":
        if clr_status == "CLEARED":
            return "Attachment Completed — Cleared"
        return "Attachment Completed — Clearance in Progress"
    if app_status == "SUCCESSFUL":
        return "Successful — Awaiting Deployment"

    status_map = {
        "PENDING": "Pending Review",
        "REVIEWED": "Reviewed",
        "SUCCESSFUL": "Successful — Awaiting Deployment",
        "REJECTED": "Rejected",
        "WITHDRAWN": "Withdrawn",
    }
    return status_map.get(app_status, app_status or "Pending Review")


class ClearanceSerializer(serializers.ModelSerializer):
    applicant_name = serializers.SerializerMethodField()
    applicant_email = serializers.SerializerMethodField()
    job_title = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    department_cleared_by_name = serializers.SerializerMethodField()
    hr_cleared_by_name = serializers.SerializerMethodField()
    display_status = serializers.SerializerMethodField()

    class Meta:
        model = Clearance
        fields = (
            "id",
            "deployment",
            "application",
            "applicant_name",
            "applicant_email",
            "job_title",
            "department_name",
            "status",
            "display_status",
            "user_confirmed",
            "user_confirmed_at",
            "user_notes",
            "final_report_file",
            "final_report_submitted_at",
            "department_cleared",
            "department_cleared_by",
            "department_cleared_by_name",
            "department_cleared_at",
            "department_notes",
            "hr_cleared",
            "hr_cleared_by",
            "hr_cleared_by_name",
            "hr_cleared_at",
            "hr_notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "user_confirmed",
            "user_confirmed_at",
            "final_report_submitted_at",
            "department_cleared",
            "department_cleared_by",
            "department_cleared_at",
            "hr_cleared",
            "hr_cleared_by",
            "hr_cleared_at",
            "created_at",
            "updated_at",
        )

    def _get_user(self, obj):
        if obj.deployment:
            return obj.deployment.application.user
        if obj.application:
            return obj.application.user
        return None

    def get_applicant_name(self, obj):
        u = self._get_user(obj)
        if u:
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return "Unknown"

    def get_applicant_email(self, obj):
        u = self._get_user(obj)
        return u.email if u else ""

    def get_job_title(self, obj):
        if obj.deployment:
            return obj.deployment.application.job.title
        if obj.application:
            return obj.application.job.title
        return "Industrial Attachment"

    def get_department_name(self, obj):
        if obj.deployment and obj.deployment.department:
            return obj.deployment.department.name
        if obj.application and obj.application.job.department:
            return obj.application.job.department.name
        return "General Directorate"

    def get_department_cleared_by_name(self, obj):
        if obj.department_cleared_by:
            u = obj.department_cleared_by
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return None

    def get_hr_cleared_by_name(self, obj):
        if obj.hr_cleared_by:
            u = obj.hr_cleared_by
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return None

    def get_display_status(self, obj):
        dep = obj.deployment
        dep_status = dep.status if dep else "EXITED"
        app_status = dep.application.status if dep and dep.application else (obj.application.status if obj.application else "SUCCESSFUL")
        return compute_derived_status(app_status, dep_status, obj.status)

    def validate_final_report_file(self, value):
        if not value:
            return value

        ext = os.path.splitext(value.name)[1].lower()
        allowed_extensions = {".pdf", ".docx", ".doc"}
        if ext not in allowed_extensions:
            raise serializers.ValidationError(
                "Only PDF and DOCX document formats are accepted for the clearance report."
            )

        max_bytes = 10 * 1024 * 1024
        if value.size > max_bytes:
            raise serializers.ValidationError(
                f"File size must not exceed 10 MB (uploaded file is {value.size / (1024 * 1024):.1f} MB)."
            )
        return value


class DeploymentSerializer(serializers.ModelSerializer):
    applicant_name = serializers.SerializerMethodField()
    applicant_email = serializers.EmailField(source="application.user.email", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    job_title = serializers.CharField(source="application.job.title", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    clearance = ClearanceSerializer(read_only=True)
    display_status = serializers.SerializerMethodField()

    class Meta:
        model = Deployment
        fields = (
            "id",
            "application",
            "applicant_name",
            "applicant_email",
            "department",
            "department_name",
            "job_title",
            "start_date",
            "planned_end_date",
            "actual_end_date",
            "status",
            "display_status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
            "clearance",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_applicant_name(self, obj):
        u = obj.application.user
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_created_by_name(self, obj):
        if obj.created_by:
            u = obj.created_by
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return None

    def get_display_status(self, obj):
        clr = getattr(obj, "clearance", None)
        clr_status = clr.status if clr else None
        app_status = obj.application.status if obj.application else "SUCCESSFUL"
        return compute_derived_status(app_status, obj.status, clr_status)

    def validate_start_date(self, value):
        # HR records a deployment the moment it is created, so a start date in
        # the past contradicts the act of deploying. A later status or
        # clearance update keeps the start date already accepted.
        stored = self.instance.start_date if self.instance else None
        if changed_to_backdated(stored, value):
            raise serializers.ValidationError(backdated_error("Start date"))
        return value


class ApplicationSerializer(serializers.ModelSerializer):
    applicant_name = serializers.SerializerMethodField()
    applicant_email = serializers.EmailField(source="user.email", read_only=True)
    job_title = serializers.CharField(source="job.title", read_only=True)
    job_type = serializers.CharField(source="job.job_type", read_only=True)
    department_name = serializers.CharField(source="job.department.name", default="General", read_only=True)
    opportunity_type = serializers.CharField(
        source="user.profile.opportunity_type", read_only=True
    )
    duration_weeks = serializers.IntegerField(source="job.duration_weeks", read_only=True)
    institution_name = serializers.CharField(source="user.profile.institution_name", read_only=True, default="")
    qualification = serializers.CharField(source="user.profile.qualification", read_only=True, default="")
    field_of_study = serializers.CharField(source="user.profile.field_of_study", read_only=True, default="")
    joining_date = serializers.DateField(source="user.profile.joining_date", read_only=True, default=None)
    projected_end_date = serializers.SerializerMethodField()
    attached_documents = serializers.SerializerMethodField()
    clearance = ClearanceSerializer(read_only=True)
    deployment = DeploymentSerializer(read_only=True)
    display_status = serializers.SerializerMethodField()
    status_history = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = (
            "id",
            "user",
            "applicant_name",
            "applicant_email",
            "job",
            "job_title",
            "job_type",
            "duration_weeks",
            "institution_name",
            "qualification",
            "field_of_study",
            "joining_date",
            "projected_end_date",
            "department_name",
            "cover_letter",
            "status",
            "display_status",
            "status_history",
            "ats_score",
            "applied_at",
            "attached_documents",
            "opportunity_type",
            "clearance",
            "deployment",
        )
        read_only_fields = ("user", "status", "applied_at", "ats_score")

    def get_applicant_name(self, obj):
        return (
            f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username
        )

    def get_projected_end_date(self, obj):
        import datetime
        profile = getattr(obj.user, "profile", None)
        if profile and profile.joining_date and obj.job and obj.job.duration_weeks:
            return profile.joining_date + datetime.timedelta(weeks=obj.job.duration_weeks)
        return None

    def get_attached_documents(self, obj):
        from accounts.serializers import DocumentSerializer

        docs = obj.user.documents.all()
        return DocumentSerializer(docs, many=True).data

    def get_display_status(self, obj):
        dep = getattr(obj, "deployment", None)
        dep_status = dep.status if dep else None
        clr = getattr(obj, "clearance", None) or (getattr(dep, "clearance", None) if dep else None)
        clr_status = clr.status if clr else None
        return compute_derived_status(obj.status, dep_status, clr_status)

    def get_status_history(self, obj):
        """
        The applicant's screening journey, oldest step first.

        Serialized here rather than in the view so every endpoint that returns
        an application returns the same trail. Falls back to a single
        "submitted" step derived from ``applied_at`` for rows created before the
        history existed, so the timeline is never empty.
        """
        events = list(getattr(obj, "_prefetched_status_events", None)
                      or obj.status_events.all())
        if events:
            return [
                {
                    "id": event.id,
                    "from_status": event.from_status,
                    "to_status": event.to_status,
                    "changed_by": event.changed_by.username if event.changed_by else None,
                    "note": event.note,
                    "created_at": event.created_at,
                }
                for event in events
            ]
        return [
            {
                "id": None,
                "from_status": "",
                "to_status": obj.status or "PENDING",
                "changed_by": None,
                "note": "Application submitted",
                "created_at": obj.applied_at,
            }
        ]


class NotificationSerializer(serializers.ModelSerializer):
    recipient_name = serializers.SerializerMethodField()
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "recipient",
            "recipient_name",
            "department",
            "department_name",
        "title",
        "message",
        "notification_type",
        "audience",
        "is_read",
        "created_at",
    )

    def get_recipient_name(self, obj):
        if obj.recipient:
            return f"{obj.recipient.first_name} {obj.recipient.last_name}".strip() or obj.recipient.username
        return None


class RecommendationLetterTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RecommendationLetterTemplate
        fields = (
            "id",
            "name",
            "body",
            "is_default",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_created_by_name(self, obj):
        if obj.created_by:
            u = obj.created_by
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return None


class RecommendationLetterSerializer(serializers.ModelSerializer):
    applicant_name = serializers.SerializerMethodField()
    applicant_email = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    job_title = serializers.SerializerMethodField()
    template_name = serializers.CharField(source="template_used.name", default="Standard Template", read_only=True)
    generated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RecommendationLetter
        fields = (
            "id",
            "deployment",
            "applicant_name",
            "applicant_email",
            "department_name",
            "job_title",
            "template_used",
            "template_name",
            "rendered_content",
            "file",
            "generated_by",
            "generated_by_name",
            "generated_at",
        )
        read_only_fields = ("generated_by", "generated_at")

    def get_applicant_name(self, obj):
        u = obj.deployment.application.user
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_applicant_email(self, obj):
        return obj.deployment.application.user.email

    def get_department_name(self, obj):
        return obj.deployment.department.name

    def get_job_title(self, obj):
        return obj.deployment.application.job.title

    def get_generated_by_name(self, obj):
        if obj.generated_by:
            u = obj.generated_by
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return "HR Directorate"


class EligibilitySettingSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()
    # Sanitize-on-render: the value handed to the public landing page is always
    # passed through the allowlist, even though it is already sanitized on save.
    general_statement_html = serializers.CharField(source="sanitized_statement", read_only=True)

    class Meta:
        model = EligibilitySetting
        fields = (
            "id",
            "general_statement",
            "general_statement_html",
            "updated_at",
            "updated_by",
            "updated_by_name",
        )
        read_only_fields = ("id", "updated_at", "updated_by")

    def get_updated_by_name(self, obj):
        if obj.updated_by:
            u = obj.updated_by
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return "System Default"

    def validate_general_statement(self, value):
        """
        Sanitize-on-save. The stored value is what the public landing page
        renders as HTML, so anything outside the rich-text allowlist
        (``<script>``, event handlers, ``javascript:`` URLs, ...) is stripped
        here rather than being trusted downstream.
        """
        return sanitize_rich_text(value)


class AtsScoringConfigurationSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()
    # Derived, read-only preview of the tier boundaries currently configured,
    # so the Admin UI never has to re-derive the tier structure client-side.
    tier_definitions = serializers.SerializerMethodField()

    # An ATS score is bounded 0-100 by calculate_ats_score, so a threshold
    # outside that range could never be reached and would silently mis-tier.
    exceptional_min = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"))
    highly_qualified_min = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"))
    qualified_min = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"))
    average_min = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"))
    qualification_benchmark = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"))

    class Meta:
        model = AtsScoringConfiguration
        fields = (
            "id",
            "exceptional_min",
            "highly_qualified_min",
            "qualified_min",
            "average_min",
            "qualification_benchmark",
            "tier_definitions",
            "updated_at",
            "updated_by",
            "updated_by_name",
        )
        read_only_fields = ("id", "updated_at", "updated_by")

    def get_updated_by_name(self, obj):
        if obj.updated_by:
            u = obj.updated_by
            return f"{u.first_name} {u.last_name}".strip() or u.username
        return "System Default"

    def get_tier_definitions(self, obj):
        return obj.tier_definitions()

    def validate(self, attrs):
        """
        The five tiers are derived purely from these four boundaries, so they must
        be strictly descending. Anything else (equal or inverted boundaries)
        would collapse a tier to zero width or make it unreachable, and the
        Admin would have no error message explaining why the chart looked wrong.
        """
        # Fall back to the field's declared default when PATCHing without an
        # existing instance. A bare `AtsScoringConfiguration(id=1)` cannot be
        # used for this: Django treats its unset fields as deferred and tries to
        # refresh them from the database.
        defaults = {
            name: AtsScoringConfiguration._meta.get_field(name).get_default()
            for name in (
                "exceptional_min",
                "highly_qualified_min",
                "qualified_min",
                "average_min",
                "qualification_benchmark",
            )
        }

        def resolve(field):
            if field in attrs:
                return attrs[field]
            if self.instance is not None:
                return getattr(self.instance, field)
            return defaults[field]

        # Ordered from the highest boundary down. `key` is the request field the
        # frontend binds its error message to.
        ordered = [
            ("exceptional_min", "Tier 1 (Exceptional)"),
            ("highly_qualified_min", "Tier 2 (Highly Qualified)"),
            ("qualified_min", "Tier 3 (Qualified)"),
            ("average_min", "Tier 4 (Average)"),
        ]

        # Sanity bounds are checked first so a nonsensical zero surfaces the
        # actionable message rather than a confusing "must be greater than"
        # ordering error aimed at a different field.
        if resolve("exceptional_min") <= 0:
            raise serializers.ValidationError(
                {
                    "exceptional_min": (
                        "Tier 1 (Exceptional) must be greater than 0, "
                        "otherwise the top tier can never be reached."
                    )
                }
            )
        if resolve("average_min") <= 0:
            raise serializers.ValidationError(
                {
                    "average_min": (
                        "Tier 4 (Average) must be greater than 0, "
                        "otherwise Tier 5 (Below Benchmark) can never be reached."
                    )
                }
            )

        for index in range(len(ordered) - 1):
            higher_field, higher_label = ordered[index]
            lower_field, lower_label = ordered[index + 1]
            higher_value = resolve(higher_field)
            lower_value = resolve(lower_field)
            if higher_value <= lower_value:
                raise serializers.ValidationError(
                    {
                        lower_field: (
                            f"{higher_label} must be strictly greater than {lower_label}. "
                            f"Received {higher_field}={higher_value} and {lower_field}={lower_value}. "
                            "Tier boundaries must descend from the highest tier to the lowest."
                        )
                    }
                )
        return attrs

