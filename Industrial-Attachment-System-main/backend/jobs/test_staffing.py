"""
Tests for the department staffing aggregation.

The Staffing Overview is the surface a manager reads to decide whether a
directorate has room, so two properties matter more than anything else here:
the deployment count must use a status that actually exists, and the fill rate
must divide by advertised capacity rather than by a hand-edited figure. Both
were wrong before this module existed, and both are pinned down below.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from jobs.models import (
    Application,
    Clearance,
    Department,
    Deployment,
    Job,
    Requisition,
)
from jobs.staffing import (
    CLEARANCE_PENDING_STATUSES,
    clearance_bucket_counts,
    department_staffing_rows,
    staffing_summary,
)

User = get_user_model()

STAFFING_ENDPOINT = "/api/jobs/staffing/"


class StaffingFixtureMixin:
    """Two departments with deliberately different shapes."""

    def setUp(self):
        self.dept_open = Department.objects.create(name="Open Directorate")
        self.dept_idle = Department.objects.create(name="Idle Directorate")

        self.job = Job.objects.create(
            title="Geophysics Attachee",
            department=self.dept_open,
            description="d",
            requirements="r",
            location="Nairobi",
            slots_required=4,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=60),
        )

        self.applicant = User.objects.create_user(
            username="staff_applicant",
            email="staff_applicant@uni.ac.ke",
            password="pw",
            role="APPLICANT",
        )
        self.application = Application.objects.create(
            user=self.applicant, job=self.job, status="SUCCESSFUL"
        )

    def _deploy(self, department, status, applicant_username):
        applicant = User.objects.create_user(
            username=applicant_username,
            email=f"{applicant_username}@uni.ac.ke",
            password="pw",
            role="APPLICANT",
        )
        application = Application.objects.create(
            user=applicant, job=self.job, status="SUCCESSFUL"
        )
        return Deployment.objects.create(
            application=application,
            department=department,
            start_date=timezone.localdate() + timedelta(days=7),
            planned_end_date=timezone.localdate() + timedelta(days=97),
            status=status,
        )


class DepartmentStaffingRowTests(StaffingFixtureMixin, TestCase):
    def _row(self, department):
        return next(
            r for r in department_staffing_rows() if r["department_id"] == department.id
        )

    def test_capacity_comes_from_open_vacancy_slots_not_intake_capacity(self):
        """
        The regression that mattered. Capacity is the sum of slots_required over
        open vacancies. Using typical_intake_capacity reported slots for a
        department that had advertised nothing.
        """
        self.dept_idle.typical_intake_capacity = 50
        self.dept_idle.save()

        self.assertEqual(self._row(self.dept_open)["capacity"], 4)
        self.assertEqual(self._row(self.dept_idle)["capacity"], 0)

    def test_a_department_with_no_open_vacancies_reports_no_fill_rate(self):
        """
        None, not 0. "0% full" would imply unfilled slots that were never
        posted; the caller renders this as "no open vacancies".
        """
        self.assertIsNone(self._row(self.dept_idle)["fill_rate"])
        self.assertEqual(self._row(self.dept_idle)["headroom"], 0)

    def test_fill_rate_is_filled_over_capacity(self):
        row = self._row(self.dept_open)
        self.assertEqual(row["filled"], 1)
        self.assertEqual(row["capacity"], 4)
        self.assertEqual(row["fill_rate"], 25)
        self.assertEqual(row["headroom"], 3)

    def test_active_deployments_count_the_real_deployment_status(self):
        """
        The other regression. The Overview counted status "ACTIVE", which is not
        in Deployment.STATUS_CHOICES, so this figure was always zero.
        """
        self._deploy(self.dept_open, "DEPLOYED", "deployed_user")
        self._deploy(self.dept_open, "EXITED", "exited_user")

        self.assertEqual(self._row(self.dept_open)["active_deployments"], 1)
        self.assertEqual(self._row(self.dept_open)["completed_deployments"], 1)

    def test_a_concluded_deployment_is_not_counted_as_active(self):
        self._deploy(self.dept_idle, "EXITED", "only_exited")
        self.assertEqual(self._row(self.dept_idle)["active_deployments"], 0)
        self.assertEqual(self._row(self.dept_idle)["completed_deployments"], 1)

    def test_an_archived_vacancy_is_excluded_from_capacity(self):
        self.job.is_archived = True
        self.job.save()
        row = self._row(self.dept_open)
        self.assertEqual(row["capacity"], 0)
        self.assertEqual(row["open_vacancies"], 0)

    def test_an_archived_vacancy_does_not_leave_filled_hanging_over_zero_capacity(self):
        """
        Capacity and filled must describe the same set of vacancies.

        Counting the success against an archived vacancy while taking capacity
        from open ones only left filled=1, capacity=0, which reads as a 100%
        fill rate for a department advertising nothing.
        """
        self.job.is_archived = True
        self.job.save()
        row = self._row(self.dept_open)
        self.assertEqual(row["filled"], 0)
        self.assertIsNone(row["fill_rate"])

    def test_an_inactive_vacancy_is_excluded_from_capacity(self):
        self.job.is_active = False
        self.job.save()
        self.assertEqual(self._row(self.dept_open)["capacity"], 0)

    def test_headroom_never_goes_negative(self):
        # Over-subscribed: more successful applications than advertised slots.
        second = User.objects.create_user(
            username="over_subscribed",
            email="over@uni.ac.ke",
            password="pw",
            role="APPLICANT",
        )
        Application.objects.create(
            user=second, job=self.job, status="SUCCESSFUL"
        )
        row = self._row(self.dept_open)
        self.assertEqual(row["filled"], 2)
        self.assertEqual(row["fill_rate"], 50)
        self.assertEqual(row["headroom"], 2, "must not render a negative bar")

    def test_an_over_capacity_department_caps_its_fill_rate_at_100(self):
        for i in range(6):
            user = User.objects.create_user(
                username=f"bulk_applicant_{i}",
                email=f"bulk{i}@uni.ac.ke",
                password="pw",
                role="APPLICANT",
            )
            Application.objects.create(user=user, job=self.job, status="SUCCESSFUL")
        self.assertEqual(self._row(self.dept_open)["fill_rate"], 100)

    def test_requisition_buckets_separate_pending_from_approved(self):
        Requisition.objects.create(
            department=self.dept_open,
            requested_by=self.applicant,
            num_candidates_requested=2,
            duration_start=timezone.localdate() + timedelta(days=30),
            duration_end=timezone.localdate() + timedelta(days=120),
            status="PENDING",
        )
        Requisition.objects.create(
            department=self.dept_open,
            requested_by=self.applicant,
            num_candidates_requested=3,
            duration_start=timezone.localdate() + timedelta(days=30),
            duration_end=timezone.localdate() + timedelta(days=120),
            status="APPROVED",
        )
        Requisition.objects.create(
            department=self.dept_open,
            requested_by=self.applicant,
            num_candidates_requested=1,
            duration_start=timezone.localdate() + timedelta(days=30),
            duration_end=timezone.localdate() + timedelta(days=120),
            status="REJECTED",
        )
        row = self._row(self.dept_open)
        self.assertEqual(row["pending_requisitions"], 1)
        self.assertEqual(row["approved_requisitions"], 1)
        self.assertEqual(row["rejected_requisitions"], 1)
        self.assertEqual(row["total_requisitions"], 3)

    def test_a_rejected_requisition_is_not_reported_as_outstanding_work(self):
        """
        "Pending" is the PENDING status and nothing else. Deriving it as
        total - approved swept up rejected requisitions, so a declined request
        stayed on the board looking like a live request.
        """
        Requisition.objects.create(
            department=self.dept_open,
            requested_by=self.applicant,
            num_candidates_requested=1,
            duration_start=timezone.localdate() + timedelta(days=30),
            duration_end=timezone.localdate() + timedelta(days=120),
            status="REJECTED",
        )
        self.assertEqual(self._row(self.dept_open)["pending_requisitions"], 0)
        self.assertEqual(self._row(self.dept_open)["total_requisitions"], 1)

    def test_every_requested_department_appears_even_with_no_records(self):
        # An idle department must still be listed; omitting it would hide the
        # departments that most need attention.
        names = {r["department_name"] for r in department_staffing_rows()}
        self.assertIn("Open Directorate", names)
        self.assertIn("Idle Directorate", names)

    def test_the_query_count_does_not_grow_with_the_number_of_departments(self):
        """
        The whole table is a fixed number of grouped aggregates: one department
        list plus five grouped counts, with all per-row arithmetic done in
        Python from those rows. Adding departments must not add queries, which
        is what a per-department loop in the client or the view would do.
        """
        with self.assertNumQueries(9):
            department_staffing_rows()

        for i in range(12):
            Department.objects.create(name=f"Extra {i}")

        with self.assertNumQueries(9):
            rows = department_staffing_rows()

        self.assertEqual(len(rows), 14)


class StaffingSummaryTests(StaffingFixtureMixin, TestCase):
    def test_summary_totals_agree_with_the_rows_they_summarise(self):
        self._deploy(self.dept_open, "DEPLOYED", "deployed_user")
        rows = department_staffing_rows()
        summary = staffing_summary()

        self.assertEqual(summary["total_capacity"], sum(r["capacity"] for r in rows))
        self.assertEqual(summary["total_filled"], sum(r["filled"] for r in rows))
        self.assertEqual(
            summary["active_deployments"], sum(r["active_deployments"] for r in rows)
        )
        self.assertEqual(
            summary["completed_deployments"],
            sum(r["completed_deployments"] for r in rows),
        )
        self.assertEqual(summary["departments"], len(rows))

    def test_summary_fill_rate_is_none_when_nothing_is_advertised(self):
        self.job.is_active = False
        self.job.save()
        self.assertIsNone(staffing_summary()["fill_rate"])

    def test_scoping_to_one_department_hides_the_other(self):
        self._deploy(self.dept_idle, "DEPLOYED", "idle_deployed")
        summary = staffing_summary([self.dept_idle.id])
        self.assertEqual(summary["active_deployments"], 1)
        self.assertEqual(summary["total_capacity"], 0)


class ClearanceBucketTests(StaffingFixtureMixin, TestCase):
    def test_both_pending_stages_count_as_pending(self):
        """
        Clearance is a two-stage flow. Counting only one stage understates the
        queue; the previous client code counted a status string
        ("PENDING_HR_REVIEW") that does not exist and so reported zero.
        """
        deployment = self._deploy(self.dept_open, "DEPLOYED", "clearance_user")
        Clearance.objects.create(deployment=deployment, status="PENDING_DEPARTMENT")
        second = self._deploy(self.dept_open, "DEPLOYED", "clearance_user_2")
        Clearance.objects.create(deployment=second, status="PENDING_HR")
        third = self._deploy(self.dept_open, "DEPLOYED", "clearance_user_3")
        Clearance.objects.create(deployment=third, status="CLEARED")

        buckets = clearance_bucket_counts()
        self.assertEqual(buckets["pending"], 2)
        self.assertEqual(buckets["cleared"], 1)

    def test_every_pending_status_is_a_status_the_model_actually_defines(self):
        defined = {value for value, _ in Clearance.STATUS_CHOICES}
        for status in CLEARANCE_PENDING_STATUSES:
            with self.subTest(status=status):
                self.assertIn(status, defined)


class DepartmentStaffingEndpointTests(StaffingFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.hr = User.objects.create_user(
            username="staffing_hr",
            email="staffing_hr@petroleum.go.ke",
            password="pw",
            role="HR",
        )

    def test_hr_sees_every_department(self):
        self.client.force_authenticate(self.hr)
        response = self.client.get(STAFFING_ENDPOINT)
        self.assertEqual(response.status_code, 200)
        names = {d["department_name"] for d in response.data["departments"]}
        self.assertEqual(names, {"Open Directorate", "Idle Directorate"})

    def test_a_director_only_sees_their_own_department(self):
        director = User.objects.create_user(
            username="staffing_director",
            email="staffing_director@petroleum.go.ke",
            password="pw",
            role="DEPARTMENT_DIRECTOR",
        )
        # The department is resolved server-side from the user record.
        director.department = self.dept_open
        director.save()

        self.client.force_authenticate(director)
        response = self.client.get(STAFFING_ENDPOINT)
        self.assertEqual(response.status_code, 200)
        names = {d["department_name"] for d in response.data["departments"]}
        self.assertEqual(names, {"Open Directorate"})
        self.assertTrue(response.data["scoped_to_department"])

    def test_a_director_with_no_department_gets_an_empty_payload_not_everyones(self):
        director = User.objects.create_user(
            username="staffing_director_orphan",
            email="orphan@petroleum.go.ke",
            password="pw",
            role="DEPARTMENT_DIRECTOR",
        )
        self.client.force_authenticate(director)
        response = self.client.get(STAFFING_ENDPOINT)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["departments"], [])

    def test_an_applicant_is_refused(self):
        self.client.force_authenticate(self.applicant)
        self.assertEqual(self.client.get(STAFFING_ENDPOINT).status_code, 403)

    def test_anonymous_access_is_refused(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(STAFFING_ENDPOINT).status_code, 401)

    def test_the_response_agrees_with_the_aggregation_helper(self):
        self._deploy(self.dept_open, "DEPLOYED", "endpoint_deployed")
        self.client.force_authenticate(self.hr)
        response = self.client.get(STAFFING_ENDPOINT)
        self.assertEqual(response.data["departments"], department_staffing_rows())
        self.assertEqual(response.data["summary"], staffing_summary())

    def test_capacity_survives_the_round_trip_to_the_client(self):
        self.client.force_authenticate(self.hr)
        response = self.client.get(STAFFING_ENDPOINT)
        row = next(
            d for d in response.data["departments"] if d["department_name"] == "Open Directorate"
        )
        self.assertEqual(row["capacity"], 4)
        self.assertEqual(row["fill_rate"], 25)
        self.assertEqual(row["active_deployments"], 0)
