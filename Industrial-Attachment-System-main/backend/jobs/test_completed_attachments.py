"""
Tests for completed-attachee records in the System Archives, and for the
completeness of every report/CSV export.

The requirements these cover:

* an attachee who successfully completed their attachment appears in System
  Archives, alongside the vacancies/applications/departments already there;
* they can be found fast by searching name, email, national ID, institution,
  vacancy or department, and narrowed by a date range and a department;
* Director-scoped Department Archives gain the same records, still hard-scoped
  to their own department;
* they are auto-archived the moment the attachment is fully complete;
* every export carries every column, with no blank cell that could be mistaken
  for a dropped field.
"""
import csv
import io
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Profile, User
from jobs.attachment_records import (
    archive_completed_attachment,
    completed_attachment_queryset,
    is_completed_attachment,
)
from jobs.models import (
    Application,
    AtsScoringConfiguration,
    Clearance,
    Department,
    Deployment,
    Job,
    RecommendationLetter,
)
from jobs.views import (
    ATTACHEE_REPORT_COLUMNS,
    FILL_RATE_REPORT_COLUMNS,
    NOT_RECORDED,
    build_export_row,
    complete_cell,
    column_headers,
    serialize_attachee_report_row,
    serialize_fill_rate_row,
)

ARCHIVE_ENDPOINT = "/api/jobs/archives/"
ATTACHEES_REPORT_ENDPOINT = "/api/jobs/reports/attachees/"
FILL_RATES_REPORT_ENDPOINT = "/api/jobs/reports/fill-rates/"
EXPORT_ENDPOINT = "/api/jobs/reports/export-csv/"


class AttachmentTestBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="att_admin", password="AdminPass!2026",
            email="att_admin@petroleum.go.ke", role="ADMIN",
            first_name="Ann", last_name="Admin",
        )
        self.hr = User.objects.create_user(
            username="att_hr", password="HrPass!2026",
            email="att_hr@petroleum.go.ke", role="HR",
            first_name="Hana", last_name="Hris",
        )
        self.director = User.objects.create_user(
            username="att_director", password="DirPass!2026",
            email="att_director@petroleum.go.ke", role="DEPARTMENT_DIRECTOR",
            first_name="Dee", last_name="Director",
        )
        self.dept_a = Department.objects.create(name="Attach Dept A")
        self.dept_b = Department.objects.create(name="Attach Dept B")
        self.dept_a.director = self.director
        self.dept_a.save()

        now = timezone.now()
        self.start = now - timedelta(days=120)
        self.end = now - timedelta(days=30)

        self.job_a = self._job("Geology Attachment", self.dept_a, slots=3)
        self.job_b = self._job("Petroleum Engineering Attachment", self.dept_b, slots=2)

        # A fully completed attachee in department A.
        self.done_app = self._attachee(
            "Grace Njeri", "grace_njeri", "GRACE1234A", "University of Nairobi",
            "BSc Geology", self.job_a, self.dept_a,
            deployed=True, exited=True, cleared=True,
            start=self.start, end=self.end,
        )
        # Completed long ago, in department B.
        self.done_app_b = self._attachee(
            "Peter Mwangi", "peter_mwangi", "PETER1234B", "Kenyatta University",
            "BSc Petroleum Engineering", self.job_b, self.dept_b,
            deployed=True, exited=True, cleared=True,
            start=self.start - timedelta(days=200), end=self.end - timedelta(days=150),
        )
        # Successful and deployed but clearance is still pending: not complete.
        self.in_progress_app = self._attachee(
            "Isaac Otieno", "isaac_otieno", "ISAAC1234C", "Maseno University",
            "BSc Geology", self.job_a, self.dept_a,
            deployed=True, exited=True, cleared=False,
            start=self.start, end=self.end,
        )
        # Successful but never deployed.
        self.success_only_app = self._attachee(
            "Lucy Wangari", "lucy_wangari", "LUCY1234D", "Kenyatta University",
            "BSc Petroleum Engineering", self.job_a, self.dept_a,
            deployed=False, exited=False, cleared=False,
        )

        self.client = APIClient()

    def _job(self, title, department, slots=1):
        return Job.objects.create(
            department=department, title=title, description="d", requirements="r",
            job_type="ATTACHMENT", slots_required=slots, duration_weeks=12,
            location="Nairobi",
            deadline=timezone.now() + timedelta(days=30),
        )

    def _attachee(self, name, username, id_number, institution, qualification,
                  job, department, deployed, exited, cleared, start=None, end=None):
        first, last = name.split(" ", 1)
        user = User.objects.create_user(
            username=username, password="Pass!2026",
            email=f"{username}@uni.ac.ke", role="APPLICANT",
            first_name=first, last_name=last,
        )
        # A Profile is created automatically when the user is created, so the
        # fixture fills it in rather than trying to insert a second one.
        profile, _ = Profile.objects.get_or_create(user=user)
        profile.phone_number = "+254700000000"
        profile.id_number = id_number
        profile.county_of_residence = "Nairobi"
        profile.institution_name = institution
        profile.qualification = qualification
        profile.field_of_study = qualification.replace("BSc ", "")
        profile.save()
        app = Application.objects.create(
            user=user, job=job, status="SUCCESSFUL", ats_score=88.50,
        )
        if deployed:
            start_date = (start or timezone.now()).date()
            deployment = Deployment.objects.create(
                application=app, department=department,
                start_date=start_date,
                planned_end_date=start_date + timedelta(weeks=12),
                actual_end_date=end.date() if (exited and end) else None,
                status="EXITED" if exited else "DEPLOYED",
            )
            if cleared:
                Clearance.objects.create(
                    application=app, deployment=deployment, status="CLEARED",
                    department_cleared=True, department_cleared_by=self.director,
                    department_cleared_at=end - timedelta(days=5) if end else timezone.now(),
                    hr_cleared=True, hr_cleared_by=self.hr,
                    hr_cleared_at=end if end else timezone.now(),
                )
            else:
                Clearance.objects.create(
                    application=app, deployment=deployment, status="PENDING_HR",
                    department_cleared=True, department_cleared_by=self.director,
                    department_cleared_at=timezone.now(),
                )
        return app

    def as_user(self, user):
        self.client.force_authenticate(user=user)

    def titles(self, res):
        return sorted(item["title"] for item in res.data["results"])


