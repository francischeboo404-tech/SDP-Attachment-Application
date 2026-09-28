import math

from django.db import models
from django.contrib.auth import get_user_model
from .sanitizers import DEFAULT_ELIGIBILITY_STATEMENT

User = get_user_model()


class Department(models.Model):
    name = models.CharField(max_length=150, unique=True, db_index=True)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    director = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="directed_department",
    )
    typical_intake_capacity = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="archived_departments",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Requisition(models.Model):
    STATUS_CHOICES = (
        ("PENDING", "Pending HR Review"),
        ("APPROVED", "Approved & Vacancy Created"),
        ("REJECTED", "Rejected"),
        ("FULFILLED", "Fulfilled"),
    )

    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="requisitions"
    )
    requested_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="submitted_requisitions"
    )
    num_candidates_requested = models.PositiveIntegerField(default=1)
    duration_start = models.DateField()
    duration_end = models.DateField()
    requirements = models.TextField()
    justification = models.TextField(blank=True)
    status = models.CharField(
        max_length=30, choices=STATUS_CHOICES, default="PENDING", db_index=True
    )
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_requisitions"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)
    created_job = models.ForeignKey(
        "Job", on_delete=models.SET_NULL, null=True, blank=True, related_name="origin_requisitions"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Requisition #{self.id} for {self.department.name} ({self.status})"


class Job(models.Model):
    JOB_TYPE_CHOICES = (
        ("ATTACHMENT", "Industrial Attachment"),
    )

    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="jobs",
        db_index=True,
    )
    title = models.CharField(max_length=200)
    description = models.TextField()
    requirements = models.TextField()
    job_type = models.CharField(max_length=20, choices=JOB_TYPE_CHOICES, default="ATTACHMENT", db_index=True)
    location = models.CharField(max_length=150)
    slots_required = models.PositiveIntegerField(default=1)
    duration_weeks = models.PositiveIntegerField(default=12)
    deadline = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="archived_jobs",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.department.name if self.department else 'General'})"

    @property
    def slots_filled(self):
        """Slots consumed by applicants who have been selected successfully."""
        return self.applications.filter(status="SUCCESSFUL").count()

    @property
    def is_full(self):
        return self.slots_filled >= self.slots_required


class Application(models.Model):
    """
    An applicant submission for a vacancy.

    Selection is binary. Once HR has reviewed an application the only two
    outcomes are SUCCESSFUL (the opportunity is granted) or REJECTED. The
    previous model carried SHORTLISTED and HIRED as intermediate stages between
    those two outcomes, which meant the same "yes" was recorded twice under
    different labels and every downstream consumer had to treat both as success.

    PENDING and REVIEWED are workflow markers, not decisions: PENDING means HR
    has not looked at it yet, and REVIEWED means the review panel was opened.
    They describe progress towards a decision and cannot be chosen as an outcome.
    """

    #: The only two statuses that represent a decision. Used by the status
    #: endpoint to validate an outcome and by the notification signal to decide
    #: whether an applicant should be told anything.
    DECISION_STATUSES = ("SUCCESSFUL", "REJECTED")

    #: Statuses meaning "no decision has been recorded yet".
    PENDING_STATUSES = ("PENDING", "REVIEWED")

    STATUS_CHOICES = (
        ("PENDING", "Pending"),
        ("REVIEWED", "Reviewed"),
        ("SUCCESSFUL", "Successful"),
        ("REJECTED", "Rejected"),
    )

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="applications"
    )
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="applications")
    cover_letter = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="PENDING", db_index=True
    )
    ats_score = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, db_index=True)
    applied_at = models.DateTimeField(auto_now_add=True, db_index=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="archived_applications",
    )
    outcome_notified_at = models.DateTimeField(null=True, blank=True, db_index=True)
    outcome_notified_status = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        unique_together = ("user", "job")
        ordering = ["-applied_at"]
        indexes = [
            models.Index(fields=["status", "-applied_at"]),
            models.Index(fields=["job", "status"]),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.job.title}"


