"""
Signal handlers for the accounts app.

Registered via AccountsConfig.ready() in apps.py so that all Django models
are fully loaded before any signal connection is made.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="accounts.User")
def auto_create_user_profile(sender, instance, created, **kwargs):
    """
    Automatically create a bare Profile row whenever a new User is saved.

    Why this matters
    ----------------
    Without this signal:
    - A freshly registered user has no Profile row in the database.
    - calculate_profile_completion() does getattr(user, "profile", None) → None.
    - All 9 profile fields are treated as empty → filled_profile_fields = 0.
    - can_apply is permanently False until the user visits the Profile page,
      which triggers get_or_create() in ProfileDetailView.get_object().
    - Users who navigate directly to Vacancies and try to apply get a
      confusing "profile incomplete" error even if they just registered.

    Using get_or_create() is idempotent — safe even if another code path
    (e.g. Google OAuth) already created the Profile for this user.

    The sender uses a string ('accounts.User') instead of the model class
    to avoid a circular import: signals.py is imported during app.ready(),
    which runs before all module-level imports are resolved.
    """
    if created:
        from .models import Profile  # deferred import avoids circular reference
        Profile.objects.get_or_create(user=instance)