class CompletedAttachmentDetectionTests(AttachmentTestBase):
    def test_only_fully_completed_attachments_are_recognised(self):
        self.assertTrue(is_completed_attachment(self.done_app))
        self.assertTrue(is_completed_attachment(self.done_app_b))
        self.assertFalse(is_completed_attachment(self.in_progress_app))
        self.assertFalse(is_completed_attachment(self.success_only_app))

    def test_an_attachment_without_a_deployment_is_not_a_completion(self):
        """A Clearance can hang off an Application for legacy rows.

        Without a deployment there is no evidence the attachee was ever placed,
        so it must not be treated as a completed attachment.
        """
        app = self._attachee(
            "Legacy Dan", "legacy_dan", "LEGACY1234E", "Kenyatta University",
            "BSc Geology", self.job_a, self.dept_a,
            deployed=False, exited=False, cleared=False,
        )
        Clearance.objects.create(application=app, status="CLEARED", hr_cleared=True)
        app.refresh_from_db()
        self.assertFalse(is_completed_attachment(app))
        self.assertNotIn(app.id, completed_attachment_queryset().values_list("id", flat=True))

    def test_the_queryset_returns_only_completions(self):
        ids = set(completed_attachment_queryset().values_list("id", flat=True))
        self.assertEqual(ids, {self.done_app.id, self.done_app_b.id})

    def test_completion_requires_the_successful_status(self):
        self.done_app.status = "REJECTED"
        self.done_app.save()
        self.assertFalse(is_completed_attachment(self.done_app))


