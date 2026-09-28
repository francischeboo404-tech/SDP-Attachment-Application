"""
Project test runner.

Exists to work around a Django/Python incompatibility that hides real server
errors during tests.

Django 5.0's test client connects ``store_rendered_templates`` to the
``template_rendered`` signal at *import* time, and that receiver does
``copy(context)`` to record the rendered context. On Python 3.14,
``copy.copy()`` of a Django template ``Context`` raises::

    AttributeError: 'super' object has no attribute 'dicts' and no __dict__ for setting new attributes

``BaseContext`` declares ``__slots__ = ("dicts",)``, and Python 3.14 changed how
``object.__copy__`` interacts with slotted classes, so the copy can no longer
repopulate ``dicts``.

The damage is that this fires while Django is *logging* a 500 response, inside
``log_response`` -> ``ExceptionReporter.get_traceback_text()``. The copy failure
replaces the genuine exception, so every 500 in this project surfaces as the
same meaningless "super object has no attribute 'dicts'" error and the actual
cause is never reported.

Disconnecting that receiver makes the genuine traceback surface again. The only
thing it powers is ``assertTemplateUsed``, which this project does not use
anywhere, so nothing is lost. If template assertions are ever introduced, revisit
this -- or upgrade Django to a version that supports the running Python.

The disconnect has to happen in *both* hooks below. ``setup_test_environment`` is
not sufficient on its own: ``django.test.client`` is imported lazily by test
modules (usually via ``rest_framework.test``) during suite construction, which
runs afterwards, and importing it re-registers the receiver.
"""
from django.test.runner import DiscoverRunner
from django.test.signals import template_rendered


def _disconnect_template_store():
    # Imported here rather than at module level: this module is loaded by the
    # runner, and importing django.test.client at import time would register the
    # very receiver we are about to remove.
    from django.test.client import store_rendered_templates

    template_rendered.disconnect(store_rendered_templates)


class PreservingTestRunner(DiscoverRunner):
    """DiscoverRunner that keeps genuine exceptions visible."""

    def setup_test_environment(self, **kwargs):
        super().setup_test_environment(**kwargs)
        _disconnect_template_store()

    def build_suite(self, *args, **kwargs):
        # Test modules are imported here, which is when django.test.client (and
        # therefore the receiver) actually gets connected.
        suite = super().build_suite(*args, **kwargs)
        _disconnect_template_store()
        return suite
