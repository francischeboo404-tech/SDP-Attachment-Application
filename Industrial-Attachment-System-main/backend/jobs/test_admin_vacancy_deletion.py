"""
Deleting a vacancy must work for an Admin, and must not destroy the records that
hang off it.

Two defects:

  1. `JobDetailView` used `IsHROrReadOnlyManagement`, whose write branch admits
     HR alone. An Admin clicking "Delete" in the Vacancies page got a 403, and
     the frontend showed a generic "Failed to delete job" alert.

  2. `Application.job` is `on_delete=CASCADE`. A hard delete of a vacancy that
     has applicants would permanently destroy their applications, and with them
     the deployments, clearances and recommendation letters that cascade from
     those applications. The system already has a designed, reversible answer --
     archiving, with a System Archives module that can restore -- so deletion
     routes there instead of cascading the graph away.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from datetime import timedelta

from django.utils import timezone
from jobs.models import Department, Job, Application, Deployment, Clearance

User = get_user_model()


class AdminVacancyDeletionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dept = Department.objects.create(
            name="Geology Directorate", location="Nairobi",
            contact_email="geology@petroleum.go.ke",
        )
        self.admin = User.objects.create_user(
            username="del_admin", email="del_admin@petroleum.go.ke", password="pw", role="ADMIN",
        )
        self.hr = User.objects.create_user(
            username="del_hr", email="del_hr@petroleum.go.ke", password="pw", role="HR",
        )
        self.applicant = User.objects.create_user(
            username="del_applicant", email="del_applicant@uni.ac.ke", password="pw", role="APPLICANT",
        )

    def _job(self, **kwargs):
        defaults = dict(
            department=self.dept, title="Geologist Attachee", description="<p>Field work.</p>",
            requirements="BSc Geology", job_type="ATTACHMENT", location="Nairobi",
            slots_required=2, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30), is_active=True,
        )
        defaults.update(kwargs)
        return Job.objects.create(**defaults)

    def test_an_admin_can_delete_a_vacancy(self):
        job = self._job()
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"/api/jobs/vacancies/{job.id}/")
        self.assertEqual(response.status_code, 204, response.content)

    def test_hr_can_still_delete_a_vacancy(self):
        job = self._job()
        self.client.force_authenticate(user=self.hr)
        response = self.client.delete(f"/api/jobs/vacancies/{job.id}/")
        self.assertEqual(response.status_code, 204, response.content)

    def test_a_deleted_vacancy_leaves_the_active_listing(self):
        job = self._job()
        self.client.force_authenticate(user=self.admin)
        self.client.delete(f"/api/jobs/vacancies/{job.id}/")
        job.refresh_from_db()
        # Either gone for good, or withdrawn from the active list.
        self.assertFalse(
            Job.objects.filter(pk=job.pk, is_archived=False).exists(),
            "A deleted vacancy must not remain in the active listing.",
        )

    def test_deleting_a_vacancy_does_not_destroy_its_applications(self):
        job = self._job()
        application = Application.objects.create(
            job=job, user=self.applicant, status="PENDING", cover_letter="",
        )
        deployment = Deployment.objects.create(
            application=application, department=self.dept, status="DEPLOYED",
            start_date=timezone.now().date(), planned_end_date=timezone.now().date() + timedelta(days=84),
        )
        clearance = Clearance.objects.create(
            application=application, deployment=deployment, status="NOT_STARTED",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"/api/jobs/vacancies/{job.id}/")
        self.assertEqual(response.status_code, 204, response.content)

        application.refresh_from_db()
        clearance.refresh_from_db()
        self.assertTrue(
            Application.objects.filter(pk=application.pk).exists(),
            "Deleting a vacancy must not cascade away the applicant's record.",
        )
        self.assertTrue(Clearance.objects.filter(pk=clearance.pk).exists())
        self.assertEqual(application.job_id, job.pk)

    def test_an_archived_vacancy_can_be_restored(self):
        job = self._job()
        self.client.force_authenticate(user=self.admin)
        self.client.delete(f"/api/jobs/vacancies/{job.id}/")
        job.refresh_from_db()
        self.assertTrue(job.is_archived, "Deletion should archive so it stays recoverable.")

        response = self.client.post(f"/api/jobs/vacancies/{job.id}/archive/")
        self.assertEqual(response.status_code, 200, response.content)
        job.refresh_from_db()
        self.assertFalse(job.is_archived)

    # Deletion must not become a general write grant.
    def test_an_admin_still_cannot_edit_a_vacancy(self):
        job = self._job()
        self.client.force_authenticate(user=self.admin)
        response = self.client.put(
            f"/api/jobs/vacancies/{job.id}/",
            {"title": "Renamed by admin", "description": "<p>x</p>", "requirements": "x",
             "job_type": "ATTACHMENT", "location": "Nairobi", "slots_required": 1,
             "duration_weeks": 12,
             "deadline": (timezone.now() + timedelta(days=10)).isoformat()},
            format="json",
        )
        self.assertIn(response.status_code, (401, 403))

    def test_a_director_still_cannot_delete_a_vacancy(self):
        director = User.objects.create_user(
            username="del_director", email="del_director@petroleum.go.ke",
            password="pw", role="DEPARTMENT_DIRECTOR",
        )
        director.department = self.dept
        director.save()
        job = self._job()
        self.client.force_authenticate(user=director)
        response = self.client.delete(f"/api/jobs/vacancies/{job.id}/")
        self.assertIn(response.status_code, (401, 403))
        self.assertTrue(Job.objects.filter(pk=job.pk).exists())

    def test_an_applicant_still_cannot_delete_a_vacancy(self):
        job = self._job()
        self.client.force_authenticate(user=self.applicant)
        response = self.client.delete(f"/api/jobs/vacancies/{job.id}/")
        self.assertIn(response.status_code, (401, 403))
        self.assertTrue(Job.objects.filter(pk=job.pk).exists())

    # ── The promises the confirmation dialog makes to the admin ────────────────

    def test_a_deleted_vacancy_appears_in_system_archives(self):
        job = self._job()
        self.client.force_authenticate(user=self.admin)
        self.client.delete(f"/api/jobs/vacancies/{job.id}/")

        response = self.client.get("/api/jobs/archives/", {"entity_type": "VACANCY"})
        self.assertEqual(response.status_code, 200, response.content)
        ids = {item["id"] for item in response.json()["results"]}
        self.assertIn(job.id, ids, "The dialog promises the vacancy moves to System Archives.")

    def test_a_deleted_vacancy_can_be_restored_from_system_archives(self):
        job = self._job()
        self.client.force_authenticate(user=self.admin)
        self.client.delete(f"/api/jobs/vacancies/{job.id}/")

        response = self.client.post(f"/api/jobs/archives/vacancy/{job.id}/restore/")
        self.assertEqual(response.status_code, 200, response.content)

        job.refresh_from_db()
        self.assertFalse(job.is_archived)
        self.assertTrue(job.is_active)

    def test_a_deleted_vacancy_disappears_from_the_public_listing(self):
        job = self._job()
        self.client.force_authenticate(user=self.admin)
        self.client.delete(f"/api/jobs/vacancies/{job.id}/")

        self.client.force_authenticate(user=None)
        response = self.client.get("/api/jobs/vacancies/public/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(job.id, {j["id"] for j in response.json()["results"]})

    def test_a_restored_vacancy_becomes_visible_to_applicants_again(self):
        # The restore used to clear only `is_archived`, leaving `is_active`
        # False. HR and Admin would then see it in the Active tab while the
        # applicant listing -- which filters on `is_active=True` -- never
        # returned it, so a restored vacancy was effectively invisible.
        job = self._job()
        self.client.force_authenticate(user=self.admin)
        self.client.delete(f"/api/jobs/vacancies/{job.id}/")
        self.client.post(f"/api/jobs/archives/vacancy/{job.id}/restore/")

        applicant = User.objects.create_user(
            username="restore_applicant", email="restore@uni.ac.ke", password="pw", role="APPLICANT",
        )
        self.client.force_authenticate(user=applicant)
        response = self.client.get("/api/jobs/vacancies/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(job.id, {j["id"] for j in response.json()["results"]})

    def test_archiving_then_unarchiving_keeps_the_active_flag_consistent(self):
        job = self._job()
        self.client.force_authenticate(user=self.admin)

        self.client.post(f"/api/jobs/vacancies/{job.id}/archive/")
        job.refresh_from_db()
        self.assertTrue(job.is_archived)
        self.assertFalse(job.is_active, "An archived vacancy must not stay flagged active.")

        self.client.post(f"/api/jobs/vacancies/{job.id}/archive/")
        job.refresh_from_db()
        self.assertFalse(job.is_archived)
        self.assertTrue(job.is_active, "An unarchived vacancy must be active again.")
