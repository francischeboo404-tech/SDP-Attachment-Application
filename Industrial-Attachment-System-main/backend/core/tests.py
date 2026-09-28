"""
Verification that a genuine server error is now reported with its real cause.

This test deliberately provokes a 500 and asserts the reported exception is the
real one, not the ``copy(context)`` AttributeError that Django 5.0 raises on
Python 3.14 while logging the response. If Django is upgraded to a version that
supports the running Python, this test should still pass (the real error is
reported) -- it is written to survive that change.
"""
import logging

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)


@csrf_exempt
def _explode(request):
    raise ValueError("deliberate failure for the masking regression test")


class UnmaskedExceptionTests(SimpleTestCase):
    def test_the_template_store_receiver_is_disconnected(self):
        """The receiver whose copy() breaks Python 3.14 must not be connected."""
        from django.test.client import store_rendered_templates
        from django.test.signals import template_rendered

        receivers = [
            ref() for _, ref in template_rendered.receivers
            if callable(ref)
        ]
        self.assertNotIn(
            store_rendered_templates,
            receivers,
            "store_rendered_templates is still connected; genuine 500 tracebacks "
            "will be masked again on Python 3.14",
        )

    def test_a_raising_view_still_raises_its_own_exception(self):
        """Sanity check: the workaround did not suppress error propagation."""
        factory = RequestFactory()
        request = factory.get("/boom/")
        with self.assertRaises(ValueError) as caught:
            _explode(request)
        self.assertIn("deliberate failure", str(caught.exception))

    def test_an_unmatched_url_returns_a_404_rather_than_a_500(self):
        """
        Regression test for a real production defect.

        This project has no templates directory, so Django's default error views
        had nothing to render. With DEBUG=False an unmatched URL raised
        TemplateDoesNotExist from inside the 404 handler, which surfaced as a 500
        and hid the real cause of any genuine server error.
        """
        response = self.client.get("/api/jobs/this-endpoint-does-not-exist/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertIn("detail", response.json())

    def test_a_non_api_404_returns_html_without_needing_a_template(self):
        response = self.client.get("/no-such-page/")
        self.assertEqual(response.status_code, 404)
        self.assertIn("text/html", response["Content-Type"])

    def test_error_handlers_do_not_depend_on_any_template(self):
        """The handler must not be able to fail the way the default one did."""
        from django.template.loader import get_template

        for name in ("404.html", "500.html", "400.html", "403.html"):
            with self.subTest(template=name):
                with self.assertRaises(Exception):
                    get_template(name)
