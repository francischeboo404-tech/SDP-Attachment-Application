"""
End-to-end verification of every calculation in the analytics pipeline.

These tests are deliberately written against hand-computed expected values
rather than against the implementation, so they fail if a formula drifts rather
than merely confirming that a function still returns something.

Covered:
* ATS tier assignment, including the boundaries and out-of-range clamping;
* the distribution invariant that every score lands in exactly one bucket and
  the percentages sum to 100;
* descriptive statistics against values worked out by hand;
* variance/std-dev consistency (the defect where variance was the square of an
  already-rounded standard deviation);
* conversion-funnel rates, and the guarantee that ``rate`` is always a share of
  all applications;
* capacity and fill-rate arithmetic, including the invariant that the
  per-department breakdown sums to the system total;
* the analytics date window.
"""
import math
import statistics
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from jobs.models import (
    Application,
    AtsScoringConfiguration,
    Clearance,
    Department,
    Deployment,
    Job,
    Requisition,
)
from jobs.views import (
    calculate_conversion_funnel,
    calculate_statistical_metrics,
    job_capacity_totals,
    percentage,
)

ANALYTICS_ENDPOINT = "/api/jobs/reports/analytics/"


class PercentageHelperTests(TestCase):
    def test_a_zero_or_missing_denominator_yields_zero_not_an_error(self):
        self.assertEqual(percentage(5, 0), 0.0)
        self.assertEqual(percentage(0, 0), 0.0)
        self.assertEqual(percentage(5, None), 0.0)

    def test_rounding_is_to_one_decimal_place(self):
        self.assertEqual(percentage(1, 3), 33.3)
        self.assertEqual(percentage(2, 3), 66.7)
        self.assertEqual(percentage(1, 8), 12.5)

    def test_a_ratio_cannot_exceed_one_hundred(self):
        """Two overlapping populations can divide to more than 100%.

        Reporting 112% would read as an impossible measurement, so the ratio is
        clamped; the underlying counts remain unclamped so nothing is lost.
        """
        self.assertEqual(percentage(112, 100), 100.0)
        self.assertEqual(percentage(112, 100, cap_at_100=False), 112.0)


