from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from django.http import JsonResponse
from django.core.management import call_command
from io import StringIO

from . import error_views

def force_migrate(request):
    out = StringIO()
    try:
        call_command('migrate', stdout=out)
        return JsonResponse({"status": "success", "output": out.getvalue()})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)})

def api_root(request):
    return JsonResponse({
        "status": "success",
        "message": "Industrial Attachment System API is running smoothly."
    })

urlpatterns = [
    path("", api_root),
    path("force-migrate/", force_migrate),
    path("admin/", admin.site.urls),
    path("api/accounts/", include("accounts.urls")),
    path("api/jobs/", include("jobs.urls")),
]

# Project-level error handlers. These replace Django's default error views, which
# render templates from a directory that does not exist in this project. With
# DEBUG=False an unmatched URL therefore used to raise TemplateDoesNotExist
# from inside the 404 handler and surface as a 500, masking the real cause of
# any genuine server error. See core/error_views.py.
handler400 = "core.error_views.bad_request"
handler403 = "core.error_views.permission_denied"
handler404 = "core.error_views.page_not_found"
handler500 = "core.error_views.server_error"

# Serve uploaded media files in local development.
# In production, a web server (nginx) or cloud storage (S3) handles this.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