class ApplicationStatusEvent(models.Model):
    """
    An immutable record of one step in an application's screening journey.

    The Application row only ever holds the *current* status, so on its own it
    cannot answer "when was this reviewed?" or "was this ever rejected and then
    reinstated?". Anything that needs the sequence -- the applicant's progress
    timeline, an audit of a contested decision, the clearance velocity
    calculation -- needs the individual steps, each with its own timestamp.

    This is deliberately append-only: a correction is recorded as a further
    event reversing the earlier one rather than by editing history, so the trail
    stays truthful even when HR changes its mind.
    """

    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="status_events"
    )
    from_status = models.CharField(max_length=20, blank=True, default="")
    to_status = models.CharField(max_length=20)
    #: HR, or null for the automatic "submitted" event created with the row.
    changed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="application_status_events",
    )
    note = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["application", "created_at"])]

    def __str__(self):
        arrow = f"{self.from_status} -> " if self.from_status else ""
        return f"{self.application_id}: {arrow}{self.to_status}"


class Notification(models.Model):
    NOTIFICATION_TYPES = (
        ("JOB_POSTED", "Job Posted"),
        ("CLEARANCE_UPDATE", "Clearance Update"),
        ("APPLICATION_UPDATE", "Application Update"),
        ("DEPLOYMENT_UPDATE", "Deployment Update"),
        ("GENERAL", "General Notification"),
    )

    # Who a notification is meant for.
    #
    # STAFF is the default so every notification written before this field
    # existed keeps behaving exactly as it did -- it goes to the management
    # feeds and to the department feed as before.
    #
    # APPLICANT marks a notice addressed to one applicant personally, such as the
    # outcome of their application. Those must not surface in the HR, Admin or
    # Director feeds. Previously they did, for two separate reasons: the list
    # view handed Admin/HR every notification unfiltered, and each outcome notice
    # also carried the vacancy's department, so the Director of that department
    # saw every applicant's result. `notification_type` could not carry this
    # distinction because APPLICATION_UPDATE is used for departmental notices too.
    AUDIENCES = (
        ("STAFF", "Staff"),
        ("APPLICANT", "Applicant"),
    )

    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE, null=True, blank=True, related_name="notifications"
    )
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, null=True, blank=True, related_name="notifications"
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=50, choices=NOTIFICATION_TYPES, default="JOB_POSTED"
    )
    audience = models.CharField(
        max_length=20, choices=AUDIENCES, default="STAFF", db_index=True
    )
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Notification: {self.title}"


class Deployment(models.Model):
    STATUS_CHOICES = (
        ("PENDING_DEPLOYMENT", "Pending Deployment"),
        ("DEPLOYED", "Deployed"),
        ("EXITED", "Exited"),
    )

    application = models.OneToOneField(
        Application, on_delete=models.CASCADE, related_name="deployment"
    )
    department = models.ForeignKey(
        Department, on_delete=models.PROTECT, related_name="deployments"
    )
    start_date = models.DateField()
    planned_end_date = models.DateField()
    actual_end_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=30, choices=STATUS_CHOICES, default="DEPLOYED", db_index=True
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_deployments"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["department", "status"]),
        ]

    def __str__(self):
        return f"Deployment of {self.application.user.username} to {self.department.name} ({self.status})"


