"""
Tests for the System Archives "Date From" / "Date To" range filter.

The filter narrows the archive by the effective archiving date of each record
across all three entity types (vacancies, applications, department profiles),
stays honest about the summary counts, and refuses nonsensical input instead of
silently ignoring it.

Also re-verifies that adding the filter did not weaken Director isolation.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from jobs.models import Application, Department, Job


class ArchiveDateFilterTestBase(TestCase):
    endpoint = "/api/jobs/archives/"

    def setUp(self):
        self.admin = User.objects.create_user(
            username="archive_admin", password="AdminPass!2026",
            email="archive_admin@petroleum.go.ke", role="ADMIN",
            first_name="Archive", last_name="Admin",
        )
        self.director = User.objects.create_user(
            username="archive_director", password="DirPass!2026",
            email="archive_director@petroleum.go.ke", role="DEPARTMENT_DIRECTOR",
            first_name="Archie", last_name="Director",
        )
        self.dept_a = Department.objects.create(name="Archive Dept A")
        self.dept_b = Department.objects.create(name="Archive Dept B")
        self.dept_a.director = self.director
        self.dept_a.save()

        now = timezone.now()
        self.recent = now - timedelta(days=5)
        self.middle = now - timedelta(days=60)
        self.old = now - timedelta(days=200)

        # Vacancies archived on three distinct dates.
        self.job_recent = self._job("Recent Vacancy", self.dept_a, self.recent)
        self.job_middle = self._job("Middle Vacancy", self.dept_a, self.middle)
        self.job_old = self._job("Old Vacancy", self.dept_b, self.old)

        # Applications archived on three distinct dates.
        self.app_recent = self._app("Recent App", self.job_recent, self.recent)
        self.app_middle = self._app("Middle App", self.job_middle, self.middle)
        self.app_old = self._app("Old App", self.job_old, self.old)

        # An archived department profile.
        self.archived_dept = Department.objects.create(
            name="Retired Department", is_archived=True,
            archived_at=self.middle, updated_at=self.middle,
        )

        # A vacancy archived with a NULL archived_at, as legacy rows can be.
        # Its displayed archive date falls back to created_at.
        self.job_no_stamp = Job.objects.create(
            department=self.dept_a, title="Undated Vacancy", description="d",
            requirements="r", job_type="ATTACHMENT", slots_required=1,
            deadline=now + timedelta(days=30), is_active=False, is_archived=True,
            archived_at=None, created_at=self.recent,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _job(self, title, department, archived_at):
        return Job.objects.create(
            department=department, title=title, description="Closed role",
            requirements="Geology", job_type="ATTACHMENT", slots_required=2,
            deadline=archived_at, is_active=False, is_archived=True,
            archived_at=archived_at, created_at=archived_at,
        )

    def _app(self, title, job, archived_at):
        applicant = User.objects.create_user(
            username=title.replace(" ", "_").lower(), password="Pass!2026",
            email=f"{title.replace(' ', '_').lower()}@uni.ac.ke", role="APPLICANT",
        )
        return Application.objects.create(
            user=applicant, job=job, status="REJECTED",
            is_archived=True, archived_at=archived_at, applied_at=archived_at,
        )

    def titles(self, res):
        return sorted(item["title"] for item in res.data["results"])

    def day(self, dt):
        return dt.date().isoformat()

    def app_title(self, app):
        """
        The archive renders an application as "<full name or username> - <job title>".
        These fixture applicants have no first/last name, so it falls back to
        the username.
        """
        return f"{app.user.get_full_name() or app.user.username} - {app.job.title}"


class ArchiveDateFilterTests(ArchiveDateFilterTestBase):
    def test_no_date_filter_returns_everything(self):
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        titles = self.titles(res)
        self.assertIn("Recent Vacancy", titles)
        self.assertIn("Old Vacancy", titles)
        self.assertIn("Retired Department", titles)

    def test_date_from_is_inclusive_and_narrows_all_entity_types(self):
        res = self.client.get(self.endpoint, {"date_from": self.day(self.recent)})
        self.assertEqual(res.status_code, 200)
        titles = self.titles(res)
        self.assertIn("Recent Vacancy", titles)
        self.assertIn(self.app_title(self.app_recent), titles)
        self.assertNotIn("Middle Vacancy", titles)
        self.assertNotIn("Old Vacancy", titles)
        self.assertNotIn(self.app_title(self.app_middle), titles)
        self.assertNotIn(self.app_title(self.app_old), titles)
        self.assertNotIn("Retired Department", titles)

    def test_date_to_is_inclusive(self):
        res = self.client.get(self.endpoint, {"date_to": self.day(self.middle)})
        self.assertEqual(res.status_code, 200)
        titles = self.titles(res)
        self.assertIn("Middle Vacancy", titles)
        self.assertIn("Old Vacancy", titles)
        self.assertIn("Retired Department", titles)
        self.assertNotIn("Recent Vacancy", titles)

    def test_full_range_narrows_to_a_single_day(self):
        res = self.client.get(
            self.endpoint,
            {"date_from": self.day(self.middle), "date_to": self.day(self.middle)},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            self.titles(res),
            sorted(["Middle Vacancy", self.app_title(self.app_middle), "Retired Department"]),
        )

    def test_range_outside_all_data_returns_empty(self):
        future = (timezone.now() + timedelta(days=400)).date().isoformat()
        res = self.client.get(self.endpoint, {"date_from": future})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["results"], [])
        self.assertEqual(res.data["counts"]["total"], 0)

    def test_counts_track_the_date_filter(self):
        res = self.client.get(self.endpoint, {"date_from": self.day(self.recent)})
        counts = res.data["counts"]
        self.assertEqual(counts["vacancies"], 2)  # Recent Vacancy + Undated Vacancy
        self.assertEqual(counts["applications"], 1)
        self.assertEqual(counts["departments"], 0)
        # total is derived from the same filtered querysets, so it can never
        # disagree with the sum of the breakdown tiles.
        self.assertEqual(
            counts["total"],
            counts["vacancies"] + counts["applications"] + counts["departments"],
        )
        self.assertEqual(counts["total"], len(res.data["results"]))

    def test_counts_match_type_filter(self):
        res = self.client.get(self.endpoint, {"type": "VACANCY"})
        counts = res.data["counts"]
        self.assertEqual(counts["applications"], 0)
        self.assertEqual(counts["departments"], 0)
        self.assertEqual(counts["vacancies"], 4)
        self.assertEqual(counts["total"], 4)

    def test_applied_filters_are_echoed_back(self):
        res = self.client.get(
            self.endpoint,
            {"date_from": self.day(self.middle), "date_to": self.day(self.recent), "type": "VACANCY"},
        )
        applied = res.data["applied_filters"]
        self.assertEqual(applied["date_from"], self.day(self.middle))
        self.assertEqual(applied["date_to"], self.day(self.recent))
        self.assertEqual(applied["type"], "VACANCY")

    def test_record_with_null_archive_date_uses_its_fallback_date(self):
        """A legacy row with no archived_at must still be filterable by the date it displays."""
        res = self.client.get(self.endpoint, {"date_from": self.day(self.recent)})
        self.assertIn("Undated Vacancy", self.titles(res))

        # ...and must be excluded by a range that its displayed date falls outside.
        res = self.client.get(self.endpoint, {"date_to": self.day(self.old)})
        self.assertNotIn("Undated Vacancy", self.titles(res))

    def test_date_filter_combines_with_type_and_search(self):
        res = self.client.get(
            self.endpoint,
            {"type": "VACANCY", "date_from": self.day(self.middle), "search": "Middle"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.titles(res), ["Middle Vacancy"])

    def test_date_filter_combines_with_department(self):
        res = self.client.get(self.endpoint, {"date_to": self.day(self.middle), "department": self.dept_b.id})
        self.assertEqual(res.status_code, 200)
        self.assertIn("Old Vacancy", self.titles(res))
        self.assertNotIn("Middle Vacancy", self.titles(res))


class ArchiveDateFilterValidationTests(ArchiveDateFilterTestBase):
    def test_invalid_date_format_is_rejected(self):
        for field in ["date_from", "date_to"]:
            res = self.client.get(self.endpoint, {field: "not-a-date"})
            self.assertEqual(res.status_code, 400, msg=f"{field} should reject junk")
            self.assertIn(field, res.data)
            self.assertIn("YYYY-MM-DD", str(res.data[field]))

    def test_impossible_date_is_rejected(self):
        res = self.client.get(self.endpoint, {"date_from": "2026-13-45"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("date_from", res.data)

    def test_reversed_range_is_rejected(self):
        res = self.client.get(
            self.endpoint,
            {"date_from": self.day(self.recent), "date_to": self.day(self.old)},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Date From", res.data["detail"])

    def test_empty_date_values_are_treated_as_unset(self):
        res = self.client.get(self.endpoint, {"date_from": "", "date_to": ""})
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["applied_filters"]["date_from"])
        self.assertIsNone(res.data["applied_filters"]["date_to"])

    def test_whitespace_only_date_is_treated_as_unset(self):
        res = self.client.get(self.endpoint, {"date_from": "   "})
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["applied_filters"]["date_from"])

    def test_same_day_range_is_accepted(self):
        res = self.client.get(
            self.endpoint,
            {"date_from": self.day(self.recent), "date_to": self.day(self.recent)},
        )
        self.assertEqual(res.status_code, 200)


class ArchiveDateFilterDirectorIsolationTests(ArchiveDateFilterTestBase):
    def as_director(self):
        self.client.force_authenticate(user=self.director)

    def test_director_date_filter_cannot_reach_another_department(self):
        self.as_director()
        res = self.client.get(self.endpoint, {"date_from": self.day(self.old)})
        self.assertEqual(res.status_code, 200)
        # Department B's old vacancy and application are outside the director's scope.
        self.assertNotIn("Old Vacancy", self.titles(res))
        self.assertNotIn(self.app_title(self.app_old), self.titles(res))
        for item in res.data["results"]:
            self.assertIn(item["department_name"], ["Archive Dept A", "General"])

    def test_director_counts_remain_department_scoped_with_a_date_filter(self):
        self.as_director()
        # Narrow to the single day of the middle record, so the only candidates
        # in the director's own department are "Middle Vacancy" and its
        # application. Department B's records fall on a different day, so they
        # would be filtered out by the date alone -- the counts therefore also
        # prove the department scope is applied, not just the date.
        res = self.client.get(
            self.endpoint,
            {"date_from": self.day(self.middle), "date_to": self.day(self.middle)},
        )
        self.assertEqual(res.status_code, 200)
        counts = res.data["counts"]
        self.assertEqual(counts["vacancies"], 1)  # Middle Vacancy only
        self.assertEqual(counts["applications"], 1)
        self.assertEqual(counts["departments"], 0)
        self.assertEqual(counts["total"], 2)
        self.assertEqual(
            self.titles(res), sorted(["Middle Vacancy", self.app_title(self.app_middle)])
        )

    def test_director_still_cannot_filter_to_another_department(self):
        self.as_director()
        res = self.client.get(
            self.endpoint, {"department": self.dept_b.id, "date_from": self.day(self.old)}
        )
        self.assertEqual(res.status_code, 403)

    def test_director_still_cannot_request_archived_department_profiles(self):
        self.as_director()
        res = self.client.get(
            self.endpoint, {"type": "DEPARTMENT", "date_to": self.day(self.middle)}
        )
        self.assertEqual(res.status_code, 403)

    def test_director_invalid_date_is_still_rejected(self):
        self.as_director()
        res = self.client.get(self.endpoint, {"date_from": "01/02/2026"})
        self.assertEqual(res.status_code, 400)