class TierAssignmentTests(TestCase):
    def setUp(self):
        self.config = AtsScoringConfiguration.get_config()

    def test_default_boundaries_place_scores_in_the_expected_tier(self):
        cases = [
            (100, "Exceptional"),
            (95, "Exceptional"),
            (90, "Exceptional"),
            (89.99, "Highly Qualified"),
            (80, "Highly Qualified"),
            (75, "Highly Qualified"),
            (74.99, "Qualified"),
            (65, "Qualified"),
            (60, "Qualified"),
            (59.99, "Average"),
            (50, "Average"),
            (49.99, "Below Benchmark"),
            (0, "Below Benchmark"),
        ]
        for score, expected in cases:
            with self.subTest(score=score):
                self.assertEqual(self.config.tier_name_for_score(score), expected)

    def test_out_of_range_scores_are_clamped_to_the_nearest_tier(self):
        """A score of 120 or -5 must still resolve to a tier, not vanish."""
        self.assertEqual(self.config.tier_name_for_score(120), "Exceptional")
        self.assertEqual(self.config.tier_name_for_score(-5), "Below Benchmark")

    def test_an_unusable_score_resolves_to_the_bottom_tier(self):
        for value in [None, "", "not a number", float("nan")]:
            with self.subTest(value=value):
                self.assertEqual(self.config.tier_name_for_score(value), "Below Benchmark")

    def test_every_score_lands_in_exactly_one_bucket(self):
        """The core invariant of the distribution chart.

        Scores outside 0-100 used to match no tier at all and so were counted in
        no bucket, making the bucket counts sum to less than the population.
        """
        scores = [-10, -0.01, 0, 49.99, 50, 59.99, 60, 74.99, 75, 89.99, 90, 100, 100.01, 150]
        buckets = self.config.stratify_scores(scores)
        self.assertEqual(sum(b["count"] for b in buckets), len(scores))

    def test_bucket_percentages_sum_to_one_hundred(self):
        scores = [95, 80, 65, 55, 20, 91, 12]
        buckets = self.config.stratify_scores(scores)
        # Each bucket is rounded to one decimal, so the total may drift by up to
        # half a bucket-step (5 buckets -> at most 0.25).
        self.assertAlmostEqual(sum(b["percentage"] for b in buckets), 100.0, delta=0.5)
        for bucket in buckets:
            self.assertEqual(
                bucket["count"] / len(scores) * 100,
                pytest_approx(bucket["percentage"]),
                msg=f"{bucket['tier']} percentage disagrees with its count",
            )

    def test_an_empty_population_yields_five_zero_buckets(self):
        buckets = self.config.stratify_scores([])
        self.assertEqual(len(buckets), 5)
        self.assertTrue(all(b["count"] == 0 and b["percentage"] == 0.0 for b in buckets))

    def test_non_finite_and_null_scores_are_excluded_consistently(self):
        """NaN must not be counted as a score or poison a bucket total."""
        scores = [90, 80, None, float("nan"), float("inf"), 70]
        buckets = self.config.stratify_scores(scores)
        # Only 90, 80 and 70 are usable; None, NaN and inf are all discarded.
        self.assertEqual(sum(b["count"] for b in buckets), 3)
        rate = self.config.qualification_rate_for(scores)
        # All 3 usable scores clear the default benchmark of 70.
        self.assertEqual(rate, 100.0)

    def test_the_distribution_follows_a_configured_threshold_change(self):
        self.config.exceptional_min = Decimal("95")
        self.config.highly_qualified_min = Decimal("75")
        self.config.save()
        config = AtsScoringConfiguration.get_config()
        self.assertEqual(config.tier_name_for_score(90), "Highly Qualified")
        self.assertEqual(config.tier_name_for_score(95), "Exceptional")
        # A reconfigured threshold must also move the bucket boundaries:
        # 95 is now Exceptional and 94 has fallen into Highly Qualified.
        buckets = config.stratify_scores([94, 95])
        self.assertEqual([b["count"] for b in buckets], [1, 1, 0, 0, 0])
        self.assertEqual(buckets[0]["tier"], "Tier 1: Exceptional (≥95%)")
        self.assertEqual(
            buckets[1]["tier"], "Tier 2: Highly Qualified (75-94.99%)"
        )

    def test_qualification_rate_uses_the_configured_benchmark(self):
        scores = [80, 70, 60, 50]
        self.assertEqual(self.config.qualification_rate_for(scores), 50.0)
        self.config.qualification_benchmark = Decimal("75")
        self.config.save()
        self.assertEqual(
            AtsScoringConfiguration.get_config().qualification_rate_for(scores), 25.0
        )


