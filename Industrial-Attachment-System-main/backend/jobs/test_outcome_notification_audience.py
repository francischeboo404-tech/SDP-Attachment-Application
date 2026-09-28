"""
An applicant's application outcome must reach the applicant and nobody else.

Two separate defects caused staff to see it, and both are covered here:

  1. The notification list handed ADMIN/HR *every* notification in the system,
     unfiltered, so each applicant's result appeared in the HR and Admin feeds.
  2. The outcome notice also carried the vacancy's department, and the Director
     feed includes department notifications, so the Director of that department
     received every one of their applicants' results.

`notification_type` could not distinguish the two cases because APPLICATION_UPDATE
is also used for departmental notices, hence the explicit `audience` field.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from datetime import timedelta

from django.utils import timezone
from jobs.models import Department, Job, Application, Notification

User = get_user_model()


class ApplicantOutcomeNotificationAudienceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dept = Department.objects.create(
            name="Geology Directorate", location="Nairobi",
            contact_email="geology@petroleum.go.ke",
        )
        self.job = Job.objects.create(
            department=self.dept, title="Geologist Attachee", description="<p>Field work.</p>",
            requirements="BSc Geology", job_type="ATTACHMENT", location="Nairobi",
            slots_required=2, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30), is_active=True,
        )
        self.applicant = User.objects.create_user(
            username="out_applicant", email="out_applicant@uni.ac.ke",
            password="pw", role="APPLICANT",
        )
        self.hr = User.objects.create_user(
            username="out_hr", email="out_hr@petroleum.go.ke", password="pw", role="HR",
        )
        self.admin = User.objects.create_user(
            username="out_admin", email="out_admin@petroleum.go.ke", password="pw", role="ADMIN",
        )
        self.director = User.objects.create_user(
            username="out_director", email="out_director@petroleum.go.ke",
            password="pw", role="DEPARTMENT_DIRECTOR",
        )
        self.director.department = self.dept
        self.director.save()

        self.application = Application.objects.create(
            job=self.job, user=self.applicant, status="PENDING",
            cover_letter="Please consider me.",
        )

    def _titles_for(self, user):
        self.client.force_authenticate(user=user)
        response = self.client.get("/api/jobs/notifications/")
        self.assertEqual(response.status_code, 200, response.content)
        return {n["title"] for n in response.json()["results"]}

    def _decide(self, status):
        self.client.force_authenticate(user=self.hr)
        response = self.client.patch(
            f"/api/jobs/applications/{self.application.id}/status/",
            {"status": status}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response

    # ── The requirement ────────────────────────────────────────────────────────

    def test_successful_outcome_notifies_the_applicant(self):
        self._decide("SUCCESSFUL")
        self.assertIn(
            "Congratulations! Application Successful",
            self._titles_for(self.applicant),
        )

    def test_rejected_outcome_notifies_the_applicant(self):
        self._decide("REJECTED")
        self.assertIn(
            "Application Outcome: Not Successful",
            self._titles_for(self.applicant),
        )

    def test_hr_does_not_see_a_successful_outcome(self):
        self._decide("SUCCESSFUL")
        self.assertNotIn(
            "Congratulations! Application Successful",
            self._titles_for(self.hr),
        )

    def test_admin_does_not_see_a_successful_outcome(self):
        self._decide("SUCCESSFUL")
        self.assertNotIn(
            "Congratulations! Application Successful",
            self._titles_for(self.admin),
        )

    def test_the_director_does_not_see_their_departments_applicant_outcomes(self):
        self._decide("SUCCESSFUL")
        self.assertNotIn(
            "Congratulations! Application Successful",
            self._titles_for(self.director),
        )

    def test_hr_does_not_see_a_rejection_either(self):
        self._decide("REJECTED")
        self.assertNotIn(
            "Application Outcome: Not Successful",
            self._titles_for(self.hr),
        )

    def test_the_director_does_not_see_a_rejection_either(self):
        self._decide("REJECTED")
        self.assertNotIn(
            "Application Outcome: Not Successful",
            self._titles_for(self.director),
        )

    # The notices must still exist -- they are hidden from the staff feeds, not
    # deleted. Otherwise the applicant would lose the portal notice entirely.
    def test_the_outcome_notice_still_exists_and_is_marked_applicant_only(self):
        self._decide("SUCCESSFUL")
        notif = Notification.objects.get(title="Congratulations! Application Successful")
        self.assertEqual(notif.recipient, self.applicant)
        self.assertEqual(notif.audience, "APPLICANT")

    # ── Staff notifications must keep working ──────────────────────────────────

    def test_a_staff_notification_still_reaches_hr_and_the_director(self):
        Notification.objects.create(
            department=self.dept, title="New Vacancy Posted: Test",
            message="A vacancy was posted.", notification_type="JOB_POSTED",
        )
        self.assertIn("New Vacancy Posted: Test", self._titles_for(self.hr))
        self.assertIn("New Vacancy Posted: Test", self._titles_for(self.director))

    def test_hr_still_sees_a_receipt_addressed_to_them(self):
        Notification.objects.create(
            recipient=self.hr, department=self.dept, title="Requisition Submitted",
            message="A requisition arrived.", notification_type="JOB_POSTED",
        )
        self.assertIn("Requisition Submitted", self._titles_for(self.hr))

    def test_an_applicant_still_sees_only_their_own_notices(self):
        other = User.objects.create_user(
            username="other_applicant", email="other@uni.ac.ke", password="pw", role="APPLICANT",
        )
        Notification.objects.create(
            recipient=other, title="Someone Else's Outcome",
            message="Not yours.", notification_type="APPLICATION_UPDATE", audience="APPLICANT",
        )
        self._decide("SUCCESSFUL")
        titles = self._titles_for(self.applicant)
        self.assertNotIn("Someone Else's Outcome", titles)
        self.assertIn("Congratulations! Application Successful", titles)

    # ── Mark-read must not become a back door ──────────────────────────────────

    def test_hr_cannot_mark_an_applicant_notice_read_by_id(self):
        self._decide("SUCCESSFUL")
        notif = Notification.objects.get(title="Congratulations! Application Successful")
        self.client.force_authenticate(user=self.hr)
        response = self.client.patch(f"/api/jobs/notifications/{notif.id}/read/")
        self.assertEqual(response.status_code, 404)
        notif.refresh_from_db()
        self.assertFalse(notif.is_read)

    def test_the_applicant_can_mark_their_own_notice_read(self):
        self._decide("SUCCESSFUL")
        notif = Notification.objects.get(title="Congratulations! Application Successful")
        self.client.force_authenticate(user=self.applicant)
        response = self.client.patch(f"/api/jobs/notifications/{notif.id}/read/")
        self.assertEqual(response.status_code, 200)
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)

    def test_hr_mark_all_read_leaves_the_applicant_notice_unread(self):
        self._decide("SUCCESSFUL")
        self.client.force_authenticate(user=self.hr)
        response = self.client.post("/api/jobs/notifications/mark-all-read/")
        self.assertEqual(response.status_code, 200)
        notif = Notification.objects.get(title="Congratulations! Application Successful")
        notif.refresh_from_db()
        self.assertFalse(
            notif.is_read,
            "Mark-all-read on the staff side must not consume an applicant's notices.",
        )

    def test_the_outcome_notice_is_not_duplicated_when_the_status_is_re_saved(self):
        self._decide("SUCCESSFUL")
        self._decide("SUCCESSFUL")
        self.assertEqual(
            Notification.objects.filter(
                title="Congratulations! Application Successful"
            ).count(),
            1,
        )