class AutoArchiveOnCompletionTests(AttachmentTestBase):
    def test_clearing_the_last_clearance_auto_archives_the_attachee(self):
        """HR granting the final clearance is what completes an attachment."""
        self.as_user(self.hr)
        res = self.client.post(
            f"/api/jobs/clearance/{Clearance.objects.get(application=self.in_progress_app).pk}/hr-review/",
            {"decision": "APPROVE", "hr_notes": "All good."},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.in_progress_app.refresh_from_db()
        self.assertTrue(self.in_progress_app.is_archived)
        self.assertIsNotNone(self.in_progress_app.archived_at)
        self.assertEqual(self.in_progress_app.archived_by, self.hr)

    def test_recording_the_exit_last_also_auto_archives_the_attachee(self):
        """The two completion facts can arrive in either order."""
        clearance = Clearance.objects.get(application=self.in_progress_app)
        clearance.status = "CLEARED"
        clearance.hr_cleared = True
        clearance.hr_cleared_by = self.hr
        clearance.hr_cleared_at = timezone.now()
        clearance.save()

        self.as_user(self.hr)
        deployment = Deployment.objects.get(application=self.in_progress_app)
        self.assertEqual(deployment.status, "EXITED")

        # Force the deployment save to re-run the signal.
        deployment.refresh_from_db()
        deployment.actual_end_date = timezone.now().date()
        deployment.save()

        self.in_progress_app.refresh_from_db()
        self.assertTrue(self.in_progress_app.is_archived)

    def test_auto_archiving_is_idempotent(self):
        app = Application.objects.get(pk=self.done_app.pk)
        self.assertTrue(app.is_archived)
        first_stamp = app.archived_at
        # A later save of the clearance must not move the archive date.
        clearance = Clearance.objects.get(application=app)
        clearance.hr_notes = "Amended note."
        clearance.save()
        app.refresh_from_db()
        self.assertEqual(app.archived_at, first_stamp)

    def test_archived_at_records_the_completion_not_the_flag_write_time(self):
        """An attachment finished long ago must be dated when it finished."""
        app = Application.objects.get(pk=self.done_app.pk)
        self.assertIsNotNone(app.archived_at)
        self.assertLess(app.archived_at, timezone.now() - timedelta(days=1))


class ArchiveAttacheeListingTests(AttachmentTestBase):
    def test_admin_sees_completed_attachees_in_the_archive(self):
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT"})
        self.assertEqual(res.status_code, 200)
        titles = self.titles(res)
        self.assertIn("Grace Njeri - Geology Attachment", titles)
        self.assertIn("Peter Mwangi - Petroleum Engineering Attachment", titles)
        self.assertNotIn("Isaac Otieno - Geology Attachment", titles)
        self.assertNotIn("Lucy Wangari - Geology Attachment", titles)

    def test_completed_attachees_appear_in_the_all_view_with_a_count(self):
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["counts"]["attachments"], 2)
        types = {item["entity_type"] for item in res.data["results"]}
        self.assertIn("ATTACHMENT", types)
        # The total must agree with the sum of the breakdown.
        counts = res.data["counts"]
        self.assertEqual(
            counts["total"],
            counts["vacancies"] + counts["applications"] + counts["attachments"] + counts["departments"],
        )

    def test_a_completed_attachee_is_not_also_listed_as_a_plain_application(self):
        """Otherwise the same attachee appears twice and the counts double up."""
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "APPLICATION"})
        titles = self.titles(res)
        self.assertNotIn("Grace Njeri - Geology Attachment", titles)

    def test_the_attachee_row_carries_the_full_record(self):
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT"})
        row = next(
            item for item in res.data["results"]
            if item["id"] == self.done_app.id
        )
        self.assertEqual(row["entity_type"], "ATTACHMENT")
        self.assertEqual(row["attachee_name"], "Grace Njeri")
        self.assertEqual(row["email"], "grace_njeri@uni.ac.ke")
        self.assertEqual(row["phone_number"], "+254700000000")
        self.assertEqual(row["id_number"], "GRACE1234A")
        self.assertEqual(row["institution_name"], "University of Nairobi")
        self.assertEqual(row["qualification"], "BSc Geology")
        self.assertEqual(row["department_name"], "Attach Dept A")
        self.assertEqual(row["job_title"], "Geology Attachment")
        self.assertEqual(row["duration_weeks"], 12)
        self.assertIsNotNone(row["completion_date"])
        self.assertIsNotNone(row["completion_year"])
        self.assertEqual(row["archived_by"], "att_hr")

    def test_search_finds_an_attachee_by_each_referable_field(self):
        self.as_user(self.admin)
        for term, expected in [
            ("Grace", "Grace Njeri - Geology Attachment"),
            ("grace_njeri", "Grace Njeri - Geology Attachment"),
            ("grace_njeri@uni.ac.ke", "Grace Njeri - Geology Attachment"),
            ("GRACE1234A", "Grace Njeri - Geology Attachment"),
            ("University of Nairobi", "Grace Njeri - Geology Attachment"),
            ("Geology Attachment", "Grace Njeri - Geology Attachment"),
            ("Attach Dept A", "Grace Njeri - Geology Attachment"),
        ]:
            with self.subTest(term=term):
                res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT", "search": term})
                self.assertEqual(res.status_code, 200)
                self.assertIn(expected, self.titles(res))

    def test_search_does_not_match_across_departments(self):
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT", "search": "Peter"})
        self.assertEqual(self.titles(res), ["Peter Mwangi - Petroleum Engineering Attachment"])

    def test_date_range_filters_on_the_completion_date(self):
        self.as_user(self.admin)
        res = self.client.get(
            ARCHIVE_ENDPOINT,
            {
                "type": "ATTACHMENT",
                "date_from": self.end.date().isoformat(),
                "date_to": self.end.date().isoformat(),
            },
        )
        self.assertEqual(
            self.titles(res), ["Grace Njeri - Geology Attachment"]
        )

    def test_an_older_completion_is_excluded_by_a_narrow_range(self):
        self.as_user(self.admin)
        res = self.client.get(
            ARCHIVE_ENDPOINT,
            {
                "type": "ATTACHMENT",
                "date_from": (self.end - timedelta(days=200)).date().isoformat(),
                "date_to": (self.end - timedelta(days=100)).date().isoformat(),
            },
        )
        self.assertEqual(
            self.titles(res), ["Peter Mwangi - Petroleum Engineering Attachment"]
        )

    def test_admin_can_filter_attachees_by_department(self):
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT", "department": self.dept_b.id})
        self.assertEqual(
            self.titles(res), ["Peter Mwangi - Petroleum Engineering Attachment"]
        )

    def test_hr_sees_the_same_records_as_admin(self):
        self.as_user(self.hr)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["results"]), 2)

    def test_applicants_cannot_read_the_archive(self):
        applicant = User.objects.get(username="grace_njeri")
        self.as_user(applicant)
        self.assertEqual(self.client.get(ARCHIVE_ENDPOINT).status_code, 403)

    def test_a_recommendation_letter_is_reported(self):
        deployment = Deployment.objects.get(application=self.done_app)
        RecommendationLetter.objects.create(
            deployment=deployment, rendered_content="Dear sir/madam,",
        )
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT"})
        row = next(i for i in res.data["results"] if i["id"] == self.done_app.id)
        self.assertEqual(row["recommendation_letter"], "Yes")
        other = next(i for i in res.data["results"] if i["id"] == self.done_app_b.id)
        self.assertEqual(other["recommendation_letter"], "No")