class DescriptiveStatisticsTests(TestCase):
    def test_hand_computed_values_are_reported_correctly(self):
        # mean 50, median 50, population-free sample variance 291.67
        scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        metrics = calculate_statistical_metrics(scores)
        self.assertEqual(metrics["count"], 10)
        self.assertEqual(metrics["mean"], 55.0)
        self.assertEqual(metrics["median"], 55.0)
        self.assertEqual(metrics["min_score"], 10.0)
        self.assertEqual(metrics["max_score"], 100.0)
        self.assertEqual(metrics["variance"], round(statistics.variance(scores), 2))
        self.assertEqual(metrics["std_dev"], round(statistics.stdev(scores), 2))

    def test_std_dev_and_variance_come_from_the_unrounded_figures(self):
        """Both must equal the true value from the standard library.

        The previous implementation computed the variance by squaring the
        already-rounded standard deviation, so for this data it reported
        3837.80 against a true 3838.27 -- off by nearly half a unit before
        rounding even applied.
        """
        scores = [3, 7, 12, 19, 28, 41, 57, 74, 96, 123, 155, 190]
        metrics = calculate_statistical_metrics(scores)
        self.assertEqual(metrics["variance"], round(statistics.variance(scores), 2))
        self.assertEqual(metrics["std_dev"], round(statistics.stdev(scores), 2))
        # And explicitly not the old, wrong derivation.
        self.assertNotEqual(
            metrics["variance"], round(round(statistics.stdev(scores), 2) ** 2, 2)
        )

    def test_interquartile_range_matches_the_quartiles(self):
        scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        metrics = calculate_statistical_metrics(scores)
        self.assertGreaterEqual(metrics["q1"], metrics["min_score"])
        self.assertLessEqual(metrics["q3"], metrics["max_score"])
        self.assertLessEqual(metrics["q1"], metrics["q3"])
        self.assertEqual(metrics["iqr"], round(metrics["q3"] - metrics["q1"], 2))

    def test_a_single_score_reports_zero_spread(self):
        metrics = calculate_statistical_metrics([77.5])
        self.assertEqual(metrics["count"], 1)
        self.assertEqual(metrics["mean"], 77.5)
        self.assertEqual(metrics["median"], 77.5)
        self.assertEqual(metrics["variance"], 0.0)
        self.assertEqual(metrics["std_dev"], 0.0)

    def test_no_scores_reports_zeros_rather_than_dividing_by_zero(self):
        metrics = calculate_statistical_metrics([])
        self.assertEqual(metrics["count"], 0)
        self.assertEqual(metrics["mean"], 0.0)
        self.assertEqual(metrics["qualification_rate"], 0.0)
        self.assertEqual(len(metrics["distribution_buckets"]), 5)

    def test_null_and_nan_scores_do_not_poison_the_mean(self):
        metrics = calculate_statistical_metrics([50, 60, None, float("nan")])
        self.assertEqual(metrics["count"], 2)
        self.assertEqual(metrics["mean"], 55.0)

    def test_decimal_scores_from_the_database_are_handled(self):
        metrics = calculate_statistical_metrics([Decimal("88.50"), Decimal("71.25")])
        self.assertEqual(metrics["count"], 2)
        self.assertEqual(metrics["mean"], 79.88)
        self.assertEqual(metrics["min_score"], 71.25)
        self.assertEqual(metrics["max_score"], 88.5)

    def test_buckets_and_the_population_agree(self):
        metrics = calculate_statistical_metrics([95, 80, 65, 55, 20])
        self.assertEqual(sum(b["count"] for b in metrics["distribution_buckets"]), 5)


