"""
Smoke test: no endpoint may return a 5xx for any supported role.

A 5xx here is a crash a real user can trigger, so each request is made with
data that exercises the awkward paths (an application with no profile, a
clearance with no deployment, a department with no jobs, a director with no
department) because those are where the crashes live.

This is a regression net, not a coverage statement: it does not assert the
response body beyond the status, but it fails loudly on any server error and
prints the endpoint so the traceback can be acted on.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Profile, User
from jobs.models import (
    Application,
    AtsScoringConfiguration,
    Clearance,
    Department,
    Deployment,
    Job,
    Requisition,
    RecommendationLetter,
)


class NoServerErrorsTests(TestCase):
    """
    Shared fixtures. Deliberately includes degenerate records (empty profile,
    deployment-less clearance, job-less department, director with no
    department) because that is where unhandled attribute access tends to hide.
    """

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username="smoke_admin", password="Pass!2026",
            email="smoke_admin@petroleum.go.ke", role="ADMIN",
            first_name="Smoke", last_name="Admin",
        )
        cls.hr = User.objects.create_user(
            username="smoke_hr", password="Pass!2026",
            email="smoke_hr@petroleum.go.ke", role="HR",
            first_name="Smoke", last_name="Hr",
        )
        cls.director = User.objects.create_user(
            username="smoke_dir", password="Pass!2026",
            email="smoke_dir@petroleum.go.ke", role="DEPARTMENT_DIRECTOR",
            first_name="Smoke", last_name="Director",
        )
        cls.orphan_director = User.objects.create_user(
            username="smoke_orphan", password="Pass!2026",
            email="smoke_orphan@petroleum.go.ke", role="DEPARTMENT_DIRECTOR",
        )
        cls.applicant = User.objects.create_user(
            username="smoke_app", password="Pass!2026",
            email="smoke_app@uni.ac.ke", role="APPLICANT",
            first_name="Smoke", last_name="Applicant",
        )

        cls.dept = Department.objects.create(
            name="Smoke Dept", description="d", location="Nairobi",
            typical_intake_capacity=5, director=cls.director,
        )
        # A department with no vacancies and no jobs at all.
        cls.empty_dept = Department.objects.create(name="Smoke Empty Dept")

        cls.job = Job.objects.create(
            department=cls.dept, title="Smoke Attachment", description="d",
            requirements="r", job_type="ATTACHMENT", slots_required=2,
            duration_weeks=12, location="Nairobi",
            deadline=timezone.now() + timedelta(days=30),
        )
        cls.zero_slot_job = Job.objects.create(
            department=cls.dept, title="Zero Slot Attachment", description="d",
            requirements="r", job_type="ATTACHMENT", slots_required=0,
            duration_weeks=12, location="Nairobi",
            deadline=timezone.now() + timedelta(days=30),
        )

        Requisition.objects.create(
            department=cls.dept, requested_by=cls.director,
            requirements="Geology attachment cohort",
            justification="j",
            num_candidates_requested=5,
            duration_start=timezone.now().date(),
            duration_end=timezone.now().date() + timedelta(days=90),
        )

        # Applicant with a bare profile: every optional field is empty.
        Profile.objects.filter(user=cls.applicant).update(
            phone_number="", id_number="", institution_name="", qualification="",
            field_of_study="", county_of_residence="",
        )

        # A completed attachment.
        cls.successful_app = Application.objects.create(
            user=cls.applicant, job=cls.job, status="SUCCESSFUL", ats_score=91.25,
        )
        cls.deployment = Deployment.objects.create(
            application=cls.successful_app, department=cls.dept,
            start_date=timezone.now().date() - timedelta(days=60),
            planned_end_date=timezone.now().date() - timedelta(days=20),
            actual_end_date=timezone.now().date() - timedelta(days=25),
            status="EXITED",
        )
        cls.clearance = Clearance.objects.create(
            application=cls.successful_app, deployment=cls.deployment, status="CLEARED",
            department_cleared=True, hr_cleared=True, hr_cleared_by=cls.hr,
            department_cleared_at=timezone.now() - timedelta(days=22),
            hr_cleared_at=timezone.now() - timedelta(days=20),
        )
        RecommendationLetter.objects.create(
            deployment=cls.deployment, rendered_content="Dear sir/madam,",
        )

        # A legacy clearance with no deployment at all.
        legacy_user = User.objects.create_user(
            username="smoke_legacy", password="Pass!2026",
            email="smoke_legacy@uni.ac.ke", role="APPLICANT",
        )
        legacy_app = Application.objects.create(
            user=legacy_user, job=cls.job, status="SUCCESSFUL", ats_score=64.0,
        )
        Clearance.objects.create(application=legacy_app, status="NOT_STARTED")

        # An application still awaiting review. A second applicant is needed
        # because Application is unique on (user, job).
        cls.pending_applicant = User.objects.create_user(
            username="smoke_pending", password="Pass!2026",
            email="smoke_pending@uni.ac.ke", role="APPLICANT",
            first_name="Smoke", last_name="Pending",
        )
        cls.pending_app = Application.objects.create(
            user=cls.pending_applicant, job=cls.job, status="PENDING", ats_score=0,
        )

        # Archived records so the archive endpoints have every entity type.
        Job.objects.filter(pk=cls.zero_slot_job.pk).update(
            is_archived=True, is_active=False, archived_at=timezone.now()
        )
        Application.objects.filter(pk=cls.pending_app.pk).update(
            is_archived=True, archived_at=timezone.now()
        )
        Department.objects.filter(pk=cls.empty_dept.pk).update(
            is_archived=True, is_active=False, archived_at=timezone.now()
        )

        AtsScoringConfiguration.get_config()

    def setUp(self):
        self.client = APIClient()

    def assert_no_server_errors(self, paths, user):
        self.client.force_authenticate(user=user)
        for path in paths:
            with self.subTest(role=user.role, path=path):
                response = self.client.get(path)
                self.assertLess(
                    response.status_code, 500,
                    f"{path} returned {response.status_code} for role {user.role}",
                )

    # Endpoint inventory. Kept as data so a crash report names the exact URL.
    READ_ONLY_REPORTING_PATHS = [
        "/api/jobs/reports/analytics/",
        "/api/jobs/reports/attachees/",
        "/api/jobs/reports/fill-rates/",
        "/api/jobs/reports/export-csv/?report_type=attachees",
        "/api/jobs/reports/export-csv/?report_type=fill_rates",
        "/api/jobs/archives/",
        "/api/jobs/archives/?type=ATTACHMENT",
        "/api/jobs/archives/?type=APPLICATION",
        "/api/jobs/archives/?type=DEPARTMENT",
        "/api/jobs/archives/?type=VACANCY",
        "/api/jobs/clearance/my-clearances/",
        "/api/jobs/clearance/department-queue/",
        "/api/jobs/clearance/hr-queue/",
        "/api/jobs/notifications/",
        "/api/accounts/audit-logs/",
        "/api/jobs/departments/",
        "/api/jobs/deployments/",
        "/api/jobs/applications/",
    ]

    def test_reporting_endpoints_do_not_crash_for_any_role(self):
        for user in (self.admin, self.hr, self.director, self.orphan_director):
            self.assert_no_server_errors(self.READ_ONLY_REPORTING_PATHS, user)

    def test_analytics_survives_every_date_window_shape(self):
        """The date-range parsing is where a crash would hide."""
        self.client.force_authenticate(user=self.admin)
        paths = [
            "/api/jobs/reports/analytics/",
            "/api/jobs/reports/analytics/?start_date=2026-01-01&end_date=2026-01-31",
            "/api/jobs/reports/analytics/?start_date=2026-01-01",
            "/api/jobs/reports/analytics/?end_date=2026-01-31",
            "/api/jobs/reports/analytics/?start_date=2020-01-01&end_date=2026-01-01",
            "/api/jobs/reports/analytics/?start_date=2000-01-01&end_date=2026-01-01",
            "/api/jobs/reports/analytics/?start_date=2026-06-01&end_date=2026-07-01",
        ]
        for path in paths:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertLess(response.status_code, 500, f"{path} returned {response.status_code}")

    def test_reports_survive_degenerate_filter_values(self):
        self.client.force_authenticate(user=self.admin)
        paths = [
            "/api/jobs/reports/attachees/?department=ALL&status=ALL",
            "/api/jobs/reports/attachees/?department=999999&status=ALL",
            "/api/jobs/reports/attachees/?status=NOT_A_STATUS",
            "/api/jobs/reports/attachees/?start_date=2026-01-01",
            "/api/jobs/reports/export-csv/?report_type=unknown_report",
            "/api/jobs/archives/?type=NOT_A_TYPE",
            "/api/jobs/archives/?date_from=not-a-date",
            "/api/jobs/archives/?search=%27%20OR%201%3D1--",
        ]
        for path in paths:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertLess(response.status_code, 500, f"{path} returned {response.status_code}")

    def test_public_endpoints_do_not_crash_for_anonymous_users(self):
        self.client.force_authenticate(user=None)
        for path in ["/api/jobs/vacancies/public/", "/api/jobs/eligibility-settings/"]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertLess(response.status_code, 500, f"{path} returned {response.status_code}")

    def test_ats_scoring_endpoints_do_not_crash(self):
        self.client.force_authenticate(user=self.admin)
        for path in ["/api/jobs/ats-scoring-configuration/"]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertLess(response.status_code, 500, f"{path} returned {response.status_code}")

    def test_the_masking_receiver_is_still_disconnected_at_runtime(self):
        """Guards the workaround itself.

        If Django's template-store receiver is connected when tests actually
        run, every genuine 500 is reported as an unrelated copy() AttributeError
        and becomes undiagnosable.
        """
        from django.test.client import store_rendered_templates
        from django.test.signals import template_rendered

        connected = [
            ref() for _, ref in template_rendered.receivers
            if callable(ref) and getattr(ref(), "__name__", "") == "store_rendered_templates"
        ]
        self.assertEqual(
            connected, [],
            "store_rendered_templates is connected at runtime; 500 tracebacks "
            "will be masked on Python 3.14",
        )
