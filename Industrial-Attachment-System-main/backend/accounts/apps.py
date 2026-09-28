from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        """
        Connect signal handlers once all models are fully loaded.
        The import is intentionally deferred here (not at module top-level)
        to prevent circular-import errors that occur when models or signals
        try to import each other during the app-loading phase.
        """
        import accounts.signals  # noqa: F401