class ConversionFunnelTests(TestCase):
    """
    A funnel in which each row's "rate" column means a different thing cannot be
    read as a funnel, so the rate is always a share of all applications.
    """

    @classmethod
    def setUpTestData(cls):
        cls.job = Job.objects.create(
            department=None, title="Funnel Job", description="d", requirements="r",
            job_type="ATTACHMENT", slots_required=10, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )

    def _application(self, username, status):
        user = User.objects.create_user(
            username=username, password="Pass!2026",
            email=f"{username}@uni.ac.ke", role="APPLICANT",
        )
        return Application.objects.create(user=user, job=self.job, status=status)

    def test_every_reviewed_application_is_accounted_for(self):
        """Every application must land in exactly one reported bucket.

        Selection is binary, so the four statuses map onto three buckets:
        PENDING and REVIEWED are both "awaiting decision", and SUCCESSFUL
        and REJECTED are the two outcomes. The previous filter named a
        non-existent "UNDER_REVIEW" instead, so reviewed applications fell
        through every bucket and vanished from the funnel.
        """
        self._application("f_pending", "PENDING")
        self._application("f_reviewed", "REVIEWED")
        self._application("f_success", "SUCCESSFUL")
        self._application("f_success_two", "SUCCESSFUL")
        self._application("f_rejected", "REJECTED")

        result = calculate_conversion_funnel(
            Application.objects.all(), Deployment.objects.none(), Clearance.objects.none(), 0
        )
        metrics = result["metrics"]
        self.assertEqual(metrics["total_applications"], 5)
        self.assertEqual(metrics["pending_review_count"], 2, "PENDING and REVIEWED")
        self.assertEqual(metrics["successful_applications"], 2)
        self.assertEqual(metrics["rejected_count"], 1)
        stages = {s["stage"]: s for s in result["funnel_stages"]}
        self.assertEqual(stages["2. Successful Selections"]["count"], 2)
        self.assertEqual(stages["3. Rejected"]["count"], 1)

    def test_rates_are_always_shares_of_all_applications(self):
        for index in range(4):
            self._application(f"f_app{index}", "PENDING")
        self._application("f_success_one", "SUCCESSFUL")

        result = calculate_conversion_funnel(
            Application.objects.all(), Deployment.objects.none(), Clearance.objects.none(), 0
        )
        stages = {s["stage"]: s for s in result["funnel_stages"]}
        total = 5
        self.assertEqual(stages["2. Successful Selections"]["rate"], 20.0)
        self.assertEqual(stages["2. Successful Selections"]["count"] / total * 100, 20.0)
        # The stage-to-stage conversion is reported separately.
        self.assertEqual(stages["2. Successful Selections"]["stage_conversion"], 20.0)

    def test_success_rate_among_decided_ignores_undecided_applications(self):
        """A large undecided intake must not depress the success rate.

        The denominator is the decided total, not all applications, so one
        success alongside one rejection reads as 50% even though 98 of the
        100 applications have no decision yet.
        """
        for index in range(98):
            self._application(f"f_pending_{index}", "PENDING")
        self._application("f_success", "SUCCESSFUL")
        self._application("f_rejected", "REJECTED")

        result = calculate_conversion_funnel(
            Application.objects.all(), Deployment.objects.none(), Clearance.objects.none(), 0
        )
        metrics = result["metrics"]
        self.assertEqual(metrics["total_applications"], 100)
        self.assertEqual(metrics["success_among_decided_rate"], 50.0)

    def test_an_empty_system_reports_zeros_rather_than_dividing_by_zero(self):
        result = calculate_conversion_funnel(
            Application.objects.none(), Deployment.objects.none(), Clearance.objects.none(), 0
        )
        for value in result["metrics"].values():
            if isinstance(value, (int, float)):
                self.assertEqual(value, 0)
        for stage in result["funnel_stages"]:
            self.assertEqual(stage["rate"], 0.0)
            self.assertEqual(stage["count"], 0)

    def test_letters_cannot_report_more_than_a_hundred_percent(self):
        app = self._application("f_clear", "SUCCESSFUL")
        clearance = Clearance.objects.create(application=app, status="CLEARED", hr_cleared=True)
        department = Department.objects.create(name="Funnel Department")
        deployment = Deployment.objects.create(
            application=app, department=department,
            start_date=timezone.now().date(),
            planned_end_date=timezone.now().date() + timedelta(days=84),
            status="DEPLOYED",
        )
        result = calculate_conversion_funnel(
            Application.objects.all(),
            Deployment.objects.filter(pk=deployment.pk),
            Clearance.objects.filter(pk=clearance.pk),
            letters_count=3,
        )
        self.assertEqual(result["metrics"]["letter_issuance_rate"], 100.0)
        # The true count is still reported faithfully.
        stages = {s["stage"]: s for s in result["funnel_stages"]}
        self.assertEqual(stages["6. Letters Issued"]["count"], 3)


