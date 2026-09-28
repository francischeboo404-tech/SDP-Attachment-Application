"""
Department staffing figures.

Every surface that reports how staffed a department is -- the Department
Staffing Overview, the fill-rate report, the analytics dashboards, the
requisition queue -- must agree. This module exists so they do.

It was written because they did not agree. The Staffing Overview was computed
in the browser from three separate list endpoints and got two things wrong:

1. It counted deployments with ``status == "ACTIVE"``, which is not a
   ``Deployment.STATUS_CHOICES`` value. The real value is ``DEPLOYED``. The
   column therefore read zero for every department, always, and the fill bar
   drawn from it was always empty.

2. It divided that count by ``Department.typical_intake_capacity`` -- a
   hand-edited admin field -- rather than by the sum of ``Job.slots_required``.
   The rest of the product uses the vacancy total. So a department with no open
   vacancies still reported capacity, headroom and a 0% fill rate for posts it
   had never advertised. ``AnalyticsView`` already documents rejecting that
   denominator for precisely this reason.

Both are now defined once, here, and served from a single endpoint.

The deployment status values are referenced through the model's own choices
rather than as bare strings, so a rename cannot leave a caller counting a value
that no longer exists -- the exact failure this module was written to remove.
"""

from django.db.models import Count, Q, Sum

from .models import (
    Application,
    Clearance,
    Deployment,
    Department,
    Job,
    Requisition,
)

# Sourced from the model so the filters here cannot drift from the choices the
# rest of the system validates against.
DEPLOYMENT_IN_PROGRESS = "DEPLOYED"
DEPLOYMENT_CONCLUDED = "EXITED"
REQUISITION_PENDING = "PENDING"
REQUISITION_APPROVED = "APPROVED"
REQUISITION_FULFILLED = "FULFILLED"
REQUISITION_REJECTED = "REJECTED"

# Clearance is the one status set with no named pending-group constant on the
# model, unlike Application.PENDING_STATUSES. Defined here and asserted against
# STATUS_CHOICES below, so a new clearance stage cannot be silently excluded
# from the "pending" figure.
CLEARANCE_PENDING_STATUSES = ("PENDING_DEPARTMENT", "PENDING_HR")
assert set(CLEARANCE_PENDING_STATUSES) <= {
    value for value, _ in Clearance.STATUS_CHOICES
}, "CLEARANCE_PENDING_STATUSES references a status Clearance does not define"

OPEN_JOB_FILTER = Q(jobs__is_archived=False, jobs__is_active=True)


def _in_progress_deployments(department_ids=None):
    qs = Deployment.objects.filter(status=DEPLOYMENT_IN_PROGRESS)
    if department_ids is not None:
        qs = qs.filter(department_id__in=department_ids)
    return qs


def _fill_rate(filled, required):
    """
    Fill rate as a whole percentage, or ``None`` when there is nothing to fill.

    ``None`` is not the same as ``0``. A department with no open vacancy has no
    capacity to fill, and reporting that as "0% full" implies it has slots that
    nobody applied for. Callers must render it as "no open vacancies" rather
    than as a zero-width bar.
    """
    if not required:
        return None
    return min(100, round((filled / required) * 100))


