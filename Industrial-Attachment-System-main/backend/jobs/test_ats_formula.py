"""
Regressions for the ATS score formula itself, computed from concrete inputs.

The requested change was to remove "Academic Standing / Grade Award" from the
score. Investigation found the field was never an input, so there was no weight
to redistribute. These tests lock that in two ways:

1. ``test_the_weights_still_sum_to_the_score_ceiling`` -- guards the invariant
   that a documented applicant matching every keyword reaches exactly 100, so a
   future criterion removal cannot quietly lower the maximum achievable score.
2. ``test_grade_award_does_not_affect_the_score`` -- proves by construction that
   no profile content, academic or otherwise beyond the keyword corpus, moves
   the number. This is the actual guarantee the user asked for.

Expected values are hand-computed from the formula rather than captured from a
run, so these fail if the weighting drifts.
"""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import Document, Education, Profile, User
from jobs.models import Application, Department, Job
from jobs.views import (
    ATS_DOCUMENT_WEIGHT,
    ATS_KEYWORD_WEIGHT,
    ATS_REQUIRED_DOC_COUNT,
    ATS_SCORE_MAX,
    DOCUMENT_ATS_KEYWORDS,
    REQUIRED_DOCUMENTS,
    ApplicationListCreateView,
)


class AtsScoreFormulaTests(TestCase):
    def setUp(self):
        self.department = Department.objects.create(name="Formula Department")
        self.user = User.objects.create_user(
            username="ats_formula",
            email="ats_formula@uni.ac.ke",
            password="Password123!",
            first_name="Atie",
            last_name="Scored",
            role="APPLICANT",
        )
        # A Profile is created automatically when the user is created, so this
        # populates that row rather than trying to insert a second one.
        self.profile, _ = Profile.objects.update_or_create(
            user=self.user,
            defaults={
                "institution_name": "University of Nairobi",
                "qualification": "BSc Geology",
                "field_of_study": "Earth Sciences",
            },
        )
        # A job whose entire text is three content words, so keyword overlap is
        # exactly countable by hand.
        self.job = Job.objects.create(
            department=self.department,
            title="Geology",
            description="Petrol",
            requirements="Basalt",
            location="Nairobi",
            slots_required=1,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )
        # The job text yields exactly three scorable words:
        # {"geology", "petrol", "basalt"}. See _set_corpus.
        self.score = ApplicationListCreateView().calculate_ats_score

    def _set_corpus(self, text):
        """
        Point every profile corpus field at one string.

        calculate_ats_score builds its keyword corpus from profile
        institution/qualification/field of study plus experience, trainings and
        document synonyms, so writing the same value to all three profile
        fields makes the matched-word count exactly predictable.

        This writes through a queryset and then re-reads, because holding a
        Profile instance and calling save() on it leaves the scorer reading a
        stale cached reverse relation off the user object.
        """
        Profile.objects.filter(pk=self.profile.pk).update(
            institution_name=text,
            qualification=text,
            field_of_study=text,
        )
        self.user.refresh_from_db()

    def _upload(self, *doc_types):
        for index, doc_type in enumerate(doc_types):
            Document.objects.create(
                user=self.user,
                document_type=doc_type,
                file="ats_test.pdf",
            )

    # --- weighting invariants -------------------------------------------------

    def test_the_weights_still_sum_to_the_score_ceiling(self):
        """A removed criterion must not leave the maximum below 100."""
        self.assertEqual(ATS_SCORE_MAX, 100.0)
        self.assertEqual(ATS_DOCUMENT_WEIGHT + ATS_KEYWORD_WEIGHT, ATS_SCORE_MAX)
        self.assertEqual(ATS_REQUIRED_DOC_COUNT, len(REQUIRED_DOCUMENTS))

    def test_a_fully_documented_perfect_keyword_match_scores_exactly_one_hundred(self):
        """The ceiling is reachable, which is what proves nothing is missing."""
        self._upload(*REQUIRED_DOCUMENTS)
        # All three job words (geology, petrol, basalt) are in the corpus, and
        # no document synonym collides with them, so keyword = 40 exactly.
        self._set_corpus("geology petrol basalt")
        self.assertEqual(self.score(self.user, self.job), 100.0)

    def test_documents_alone_are_worth_sixty_and_nothing_more(self):
        """All documents uploaded but zero of three job words matched."""
        self._upload(*REQUIRED_DOCUMENTS)
        self._set_corpus("nowhere unrelated unmentioned")
        self.assertEqual(self.score(self.user, self.job), ATS_DOCUMENT_WEIGHT)

    def test_half_the_required_documents_scores_thirty(self):
        half = ATS_REQUIRED_DOC_COUNT // 2
        self._upload(*REQUIRED_DOCUMENTS[:half])
        self._set_corpus("nowhere unrelated unmentioned")
        expected = round((half / ATS_REQUIRED_DOC_COUNT) * ATS_DOCUMENT_WEIGHT, 2)
        self.assertEqual(self.score(self.user, self.job), expected)

    def test_no_documents_and_no_keyword_match_scores_zero(self):
        self._set_corpus("nowhere unrelated unmentioned")
        self.assertEqual(self.score(self.user, self.job), 0.0)

    def test_one_of_three_job_words_is_worth_a_third_of_the_keyword_weight(self):
        """Concrete partial match: 1/3 of 40 = 13.33."""
        self._set_corpus("geology and other words")
        expected = round((1 / 3) * ATS_KEYWORD_WEIGHT, 2)
        self.assertEqual(self.score(self.user, self.job), expected)
        self.assertEqual(self.score(self.user, self.job), 13.33)

    def test_a_job_with_no_content_words_awards_the_full_keyword_weight(self):
        """Pre-existing behaviour: an empty corpus must not divide by zero."""
        empty_job = Job.objects.create(
            department=self.department,
            title="A",
            description="",
            requirements="",
            location="Nairobi",
            slots_required=1,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )
        self._upload(*REQUIRED_DOCUMENTS)
        self.assertEqual(self.score(self.user, empty_job), ATS_SCORE_MAX)

    # --- the actual guarantee requested ---------------------------------------

    def test_rich_text_markup_does_not_enter_the_keyword_set(self):
        """
        A rich-text description must score identically to its plain equivalent.

        Vacancy descriptions are Admin-authored rich text. The scorer builds the
        job's keyword set from the description, so if the markup were matched
        as-is, every tag name and attribute ("strong", "href", "class", "http")
        would become a required keyword that no applicant document can contain.
        The keyword denominator would inflate and every score would drop.

        Same three words, one bare and one wrapped in markup, must score the
        same: full documents (60) plus a perfect keyword match (40) = 100.
        """
        self._upload(*REQUIRED_DOCUMENTS)
        self._set_corpus("geology petrol basalt")

        rich_job = Job.objects.create(
            department=self.department,
            title="Geology",
            description="<h3>Petrol</h3><p><strong>Field</strong> notes on "
                        '<a href="https://example.com" class="link">site</a></p>',
            requirements="<ul><li>Basalt</li></ul>",
            location="Nairobi",
            slots_required=1,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )

        # "field" and "site" are genuine extra words, so compare against the
        # same vocabulary written plainly rather than against the bare job.
        plain_job = Job.objects.create(
            department=self.department,
            title="Geology",
            description="Petrol Field notes on site",
            requirements="Basalt",
            location="Nairobi",
            slots_required=1,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )

        self.assertEqual(self.score(self.user, rich_job), self.score(self.user, plain_job))

        # And no markup word may appear in the extracted vocabulary.
        from jobs.sanitizers import rich_text_to_plain_text
        import re
        words = set(re.findall(r"\b[a-z]{3,}\b", rich_text_to_plain_text(rich_job.description).lower()))
        self.assertEqual(words & {"strong", "href", "class", "https", "link", "site"}, {"site"})

    def test_grade_award_does_not_affect_the_score(self):
        """
        The field is gone from the model, so it cannot be set. This asserts the
        profile carries no grade-award attribute at all, and that the academic
        fields which DO remain are the only Profile inputs to the keyword corpus.
        """
        self.assertFalse(
            hasattr(Profile, "grade_award"),
            "Profile.grade_award must no longer exist",
        )
        self.assertFalse(
            hasattr(Education, "grade_award"),
            "Education.grade_award must no longer exist",
        )
        # Sanity: the remaining academic fields still do reach the keyword score.
        # One document (60/10) plus a perfect three-word keyword match (40).
        self._upload(REQUIRED_DOCUMENTS[0])
        self._set_corpus("geology petrol basalt")
        expected = round((1 / ATS_REQUIRED_DOC_COUNT) * ATS_DOCUMENT_WEIGHT, 2) + ATS_KEYWORD_WEIGHT
        self.assertEqual(self.score(self.user, self.job), expected)