class Clearance(models.Model):
    STATUS_CHOICES = (
        ("NOT_STARTED", "Not Started"),
        ("PENDING_DEPARTMENT", "Pending Department Review"),
        ("PENDING_HR", "Pending HR Review"),
        ("CLEARED", "Cleared"),
        ("REJECTED", "Rejected"),
    )

    deployment = models.OneToOneField(
        Deployment, on_delete=models.CASCADE, null=True, blank=True, related_name="clearance"
    )
    application = models.OneToOneField(
        Application, on_delete=models.CASCADE, null=True, blank=True, related_name="clearance"
    )
    status = models.CharField(
        max_length=30, choices=STATUS_CHOICES, default="NOT_STARTED", db_index=True
    )
    user_confirmed = models.BooleanField(default=False)
    user_confirmed_at = models.DateTimeField(null=True, blank=True)
    user_notes = models.TextField(blank=True)
    final_report_file = models.FileField(upload_to="clearance_docs/", null=True, blank=True)
    final_report_submitted_at = models.DateTimeField(null=True, blank=True)

    # Department-side review
    department_cleared = models.BooleanField(default=False)
    department_cleared_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="department_cleared_records"
    )
    department_cleared_at = models.DateTimeField(null=True, blank=True)
    department_notes = models.TextField(blank=True)

    # HR-side review
    hr_cleared = models.BooleanField(default=False)
    hr_cleared_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="hr_cleared_records"
    )
    hr_cleared_at = models.DateTimeField(null=True, blank=True)
    hr_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["status", "department_cleared", "hr_cleared"]),
        ]

    def __str__(self):
        user_str = self.deployment.application.user.username if self.deployment else (self.application.user.username if self.application else "Unknown")
        return f"Clearance for {user_str} ({self.status})"


class RecommendationLetterTemplate(models.Model):
    """
    Template for recommendation letters.
    Supported placeholder tokens:
      {{full_name}}         - Attachee's full name (e.g. John Doe)
      {{department}}        - Assigned department (e.g. Directorate of Petroleum Exploration)
      {{role_or_position}}  - Position/role title (e.g. Industrial Attachee - Geophysics)
      {{start_date}}        - Attachment start date
      {{end_date}}          - Attachment completion date
      {{issue_date}}        - Date the letter is generated
      {{hr_name}}           - Full name / Title of the approving HR Officer
      {{institution_name}}  - Attachee's academic institution / university
    """
    name = models.CharField(max_length=150)
    body = models.TextField()
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_letter_templates"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_default", "-created_at"]

    def __str__(self):
        return f"{self.name} {'(Default)' if self.is_default else ''}"


class RecommendationLetter(models.Model):
    deployment = models.ForeignKey(
        Deployment, on_delete=models.CASCADE, related_name="recommendation_letters"
    )
    template_used = models.ForeignKey(
        RecommendationLetterTemplate, on_delete=models.SET_NULL, null=True, blank=True
    )
    rendered_content = models.TextField()
    file = models.FileField(upload_to="recommendations/", null=True, blank=True)
    generated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="generated_letters"
    )
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-generated_at"]

    def __str__(self):
        return f"Recommendation Letter for {self.deployment.application.user.username} ({self.generated_at.date()})"


class EligibilitySetting(models.Model):
    """
    Singleton configuration model storing the institutional eligibility statement
    as Admin-authored rich text (sanitized HTML).
    Edited exclusively from Admin -> System Settings & Keys; publicly rendered
    read-only on the landing page.
    """
    general_statement = models.TextField(default=DEFAULT_ELIGIBILITY_STATEMENT)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="updated_eligibility_settings"
    )

    class Meta:
        verbose_name = "Eligibility Setting"
        verbose_name_plural = "Eligibility Settings"

    def __str__(self):
        return f"General Eligibility Setting (Updated {self.updated_at.strftime('%Y-%m-%d') if self.updated_at else 'Initial'})"

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj

    @property
    def sanitized_statement(self):
        """
        Sanitize-on-render. Content is already sanitized on save, but the stored
        value is the authoritative public output, so it is passed through the
        allowlist again on every read.
        """
        from .sanitizers import sanitize_rich_text

        return sanitize_rich_text(self.general_statement)