class CapacityArithmeticTests(TestCase):
    """Capacity figures must agree between the system total and the breakdown."""

    @classmethod
    def setUpTestData(cls):
        cls.dept_a = Department.objects.create(name="Cap A")
        cls.dept_b = Department.objects.create(name="Cap B")
        cls.idle = Department.objects.create(
            name="Cap Idle", typical_intake_capacity=99
        )
        cls.job_a = Job.objects.create(
            department=cls.dept_a, title="Cap A Job", description="d", requirements="r",
            job_type="ATTACHMENT", slots_required=10, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )
        cls.job_b = Job.objects.create(
            department=cls.dept_b, title="Cap B Job", description="d", requirements="r",
            job_type="ATTACHMENT", slots_required=5, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )

    def _succeed(self, job, username):
        user = User.objects.create_user(
            username=username, password="Pass!2026",
            email=f"{username}@uni.ac.ke", role="APPLICANT",
        )
        return Application.objects.create(user=user, job=job, status="SUCCESSFUL")

    def test_filled_slots_count_successful_applicants(self):
        self._succeed(self.job_a, "cap_h1")
        self._succeed(self.job_a, "cap_h2")
        self._succeed(self.job_b, "cap_h3")
        required, filled = job_capacity_totals(Job.objects.filter(is_archived=False))
        self.assertEqual(required, 15)
        self.assertEqual(filled, 3)

    def test_rejected_and_pending_applicants_do_not_consume_capacity(self):
        user = User.objects.create_user(
            username="cap_pending", password="Pass!2026",
            email="cap_pending@uni.ac.ke", role="APPLICANT",
        )
        Application.objects.create(user=user, job=self.job_a, status="PENDING")
        Application.objects.create(user=user, job=self.job_b, status="REJECTED")
        required, filled = job_capacity_totals(Job.objects.filter(is_archived=False))
        self.assertEqual(filled, 0)

    def test_capacity_is_zero_when_there_are_no_vacancies(self):
        required, filled = job_capacity_totals(Job.objects.none())
        self.assertEqual(required, 0)
        self.assertEqual(filled, 0)

    def test_the_department_breakdown_sums_to_the_system_total(self):
        """A department with no vacancies must contribute no phantom capacity.

        The old code fell back to typical_intake_capacity when a department's
        vacancies summed to zero, so a department with nothing posted reported
        phantom slots and the breakdown stopped matching the system total.
        """
        self._succeed(self.job_a, "cap_sum1")
        self._succeed(self.job_b, "cap_sum2")

        admin = User.objects.create_user(
            username="cap_admin", password="Pass!2026",
            email="cap_admin@petroleum.go.ke", role="ADMIN",
        )
        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(ANALYTICS_ENDPOINT)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        system_required = data["departments_summary"]["total_capacity"]
        system_filled = data["departments_summary"]["total_filled"]
        self.assertEqual(system_required, 15)
        self.assertEqual(system_filled, 2)

        breakdown = {d["name"]: d for d in data["department_fill_rates"]}
        self.assertIn("Cap Idle", breakdown)
        # The idle department posted nothing, so it has no capacity at all
        # despite declaring a typical intake of 99.
        self.assertEqual(breakdown["Cap Idle"]["slots_required"], 0)
        self.assertEqual(breakdown["Cap Idle"]["fill_rate"], 0.0)
        self.assertEqual(breakdown["Cap Idle"]["available_headroom"], 0)

        self.assertEqual(
            sum(d["slots_required"] for d in data["department_fill_rates"]),
            system_required,
        )
        self.assertEqual(
            sum(d["slots_filled"] for d in data["department_fill_rates"]),
            system_filled,
        )

    def test_headroom_and_fill_rate_agree(self):
        self._succeed(self.job_a, "cap_hr1")
        self._succeed(self.job_a, "cap_hr2")
        admin = User.objects.create_user(
            username="cap_admin2", password="Pass!2026",
            email="cap_admin2@petroleum.go.ke", role="ADMIN",
        )
        client = APIClient()
        client.force_authenticate(user=admin)
        data = client.get(ANALYTICS_ENDPOINT).json()
        summary = data["departments_summary"]
        self.assertEqual(summary["available_headroom"], 15 - 2)
        self.assertEqual(summary["overall_fill_rate"], round(2 / 15 * 100, 1))


class AnalyticsDateWindowTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="win_admin", password="Pass!2026",
            email="win_admin@petroleum.go.ke", role="ADMIN",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_a_single_start_bound_is_honoured_rather_than_discarded(self):
        """Previously any single bound was ignored and a default 30 days used."""
        response = self.client.get(ANALYTICS_ENDPOINT, {"start_date": "2020-01-01"})
        self.assertEqual(response.status_code, 200)

    def test_an_unparseable_date_is_rejected_rather_than_silently_ignored(self):
        response = self.client.get(ANALYTICS_ENDPOINT, {"start_date": "01-01-2020"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("start_date", str(response.json()))

    def test_a_reversed_range_is_rejected(self):
        response = self.client.get(
            ANALYTICS_ENDPOINT, {"start_date": "2026-06-01", "end_date": "2026-01-01"}
        )
        self.assertEqual(response.status_code, 400)

    def test_the_final_second_of_the_end_day_is_included(self):
        """The end date used to stop at 23:59:59.000000."""
        response = self.client.get(
            ANALYTICS_ENDPOINT, {"start_date": "2026-01-01", "end_date": "2026-01-31"}
        )
        self.assertEqual(response.status_code, 200)
        # A 30-day window stays on the daily granularity.
        self.assertEqual(response.json()["period_label"], "Daily")

    def test_the_window_selects_the_granularity_label(self):
        cases = [
            (("2026-09-01", "2026-09-20"), "Daily"),      # 19 days
            (("2026-01-01", "2026-06-01"), "Weekly"),     # 151 days
            (("2026-01-01", "2026-09-01"), "Monthly"),    # 243 days
            (("2020-01-01", "2026-09-01"), "Yearly"),     # 6.7 years
        ]
        for (start, end), expected in cases:
            with self.subTest(start=start, end=end):
                response = self.client.get(
                    ANALYTICS_ENDPOINT, {"start_date": start, "end_date": end}
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["period_label"], expected)

    def test_the_qualification_benchmark_is_published_with_the_payload(self):
        """The dashboard labels the benchmark it measured against."""
        AtsScoringConfiguration.get_config()
        with_default = self.client.get(ANALYTICS_ENDPOINT).json()
        self.assertEqual(with_default["qualification_benchmark"], 70.0)

        config = AtsScoringConfiguration.get_config()
        config.qualification_benchmark = Decimal("85")
        config.save()
        updated = self.client.get(ANALYTICS_ENDPOINT).json()
        self.assertEqual(updated["qualification_benchmark"], 85.0)


class DirectorStageOneVelocityTests(TestCase):
    def test_velocity_ignores_clearances_that_have_not_been_decided(self):
        """
        The denominator must be the clearances that reached stage 1.

        Counting untouched NOT_STARTED clearances understated the rate for a
        department with many clearances still waiting to be submitted.
        """
        hr = User.objects.create_user(
            username="vel_hr", password="Pass!2026",
            email="vel_hr@petroleum.go.ke", role="HR",
        )
        director = User.objects.create_user(
            username="vel_dir", password="Pass!2026",
            email="vel_dir@petroleum.go.ke", role="DEPARTMENT_DIRECTOR",
        )
        department = Department.objects.create(name="Vel Dept", director=director)
        job = Job.objects.create(
            department=department, title="Vel Job", description="d", requirements="r",
            job_type="ATTACHMENT", slots_required=5, duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
        )
        department.requisitions.create(
            requested_by=director, requirements="r", num_candidates_requested=1,
            duration_start=timezone.now().date(),
            duration_end=timezone.now().date() + timedelta(days=30),
        )

        def make_clearance(username, status, cleared):
            user = User.objects.create_user(
                username=username, password="Pass!2026",
                email=f"{username}@uni.ac.ke", role="APPLICANT",
            )
            app = Application.objects.create(user=user, job=job, status="SUCCESSFUL")
            deployment = Deployment.objects.create(
                application=app, department=department,
                start_date=timezone.now().date(),
                planned_end_date=timezone.now().date() + timedelta(days=84),
                status="DEPLOYED",
            )
            return Clearance.objects.create(
                application=app, deployment=deployment, status=status,
                department_cleared=cleared,
                department_cleared_at=timezone.now() if cleared else None,
            )

        make_clearance("vel_c1", "CLEARED", True)
        make_clearance("vel_c2", "CLEARED", True)
        make_clearance("vel_c3", "REJECTED", False)
        # Never submitted: must not drag the rate down.
        for index in range(5):
            make_clearance(f"vel_untouched{index}", "NOT_STARTED", False)

        client = APIClient()
        client.force_authenticate(user=director)
        data = client.get(ANALYTICS_ENDPOINT).json()
        # 2 approved out of 3 decided = 66.7%, not 2 out of 8.
        self.assertEqual(data["decided_stage1_clearances"], 3)
        self.assertEqual(data["approved_stage1_clearances"], 2)
        self.assertEqual(data["stage1_velocity_rate"], 66.7)

        # The director payload reports the same benchmark the admin view does.
        self.assertEqual(data["qualification_benchmark"], 70.0)


def pytest_approx(value):
    """A small stand-in for pytest.approx, which this project does not use."""
    class _Approx:
        def __eq__(self, other):
            return abs(other - value) <= 0.1

    return _Approx()