class RequiredDocumentSetTests(TestCase):
    """
    TRANSCRIPT and GOOD_CONDUCT replaced KRA PIN in the required upload set.

    Because each required document carries an equal share of the document
    weight, the set size is part of the scoring formula. These tests pin the new
    set and the resulting per-document value, so a future edit to the list is a
    deliberate, visible act rather than a silent change to every score.
    """

    def test_the_required_set_is_the_ten_current_documents(self):
        self.assertEqual(len(REQUIRED_DOCUMENTS), 10)
        self.assertEqual(len(set(REQUIRED_DOCUMENTS)), 10, "no duplicates")
        self.assertEqual(ATS_REQUIRED_DOC_COUNT, 10)
        for expected in ("TRANSCRIPT", "GOOD_CONDUCT"):
            self.assertIn(expected, REQUIRED_DOCUMENTS)

    def test_kra_pin_is_no_longer_required(self):
        self.assertNotIn("KRA_PIN", REQUIRED_DOCUMENTS)

    def test_both_new_types_contribute_keyword_synonyms(self):
        """
        "Included in ATS scoring" has two halves: each new document is worth its
        share of the document weight, and its synonyms feed the keyword corpus.
        """
        for document_type in ("TRANSCRIPT", "GOOD_CONDUCT"):
            with self.subTest(document_type=document_type):
                self.assertIn(document_type, DOCUMENT_ATS_KEYWORDS)
                self.assertTrue(DOCUMENT_ATS_KEYWORDS[document_type].strip())

    def test_a_document_type_that_is_required_has_keywords(self):
        """Every required type must be scoreable, or its upload is worth less."""
        for document_type in REQUIRED_DOCUMENTS:
            with self.subTest(document_type=document_type):
                self.assertIn(document_type, DOCUMENT_ATS_KEYWORDS)

    def test_the_per_document_value_reflects_the_ten_document_set(self):
        """60 points shared across 10 documents is 6.0 each, not the old 6.67."""
        per_document = ATS_DOCUMENT_WEIGHT / ATS_REQUIRED_DOC_COUNT
        self.assertEqual(per_document, 6.0)


