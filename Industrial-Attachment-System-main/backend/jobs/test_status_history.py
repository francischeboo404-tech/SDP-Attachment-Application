"""
Tests for the persisted application status history.

The applicant's "step by step" tracking depends on these events surviving a
refresh, on the endpoint appending exactly one per real transition, and on the
API returning the trail. Each of those is a distinct way the feature can
silently stop working, so each is asserted separately.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Document, User
from jobs.models import Application, ApplicationStatusEvent, Department, Job
from jobs.views import REQUIRED_DOCUMENTS

STATUS_URL = "/api/jobs/applications/{pk}/status/"


class StatusHistoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.department = Department.objects.create(name="History Department")
        self.job = Job.objects.create(
            department=self.department,
            title="Geology Attachee",
            description="Field mapping",
            requirements="geology mapping",
            location="Nairobi",
            slots_required=2,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )
        self.applicant = User.objects.create_user(
            username="hist_applicant",
            email="hist@uni.ac.ke",
            password="Pass!2026",
            role="APPLICANT",
        )
        self.hr = User.objects.create_user(
            username="hist_hr",
            email="hist_hr@petroleum.go.ke",
            password="Pass!2026",
            role="HR",
        )
        self.application = Application.objects.create(
            user=self.applicant, job=self.job, status="PENDING"
        )

    def _decide(self, new_status):
        self.client.force_authenticate(user=self.hr)
        return self.client.patch(
            STATUS_URL.format(pk=self.application.pk),
            {"status": new_status},
            format="json",
        )

    def test_a_new_application_starts_with_a_submitted_event(self):
        # The applicant's own submission is the first step of their journey.
        ApplicationStatusEvent.objects.create(
            application=self.application,
            from_status="",
            to_status="PENDING",
            note="Application submitted",
        )
        self.assertEqual(self.application.status_events.count(), 1)

    def test_a_decision_appends_exactly_one_event(self):
        res = self._decide("SUCCESSFUL")
        self.assertEqual(res.status_code, 200)
        events = list(self.application.status_events.all())
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].from_status, "PENDING")
        self.assertEqual(events[0].to_status, "SUCCESSFUL")
        self.assertEqual(events[0].changed_by, self.hr)

    def test_repeated_identical_statuses_do_not_pad_the_timeline(self):
        # Re-saving the same status is not a new step. Without this guard the
        # applicant's history would fill with duplicates on every re-save.
        self._decide("SUCCESSFUL")
        self._decide("SUCCESSFUL")
        self.assertEqual(
            self.application.status_events.filter(to_status="SUCCESSFUL").count(), 1
        )

    def test_a_reversal_is_recorded_rather_than_erased(self):
        # History is append-only: correcting a decision adds a step, so the
        # earlier decision is still visible and auditable.
        self._decide("REJECTED")
        self._decide("SUCCESSFUL")
        trail = [e.to_status for e in self.application.status_events.all()]
        self.assertEqual(trail, ["REJECTED", "SUCCESSFUL"])
        # The view works on its own instance, so the one held by the test is
        # stale and must be re-read rather than assumed.
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, "SUCCESSFUL")

    def test_events_are_ordered_oldest_first(self):
        self._decide("REVIEWED")
        self._decide("SUCCESSFUL")
        stamps = [e.created_at for e in self.application.status_events.all()]
        self.assertEqual(stamps, sorted(stamps))

    def test_the_api_returns_the_history_to_the_applicant(self):
        self._decide("SUCCESSFUL")
        self.client.force_authenticate(user=self.applicant)
        res = self.client.get(f"/api/jobs/applications/{self.application.pk}/")
        self.assertEqual(res.status_code, 200)
        history = res.data["status_history"]
        self.assertTrue(history, "the applicant must always receive a timeline")
        self.assertEqual(history[-1]["to_status"], "SUCCESSFUL")
        self.assertEqual(history[-1]["changed_by"], "hist_hr")
        self.assertIsNotNone(history[-1]["created_at"])

    def test_an_application_with_no_events_still_returns_a_timeline(self):
        # Legacy row created before the feature existed: the serializer must
        # synthesise a single submitted step rather than return an empty list,
        # which the applicant would read as "nothing has happened yet".
        self.assertEqual(self.application.status_events.count(), 0)
        self.client.force_authenticate(user=self.applicant)
        res = self.client.get(f"/api/jobs/applications/{self.application.pk}/")
        history = res.data["status_history"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["to_status"], "PENDING")
        self.assertEqual(history[0]["created_at"], self.application.applied_at)

    def test_history_survives_a_fresh_read_after_a_reload(self):
        # The persistence guarantee: the trail is in the database, not in page
        # state, so re-fetching returns the same steps.
        self._decide("REJECTED")
        self._decide("SUCCESSFUL")
        self.client.force_authenticate(user=self.applicant)
        first = self.client.get(f"/api/jobs/applications/{self.application.pk}/").data
        second = self.client.get(f"/api/jobs/applications/{self.application.pk}/").data
        self.assertEqual(
            [e["to_status"] for e in first["status_history"]],
            [e["to_status"] for e in second["status_history"]],
        )
        self.assertEqual(
            [e["to_status"] for e in second["status_history"]],
            ["REJECTED", "SUCCESSFUL"],
        )

    def test_applying_records_a_submitted_event(self):
        # Creating an application through the API opens the timeline, so the
        # applicant can see that their own submission was received.
        from datetime import date

        from accounts.models import Profile

        self.applicant.first_name = "Amina"
        self.applicant.last_name = "Attachee"
        self.applicant.phone_number = "0700000001"
        self.applicant.save()

        profile, _ = Profile.objects.get_or_create(user=self.applicant)
        profile.phone_number = "0700000002"
        profile.id_number = "12345678"
        profile.dob = date(2002, 1, 1)
        profile.gender = "MALE"
        profile.nationality = "Kenyan"
        profile.postal_address = "Nairobi"
        profile.institution_name = "University of Nairobi"
        profile.qualification = "BSc Geology"
        profile.field_of_study = "Earth Sciences"
        profile.joining_date = date(2026, 5, 1)
        profile.next_of_kin_name = "Jane Kin"
        profile.next_of_kin_phone = "0700000000"
        profile.save()

        # `get_or_create(user=...)` caches the reverse relation on the User
        # instance, and the view reads `request.user.profile`. Without dropping
        # that cache the view would see the empty profile created by the
        # registration signal. A real request loads request.user fresh, so this
        # is a test-fixture artifact rather than a production defect.
        self.applicant.refresh_from_db()

        for document_type in REQUIRED_DOCUMENTS:
            Document.objects.create(
                user=self.applicant, document_type=document_type, file="f.pdf"
            )

        # A second vacancy, so the fixture application does not trip the
        # one-application-per-vacancy constraint.
        job2 = Job.objects.create(
            department=self.department,
            title="Petroleum Engineering Attachee",
            description="Field support",
            requirements="petroleum engineering",
            location="Nairobi",
            slots_required=1,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )

        self.client.force_authenticate(user=self.applicant)
        res = self.client.post(
            "/api/jobs/applications/",
            {"job": job2.pk, "cover_letter": "Please consider me."},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        application = Application.objects.get(pk=res.data["id"])
        events = list(application.status_events.all())
        self.assertTrue(events, "a new application must record its submission")
        self.assertEqual(events[0].to_status, "PENDING")
        self.assertEqual(events[0].note, "Application submitted")