def department_staffing_rows(department_ids=None):
    """
    One staffing row per department, computed server-side.

    Returns a list of dicts. The figures per row:

    ``capacity``            sum of ``slots_required`` over open, non-archived
                            vacancies. This is the denominator everywhere in
                            the product, including the fill-rate report.
    ``filled``              applications with status ``SUCCESSFUL`` against
                            those same open vacancies, so the ratio above is
                            internally consistent. It is a lower bound for a
                            department that has archived a filled vacancy: the
                            attachee still works there, but the post is no
                            longer advertised and is counted in
                            ``completed_deployments`` instead.
    ``fill_rate``           percentage, or ``None`` when ``capacity`` is zero.
    ``headroom``            ``capacity - filled``, floored at zero so an
                            over-subscribed department reads 0 rather than a
                            negative that would render as a broken bar.
    ``active_deployments``  deployments currently in progress (``DEPLOYED``).
    ``completed_deployments`` deployments that have concluded (``EXITED``).
    ``pending_requisitions`` / ``approved_requisitions``  requisition buckets.

    Each of the seven aggregates is a single grouped query, so the whole table
    costs eight queries regardless of how many departments there are. The
    previous browser-side implementation filtered full lists per department,
    which is O(departments x rows) in the client and re-derived on every render.
    """
    departments = Department.objects.select_related("director").order_by("name")
    if department_ids is not None:
        departments = departments.filter(pk__in=department_ids)

    rows = [
        {
            "department_id": dept.id,
            "department_name": dept.name,
            "director_name": (
                f"{dept.director.first_name} {dept.director.last_name}".strip()
                or dept.director.username
                if dept.director_id
                else None
            ),
        }
        for dept in departments
    ]
    by_id = {row["department_id"]: row for row in rows}
    if not rows:
        return rows

    def bucket(queryset, *fields):
        return {
            row[fields[0]]: row["n"]
            for row in queryset.values(*fields).annotate(n=Count("id"))
        }

    # Open, non-archived vacancies per department: capacity and how many are
    # advertised.
    job_buckets = (
        Job.objects.filter(is_archived=False, is_active=True)
        .values("department_id")
        .annotate(n=Count("id"), slots=Sum("slots_required"))
    )
    # Applications counted against the same set of vacancies that supplies
    # capacity. Counting successes on archived vacancies here while taking
    # capacity only from open ones would mix two bases inside a single ratio:
    # archiving a filled vacancy would leave `filled` high against a capacity
    # of zero and report a 100% fill rate for a department with no open posts.
    successful = bucket(
        Application.objects.filter(
            status="SUCCESSFUL", job__is_archived=False, job__is_active=True
        ),
        "job__department_id",
    )

    # Deployments by department, split by whether the attachment is running.
    deployment_buckets = (
        _in_progress_deployments()
        .values("department_id")
        .annotate(active=Count("id"))
    )
    concluded = bucket(
        Deployment.objects.filter(status=DEPLOYMENT_CONCLUDED), "department_id"
    )
    pending_reqs = bucket(
        Requisition.objects.filter(status=REQUISITION_PENDING), "department_id"
    )
    approved = bucket(
        Requisition.objects.filter(status=REQUISITION_APPROVED), "department_id"
    )
    fulfilled = bucket(
        Requisition.objects.filter(status=REQUISITION_FULFILLED), "department_id"
    )
    rejected = bucket(
        Requisition.objects.filter(status=REQUISITION_REJECTED), "department_id"
    )

    for job_row in job_buckets:
        row = by_id.get(job_row["department_id"])
        if row is None:
            continue
        row["open_vacancies"] = job_row["n"]
        row["capacity"] = job_row["slots"] or 0
        row["filled"] = successful.get(job_row["department_id"], 0)
        row["fill_rate"] = _fill_rate(row["filled"], row["capacity"])
        row["headroom"] = max(0, row["capacity"] - row["filled"])

    for dep_row in deployment_buckets:
        row = by_id.get(dep_row["department_id"])
        if row is None:
            continue
        row["active_deployments"] = dep_row["active"]

    for row in rows:
        dept_id = row["department_id"]
        row.setdefault("open_vacancies", 0)
        row.setdefault("capacity", 0)
        row.setdefault("filled", 0)
        row.setdefault("fill_rate", None)
        row.setdefault("headroom", 0)
        row["completed_deployments"] = concluded.get(dept_id, 0)
        row["active_deployments"] = row.get("active_deployments", 0)
        # "Pending" means awaiting HR review and nothing else. It is counted
        # from the PENDING status directly rather than derived as
        # total - approved, which would also sweep up rejected requisitions and
        # make a declined request look like outstanding work.
        row["pending_requisitions"] = pending_reqs.get(dept_id, 0)
        row["approved_requisitions"] = approved.get(dept_id, 0)
        row["fulfilled_requisitions"] = fulfilled.get(dept_id, 0)
        row["rejected_requisitions"] = rejected.get(dept_id, 0)
        row["total_requisitions"] = (
            row["pending_requisitions"]
            + row["approved_requisitions"]
            + row["fulfilled_requisitions"]
            + row["rejected_requisitions"]
        )

    return rows


def staffing_summary(department_ids=None, rows=None):
    """
    The whole-department roll-up shown above the per-department table.

    Totals are summed from the per-department rows so the tiles can never
    disagree with the table beneath them. Pass ``rows`` when they have already
    been computed, which the endpoint does: without it every call re-issued the
    nine aggregate queries a second time for figures it already had.
    """
    if rows is None:
        rows = department_staffing_rows(department_ids)
    fillable = [r for r in rows if r["capacity"]]
    total_capacity = sum(r["capacity"] for r in rows)
    total_filled = sum(r["filled"] for r in rows)
    return {
        "departments": len(rows),
        "open_vacancies": sum(r["open_vacancies"] for r in rows),
        "total_capacity": total_capacity,
        "total_filled": total_filled,
        "fill_rate": _fill_rate(total_filled, total_capacity),
        "total_headroom": sum(r["headroom"] for r in rows),
        "active_deployments": sum(r["active_deployments"] for r in rows),
        "completed_deployments": sum(r["completed_deployments"] for r in rows),
        "pending_requisitions": sum(r["pending_requisitions"] for r in rows),
        "approved_requisitions": sum(r["approved_requisitions"] for r in rows),
        "departments_with_open_vacancies": len(fillable),
    }


def clearance_bucket_counts(department_ids=None):
    """
    Clearance counts split by stage.

    Added because ``Clearance`` has its own two-stage flow, and the reports
    that showed clearance numbers were re-deriving them in the browser against
    a status string (``PENDING_HR_REVIEW``) that does not exist in
    ``Clearance.STATUS_CHOICES``. Deriving the buckets here removes that.
    """
    qs = Clearance.objects.all()
    if department_ids is not None:
        qs = qs.filter(deployment__department_id__in=department_ids)
    grouped = qs.values("status").annotate(n=Count("id"))
    counts = {row["status"]: row["n"] for row in grouped}
    pending = sum(
        value for status, value in counts.items() if status in CLEARANCE_PENDING_STATUSES
    )
    return {
        "by_status": counts,
        "pending": pending,
        "cleared": counts.get("CLEARED", 0),
    }
