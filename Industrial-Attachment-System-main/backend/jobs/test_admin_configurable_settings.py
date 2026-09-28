"""
Tests for Admin-configurable institutional content and ATS scoring thresholds.

Covers the four guarantees this feature has to hold:
  1. Eligibility content is sanitized on save and again on render.
  2. Saving eligibility content invalidates the public cache key.
  3. ATS threshold configurations that would break tiering are rejected.
  4. Changing thresholds re-tiers a given score through the *actual* shared
     tiering computation (AtsScoringConfiguration / calculate_statistical_metrics),
     never a reimplementation of it.
"""
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from jobs.models import Application, AtsScoringConfiguration, EligibilitySetting, Job
from jobs.sanitizers import sanitize_rich_text
from jobs.signals import CACHE_KEY_ELIGIBILITY_SETTINGS
from jobs.views import calculate_statistical_metrics


class BaseAdminTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username="settings_admin",
            password="AdminPass!2026",
            email="settings_admin@petroleum.go.ke",
            role="ADMIN",
            first_name="Settings",
            last_name="Admin",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)


# ---------------------------------------------------------------------------
# 1. Sanitization
# ---------------------------------------------------------------------------

class EligibilitySanitizationTests(BaseAdminTestCase):
    endpoint = "/api/jobs/eligibility-settings/"

    def test_script_tag_is_stripped_on_save(self):
        res = self.client.patch(
            self.endpoint,
            {"general_statement": "<p>Safe intro</p><script>alert('xss')</script>"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        stored = EligibilitySetting.get_settings().general_statement
        self.assertNotIn("<script", stored.lower())
        self.assertNotIn("alert(", stored)
        # Text content that was inside the script tag is dropped along with the tag.
        self.assertIn("Safe intro", stored)

    def test_event_handler_attributes_are_stripped(self):
        res = self.client.patch(
            self.endpoint,
            {"general_statement": '<p onclick="steal()">Click me</p><img src=x onerror="steal()">'},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        stored = EligibilitySetting.get_settings().general_statement
        self.assertNotIn("onclick", stored.lower())
        self.assertNotIn("onerror", stored.lower())
        self.assertIn("Click me", stored)

    def test_javascript_protocol_links_are_stripped(self):
        payload = '<p><a href="javascript:alert(1)">Bad link</a></p>'
        res = self.client.patch(self.endpoint, {"general_statement": payload}, format="json")
        self.assertEqual(res.status_code, 200)
        stored = EligibilitySetting.get_settings().general_statement
        self.assertNotIn("javascript:", stored.lower())
        self.assertIn("Bad link", stored)

    def test_allowed_formatting_survives_sanitization(self):
        rich = (
            "<h3>Who can apply</h3>"
            "<p>Applicants must be <strong>enrolled</strong> and <em>accredited</em>.</p>"
            "<ul><li>Undergraduate</li><li>Diploma</li></ul>"
            "<ol><li>Register</li><li>Apply</li></ol>"
            '<p><a href="https://petroleum.go.ke">More info</a></p>'
        )
        res = self.client.patch(self.endpoint, {"general_statement": rich}, format="json")
        self.assertEqual(res.status_code, 200)
        stored = EligibilitySetting.get_settings().general_statement
        for fragment in ["<h3>", "<strong>", "<em>", "<ul>", "<li>", "<ol>", "<p>", 'href="https://petroleum.go.ke"']:
            self.assertIn(fragment, stored)

    def test_sanitize_on_render_also_strips_directly_injected_db_content(self):
        """Defense in depth: even a value written straight to the DB is sanitized on read."""
        obj = EligibilitySetting.get_settings()
        EligibilitySetting.objects.filter(pk=obj.pk).update(
            general_statement='<p>Legit</p><script>alert("raw")</script>'
        )
        obj.refresh_from_db()
        # Raw stored value is untouched in the DB...
        self.assertIn("<script", obj.general_statement)
        # ...but the render path is clean.
        self.assertNotIn("<script", obj.sanitized_statement)
        self.assertIn("Legit", obj.sanitized_statement)

    def test_public_endpoint_serves_sanitized_html(self):
        self.client.patch(
            self.endpoint,
            {"general_statement": "<p>Hello</p><script>alert('public')</script>"},
            format="json",
        )
        public = APIClient()
        res = public.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("<script", res.data["general_statement_html"].lower())
        self.assertNotIn("<script", res.data["general_statement"].lower())
        self.assertIn("Hello", res.data["general_statement_html"])

    def test_sanitizer_unit_behaviour(self):
        self.assertEqual(sanitize_rich_text("<p>ok</p>"), "<p>ok</p>")
        self.assertEqual(sanitize_rich_text(""), "")
        self.assertEqual(sanitize_rich_text(None), "")
        self.assertEqual(sanitize_rich_text("<iframe src=x></iframe>"), "")
        # Disallowed tags keep their inner text, they do not swallow the content.
        self.assertIn("kept", sanitize_rich_text("<marquee>kept</marquee>"))
        # Script-like elements are dropped WITH their contents, so the body of a
        # script block can never surface as literal text on the public page.
        self.assertEqual(sanitize_rich_text("<p>ok</p><script>alert(1)</script>"), "<p>ok</p>")
        self.assertNotIn("alert", sanitize_rich_text("<p>ok</p><script>alert(1)</script>"))
        self.assertNotIn("x{}", sanitize_rich_text("<style>.a{x{}</style>"))
        # Unclosed script block is dropped up to the end of the fragment.
        self.assertEqual(sanitize_rich_text("<p>ok</p><script>alert(1)"), "<p>ok</p>")


# ---------------------------------------------------------------------------
# 2. Cache invalidation
# ---------------------------------------------------------------------------

class EligibilityCacheInvalidationTests(BaseAdminTestCase):
    endpoint = "/api/jobs/eligibility-settings/"

    def test_public_get_populates_cache(self):
        public = APIClient()
        res = public.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(cache.get(CACHE_KEY_ELIGIBILITY_SETTINGS))

    def test_saving_content_invalidates_the_cache_key(self):
        public = APIClient()
        public.get(self.endpoint)
        self.assertIsNotNone(cache.get(CACHE_KEY_ELIGIBILITY_SETTINGS))

        self.client.patch(
            self.endpoint,
            {"general_statement": "<p>Brand new published policy</p>"},
            format="json",
        )
        self.assertIsNone(cache.get(CACHE_KEY_ELIGIBILITY_SETTINGS))

    def test_landing_page_reflects_new_content_immediately_after_save(self):
        self.client.patch(
            self.endpoint,
            {"general_statement": "<p>First policy</p>"},
            format="json",
        )
        public = APIClient()
        first = public.get(self.endpoint)
        self.assertIn("First policy", first.data["general_statement_html"])

        self.client.patch(
            self.endpoint,
            {"general_statement": "<h3>Updated heading</h3><p>Second policy</p>"},
            format="json",
        )

        second = public.get(self.endpoint)
        self.assertIn("Second policy", second.data["general_statement_html"])
        self.assertIn("<h3>Updated heading</h3>", second.data["general_statement_html"])
        self.assertNotIn("First policy", second.data["general_statement_html"])

    def test_signal_invalidates_cache_on_model_save(self):
        """The signal path is the primary invalidation route, independent of the view."""
        obj = EligibilitySetting.get_settings()
        cache.set(CACHE_KEY_ELIGIBILITY_SETTINGS, {"stale": True}, 900)
        obj.general_statement = "<p>Signal driven</p>"
        obj.save()
        self.assertIsNone(cache.get(CACHE_KEY_ELIGIBILITY_SETTINGS))


# ---------------------------------------------------------------------------
# 3. Threshold validation
# ---------------------------------------------------------------------------

class AtsThresholdValidationTests(BaseAdminTestCase):
    endpoint = "/api/jobs/ats-scoring-configuration/"

    def test_defaults_match_the_previous_hardcoded_boundaries(self):
        res = self.client.get(self.endpoint)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Decimal(str(res.data["exceptional_min"])), Decimal("90.00"))
        self.assertEqual(Decimal(str(res.data["highly_qualified_min"])), Decimal("75.00"))
        self.assertEqual(Decimal(str(res.data["qualified_min"])), Decimal("60.00"))
        self.assertEqual(Decimal(str(res.data["average_min"])), Decimal("50.00"))
        self.assertEqual(Decimal(str(res.data["qualification_benchmark"])), Decimal("70.00"))

    def test_inverted_boundaries_are_rejected(self):
        res = self.client.patch(
            self.endpoint,
            {"exceptional_min": "60", "highly_qualified_min": "80"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("highly_qualified_min", res.data)
        # Rejected config must not be persisted.
        config = AtsScoringConfiguration.get_config()
        self.assertEqual(config.exceptional_min, Decimal("90.00"))

    def test_equal_boundaries_are_rejected(self):
        res = self.client.patch(
            self.endpoint,
            {"exceptional_min": "75", "highly_qualified_min": "75"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("highly_qualified_min", res.data)

    def test_out_of_range_threshold_is_rejected(self):
        res = self.client.patch(self.endpoint, {"exceptional_min": "150"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("exceptional_min", res.data)

        res = self.client.patch(self.endpoint, {"average_min": "-5"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("average_min", res.data)

    def test_zero_top_boundary_is_rejected(self):
        res = self.client.patch(self.endpoint, {"exceptional_min": "0"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("exceptional_min", res.data)

    def test_zero_bottom_boundary_is_rejected(self):
        res = self.client.patch(self.endpoint, {"average_min": "0"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("average_min", res.data)

    def test_partial_update_validates_against_persisted_values(self):
        """A single-field PATCH must still be checked against the stored boundaries."""
        self.client.patch(self.endpoint, {"exceptional_min": "55"}, format="json")
        res = self.client.patch(self.endpoint, {"highly_qualified_min": "60"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_valid_configuration_is_accepted(self):
        res = self.client.patch(
            self.endpoint,
            {
                "exceptional_min": "92",
                "highly_qualified_min": "80",
                "qualified_min": "65",
                "average_min": "45",
                "qualification_benchmark": "72",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        config = AtsScoringConfiguration.get_config()
        self.assertEqual(config.exceptional_min, Decimal("92.00"))
        self.assertEqual(config.qualification_benchmark, Decimal("72.00"))

    def test_non_admin_cannot_read_or_write_thresholds(self):
        applicant = User.objects.create_user(
            username="tier_applicant",
            password="Pass!2026",
            email="tier_applicant@uni.ac.ke",
            role="APPLICANT",
        )
        client = APIClient()
        client.force_authenticate(user=applicant)
        self.assertEqual(client.get(self.endpoint).status_code, 403)
        self.assertEqual(
            client.patch(self.endpoint, {"exceptional_min": "99"}, format="json").status_code,
            403,
        )

    def test_anon_cannot_read_thresholds(self):
        # DRF answers 401 for unauthenticated requests to a non-public endpoint.
        res = APIClient().get(self.endpoint)
        self.assertEqual(res.status_code, 401)


# ---------------------------------------------------------------------------
# 4. Thresholds actually drive the shared tiering computation
# ---------------------------------------------------------------------------

class AtsTieringIsConfigDrivenTests(BaseAdminTestCase):
    endpoint = "/api/jobs/ats-scoring-configuration/"
    analytics_endpoint = "/api/jobs/reports/analytics/"

    def setUp(self):
        super().setUp()
        from jobs.models import Department

        self.department = Department.objects.create(name="Tiering Department")
        self.job = Job.objects.create(
            department=self.department,
            title="Tiering Analyst",
            description="Statistical analysis",
            requirements="Statistics",
            job_type="ATTACHMENT",
            slots_required=10,
            deadline="2030-01-01",
            is_active=True,
        )
        # One application per tier under the default boundaries. Application has
        # a unique (user, job) constraint, so each score needs its own applicant.
        self.applications = {}
        for index, score in enumerate([95.0, 80.0, 65.0, 55.0, 20.0]):
            applicant = User.objects.create_user(
                username=f"tier_applicant_{index}",
                password="Pass!2026",
                email=f"tier_applicant_{index}@uni.ac.ke",
                role="APPLICANT",
            )
            app = Application.objects.create(
                user=applicant,
                job=self.job,
                ats_score=Decimal(str(score)),
            )
            self.applications[score] = app

    def test_default_boundaries_reproduce_the_original_tier_labels(self):
        config = AtsScoringConfiguration.get_config()
        # The inclusive upper bound is the highest two-decimal score that still
        # falls below the next threshold, so "89.99" rather than "89": a score
        # of 89.99 is in this tier, and the old label denied it.
        self.assertEqual(
            [d["label"] for d in config.tier_definitions()],
            [
                "Tier 1: Exceptional (\u226590%)",
                "Tier 2: Highly Qualified (75-89.99%)",
                "Tier 3: Qualified (60-74.99%)",
                "Tier 4: Average (50-59.99%)",
                "Tier 5: Below Benchmark (<50%)",
            ],
        )

    def test_every_score_lands_in_exactly_one_tier(self):
        config = AtsScoringConfiguration.get_config()
        scores = [0, 49.99, 50, 59.99, 60, 74.99, 75, 89.99, 90, 100]
        buckets = config.stratify_scores(scores)
        self.assertEqual(sum(b["count"] for b in buckets), len(scores))
        self.assertEqual(len(buckets), 5)

    def test_tier_for_score_matches_the_shared_computation(self):
        config = AtsScoringConfiguration.get_config()
        self.assertEqual(config.tier_name_for_score(95), "Exceptional")
        self.assertEqual(config.tier_name_for_score(90), "Exceptional")
        self.assertEqual(config.tier_name_for_score(89.99), "Highly Qualified")
        self.assertEqual(config.tier_name_for_score(75), "Highly Qualified")
        self.assertEqual(config.tier_name_for_score(74.99), "Qualified")
        self.assertEqual(config.tier_name_for_score(60), "Qualified")
        self.assertEqual(config.tier_name_for_score(59.99), "Average")
        self.assertEqual(config.tier_name_for_score(50), "Average")
        self.assertEqual(config.tier_name_for_score(49.99), "Below Benchmark")
        self.assertEqual(config.tier_name_for_score(0), "Below Benchmark")

    def test_changing_thresholds_changes_which_tier_a_score_falls_into(self):
        """The core requirement: a threshold change re-tiers existing scores."""
        config = AtsScoringConfiguration.get_config()
        probe = 78.0
        # Under the default boundaries 78 sits in Tier 2 (75 <= 78 < 90).
        self.assertEqual(config.tier_name_for_score(probe), "Highly Qualified")

        res = self.client.patch(
            self.endpoint,
            {"exceptional_min": "95", "highly_qualified_min": "90", "qualified_min": "80", "average_min": "50"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        config = AtsScoringConfiguration.get_config()
        # The same unchanged score now sits below the raised Tier 3 boundary.
        self.assertEqual(config.tier_name_for_score(probe), "Average")

    def test_threshold_change_reflows_stratification_of_existing_scores(self):
        scores = [95.0, 80.0, 65.0, 55.0, 20.0]

        before = calculate_statistical_metrics(scores)
        before_counts = {b["tier"]: b["count"] for b in before["distribution_buckets"]}
        # Defaults: 95 -> Tier 1, 80 -> Tier 2, 65 -> Tier 3, 55 -> Tier 4, 20 -> Tier 5
        self.assertEqual(
            before_counts,
            {
                "Tier 1: Exceptional (\u226590%)": 1,
                "Tier 2: Highly Qualified (75-89.99%)": 1,
                "Tier 3: Qualified (60-74.99%)": 1,
                "Tier 4: Average (50-59.99%)": 1,
                "Tier 5: Below Benchmark (<50%)": 1,
            },
        )

        self.client.patch(
            self.endpoint,
            {"exceptional_min": "96", "highly_qualified_min": "85", "qualified_min": "70", "average_min": "60"},
            format="json",
        )

        after = calculate_statistical_metrics(scores)
        after_counts = {b["tier"]: b["count"] for b in after["distribution_buckets"]}
        # New boundaries: 95 -> Tier 2 (no longer exceptional), 80 -> Tier 3,
        # 65 -> Tier 4, 55 and 20 -> Tier 5.
        self.assertEqual(
            after_counts,
            {
                "Tier 1: Exceptional (\u226596%)": 0,
                "Tier 2: Highly Qualified (85-95.99%)": 1,
                "Tier 3: Qualified (70-84.99%)": 1,
                "Tier 4: Average (60-69.99%)": 1,
                "Tier 5: Below Benchmark (<60%)": 2,
            },
        )
        self.assertEqual(sum(after_counts.values()), len(scores))

    def test_tier_labels_track_the_configured_boundaries(self):
        self.client.patch(self.endpoint, {"exceptional_min": "95"}, format="json")
        config = AtsScoringConfiguration.get_config()
        self.assertEqual(config.tier_definitions()[0]["label"], "Tier 1: Exceptional (\u226595%)")
        self.assertEqual(config.empty_distribution_buckets()[0]["tier"], "Tier 1: Exceptional (\u226595%)")

    def test_qualification_benchmark_is_configurable(self):
        scores = [95.0, 80.0, 65.0, 55.0, 20.0]
        config = AtsScoringConfiguration.get_config()
        self.assertEqual(config.qualification_rate_for(scores), 40.0)  # 95 and 80 >= 70

        self.client.patch(self.endpoint, {"qualification_benchmark": "60"}, format="json")
        config = AtsScoringConfiguration.get_config()
        self.assertEqual(config.qualification_rate_for(scores), 60.0)  # 95, 80, 65

        metrics = calculate_statistical_metrics(scores)
        self.assertEqual(metrics["qualification_rate"], 60.0)

    def test_analytics_endpoint_serves_configured_tiers(self):
        """The dashboard card's data source must reflect the configured boundaries."""
        res = self.client.get(self.analytics_endpoint)
        self.assertEqual(res.status_code, 200)
        metrics = res.data["statistical_quality_metrics"]
        labels = [b["tier"] for b in metrics["distribution_buckets"]]
        self.assertEqual(len(labels), 5)
        self.assertIn("Tier 1: Exceptional (\u226590%)", labels)

        self.client.patch(self.endpoint, {"exceptional_min": "96"}, format="json")
        res = self.client.get(self.analytics_endpoint)
        labels = [b["tier"] for b in res.data["statistical_quality_metrics"]["distribution_buckets"]]
        self.assertIn("Tier 1: Exceptional (\u226596%)", labels)

    def test_analytics_with_no_scores_still_uses_configured_labels(self):
        Application.objects.all().delete()
        self.client.patch(self.endpoint, {"exceptional_min": "88"}, format="json")
        res = self.client.get(self.analytics_endpoint)
        metrics = res.data["statistical_quality_metrics"]
        self.assertEqual(metrics["count"], 0)
        labels = [b["tier"] for b in metrics["distribution_buckets"]]
        self.assertIn("Tier 1: Exceptional (\u226588%)", labels)
        self.assertTrue(all(b["count"] == 0 for b in metrics["distribution_buckets"]))


# ---------------------------------------------------------------------------
# 6. The seeded formatted default must never clobber real Admin content
# ---------------------------------------------------------------------------

class EligibilityDefaultSeedingTests(TestCase):
    def test_default_statement_is_fully_formatted_rich_text(self):
        from jobs.sanitizers import DEFAULT_ELIGIBILITY_STATEMENT

        # The default must demonstrate every formatting the editor offers,
        # otherwise the feature looks broken on a fresh install.
        for fragment in ["<h3>", "<p>", "<strong>", "<em>", "<ul>", "<li>", "<ol>"]:
            self.assertIn(fragment, DEFAULT_ELIGIBILITY_STATEMENT)
        # And it must survive sanitization unchanged.
        self.assertEqual(sanitize_rich_text(DEFAULT_ELIGIBILITY_STATEMENT), DEFAULT_ELIGIBILITY_STATEMENT)

    def test_placeholder_detection(self):
        import importlib

        migration = importlib.import_module("jobs.migrations.0018_seed_formatted_eligibility_default")
        from jobs.sanitizers import (
            DEFAULT_ELIGIBILITY_STATEMENT,
            LEGACY_ELIGIBILITY_STATEMENT,
            LEGACY_ELIGIBILITY_STATEMENT_WITH_GRADUATION,
        )

        # Plain-text and already-wrapped placeholders are both recognised.
        self.assertTrue(migration.is_untouched_placeholder(LEGACY_ELIGIBILITY_STATEMENT))
        self.assertTrue(migration.is_untouched_placeholder(LEGACY_ELIGIBILITY_STATEMENT_WITH_GRADUATION))
        self.assertTrue(
            migration.is_untouched_placeholder(f"<p>{LEGACY_ELIGIBILITY_STATEMENT_WITH_GRADUATION}</p>")
        )

        # Anything an Admin actually wrote is not a placeholder.
        self.assertFalse(migration.is_untouched_placeholder(""))
        self.assertFalse(migration.is_untouched_placeholder(None))
        self.assertFalse(migration.is_untouched_placeholder(DEFAULT_ELIGIBILITY_STATEMENT))
        self.assertFalse(
            migration.is_untouched_placeholder("<p>Applicants must be Kenyan citizens only.</p>")
        )

    def test_forwards_seeds_placeholder_and_preserves_authored_content(self):
        import importlib
        from django.apps import apps as django_apps

        migration = importlib.import_module("jobs.migrations.0018_seed_formatted_eligibility_default")
        from jobs.sanitizers import DEFAULT_ELIGIBILITY_STATEMENT, LEGACY_ELIGIBILITY_STATEMENT_WITH_GRADUATION

        model = django_apps.get_model("jobs", "EligibilitySetting")

        # Row 1: untouched legacy placeholder -> gets the formatted default.
        legacy = model.objects.create(id=1, general_statement=LEGACY_ELIGIBILITY_STATEMENT_WITH_GRADUATION)
        # Row 2: real Admin content -> must survive untouched.
        authored = model.objects.create(
            id=2, general_statement="<p>Only Kenyan nationals under 35 may apply.</p>"
        )

        migration.forwards(django_apps, None)

        legacy.refresh_from_db()
        authored.refresh_from_db()
        self.assertEqual(legacy.general_statement, DEFAULT_ELIGIBILITY_STATEMENT)
        self.assertEqual(authored.general_statement, "<p>Only Kenyan nationals under 35 may apply.</p>")


# ---------------------------------------------------------------------------
# 7. Public landing page must not expose any write path
# ---------------------------------------------------------------------------

class EligibilityWritePathIsAdminOnlyTests(BaseAdminTestCase):
    endpoint = "/api/jobs/eligibility-settings/"

    def test_public_cannot_edit_eligibility_content(self):
        res = APIClient().patch(
            self.endpoint, {"general_statement": "<p>hostile</p>"}, format="json"
        )
        self.assertEqual(res.status_code, 401)

    def test_non_admin_roles_cannot_edit_eligibility_content(self):
        for role in ["HR", "DEPARTMENT_DIRECTOR", "APPLICANT"]:
            user = User.objects.create_user(
                username=f"elig_{role.lower()}",
                password="Pass!2026",
                email=f"elig_{role.lower()}@petroleum.go.ke",
                role=role,
            )
            client = APIClient()
            client.force_authenticate(user=user)
            res = client.patch(
                self.endpoint, {"general_statement": "<p>hostile</p>"}, format="json"
            )
            self.assertEqual(res.status_code, 403, msg=f"{role} should not be able to edit")
