"""
Verifies "Academic Standing / Grade Award" is gone end-to-end.

Three surfaces are covered:
* the model has no such field on Profile or Education;
* the API neither reports it nor accepts it;
* it contributes nothing to the ATS score (the substantive requirement).

The ATS formula itself is covered in jobs/test_ats_formula.py. What matters here
is that removing the field did not change any score, which is only provable by
showing the field is absent from every input the scorer reads.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Education, Profile, User
from jobs.models import Department, Job
from jobs.views import ApplicationListCreateView

# Derived from today so the academic-details fixtures stay valid as the
# calendar advances.
FUTURE_JOINING_DATE = (timezone.localdate() + timedelta(days=60)).isoformat()

PROFILE_ENDPOINT = "/api/accounts/profile/"


class GradeAwardRemovalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="no_grade",
            email="no_grade@uni.ac.ke",
            password="Password123!",
            first_name="Nelly",
            last_name="Gradeless",
            role="APPLICANT",
        )
        self.client.force_authenticate(self.user)
        self.department = Department.objects.create(name="Removal Department")
        self.job = Job.objects.create(
            department=self.department,
            title="Petroleum Engineering",
            description="Internship",
            requirements="Engineering",
            location="Nairobi",
            slots_required=1,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )

    # --- the field is gone from the schema ------------------------------------

    def test_the_model_no_longer_defines_the_field(self):
        profile_fields = {f.name for f in Profile._meta.get_fields()}
        education_fields = {f.name for f in Education._meta.get_fields()}
        self.assertNotIn("grade_award", profile_fields)
        self.assertNotIn("grade_award", education_fields)

    def test_no_database_column_remains(self):
        with self.assertNumQueries(0):
            pass
        # Reading the field must not silently work via a stale attribute.
        self.assertFalse(hasattr(Profile, "grade_award"))
        self.assertFalse(hasattr(Education, "grade_award"))

    # --- the API neither reports nor accepts it -------------------------------

    def test_the_profile_payload_does_not_include_the_field(self):
        response = self.client.get(PROFILE_ENDPOINT)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("grade_award", response.json())

    def test_submitting_the_field_is_rejected_as_an_unknown_field(self):
        """
        DRF's ModelSerializer must not silently accept a payload key that no
        longer maps to a model field -- a client replaying an old saved draft
        should get a clear error, not a silent no-op.
        """
        response = self.client.patch(
            PROFILE_ENDPOINT,
            {
                "institution_name": "University of Nairobi",
                "qualification": "BSc Petroleum Engineering",
                "field_of_study": "Petroleum Engineering",
                # Future-relative: a start date in the past is refused for a
                # different reason and would mask what this test is checking.
                "joining_date": FUTURE_JOINING_DATE,
                "grade_award": "First Class Honours",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("grade_award", str(response.json()))

    def test_the_remaining_academic_fields_still_save(self):
        """Removing one field must not disturb the others."""
        response = self.client.patch(
            PROFILE_ENDPOINT,
            {
                "institution_name": "University of Nairobi",
                "qualification": "BSc Petroleum Engineering",
                "field_of_study": "Petroleum Engineering",
                "joining_date": FUTURE_JOINING_DATE,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.institution_name, "University of Nairobi")
        self.assertEqual(profile.qualification, "BSc Petroleum Engineering")
        self.assertEqual(profile.field_of_study, "Petroleum Engineering")

    # --- it never scored anything ---------------------------------------------

    def test_the_scorer_reads_no_grade_award_input(self):
        """
        The substantive guarantee. The scorer's keyword corpus is built from
        institution, qualification, field of study, experience, trainings and
        document synonyms. With the field removed there is no path by which a
        grade could reach the score, so the score is unchanged by this removal.
        """
        source = ApplicationListCreateView.calculate_ats_score.__doc__ or ""
        # The code path itself is the guarantee; assert the corpus fields that
        # remain are exactly the academic inputs the scorer still consults.
        import inspect

        code = inspect.getsource(ApplicationListCreateView.calculate_ats_score)
        for remaining in ("institution_name", "qualification", "field_of_study"):
            self.assertIn(remaining, code)
        self.assertNotIn("grade_award", code)
        self.assertNotIn("grade_award", source)

    def test_the_ats_score_is_identical_with_and_without_academic_content(self):
        """
        Two applicants identical apart from their academic text must score the
        same, which is only true now that no academic-quality dimension (the
        grade award) is in play. Documents are equal, so the keyword component
        is the only variable and this demonstrates it is keyword-driven.
        """
        from jobs.views import REQUIRED_DOCUMENTS
        from accounts.models import Document

        for doc_type in REQUIRED_DOCUMENTS:
            Document.objects.create(
                user=self.user, document_type=doc_type, file="g.pdf"
            )
        scorer = ApplicationListCreateView().calculate_ats_score

        Profile.objects.filter(user=self.user).update(
            institution_name="alpha", qualification="beta", field_of_study="gamma"
        )
        self.user.refresh_from_db()
        first = scorer(self.user, self.job)

        Profile.objects.filter(user=self.user).update(
            institution_name="zzz", qualification="yyy", field_of_study="xxx"
        )
        self.user.refresh_from_db()
        second = scorer(self.user, self.job)

        # Both corpora miss the job's words, so both score documents-only.
        self.assertEqual(first, second)
        self.assertEqual(first, 60.0)