class AtsScoringConfiguration(models.Model):
    """
    Singleton configuration model holding the Admin-configurable ATS quality
    tier boundaries and qualification benchmark.

    This model is the SINGLE SOURCE OF TRUTH for tiering. The tier structure
    (five named tiers) is fixed; only the numeric boundaries separating them are
    configurable. Every consumer -- the "Applicant Quality Distribution &
    Statistical Dispersion Profile" card, the Department Director quality
    profile, and any other tier display -- must derive its tiers from
    :meth:`stratify_scores` / :meth:`tier_definitions` rather than re-implementing
    the comparison logic.
    """
    # Minimum score (inclusive) for each of the top four tiers. The fifth tier
    # ("Below Benchmark") is the implicit remainder below `average_min`.
    exceptional_min = models.DecimalField(max_digits=5, decimal_places=2, default=90.00)
    highly_qualified_min = models.DecimalField(max_digits=5, decimal_places=2, default=75.00)
    qualified_min = models.DecimalField(max_digits=5, decimal_places=2, default=60.00)
    average_min = models.DecimalField(max_digits=5, decimal_places=2, default=50.00)

    # Score at or above which an applicant counts towards the qualification rate.
    qualification_benchmark = models.DecimalField(max_digits=5, decimal_places=2, default=70.00)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="updated_ats_configurations"
    )

    class Meta:
        verbose_name = "ATS Scoring Configuration"
        verbose_name_plural = "ATS Scoring Configurations"

    def __str__(self):
        return f"ATS Scoring Configuration (Updated {self.updated_at.strftime('%Y-%m-%d') if self.updated_at else 'Initial'})"

    @classmethod
    def get_config(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj

    @property
    def thresholds(self):
        """Ascending list of the four configurable tier boundaries."""
        return [
            self.average_min,
            self.qualified_min,
            self.highly_qualified_min,
            self.exceptional_min,
        ]

    @property
    def tier_names(self):
        """Fixed tier names, ordered from the lowest tier upward."""
        return [
            "Below Benchmark",
            "Average",
            "Qualified",
            "Highly Qualified",
            "Exceptional",
        ]

    @staticmethod
    def _format_score(value):
        value = float(value)
        return f"{value:g}"

    @staticmethod
    def sanitize_scores(scores):
        """
        Coerce an iterable of scores to a list of finite floats.

        Shared by every consumer (tiering, statistics, qualification rate) so a
        score can never be dropped by one calculation and kept by another --
        that mismatch is what made distribution counts stop summing to the
        population.

        ``None``, non-numeric values, NaN and +/-inf are all dropped. NaN is
        the important case: every comparison against NaN is False, so a NaN
        score silently falls out of every tier and poisons any mean it enters.
        """
        clean = []
        for raw in scores:
            if raw is None:
                continue
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if math.isnan(value) or math.isinf(value):
                continue
            clean.append(value)
        return clean

    @classmethod
    def _coerce_score(cls, score):
        """A single score as a finite float, or ``None`` if it is not usable."""
        clean = cls.sanitize_scores([score])
        return clean[0] if clean else None

    @classmethod
    def _inclusive_ceiling(cls, exclusive_floor):
        """
        The inclusive upper bound of a tier, derived from the next (higher)
        tier's exclusive lower bound.

        Scores are stored with two decimal places, so the highest score that
        still falls below a whole threshold of 90 is 89.99 -- not 89. Labelling
        the tier "75-89" therefore understated its real range and made a 89.99
        score appear to belong to a band it did not. Bucketing always uses the
        exclusive bound; this only affects the displayed maximum.
        """
        return round(float(exclusive_floor) - 0.01, 2)

    def tier_definitions(self):
        """
        Returns the five tier definitions ordered from the highest tier down.

        ``min_score`` is inclusive and ``max_score_exclusive`` is the exclusive
        upper bound (``None`` for the top tier, which is unbounded above). The
        ``max_score`` and ``label`` fields are derived from the *currently
        configured* thresholds, so a label can never describe different
        boundaries from the ones actually used to bucket scores.
        """
        t4, t3, t2, t1 = [float(x) for x in self.thresholds]
        names = self.tier_names
        # (tier, name, inclusive min, exclusive max, next tier's exclusive floor)
        bounds = [
            (1, names[4], t1, None, None),
            (2, names[3], t2, t1, t1),
            (3, names[2], t3, t2, t2),
            (4, names[1], t4, t3, t3),
            (5, names[0], 0.0, t4, None),
        ]
        definitions = []
        for tier, name, minimum, max_exclusive, next_floor in bounds:
            if tier == 1:
                label = f"Tier {tier}: {name} (\u2265{self._format_score(t1)}%)"
            elif tier == 5:
                label = f"Tier {tier}: {name} (<{self._format_score(t4)}%)"
            else:
                label = (
                    f"Tier {tier}: {name} "
                    f"({self._format_score(minimum)}-{self._format_score(self._inclusive_ceiling(next_floor))}%)"
                )
            definitions.append(
                {
                    "tier": tier,
                    "name": name,
                    "label": label,
                    "min_score": minimum,
                    "max_score": 100.0 if max_exclusive is None else self._inclusive_ceiling(max_exclusive),
                    "max_score_exclusive": max_exclusive,
                }
            )
        return definitions

    @staticmethod
    def _score_in_tier(definition, value):
        """
        The single score-to-tier comparison. Every consumer goes through this so
        bucketing and single-score lookup can never disagree.
        """
        if value < definition["min_score"]:
            return False
        max_exclusive = definition["max_score_exclusive"]
        return max_exclusive is None or value < max_exclusive

    def _tier_index_for(self, value, definitions):
        """
        The single score-to-tier resolution. Returns an index into
        ``definitions`` (highest tier first).

        Out-of-range scores are clamped into the nearest tier rather than
        falling through. A score below zero used to match no tier at all and so
        was counted in no bucket, which meant the bucket counts silently summed
        to less than the population and the reported percentages overstated
        every tier that did exist.
        """
        for index, definition in enumerate(definitions):
            if self._score_in_tier(definition, value):
                return index
        return 0 if value > 100.0 else len(definitions) - 1

    def tier_for_score(self, score):
        """Returns the tier definition dict containing ``score``."""
        value = self._coerce_score(score)
        if value is None:
            # An unusable score is treated as a zero, matching the bottom tier,
            # so callers always get a usable answer instead of a crash.
            value = 0.0
        definitions = self.tier_definitions()
        return definitions[self._tier_index_for(value, definitions)]

    def tier_name_for_score(self, score):
        return self.tier_for_score(score)["name"]

    def empty_distribution_buckets(self):
        """Zero-count buckets for the tier definitions, used when no scores exist."""
        return [{"tier": d["label"], "count": 0, "percentage": 0.0} for d in self.tier_definitions()]

    def stratify_scores(self, scores_list):
        """
        Distributes ``scores_list`` across the configured tiers and returns the
        ``distribution_buckets`` payload consumed by the analytics dashboards.
        This is the only place score-to-tier assignment happens.

        Every accepted score lands in exactly one bucket, so the counts always
        sum to the population and the percentages always sum to 100.
        """
        clean_scores = self.sanitize_scores(scores_list)
        if not clean_scores:
            return self.empty_distribution_buckets()

        definitions = self.tier_definitions()
        counts = [0] * len(definitions)
        for score in clean_scores:
            counts[self._tier_index_for(score, definitions)] += 1

        n = len(clean_scores)
        return [
            {
                "tier": definition["label"],
                "count": count,
                "percentage": round((count / n) * 100, 1),
            }
            for definition, count in zip(definitions, counts)
        ]

    def qualification_rate_for(self, scores_list):
        """Percentage of scores at or above the configured qualification benchmark."""
        clean_scores = self.sanitize_scores(scores_list)
        if not clean_scores:
            return 0.0
        benchmark = float(self.qualification_benchmark)
        qual_count = sum(1 for s in clean_scores if s >= benchmark)
        return round((qual_count / len(clean_scores)) * 100, 1)