class ArchiveAttacheeDirectorIsolationTests(AttachmentTestBase):
    def test_director_sees_only_their_own_departments_attachees(self):
        self.as_user(self.director)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.titles(res), ["Grace Njeri - Geology Attachment"])
        self.assertEqual(res.data["counts"]["attachments"], 1)

    def test_director_counts_agree_with_their_records(self):
        self.as_user(self.director)
        res = self.client.get(ARCHIVE_ENDPOINT)
        counts = res.data["counts"]
        self.assertEqual(counts["total"], len(res.data["results"]))
        self.assertEqual(counts["attachments"], 1)

    def test_director_cannot_reach_another_department_by_parameter(self):
        self.as_user(self.director)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT", "department": self.dept_b.id})
        self.assertEqual(res.status_code, 403)

    def test_director_cannot_search_into_another_department(self):
        """Search must not become a side channel around the department scope."""
        self.as_user(self.director)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT", "search": "Peter"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.titles(res), [])

    def test_director_with_no_department_sees_no_attachees(self):
        orphan = User.objects.create_user(
            username="orphan_director", password="Pass!2026",
            email="orphan@petroleum.go.ke", role="DEPARTMENT_DIRECTOR",
        )
        self.as_user(orphan)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["results"], [])
        self.assertEqual(res.data["counts"]["attachments"], 0)
        self.assertEqual(res.data["counts"]["total"], 0)

    def test_director_cannot_restore_or_purge(self):
        self.as_user(self.director)
        self.assertEqual(
            self.client.post(f"{ARCHIVE_ENDPOINT}attachment/{self.done_app.id}/restore/").status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"{ARCHIVE_ENDPOINT}attachment/{self.done_app.id}/purge/").status_code,
            403,
        )


