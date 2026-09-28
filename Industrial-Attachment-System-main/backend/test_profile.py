import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
u = User(username="test", email="test@test.com")
u.save()

try:
    print(getattr(u, "profile", None))
    print("getattr(u, 'profile', None) succeeded")
except Exception as e:
    print(f"getattr(u, 'profile', None) failed: {e}")

try:
    print(u.profile)
except Exception as e:
    print(f"u.profile failed: {e}")