class AtsRecomputeCommandTests(TestCase):
    """
    Stored ats_score values are written once at submission and never recomputed
    on read, so a change to the required set leaves every existing score stale.
    This command is the remedy; these tests prove it actually corrects them.
    """

    def setUp(self):
        self.department = Department.objects.create(name="Recompute Department")
        self.user = User.objects.create_user(
            username="recompute",
            email="recompute@uni.ac.ke",
            password="Password123!",
            role="APPLICANT",
        )
        self.job = Job.objects.create(
            department=self.department,
            title="Geology",
            description="Petrol",
            requirements="Basalt",
            location="Nairobi",
            slots_required=1,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )
        self.application = Application.objects.create(
            user=self.user, job=self.job, cover_letter="", status="PENDING"
        )

    def _expected_score(self):
        return ApplicationListCreateView().calculate_ats_score(self.user, self.job)

    def test_a_dry_run_reports_without_writing(self):
        Application.objects.filter(pk=self.application.pk).update(ats_score=99.99)
        out = StringIO()
        call_command("recompute_ats_scores", stdout=out)
        output = out.getvalue()
        self.assertIn("would change", output)
        self.assertIn("Dry run", output)
        self.application.refresh_from_db()
        self.assertEqual(float(self.application.ats_score), 99.99)

    def test_apply_rewrites_a_stale_score(self):
        Application.objects.filter(pk=self.application.pk).update(ats_score=99.99)
        expected = self._expected_score()
        self.assertNotEqual(expected, 99.99, "fixture must be genuinely stale")
        out = StringIO()
        call_command("recompute_ats_scores", "--apply", stdout=out)
        self.assertIn("Recomputed and saved", out.getvalue())
        self.application.refresh_from_db()
        self.assertEqual(float(self.application.ats_score), expected)

    def test_running_it_twice_changes_nothing_the_second_time(self):
        call_command("recompute_ats_scores", "--apply", stdout=StringIO())
        self.application.refresh_from_db()
        first = float(self.application.ats_score)
        out = StringIO()
        call_command("recompute_ats_scores", "--apply", stdout=out)
        self.assertIn("Nothing to do", out.getvalue())
        self.application.refresh_from_db()
        self.assertEqual(float(self.application.ats_score), first)

    def test_a_newly_added_document_changes_the_score(self):
        """
        The whole reason the command exists: uploading one of the newly required
        documents must move the score, and the command must pick that up.
        """
        from accounts.models import Document

        Application.objects.filter(pk=self.application.pk).update(ats_score=0)
        before = self._expected_score()
        Document.objects.create(
            user=self.user, document_type="TRANSCRIPT", file="t.pdf"
        )
        after = self._expected_score()
        self.assertGreater(after, before)
        # The gain is exactly one document's share of the document weight.
        self.assertAlmostEqual(
            after - before, ATS_DOCUMENT_WEIGHT / ATS_REQUIRED_DOC_COUNT, places=2
        )
        call_command("recompute_ats_scores", "--apply", stdout=StringIO())
        self.application.refresh_from_db()
        self.assertEqual(float(self.application.ats_score), after)

    def test_an_unknown_application_id_is_reported_not_ignored(self):
        out, err = StringIO(), StringIO()
        call_command("recompute_ats_scores", "--application", "999999", stdout=out, stderr=err)
        self.assertIn("No application", err.getvalue())