class ArchiveAttacheeRestorePurgeTests(AttachmentTestBase):
    def test_hr_can_restore_an_attachee_record(self):
        self.as_user(self.hr)
        res = self.client.post(f"{ARCHIVE_ENDPOINT}attachment/{self.done_app.id}/restore/")
        self.assertEqual(res.status_code, 200)
        app = Application.objects.get(pk=self.done_app.pk)
        self.assertFalse(app.is_archived)
        self.assertIsNone(app.archived_at)

    def test_restoring_cannot_be_used_to_hide_a_completed_attachee(self):
        """Completion, not the flag, is what makes an attachee archival."""
        self.as_user(self.hr)
        self.client.post(f"{ARCHIVE_ENDPOINT}attachment/{self.done_app.id}/restore/")
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT"})
        self.assertIn("Grace Njeri - Geology Attachment", self.titles(res))

    def test_restoring_a_non_completed_application_as_an_attachee_is_rejected(self):
        self.as_user(self.hr)
        res = self.client.post(f"{ARCHIVE_ENDPOINT}attachment/{self.success_only_app.id}/restore/")
        self.assertEqual(res.status_code, 400)

    def test_attachee_records_cannot_be_purged(self):
        """Purging would cascade away the deployment, clearance and final report."""
        self.as_user(self.admin)
        res = self.client.delete(f"{ARCHIVE_ENDPOINT}attachment/{self.done_app.id}/purge/")
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Application.objects.filter(pk=self.done_app.pk).exists())
        self.assertTrue(Deployment.objects.filter(application=self.done_app).exists())
        self.assertTrue(Clearance.objects.filter(application=self.done_app).exists())

    def test_a_completed_attachee_cannot_be_purged_through_the_application_route(self):
        self.as_user(self.admin)
        res = self.client.delete(f"{ARCHIVE_ENDPOINT}application/{self.done_app.id}/purge/")
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Application.objects.filter(pk=self.done_app.pk).exists())

    def test_a_plain_archived_application_can_still_be_purged(self):
        """The new guard must not disable purging for ordinary applications."""
        app = self._attachee(
            "Rejected Rita", "rejected_rita", "RITA1234F", "Kenyatta University",
            "BSc Geology", self.job_a, self.dept_a,
            deployed=False, exited=False, cleared=False,
        )
        app.status = "REJECTED"
        app.is_archived = True
        app.archived_at = timezone.now()
        app.save()
        self.as_user(self.admin)
        res = self.client.delete(f"{ARCHIVE_ENDPOINT}application/{app.id}/purge/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Application.objects.filter(pk=app.pk).exists())


class ExportCompletenessTests(AttachmentTestBase):
    """
    An export is only usable as a record if it carries every column and no cell
    is silently blank.
    """

    def test_complete_cell_never_yields_an_empty_string(self):
        for value in [None, "", "   ", False]:
            self.assertNotEqual(complete_cell(value), "")
        self.assertEqual(complete_cell(None), NOT_RECORDED)
        self.assertEqual(complete_cell("   "), NOT_RECORDED)
        self.assertEqual(complete_cell(True), "Yes")
        self.assertEqual(complete_cell(False), "No")
        self.assertEqual(complete_cell(0), "0")

    def test_complete_cell_formats_dates(self):
        self.assertEqual(complete_cell(timezone.now().date()), timezone.now().date().isoformat())
        self.assertIn(":", complete_cell(timezone.now()))

    def test_build_export_row_fills_every_column_of_the_definition(self):
        row = build_export_row({"applicant_name": "Grace"}, ATTACHEE_REPORT_COLUMNS)
        self.assertEqual(len(row), len(ATTACHEE_REPORT_COLUMNS))
        self.assertEqual(row[1], "Grace")
        self.assertTrue(all(cell.strip() for cell in row))

    def test_every_attachee_report_column_is_produced_by_the_serializer(self):
        app = Application.objects.select_related(
            "user", "user__profile", "job", "job__department", "clearance", "deployment",
        ).get(pk=self.done_app.pk)
        record = serialize_attachee_report_row(app)
        for key, _ in ATTACHEE_REPORT_COLUMNS:
            with self.subTest(column=key):
                self.assertIn(key, record)

    def test_every_fill_rate_column_is_produced_by_the_serializer(self):
        record = serialize_fill_rate_row(self.job_a)
        for key, _ in FILL_RATE_REPORT_COLUMNS:
            with self.subTest(column=key):
                self.assertIn(key, record)

    def test_a_sparse_attachee_still_exports_without_blank_cells(self):
        """An applicant with no profile at all must not produce holes."""
        sparse = self._attachee(
            "Sparse Sam", "sparse_sam", "SAM1234G", "", "",
            self.job_a, self.dept_a,
            deployed=False, exited=False, cleared=False,
        )
        app = Application.objects.select_related(
            "user", "user__profile", "job", "job__department", "clearance", "deployment",
        ).get(pk=sparse.pk)
        row = build_export_row(serialize_attachee_report_row(app), ATTACHEE_REPORT_COLUMNS)
        self.assertEqual(len(row), len(ATTACHEE_REPORT_COLUMNS))
        for cell in row:
            self.assertTrue(cell.strip(), "exported cell was blank")

    def test_attachee_csv_has_a_cell_for_every_column_on_every_row(self):
        self.as_user(self.admin)
        res = self.client.get(EXPORT_ENDPOINT, {"report_type": "attachees"})
        self.assertEqual(res.status_code, 200)
        text = res.content.decode("utf-8")
        rows = list(csv.reader(io.StringIO(text)))
        body = self._body_rows(rows, ATTACHEE_REPORT_COLUMNS)
        self.assertTrue(body)
        expected_width = len(ATTACHEE_REPORT_COLUMNS)
        for row in body:
            self.assertEqual(len(row), expected_width)
            for index, cell in enumerate(row):
                self.assertTrue(
                    cell.strip(),
                    f"blank cell in column {column_headers(ATTACHEE_REPORT_COLUMNS)[index]}",
                )

    def test_attachee_csv_carries_the_attachee_detail_columns(self):
        self.as_user(self.admin)
        res = self.client.get(EXPORT_ENDPOINT, {"report_type": "attachees"})
        text = res.content.decode("utf-8")
        for expected in ["National ID", "Institution", "Qualification", "ATS Score (%)",
                         "Completion Date", "Recommendation Letter", "Phone"]:
            self.assertIn(expected, text)

    def test_fill_rate_csv_has_a_cell_for_every_column_on_every_row(self):
        self.as_user(self.admin)
        res = self.client.get(EXPORT_ENDPOINT, {"report_type": "fill_rates"})
        self.assertEqual(res.status_code, 200)
        rows = list(csv.reader(io.StringIO(res.content.decode("utf-8"))))
        body = self._body_rows(rows, FILL_RATE_REPORT_COLUMNS)
        self.assertTrue(body)
        for row in body:
            self.assertEqual(len(row), len(FILL_RATE_REPORT_COLUMNS))
            for cell in row:
                self.assertTrue(cell.strip())

    def test_the_json_report_publishes_the_same_columns_as_the_csv(self):
        self.as_user(self.admin)
        res = self.client.get(ATTACHEES_REPORT_ENDPOINT)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            [c["header"] for c in res.data["columns"]],
            column_headers(ATTACHEE_REPORT_COLUMNS),
        )
        for record in res.data["attachees"]:
            for column in res.data["columns"]:
                self.assertIn(column["key"], record)

    def test_the_fill_rate_json_report_publishes_its_columns(self):
        self.as_user(self.admin)
        res = self.client.get(FILL_RATES_REPORT_ENDPOINT)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            [c["header"] for c in res.data["columns"]],
            column_headers(FILL_RATE_REPORT_COLUMNS),
        )

    def test_the_attachee_report_flags_completed_attachments(self):
        self.as_user(self.admin)
        res = self.client.get(ATTACHEES_REPORT_ENDPOINT)
        rows = {r["application_id"]: r for r in res.data["attachees"]}
        self.assertTrue(rows[self.done_app.id]["is_completed"])
        self.assertIsNotNone(rows[self.done_app.id]["completion_date"])
        self.assertFalse(rows[self.in_progress_app.id]["is_completed"])
        self.assertIsNone(rows[self.in_progress_app.id]["completion_date"])

    def test_completed_attachees_remain_in_the_attachee_report(self):
        """Archiving must not remove an attachee from the operational report."""
        self.as_user(self.admin)
        res = self.client.get(ATTACHEES_REPORT_ENDPOINT)
        ids = {r["application_id"] for r in res.data["attachees"]}
        self.assertIn(self.done_app.id, ids)

    def test_director_csv_export_stays_department_scoped(self):
        self.as_user(self.director)
        res = self.client.get(EXPORT_ENDPOINT, {"report_type": "attachees"})
        self.assertEqual(res.status_code, 200)
        text = res.content.decode("utf-8")
        self.assertIn("grace_njeri@uni.ac.ke", text)
        self.assertNotIn("peter_mwangi@uni.ac.ke", text)

    @staticmethod
    def _find_header_row(rows, expected_headers):
        """Locate the report header, which sits below the branding block."""
        width = len(expected_headers)
        for index, row in enumerate(rows):
            if len(row) == width and row == expected_headers:
                return index
        raise AssertionError(
            f"header row {expected_headers} not found in {[r[:4] for r in rows]}"
        )

    @classmethod
    def _body_rows(cls, rows, columns):
        """
        The data rows that sit between the header and the footer block.

        The branding header and the footer are single-cell rows, so they are
        skipped; everything between the header and the "-" separator is a record.
        """
        header = cls._find_header_row(rows, column_headers(columns))
        body = []
        for row in rows[header + 1:]:
            if not row:
                continue
            first = row[0]
            if first.startswith("-") or first.startswith("End of Report") or first.startswith("State Department"):
                break
            if first == "":
                continue
            body.append(row)
        return body


