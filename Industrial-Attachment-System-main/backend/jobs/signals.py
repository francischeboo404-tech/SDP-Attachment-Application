import logging
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from .models import Application, Clearance, Deployment, EligibilitySetting, Job
from .tasks import send_applicant_outcome_email_task

logger = logging.getLogger(__name__)

CACHE_KEY_PUBLIC_VACANCIES = "public_vacancies_list_data"
CACHE_KEY_ELIGIBILITY_SETTINGS = "eligibility_settings_public_data"

# Upper bound for the public vacancy list. The effective TTL is this value or,
# when sooner, the time until the soonest vacancy deadline -- the list is
# filtered on deadline, so caching past a deadline would advertise a closed
# vacancy. See PublicVacancyListView._public_vacancy_cache_ttl.
CACHE_TTL_PUBLIC_VACANCIES = 900


@receiver(pre_save, sender=Application)
def track_application_previous_status(sender, instance, **kwargs):
    """
    Captures previous status from database before save to identify true state transitions.
    """
    if instance.pk:
        try:
            previous = Application.objects.only("status", "outcome_notified_status").get(pk=instance.pk)
            instance._previous_status = previous.status
            instance._previous_notified_status = previous.outcome_notified_status
        except Application.DoesNotExist:
            instance._previous_status = None
            instance._previous_notified_status = None
    else:
        instance._previous_status = None
        instance._previous_notified_status = None


@receiver(post_save, sender=Application)
def dispatch_applicant_outcome_notification(sender, instance, created, **kwargs):
    """
    Sends the applicant outcome email when status transitions into a decision.

    The only two deciding statuses are SUCCESSFUL and REJECTED. PENDING and
    REVIEWED are workflow markers and must never notify an applicant, because a
    marker is not an answer.

    Duplicate sends are guarded twice: the status must actually have changed, and
    the same decision must not already have been communicated.
    """
    current_status = instance.status
    prev_status = getattr(instance, "_previous_status", None)
    prev_notified = getattr(instance, "_previous_notified_status", None) or instance.outcome_notified_status

    if current_status in Application.DECISION_STATUSES:
        is_new_transition = (created or prev_status != current_status)
        is_already_notified = (prev_notified == current_status)

        if is_new_transition and not is_already_notified:
            logger.info(
                f"Dispatching outcome email task for application #{instance.id} "
                f"(transition: {prev_status} -> {current_status})"
            )
            # Dispatch Celery background task
            try:
                send_applicant_outcome_email_task.delay(instance.id, current_status)
            except Exception as e:
                # If celery broker is unavailable or in non-eager mode without broker, call directly
                logger.warning(f"Async dispatch error: {e}. Executing task in-process fallback.")
                send_applicant_outcome_email_task(instance.id, current_status)


@receiver(post_save, sender=Job)
@receiver(post_delete, sender=Job)
def invalidate_public_vacancy_cache(sender, instance, **kwargs):
    """
    Automatically clears public vacancy cache whenever a Job is created, updated, archived, or deleted.
    """
    try:
        cache.delete(CACHE_KEY_PUBLIC_VACANCIES)
        logger.debug("Invalidated public vacancy cache due to Job update.")
    except Exception as e:
        logger.warning(f"Failed to invalidate public vacancy cache: {e}")


@receiver(post_save, sender=EligibilitySetting)
@receiver(post_delete, sender=EligibilitySetting)
def invalidate_eligibility_settings_cache(sender, instance, **kwargs):
    """
    Clears the cached public eligibility content whenever an Admin edits it, so
    the landing page reflects the new rich text on its very next load instead of
    serving a stale 15-minute cached copy.
    """
    try:
        cache.delete(CACHE_KEY_ELIGIBILITY_SETTINGS)
        logger.debug("Invalidated public eligibility settings cache due to EligibilitySetting update.")
    except Exception as e:
        logger.warning(f"Failed to invalidate eligibility settings cache: {e}")


@receiver(post_save, sender=Clearance)
@receiver(post_save, sender=Deployment)
def archive_attachments_on_completion(sender, instance, **kwargs):
    """
    Moves a finished attachee into the records archive the moment their
    attachment becomes fully complete.

    An attachment is complete only when the deployment is EXITED *and* the
    clearance is CLEARED, and those two facts get recorded at different times by
    different actors: HR can grant clearance before an exit date is entered, and
    an exit is normally recorded before clearance is even created. Listening to
    both models means whichever event happens last triggers the archive, instead
    of leaving a completed attachee stranded outside the archive whenever the
    two events happened in the "wrong" order.

    ``archive_completed_attachment`` is idempotent, so the second (redundant)
    signal is a cheap no-op.
    """
    from .attachment_records import archive_completed_attachment

    try:
        application = getattr(instance, "application", None)
        if application is None:
            return
        archive_completed_attachment(application)
    except Exception as e:
        # Archiving is a records convenience; it must never break the HR action
        # that triggered it (approving a clearance, or recording an exit).
        logger.warning(
            f"Failed to auto-archive completed attachment triggered by "
            f"{sender.__name__} #{instance.pk}: {e}"
        )
