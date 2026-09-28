import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from accounts.utils import verify_google_token

# Try to verify with an invalid token to see if it reaches the ValidationError or fails on requests
try:
    verify_google_token("invalid_token_123")
    print("Passed")
except Exception as e:
    import traceback

    traceback.print_exc()
