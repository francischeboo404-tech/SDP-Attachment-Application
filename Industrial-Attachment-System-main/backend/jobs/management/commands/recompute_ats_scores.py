"""
Recompute every stored ATS score under the current formula.

Why this exists
---------------
``Application.ats_score`` is written exactly once, at submission time in
``ApplicationListCreateView.perform_create``. It is read-only over the API and is
never recomputed on read. That means any change to the scoring formula -- or to
the *required document set*, since each required document carries an equal share
of the document weight -- leaves previously stored scores computed under the
old rules, silently mixing two incomparable scales in the same report.

Two such changes have now happened:
  * "Academic Standing / Grade Award" was removed. It was never a scoring input,
    so no score was affected.
  * TRANSCRIPT and GOOD_CONDUCT replaced KRA_PIN, changing the required set from
    9 to 10 documents. The per-document value fell from 60/9 to 60/10, so every
    stored score is now stale and must be recomputed.

Usage
-----
    python manage.py recompute_ats_scores            # report what would change
    python manage.py recompute_ats_scores --apply    # write the new scores

The default is a dry run on purpose: this rewrites a field HR and Admin use to
shortlist candidates, so it should be something an operator runs deliberately
after reading the report.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from jobs.models import Application
from jobs.views import (
    ATS_DOCUMENT_WEIGHT,
    ATS_REQUIRED_DOC_COUNT,
    REQUIRED_DOCUMENTS,
    ApplicationListCreateView,
)


class Command(BaseCommand):
    help = (
        "Recompute Application.ats_score for every application under the current "
        "scoring formula. Run without --apply first to preview the changes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help=(
                "Actually write the recomputed scores. Without this flag the "
                "command only reports what would change."
            ),
        )
        parser.add_argument(
            "--application",
            type=int,
            help="Recompute a single application by primary key.",
        )

    def handle(self, *args, **options):
        per_document = ATS_DOCUMENT_WEIGHT / ATS_REQUIRED_DOC_COUNT
        self.stdout.write(
            f"Required documents: {ATS_REQUIRED_DOC_COUNT} "
            f"(each worth {per_document:.4f} of the {ATS_DOCUMENT_WEIGHT:g}-point "
            f"document component)"
        )
        self.stdout.write("Required set: " + ", ".join(REQUIRED_DOCUMENTS))
        self.stdout.write("")

        applications = Application.objects.select_related("user", "job")
        if options["application"]:
            applications = applications.filter(pk=options["application"])
            if not applications.exists():
                self.stderr.write(
                    self.style.ERROR(
                        f"No application with id {options['application']}."
                    )
                )
                return

        scorer = ApplicationListCreateView().calculate_ats_score
        changed, unchanged = [], 0
        updates = []

        for application in applications.iterator():
            new_score = scorer(application.user, application.job)
            old_score = float(application.ats_score)
            if abs(new_score - old_score) < 0.005:
                unchanged += 1
                continue
            changed.append((application, old_score, new_score))
            updates.append((new_score, application.pk))

        self.stdout.write(
            self.style.SUCCESS(
                f"{applications.count()} application(s) examined: "
                f"{len(changed)} would change, {unchanged} already correct."
            )
        )
        for application, old_score, new_score in changed:
            delta = new_score - old_score
            self.stdout.write(
                f"  #{application.pk} {application.user.username} -> "
                f"{application.job.title}: {old_score:.2f} -> {new_score:.2f} "
                f"({delta:+.2f})"
            )

        if not changed:
            self.stdout.write("Nothing to do.")
            return

        if not options["apply"]:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "Dry run. Re-run with --apply to write these scores."
                )
            )
            return

        with transaction.atomic():
            for new_score, pk in updates:
                Application.objects.filter(pk=pk).update(ats_score=new_score)

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(f"Recomputed and saved {len(updates)} score(s).")
        )
