"""
Tests for the no-backdated-start rule.

A start date that is already in the past silently corrupts duration reporting
and can place a deployment before the requisition that funded it, so the three
places that record a beginning — profile ``joining_date``, requisition
``duration_start`` and deployment ``start_date`` — all refuse it.

The rule has one deliberate subtlety that these tests pin down: a record that
predates the rule keeps its stored date. Resubmitting that same date is not
new backdating and must not lock the holder out of editing an unrelated field.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.date_rules import (
    backdated_error,
    changed_to_backdated,
    earliest_allowed_date,
    is_backdated,
)
from jobs.models import (
    Application,
    Department,
    Deployment,
    Job,
    Requisition,
)
from jobs.serializers import RequisitionSerializer

User = get_user_model()

# Two days back, so it is unambiguously past even with the one-day skew
# tolerance that lets a genuine "today" through in any timezone.
PAST = timezone.localdate() - timedelta(days=2)
FUTURE = timezone.localdate() + timedelta(days=30)


class DateRuleUnitTests(APITestCase):
    """The shared rule itself, independent of any serializer."""

    def test_today_is_not_backdated(self):
        self.assertFalse(is_backdated(timezone.localdate()))

    def test_future_is_not_backdated(self):
        self.assertFalse(is_backdated(FUTURE))

    def test_past_is_backdated(self):
        self.assertTrue(is_backdated(PAST))

    def test_missing_and_blank_values_are_not_backdated(self):
        # A blank value is "missing", not "past". Field-level required
        # validation owns that message; this rule stays silent so the user is
        # never told a date is in the past when it is simply absent.
        self.assertFalse(is_backdated(None))
        self.assertFalse(is_backdated(""))

    def test_one_day_of_skew_tolerance_admits_yesterday(self):
        # A user in a timezone ahead of the server may legitimately believe
        # "today" is the server's yesterday. That must not be rejected.
        yesterday = timezone.localdate() - timedelta(days=1)
        self.assertEqual(earliest_allowed_date(), yesterday)
        self.assertFalse(is_backdated(yesterday))

    def test_error_message_names_the_field_and_the_earliest_allowed_date(self):
        message = backdated_error("Start date")
        self.assertIn("Start date", message)
        self.assertIn(
            earliest_allowed_date().strftime("%d %B %Y"), message
        )

    def test_unchanged_past_date_is_not_treated_as_new_backdating(self):
        # The escape hatch for records created before the rule existed.
        self.assertFalse(changed_to_backdated(PAST, PAST))

    def test_changing_to_a_new_past_date_is_still_refused(self):
        self.assertTrue(changed_to_backdated(FUTURE, PAST))

    def test_changing_to_a_future_date_is_allowed(self):
        self.assertFalse(changed_to_backdated(PAST, FUTURE))


class RequisitionStartDateTests(APITestCase):
    def setUp(self):
        self.hr = User.objects.create_user(
            username="hr_start", password="pw", role="HR", email="hr_start@example.com"
        )
        self.director = User.objects.create_user(
            username="dir_start", password="pw", role="DEPARTMENT_DIRECTOR", email="dir_start@example.com"
        )
        self.department = Department.objects.create(name="Ops Start")
        # A Director's department is resolved server-side from the user record,
        # so the requisition tests must bind it there rather than on the profile.
        self.director.department = self.department
        self.director.save()

    def _payload(self, start):
        return {
            "department": self.department.id,
            "num_candidates_requested": 2,
            "duration_start": start.isoformat(),
            "duration_end": (start + timedelta(days=90)).isoformat(),
            "requirements": "Cover letter",
            "justification": "Backfill",
        }

    def test_backdated_start_is_rejected(self):
        self.client.force_authenticate(self.director)
        response = self.client.post(
            reverse("requisition-list"), self._payload(PAST), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("duration_start", response.data)
        self.assertIn("Start date", str(response.data["duration_start"][0]))

    def test_future_start_is_accepted(self):
        self.client.force_authenticate(self.director)
        response = self.client.post(
            reverse("requisition-list"), self._payload(FUTURE), format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            Requisition.objects.get().duration_start, FUTURE
        )

    def test_existing_legacy_past_start_survives_its_own_validation(self):
        # RequisitionDetailView is retrieve-only, so this exercises the
        # serializer directly. A requisition created before the rule existed
        # must remain representable rather than failing its own validation.
        legacy = Requisition.objects.create(
            department=self.department,
            requested_by=self.director,
            num_candidates_requested=2,
            duration_start=PAST,
            duration_end=PAST + timedelta(days=90),
            requirements="Cover letter",
            justification="Backfill",
        )
        data = RequisitionSerializer(instance=legacy).data
        self.assertEqual(data["duration_start"], PAST.isoformat())

    def test_moving_a_legacy_start_to_a_new_past_date_is_rejected(self):
        # Guards the future case where a write route is added to this view: the
        # rule must not become a blanket ban on records that predate it.
        legacy = Requisition.objects.create(
            department=self.department,
            requested_by=self.director,
            num_candidates_requested=2,
            duration_start=PAST,
            duration_end=PAST + timedelta(days=90),
            requirements="Cover letter",
            justification="Backfill",
        )
        serializer = RequisitionSerializer(
            instance=legacy,
            data={"duration_start": (PAST - timedelta(days=10)).isoformat()},
            partial=True,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("duration_start", serializer.errors)

    def test_applying_for_a_role_where_a_candidate_cannot_submit_requisitions(self):
        # Confirms the 403 in the backdating test is a permission outcome, not
        # the date rule firing early: the rejection above is genuinely 400.
        applicant = User.objects.create_user(
            username="req_applicant", password="pw", role="STUDENT", email="req_applicant@example.com"
        )
        self.client.force_authenticate(applicant)
        response = self.client.post(
            reverse("requisition-list"), self._payload(PAST), format="json"
        )
        self.assertEqual(response.status_code, 403)


class ProfileJoiningDateTests(APITestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            username="student_start", password="pw", role="STUDENT", email="student_start@example.com"
        )

    def test_backdated_joining_date_is_rejected(self):
        self.client.force_authenticate(self.student)
        response = self.client.patch(
            reverse("profile-detail"),
            {"joining_date": PAST.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("joining_date", response.data)
        self.assertIn(
            "Intended attachment start date",
            str(response.data["joining_date"][0]),
        )

    def test_future_joining_date_is_accepted(self):
        self.client.force_authenticate(self.student)
        response = self.client.patch(
            reverse("profile-detail"),
            {"joining_date": FUTURE.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.student.profile.refresh_from_db()
        self.assertEqual(self.student.profile.joining_date, FUTURE)

    def test_legacy_past_joining_date_can_still_be_resubmitted_unchanged(self):
        profile = self.student.profile
        profile.joining_date = PAST
        profile.save()

        self.client.force_authenticate(self.student)
        response = self.client.patch(
            reverse("profile-detail"),
            {"joining_date": PAST.isoformat(), "gender": "F"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        self.assertEqual(profile.joining_date, PAST)
        self.assertEqual(profile.gender, "F")

    def test_editing_other_fields_ignores_a_legacy_past_joining_date(self):
        # The field is not in the payload at all, so no comparison happens and
        # the student is not locked out.
        profile = self.student.profile
        profile.joining_date = PAST
        profile.save()

        self.client.force_authenticate(self.student)
        response = self.client.patch(
            reverse("profile-detail"),
            {"institution_name": "University of Tests"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)


class DeploymentStartDateTests(APITestCase):
    def setUp(self):
        self.hr = User.objects.create_user(
            username="hr_dep", password="pw", role="HR", email="hr_dep@example.com"
        )
        self.department = Department.objects.create(name="Field Ops")
        self.job = Job.objects.create(
            title="Field Tech",
            department=self.department,
            slots_required=2,
            duration_weeks=12,
            job_type="ATTACHMENT",
            deadline=timezone.now() + timedelta(days=30),
            is_active=True,
        )
        self.applicant = User.objects.create_user(
            username="dep_applicant", password="pw", role="STUDENT", email="dep_applicant@example.com"
        )
        self.application = Application.objects.create(
            user=self.applicant,
            job=self.job,
            status="SUCCESSFUL",
        )

    def _payload(self, start):
        return {
            "application": self.application.id,
            "department": self.department.id,
            "start_date": start.isoformat(),
            "planned_end_date": (start + timedelta(days=90)).isoformat(),
        }

    def test_backdated_start_is_rejected(self):
        self.client.force_authenticate(self.hr)
        response = self.client.post(
            reverse("deployment-list"), self._payload(PAST), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("start_date", response.data)
        self.assertIn("Start date", str(response.data["start_date"][0]))
        self.assertEqual(Deployment.objects.count(), 0)

    def test_future_start_is_accepted(self):
        self.client.force_authenticate(self.hr)
        response = self.client.post(
            reverse("deployment-list"), self._payload(FUTURE), format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Deployment.objects.get().start_date, FUTURE)

    def test_status_update_keeps_the_start_date_already_accepted(self):
        # Recording a deployment is the moment the start date becomes
        # meaningful. A later clearance or status change must not re-litigate it.
        self.client.force_authenticate(self.hr)
        created = self.client.post(
            reverse("deployment-list"), self._payload(FUTURE), format="json"
        )
        self.assertEqual(created.status_code, 201, created.data)

        response = self.client.patch(
            reverse("deployment-detail", args=[created.data["id"]]),
            {"status": "EXITED"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_legacy_past_start_can_still_be_resubmitted_unchanged(self):
        legacy = Deployment.objects.create(
            application=self.application,
            department=self.department,
            start_date=PAST,
            planned_end_date=PAST + timedelta(days=90),
            created_by=self.hr,
        )
        self.client.force_authenticate(self.hr)
        response = self.client.patch(
            reverse("deployment-detail", args=[legacy.id]),
            {"status": "EXITED"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
