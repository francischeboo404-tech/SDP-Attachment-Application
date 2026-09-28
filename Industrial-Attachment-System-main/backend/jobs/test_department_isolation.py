"""
Cross-department data isolation tests.

Every endpoint that a DEPARTMENT_DIRECTOR (or DEPARTMENT) role can reach is
exercised here from two departments, X and Y, and asserted to satisfy all three
requirements:

  1. Y's data never appears in a list endpoint's payload for X's director.
  2. Direct ID access to Y's record is denied (403 or 404, per endpoint).
  3. A director who deliberately crafts a request specifying department Y is
     rejected, and can never widen their own scope.

The same tests assert that ADMIN and HR keep their cross-department reach, so
scoping the Director role can never silently become scoping everyone.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
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

User = get_user_model()


def results_of(response):
    """Normalise a DRF list response (paginated or not) to a plain list."""
    data = response.data
    if isinstance(data, dict):
        return data.get("results", [])
    return data if isinstance(data, list) else []


class DepartmentIsolationTestBase(TestCase):
    """Two fully populated departments, X and Y, each with their own director."""

    def setUp(self):
        cache.clear()  # keep throttle counters from leaking between tests
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username="iso_admin", email="iso_admin@petroleum.go.ke",
            password="Password123!", role="ADMIN",
        )
        self.hr = User.objects.create_user(
            username="iso_hr", email="iso_hr@petroleum.go.ke",
            password="Password123!", role="HR",
        )
        self.applicant = User.objects.create_user(
            username="iso_applicant", email="iso_applicant@uni.ac.ke",
            password="Password123!", first_name="Nosy", last_name="Applicant",
            role="APPLICANT",
        )

        # ── Department X ────────────────────────────────────────────────
        self.dept_x = Department.objects.create(
            name="Directorate X", description="Department X operations",
            contact_email="x@petroleum.go.ke", typical_intake_capacity=5,
            is_active=True,
        )
        self.director_x = User.objects.create_user(
            username="iso_dir_x", email="iso_dir_x@petroleum.go.ke",
            password="Password123!", first_name="Xavier", last_name="Director",
            role="DEPARTMENT_DIRECTOR", department=self.dept_x,
        )
        self.dept_x.director = self.director_x
        self.dept_x.save()

        # ── Department Y ────────────────────────────────────────────────
        self.dept_y = Department.objects.create(
            name="Directorate Y", description="Department Y operations",
            contact_email="y@petroleum.go.ke", typical_intake_capacity=7,
            is_active=True,
        )
        self.director_y = User.objects.create_user(
            username="iso_dir_y", email="iso_dir_y@petroleum.go.ke",
            password="Password123!", first_name="Yvonne", last_name="Director",
            role="DEPARTMENT_DIRECTOR", department=self.dept_y,
        )
        self.dept_y.director = self.director_y
        self.dept_y.save()

        # ── X's operational records ─────────────────────────────────────
        self.job_x = Job.objects.create(
            department=self.dept_x, title="X Geologist Attachee",
            description="X work", requirements="Geology", job_type="ATTACHMENT",
            location="Nairobi", slots_required=2, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30), is_active=True,
        )
        self.applicant_x = User.objects.create_user(
            username="iso_attachee_x", email="attachee_x@uni.ac.ke",
            password="Password123!", first_name="Xavierina", last_name="AttacheeX",
            role="APPLICANT",
        )
        self.app_x = Application.objects.create(
            user=self.applicant_x, job=self.job_x, status="SUCCESSFUL",
            ats_score=88.50,
        )
        self.deployment_x = Deployment.objects.create(
            application=self.app_x, department=self.dept_x,
            start_date=timezone.now().date() - timedelta(days=30),
            planned_end_date=timezone.now().date() + timedelta(days=54),
            status="DEPLOYED", created_by=self.hr,
        )
        self.clearance_x = Clearance.objects.create(
            deployment=self.deployment_x, application=self.app_x,
            status="PENDING_DEPARTMENT",
        )
        self.requisition_x = Requisition.objects.create(
            department=self.dept_x, requested_by=self.director_x,
            num_candidates_requested=2, duration_start=timezone.now().date(),
            duration_end=timezone.now().date() + timedelta(days=90),
            requirements="X requirements", status="PENDING",
        )
        self.archived_job_x = Job.objects.create(
            department=self.dept_x, title="X Archived Vacancy",
            description="Closed", requirements="Geology", job_type="ATTACHMENT",
            location="Nairobi", slots_required=1,
            deadline=timezone.now() - timedelta(days=90),
            is_active=False, is_archived=True, archived_at=timezone.now(),
        )
        self.archived_app_x = Application.objects.create(
            user=self.applicant_x, job=self.archived_job_x, status="REJECTED",
            is_archived=True, archived_at=timezone.now(),
        )

        # ── Y's operational records ─────────────────────────────────────
        self.job_y = Job.objects.create(
            department=self.dept_y, title="Y Solar Attachee",
            description="Y work", requirements="Physics", job_type="ATTACHMENT",
            location="Nairobi", slots_required=3, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30), is_active=True,
        )
        self.applicant_y = User.objects.create_user(
            username="iso_attachee_y", email="attachee_y@uni.ac.ke",
            password="Password123!", first_name="Yolanda", last_name="AttacheeY",
            role="APPLICANT",
        )
        self.app_y = Application.objects.create(
            user=self.applicant_y, job=self.job_y, status="SUCCESSFUL",
            ats_score=71.25,
        )
        self.deployment_y = Deployment.objects.create(
            application=self.app_y, department=self.dept_y,
            start_date=timezone.now().date() - timedelta(days=20),
            planned_end_date=timezone.now().date() + timedelta(days=64),
            status="DEPLOYED", created_by=self.hr,
        )
        self.clearance_y = Clearance.objects.create(
            deployment=self.deployment_y, application=self.app_y,
            status="PENDING_DEPARTMENT",
        )
        self.requisition_y = Requisition.objects.create(
            department=self.dept_y, requested_by=self.director_y,
            num_candidates_requested=4, duration_start=timezone.now().date(),
            duration_end=timezone.now().date() + timedelta(days=90),
            requirements="Y requirements", status="PENDING",
        )
        self.archived_job_y = Job.objects.create(
            department=self.dept_y, title="Y Archived Vacancy",
            description="Closed", requirements="Physics", job_type="ATTACHMENT",
            location="Nairobi", slots_required=1,
            deadline=timezone.now() - timedelta(days=90),
            is_active=False, is_archived=True, archived_at=timezone.now(),
        )
        self.archived_app_y = Application.objects.create(
            user=self.applicant_y, job=self.archived_job_y, status="REJECTED",
            is_archived=True, archived_at=timezone.now(),
        )

        # A second, unassigned director — proves scope is derived from the
        # account and that "no department" yields empty, not everything.
        self.director_unassigned = User.objects.create_user(
            username="iso_dir_none", email="iso_dir_none@petroleum.go.ke",
            password="Password123!", role="DEPARTMENT_DIRECTOR",
        )

    def as_x(self):
        self.client.force_authenticate(user=self.director_x)

    def as_y(self):
        self.client.force_authenticate(user=self.director_y)

    def as_hr(self):
        self.client.force_authenticate(user=self.hr)

    def as_admin(self):
        self.client.force_authenticate(user=self.admin)

    def as_applicant(self):
        self.client.force_authenticate(user=self.applicant)

    def assertNoYData(self, payload):
        """Assert that nothing belonging to department Y leaked into payload."""
        blob = str(payload)
        self.assertNotIn("attachee_y@uni.ac.ke", blob)
        self.assertNotIn("AttacheeY", blob)
        self.assertNotIn("Yolanda", blob)
        self.assertNotIn("Y Solar Attachee", blob)
        self.assertNotIn("Y Archived Vacancy", blob)
        self.assertNotIn("Y requirements", blob)
        self.assertNotIn("Directorate Y", blob)


# ---------------------------------------------------------------------------
# 2a — Department-scoped Reports
# ---------------------------------------------------------------------------

class AttacheesReportIsolationTests(DepartmentIsolationTestBase):
    endpoint = "/api/jobs/reports/attachees/"

    def test_director_sees_only_own_department_attachees(self):
        self.as_x()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        names = [row["applicant_email"] for row in res.data["attachees"]]
        self.assertIn("attachee_x@uni.ac.ke", names)
        self.assertNoYData(res.data)

    def test_director_cannot_request_another_department_by_parameter(self):
        self.as_x()
        res = self.client.get(self.endpoint, {"department": self.dept_y.id})
        self.assertEqual(res.status_code, 403)
        self.assertNoYData(res.data)

    def test_director_passing_own_department_id_is_a_no_op(self):
        self.as_x()
        res = self.client.get(self.endpoint, {"department": self.dept_x.id})
        self.assertEqual(res.status_code, 200)
        names = [row["applicant_email"] for row in res.data["attachees"]]
        self.assertEqual(names, ["attachee_x@uni.ac.ke"])
        self.assertNoYData(res.data)

    def test_director_with_no_department_sees_nothing(self):
        self.client.force_authenticate(user=self.director_unassigned)
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["attachees"], [])
        self.assertEqual(res.data["total_count"], 0)

    def test_applicant_cannot_read_the_attachees_report(self):
        self.as_applicant()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 403)

    def test_hr_retains_cross_department_reach(self):
        self.as_hr()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        emails = [row["applicant_email"] for row in res.data["attachees"]]
        self.assertIn("attachee_x@uni.ac.ke", emails)
        self.assertIn("attachee_y@uni.ac.ke", emails)

        scoped = self.client.get(self.endpoint, {"department": self.dept_y.id})
        self.assertEqual(scoped.status_code, 200)
        self.assertEqual(
            [row["applicant_email"] for row in scoped.data["attachees"]],
            ["attachee_y@uni.ac.ke"],
        )

    def test_admin_retains_cross_department_reach(self):
        self.as_admin()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["total_count"], 2)


class FillRatesReportIsolationTests(DepartmentIsolationTestBase):
    endpoint = "/api/jobs/reports/fill-rates/"

    def test_director_sees_only_own_department_vacancies(self):
        self.as_x()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        titles = [row["title"] for row in res.data["vacancies"]]
        self.assertIn("X Geologist Attachee", titles)
        self.assertIn("X Archived Vacancy", titles)
        self.assertNoYData(res.data)

    def test_director_cannot_request_another_department_by_parameter(self):
        self.as_x()
        res = self.client.get(self.endpoint, {"department": self.dept_y.id})
        self.assertEqual(res.status_code, 403)
        self.assertNoYData(res.data)

    def test_director_with_no_department_sees_nothing(self):
        self.client.force_authenticate(user=self.director_unassigned)
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["vacancies"], [])

    def test_applicant_cannot_read_the_fill_rates_report(self):
        self.as_applicant()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 403)

    def test_hr_retains_cross_department_reach(self):
        self.as_hr()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["total_count"], 4)

        scoped = self.client.get(self.endpoint, {"department": self.dept_y.id})
        self.assertEqual(scoped.status_code, 200)
        self.assertEqual(
            sorted(row["title"] for row in scoped.data["vacancies"]),
            ["Y Archived Vacancy", "Y Solar Attachee"],
        )


class ExportCSVReportIsolationTests(DepartmentIsolationTestBase):
    def csv_text(self, res):
        return res.content.decode("utf-8")

    def test_attachees_csv_is_department_scoped(self):
        self.as_x()
        res = self.client.get("/api/jobs/reports/export-csv/", {"report_type": "attachees"})
        self.assertEqual(res.status_code, 200)
        body = self.csv_text(res)
        self.assertIn("attachee_x@uni.ac.ke", body)
        self.assertNoYData(body)

    def test_attachees_csv_rejects_foreign_department_parameter(self):
        self.as_x()
        res = self.client.get(
            "/api/jobs/reports/export-csv/",
            {"report_type": "attachees", "department": self.dept_y.id},
        )
        self.assertEqual(res.status_code, 403)
        self.assertNoYData(self.csv_text(res))

    def test_fill_rates_csv_is_department_scoped(self):
        self.as_x()
        res = self.client.get("/api/jobs/reports/export-csv/", {"report_type": "fill_rates"})
        self.assertEqual(res.status_code, 200)
        body = self.csv_text(res)
        self.assertIn("X Geologist Attachee", body)
        self.assertNoYData(body)

    def test_fill_rates_csv_rejects_foreign_department_parameter(self):
        self.as_x()
        res = self.client.get(
            "/api/jobs/reports/export-csv/",
            {"report_type": "fill_rates", "department": self.dept_y.id},
        )
        self.assertEqual(res.status_code, 403)

    def test_director_with_no_department_exports_nothing(self):
        self.client.force_authenticate(user=self.director_unassigned)
        res = self.client.get("/api/jobs/reports/export-csv/", {"report_type": "attachees"})
        self.assertEqual(res.status_code, 200)
        body = self.csv_text(res)
        self.assertIn("Total Records:  0", body)
        self.assertNoYData(body)

    def test_applicant_cannot_export_reports(self):
        self.as_applicant()
        for report_type in ("attachees", "fill_rates"):
            res = self.client.get("/api/jobs/reports/export-csv/", {"report_type": report_type})
            self.assertEqual(res.status_code, 403)

    def test_hr_export_retains_cross_department_reach(self):
        self.as_hr()
        res = self.client.get("/api/jobs/reports/export-csv/", {"report_type": "attachees"})
        self.assertEqual(res.status_code, 200)
        body = self.csv_text(res)
        self.assertIn("attachee_x@uni.ac.ke", body)
        self.assertIn("attachee_y@uni.ac.ke", body)
        self.assertIn("Total Records:  2", body)

    def test_admin_export_respects_its_own_department_filter(self):
        self.as_admin()
        res = self.client.get(
            "/api/jobs/reports/export-csv/",
            {"report_type": "attachees", "department": self.dept_x.id},
        )
        self.assertEqual(res.status_code, 200)
        body = self.csv_text(res)
        self.assertIn("attachee_x@uni.ac.ke", body)
        self.assertNotIn("attachee_y@uni.ac.ke", body)

    def test_export_honours_the_status_filter_it_previously_ignored(self):
        self.as_x()
        self.clearance_x.status = "CLEARED"
        self.clearance_x.save()
        res = self.client.get(
            "/api/jobs/reports/export-csv/",
            {"report_type": "attachees", "status": "PENDING_DEPARTMENT"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("Total Records:  0", self.csv_text(res))


class AnalyticsIsolationTests(DepartmentIsolationTestBase):
    endpoint = "/api/jobs/reports/analytics/"

    def test_director_analytics_are_department_scoped(self):
        self.as_x()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["role"], "DEPARTMENT_DIRECTOR")
        self.assertEqual(res.data["department_info"]["id"], self.dept_x.id)
        self.assertEqual(res.data["active_attachees_count"], 1)
        self.assertEqual(res.data["requisitions_summary"]["total"], 1)
        self.assertNoYData(res.data)

    def test_director_analytics_never_contain_system_wide_payload(self):
        self.as_x()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        for system_wide_key in (
            "departments_summary", "department_fill_rates",
            "users_summary", "conversion_funnel", "recent_activity",
        ):
            self.assertNotIn(system_wide_key, res.data)

    def test_applicant_cannot_read_analytics(self):
        self.as_applicant()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 403)

    def test_hr_analytics_retain_cross_department_payload(self):
        self.as_hr()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertIn("departments_summary", res.data)
        self.assertIn("department_fill_rates", res.data)
        names = [d["name"] for d in res.data["department_fill_rates"]]
        self.assertIn("Directorate X", names)
        self.assertIn("Directorate Y", names)


# ---------------------------------------------------------------------------
# 2b — Department-scoped Archives
# ---------------------------------------------------------------------------

class ArchivesIsolationTests(DepartmentIsolationTestBase):
    endpoint = "/api/jobs/archives/"

    def test_director_sees_only_own_department_archived_records(self):
        self.as_x()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        titles = [item["title"] for item in res.data["results"]]
        self.assertIn("X Archived Vacancy", titles)
        self.assertNoYData(res.data)
        self.assertTrue(res.data["read_only"])
        self.assertEqual(res.data["department"]["id"], self.dept_x.id)

    def test_director_archive_counts_are_department_scoped(self):
        self.as_x()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        counts = res.data["counts"]
        self.assertEqual(counts["vacancies"], 1)
        self.assertEqual(counts["applications"], 1)
        self.assertEqual(counts["departments"], 0)
        self.assertEqual(counts["total"], 2)

    def test_director_cannot_request_another_department_archive(self):
        self.as_x()
        res = self.client.get(self.endpoint, {"department": self.dept_y.id})
        self.assertEqual(res.status_code, 403)
        self.assertNoYData(res.data)

    def test_director_cannot_read_archived_department_profiles(self):
        self.as_x()
        res = self.client.get(self.endpoint, {"type": "DEPARTMENT"})
        self.assertEqual(res.status_code, 403)

    def test_director_search_cannot_escape_their_department(self):
        self.as_x()
        res = self.client.get(self.endpoint, {"search": "Y Archived Vacancy"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["results"], [])

    def test_director_with_no_department_sees_empty_archive(self):
        self.client.force_authenticate(user=self.director_unassigned)
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["results"], [])
        self.assertEqual(res.data["counts"]["total"], 0)
        self.assertIsNone(res.data["department"])

    def test_archives_remain_read_only_for_directors(self):
        self.as_x()
        restore = self.client.post(
            f"/api/jobs/archives/vacancy/{self.archived_job_x.id}/restore/"
        )
        self.assertEqual(restore.status_code, 403)
        self.archived_job_x.refresh_from_db()
        self.assertTrue(self.archived_job_x.is_archived)

        purge = self.client.delete(
            f"/api/jobs/archives/vacancy/{self.archived_job_x.id}/purge/"
        )
        self.assertEqual(purge.status_code, 403)
        self.assertTrue(Job.objects.filter(id=self.archived_job_x.id).exists())

    def test_director_cannot_restore_another_departments_archive(self):
        self.as_x()
        res = self.client.post(
            f"/api/jobs/archives/vacancy/{self.archived_job_y.id}/restore/"
        )
        self.assertEqual(res.status_code, 403)
        self.archived_job_y.refresh_from_db()
        self.assertTrue(self.archived_job_y.is_archived)

    def test_hr_archive_retains_full_institutional_view(self):
        self.as_hr()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["read_only"])
        self.assertIsNone(res.data["department"])
        self.assertEqual(res.data["counts"]["vacancies"], 2)
        self.assertEqual(res.data["counts"]["applications"], 2)

        # The ?department= filter narrows the records AND the summary counts, so
        # the tiles always agree with the table. HR still reaches every
        # department by simply not filtering (asserted above); only the Director
        # scoping guarantee is restricted, and that is unchanged.
        scoped = self.client.get(self.endpoint, {"department": self.dept_y.id})
        self.assertEqual(scoped.status_code, 200)
        self.assertEqual(scoped.data["counts"]["vacancies"], 1)
        self.assertEqual(scoped.data["counts"]["applications"], 1)
        self.assertEqual(scoped.data["counts"]["total"], 2)
        titles = [item["title"] for item in scoped.data["results"]]
        self.assertEqual(
            sorted(titles),
            sorted(["Y Archived Vacancy", f"{self.applicant_y.get_full_name()} - Y Archived Vacancy"]),
        )

    def test_hr_can_still_restore_and_admin_can_still_purge(self):
        self.as_hr()
        res = self.client.post(f"/api/jobs/archives/vacancy/{self.archived_job_x.id}/restore/")
        self.assertEqual(res.status_code, 200)
        self.archived_job_x.refresh_from_db()
        self.assertFalse(self.archived_job_x.is_archived)

        self.as_admin()
        res = self.client.delete(f"/api/jobs/archives/vacancy/{self.archived_job_y.id}/purge/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Job.objects.filter(id=self.archived_job_y.id).exists())


# ---------------------------------------------------------------------------
# 4 — Deployment isolation (the critical list/detail gap)
# ---------------------------------------------------------------------------

class DeploymentIsolationTests(DepartmentIsolationTestBase):
    endpoint = "/api/jobs/deployments/"

    def test_director_list_shows_only_own_department(self):
        self.as_x()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        items = results_of(res)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], self.deployment_x.id)
        self.assertNoYData(res.data)

    def test_director_cannot_narrow_to_another_department_by_parameter(self):
        self.as_x()
        res = self.client.get(self.endpoint, {"department": self.dept_y.id})
        self.assertEqual(res.status_code, 403)
        self.assertNoYData(res.data)

    def test_director_with_no_department_sees_no_deployments(self):
        self.client.force_authenticate(user=self.director_unassigned)
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(results_of(res), [])

    def test_director_cannot_read_another_departments_deployment_by_id(self):
        self.as_x()
        res = self.client.get(f"{self.endpoint}{self.deployment_y.id}/")
        self.assertEqual(res.status_code, 404)
        self.assertNoYData(res.content.decode("utf-8"))

    def test_director_can_read_own_departments_deployment(self):
        self.as_x()
        res = self.client.get(f"{self.endpoint}{self.deployment_x.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["id"], self.deployment_x.id)

    def test_director_cannot_update_a_deployment(self):
        self.as_x()
        res = self.client.patch(
            f"{self.endpoint}{self.deployment_x.id}/",
            {"status": "EXITED"}, format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.deployment_x.refresh_from_db()
        self.assertEqual(self.deployment_x.status, "DEPLOYED")

    def test_director_cannot_reassign_a_deployment_to_another_department(self):
        self.as_x()
        res = self.client.patch(
            f"{self.endpoint}{self.deployment_x.id}/",
            {"department": self.dept_y.id}, format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.deployment_x.refresh_from_db()
        self.assertEqual(self.deployment_x.department_id, self.dept_x.id)

    def test_hr_retains_cross_department_deployment_access(self):
        self.as_hr()
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(results_of(res)), 2)

        scoped = self.client.get(self.endpoint, {"department": self.dept_y.id})
        self.assertEqual(scoped.status_code, 200)
        self.assertEqual(
            [d["id"] for d in results_of(scoped)], [self.deployment_y.id]
        )

        detail = self.client.get(f"{self.endpoint}{self.deployment_y.id}/")
        self.assertEqual(detail.status_code, 200)


# ---------------------------------------------------------------------------
# 4 — Requisitions, clearance queue and applications (regression guards)
# ---------------------------------------------------------------------------

class DirectorScopedModuleIsolationTests(DepartmentIsolationTestBase):
    def test_requisition_list_ignores_a_foreign_department_parameter(self):
        self.as_x()
        res = self.client.get("/api/jobs/requisitions/", {"department": self.dept_y.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual([r["id"] for r in results_of(res)], [self.requisition_x.id])
        self.assertNoYData(res.data)

    def test_requisition_detail_of_another_department_is_denied(self):
        self.as_x()
        res = self.client.get(f"/api/jobs/requisitions/{self.requisition_y.id}/")
        self.assertEqual(res.status_code, 403)
        self.assertNoYData(res.content.decode("utf-8"))

    def test_department_clearance_queue_is_department_scoped(self):
        self.as_x()
        res = self.client.get(
            "/api/jobs/clearance/department-queue/", {"department": self.dept_y.id}
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual([c["id"] for c in results_of(res)], [self.clearance_x.id])
        self.assertNoYData(res.data)

    def test_cross_department_clearance_review_is_denied(self):
        self.as_x()
        res = self.client.post(
            f"/api/jobs/clearance/{self.clearance_y.id}/department-review/",
            {"decision": "APPROVE"}, format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.clearance_y.refresh_from_db()
        self.assertFalse(self.clearance_y.department_cleared)

    def test_clearance_without_a_deployment_still_respects_the_boundary(self):
        """A legacy application-only clearance must not become a free pass."""
        self.clearance_y.deployment = None
        self.clearance_y.save()

        self.as_x()
        res = self.client.post(
            f"/api/jobs/clearance/{self.clearance_y.id}/department-review/",
            {"decision": "APPROVE"}, format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.clearance_y.refresh_from_db()
        self.assertFalse(self.clearance_y.department_cleared)

    def test_application_list_is_department_scoped(self):
        self.as_x()
        res = self.client.get("/api/jobs/applications/")
        self.assertEqual(res.status_code, 200)
        returned = {a["id"] for a in results_of(res)}
        # Both of department X's applications (active and archived) are returned;
        # none of department Y's are.
        self.assertEqual(returned, {self.app_x.id, self.archived_app_x.id})
        self.assertNotIn(self.app_y.id, returned)
        self.assertNotIn(self.archived_app_y.id, returned)
        self.assertNoYData(res.data)

    def test_application_detail_of_another_department_is_denied(self):
        self.as_x()
        res = self.client.get(f"/api/jobs/applications/{self.app_y.id}/")
        self.assertEqual(res.status_code, 404)
        self.assertNoYData(res.content.decode("utf-8"))

    def test_director_cannot_list_archived_vacancies_cross_department(self):
        self.as_x()
        for query in ({"include_archived": "true"}, {"archived": "true"}):
            res = self.client.get("/api/jobs/vacancies/", query)
            self.assertEqual(res.status_code, 403)

    def test_director_sees_active_vacancies_normally(self):
        self.as_x()
        res = self.client.get("/api/jobs/vacancies/")
        self.assertEqual(res.status_code, 200)
        titles = [j["title"] for j in results_of(res)]
        self.assertIn("X Geologist Attachee", titles)
        self.assertNotIn("X Archived Vacancy", titles)

    def test_hr_retains_archived_vacancy_browsing(self):
        self.as_hr()
        res = self.client.get("/api/jobs/vacancies/", {"include_archived": "true"})
        self.assertEqual(res.status_code, 200)
        titles = [j["title"] for j in results_of(res)]
        self.assertIn("X Archived Vacancy", titles)
        self.assertIn("Y Archived Vacancy", titles)

    def test_director_cannot_browse_other_departments_documents(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        from accounts.models import Document

        doc_y = Document.objects.create(
            user=self.applicant_y, document_type="NATIONAL_ID",
            file=SimpleUploadedFile("y_id.pdf", b"%PDF-1.4 secret", content_type="application/pdf"),
        )
        self.as_x()
        res = self.client.get(f"/api/accounts/documents/{doc_y.id}/download/")
        self.assertEqual(res.status_code, 403)

        # Their own department's attachee document remains readable.
        doc_x = Document.objects.create(
            user=self.applicant_x, document_type="NATIONAL_ID",
            file=SimpleUploadedFile("x_id.pdf", b"%PDF-1.4 ok", content_type="application/pdf"),
        )
        res = self.client.get(f"/api/accounts/documents/{doc_x.id}/download/")
        self.assertEqual(res.status_code, 200)

    def test_department_role_variant_is_scoped_identically(self):
        """The legacy DEPARTMENT role must get exactly the same treatment."""
        legacy = User.objects.create_user(
            username="iso_dir_legacy", email="iso_dir_legacy@petroleum.go.ke",
            password="Password123!", role="DEPARTMENT", department=self.dept_y,
        )
        self.dept_y.director = legacy
        self.dept_y.save()

        self.client.force_authenticate(user=legacy)
        res = self.client.get("/api/jobs/deployments/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            [d["id"] for d in results_of(res)], [self.deployment_y.id]
        )
        detail = self.client.get(f"/api/jobs/deployments/{self.deployment_x.id}/")
        self.assertEqual(detail.status_code, 404)
