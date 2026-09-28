from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from datetime import timedelta

from django.utils import timezone
from jobs.models import Department, Job

User = get_user_model()


class ApplicantVacancyVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dept = Department.objects.create(
            name="Geology Directorate", location="Nairobi",
            contact_email="geology@petroleum.go.ke",
        )
        self.job = Job.objects.create(
            department=self.dept,
            title="Geologist Industrial Attachee",
            description="<p>Field mapping.</p>",
            requirements="BSc Geology",
            job_type="ATTACHMENT",
            location="Nairobi",
            slots_required=2,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
            is_active=True,
        )
        self.applicant = User.objects.create_user(
            username="app_vac", email="app_vac@uni.ac.ke", password="pw", role="APPLICANT"
        )

    def test_an_applicant_can_list_open_vacancies(self):
        self.client.force_authenticate(user=self.applicant)
        response = self.client.get("/api/jobs/vacancies/")
        self.assertEqual(
            response.status_code, 200,
            "An applicant must be able to read the vacancy list from the portal.",
        )
        ids = [j["id"] for j in response.json()["results"]]
        self.assertIn(self.job.id, ids)

    def test_an_anonymous_visitor_is_still_refused(self):
        response = self.client.get("/api/jobs/vacancies/")
        self.assertIn(response.status_code, (401, 403))

    # The read permission was widened; these prove the queryset was narrowed to
    # match, so applicants gain the openings without gaining internal records.
    def _applicant_ids(self, **params):
        self.client.force_authenticate(user=self.applicant)
        response = self.client.get("/api/jobs/vacancies/", params)
        self.assertEqual(response.status_code, 200)
        return {j["id"] for j in response.json()["results"]}

    def test_an_applicant_does_not_see_a_closed_vacancy(self):
        closed = Job.objects.create(
            department=self.dept, title="Closed", description="<p>x</p>", job_type="ATTACHMENT",
            location="Nairobi", slots_required=1, duration_weeks=12,
            deadline=timezone.now() - timedelta(days=1), is_active=True,
        )
        self.assertNotIn(closed.id, self._applicant_ids())

    def test_an_applicant_does_not_see_a_deactivated_vacancy(self):
        inactive = Job.objects.create(
            department=self.dept, title="Deactivated", description="<p>x</p>", job_type="ATTACHMENT",
            location="Nairobi", slots_required=1, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=10), is_active=False,
        )
        self.assertNotIn(inactive.id, self._applicant_ids())

    def test_an_applicant_does_not_see_a_non_attachment_vacancy(self):
        other = Job.objects.create(
            department=self.dept, title="Internship", description="<p>x</p>", job_type="INTERNSHIP",
            location="Nairobi", slots_required=1, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=10), is_active=True,
        )
        self.assertNotIn(other.id, self._applicant_ids())

    # The archive toggles are management controls. Honouring them for an applicant
    # would expose archived postings, which are internal records.
    def test_an_applicant_cannot_surface_archived_vacancies(self):
        archived = Job.objects.create(
            department=self.dept, title="Archived", description="<p>x</p>", job_type="ATTACHMENT",
            location="Nairobi", slots_required=1, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=10), is_active=True, is_archived=True,
        )
        self.assertNotIn(archived.id, self._applicant_ids(include_archived="true"))
        self.assertNotIn(archived.id, self._applicant_ids(archived="true"))
        self.assertNotIn(archived.id, self._applicant_ids(archived="true", include_archived="true"))

    def test_an_applicant_still_cannot_create_a_vacancy(self):
        self.client.force_authenticate(user=self.applicant)
        response = self.client.post("/api/jobs/vacancies/", {
            "department": self.dept.id, "title": "Sneaky", "description": "<p>x</p>",
            "requirements": "none", "job_type": "ATTACHMENT", "location": "Nairobi",
            "slots_required": 1, "duration_weeks": 12,
            "deadline": (timezone.now() + timedelta(days=30)).isoformat(),
        }, format="json")
        self.assertIn(response.status_code, (401, 403))

    def test_management_roles_still_see_archived_vacancies(self):
        hr = User.objects.create_user(
            username="hr_vac", email="hr_vac@petroleum.go.ke", password="pw", role="HR"
        )
        archived = Job.objects.create(
            department=self.dept, title="Archived", description="<p>x</p>", job_type="ATTACHMENT",
            location="Nairobi", slots_required=1, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=10), is_active=True, is_archived=True,
        )
        self.client.force_authenticate(user=hr)
        response = self.client.get("/api/jobs/vacancies/", {"include_archived": "true"})
        self.assertEqual(response.status_code, 200)
        self.assertIn(archived.id, {j["id"] for j in response.json()["results"]})

    def test_an_applicant_can_narrow_to_one_department(self):
        other_dept = Department.objects.create(
            name="Downstream Directorate", location="Mombasa",
            contact_email="down@petroleum.go.ke",
        )
        elsewhere = Job.objects.create(
            department=other_dept, title="Downstream", description="<p>x</p>", job_type="ATTACHMENT",
            location="Mombasa", slots_required=1, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=10), is_active=True,
        )
        ids = self._applicant_ids(department=other_dept.id)
        self.assertIn(elsewhere.id, ids)
        self.assertNotIn(self.job.id, ids)
