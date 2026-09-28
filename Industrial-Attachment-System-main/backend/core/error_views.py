"""
Project-wide error handlers.

Why these exist
---------------
This backend ships with ``TEMPLATES["DIRS"] = []`` and no ``templates/``
directory, so Django's built-in error views had nothing to render. With
``DEBUG=False`` -- the production setting -- an unmatched URL or an unhandled
exception raised ``TemplateDoesNotExist: 404.html`` from inside the error
handler itself. The result was severe and silent:

* a request for a non-existent URL produced a confusing 500 instead of a 404;
* a genuine server error could not render an error page either, so the only
  record of it was the exception the error handler raised -- which masked the
  real cause entirely.

These handlers make error responses work without depending on any template, and
return JSON for ``/api/`` paths so the single-page frontend receives a
parseable body rather than an HTML page. Non-API paths get a minimal HTML page
built in code, so a missing template can never take the error handler down.
"""
from django.http import HttpResponse, JsonResponse

#: Paths served by the JSON API. Anything under this prefix is a machine client.
API_PREFIX = "/api/"


def _wants_json(request):
    path = request.path or ""
    if path.startswith(API_PREFIX):
        return True
    # Honour an explicit JSON preference from any other client too.
    accept = request.META.get("HTTP_ACCEPT", "")
    return "application/json" in accept and "text/html" not in accept


def _error_response(request, status, title, detail):
    """
    A dependency-free error response.

    Deliberately constructs the HTML inline rather than rendering a template:
    the whole failure mode being fixed is "the error handler could not find its
    template", so this handler must not be able to fail the same way.
    """
    if _wants_json(request):
        return JsonResponse(
            {"detail": detail, "error": title, "status_code": status},
            status=status,
        )
    body = (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{status} {title}</title>"
        "<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,"
        "Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;"
        "display:flex;align-items:center;justify-content:center;min-height:100vh}"
        "main{text-align:center;padding:2rem}h1{font-size:3rem;margin:0}"
        "p{color:#475569;max-width:34rem}p.small{font-size:.8rem;color:#94a3b8}"
        "</style></head><body><main>"
        f"<h1>{status}</h1><p>{detail}</p>"
        "<p class='small'>State Department for Petroleum &mdash; "
        "Industrial Attachment System</p>"
        "</main></body></html>"
    )
    return HttpResponse(body, status=status, content_type="text/html; charset=utf-8")


def bad_request(request, exception=None):
    """Malformed request (400)."""
    return _error_response(
        request, 400, "Bad Request", "The request could not be understood."
    )


def permission_denied(request, exception=None):
    """Authenticated but not allowed (403)."""
    return _error_response(
        request, 403, "Forbidden", "You do not have permission to access this resource."
    )


def page_not_found(request, exception=None):
    """Unmatched URL (404)."""
    return _error_response(
        request, 404, "Not Found", "The requested resource does not exist."
    )


def server_error(request):
    """
    Unhandled exception (500).

    Django calls this with only the request. No exception detail is exposed to
    the client: the traceback stays in the logs, where it belongs, rather than
    leaking internals to whoever triggered the error.
    """
    return _error_response(
        request,
        500,
        "Server Error",
        "Something went wrong on our side. The error has been logged.",
    )