class ArchiveDateFilterInteractionTests(AttachmentTestBase):
    def test_attachee_date_range_rejects_bad_input(self):
        self.as_user(self.admin)
        res = self.client.get(ARCHIVE_ENDPOINT, {"type": "ATTACHMENT", "date_from": "not-a-date"})
        self.assertEqual(res.status_code, 400)

    def test_attachee_date_range_rejects_a_reversed_range(self):
        self.as_user(self.admin)
        res = self.client.get(
            ARCHIVE_ENDPOINT,
            {"type": "ATTACHMENT", "date_from": "2026-05-01", "date_to": "2026-01-01"},
        )
        self.assertEqual(res.status_code, 400)


class ScoredArchiveConsistencyTests(AttachmentTestBase):
    def test_ats_tiering_still_works_with_the_new_report_columns(self):
        """Guards against a column refactor disturbing the scoring helpers."""
        config = AtsScoringConfiguration.get_config()
        self.assertEqual(config.tier_name_for_score(95), "Exceptional")
        self.assertEqual(config.tier_name_for_score(40), "Below Benchmark")

    def test_manually_archiving_helper_does_nothing_for_incomplete_records(self):
        self.assertFalse(archive_completed_attachment(self.in_progress_app))
        self.assertFalse(archive_completed_attachment(self.success_only_app))
