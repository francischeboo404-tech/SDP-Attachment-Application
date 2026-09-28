"""
Department descriptions are authored in the rich-text editor and rendered as
HTML, so they need the same allowlist sanitizing that a vacancy description has
always had.

The defect these guard against: `DepartmentSerializer.description` was a plain
`CharField` with no sanitizing at all. That was safe only for as long as nothing
rendered it as markup -- it displayed as literal text inside a `<p>`. The moment
it became formatted content, an unsanitized value would have been a stored-XSS
vector on the public landing page and in the Director portal, reachable by
anyone who could create or edit a department.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from jobs.models import Department
from jobs.serializers import DepartmentSerializer


XSS_PAYLOAD = (
    '<p>Real mandate</p>'
    '<script>alert(1)</script>'
    '<img src=x onerror=alert(2)>'
    '<iframe src="https://evil.example"></iframe>'
    '<a href="javascript:alert(3)">bad link</a>'
    '<a href="https://ok.go.ke" target="_blank">good link</a>'
    '<h3>Core Functions</h3>'
    '<ul><li><strong>Upstream</strong> exploration</li><li>Refining</li></ul>'
)

FORMATTED_PAYLOAD = (
    '<h3>Mandate</h3>'
    '<p>The directorate <strong>oversees</strong> <em>petroleum</em> activities.</p>'
    '<ul><li>Regulation</li><li>Licensing</li></ul>'
)


def make_department(**kwargs):
    defaults = {
        "name": "Geology Directorate",
        "location": "Nairobi",
        "contact_email": "geology@petroleum.go.ke",
        "description": "",
    }
    defaults.update(kwargs)
    return Department.objects.create(**defaults)


class DepartmentDescriptionSanitizationTests(TestCase):
    def assert_no_dangerous_markup(self, value):
        lowered = value.lower()
        self.assertNotIn("<script", lowered)
        self.assertNotIn("onerror", lowered)
        self.assertNotIn("<iframe", lowered)
        self.assertNotIn("javascript:", lowered)
        self.assertNotIn("alert(", lowered)

    def test_a_script_payload_is_stripped_on_write(self):
        serializer = DepartmentSerializer(
            data={
                "name": "Geology Directorate",
                "location": "Nairobi",
                "contact_email": "geology@petroleum.go.ke",
                "description": XSS_PAYLOAD,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stored = serializer.validated_data["description"]
        self.assert_no_dangerous_markup(stored)
        self.assertIn("Real mandate", stored)

    def test_a_script_payload_is_stripped_on_read_for_legacy_rows(self):
        # A row written straight to the database, never through the serializer.
        # Write-time sanitizing alone would leave this content trusted.
        department = make_department(description=XSS_PAYLOAD)
        rendered = DepartmentSerializer(department).data["description"]
        self.assert_no_dangerous_markup(rendered)
        self.assertIn("Real mandate", rendered)

    def test_formatting_is_preserved(self):
        serializer = DepartmentSerializer(
            data={
                "name": "Engineering Directorate",
                "location": "Mombasa",
                "contact_email": "eng@petroleum.go.ke",
                "description": FORMATTED_PAYLOAD,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stored = serializer.validated_data["description"]
        for tag in ("<h3>", "<p>", "<strong>", "<em>", "<ul>", "<li>"):
            self.assertIn(tag, stored, f"expected {tag} to survive sanitizing")

    def test_a_plain_text_legacy_description_is_untouched(self):
        # Departments created before the editor existed hold plain prose. It must
        # not gain paragraph markup or be mangled.
        plain = "Mandated department responsible for sector coordination."
        department = make_department(description=plain)
        self.assertEqual(DepartmentSerializer(department).data["description"], plain)

    def test_an_ampersand_survives_as_an_entity(self):
        # bleach escapes it; the client decodes it for search. Asserting the
        # stored form is escaped keeps the two halves honest.
        department = make_department(description="<p>Research &amp; Development</p>")
        self.assertEqual(
            DepartmentSerializer(department).data["description"],
            "<p>Research &amp; Development</p>",
        )

    def test_an_empty_description_is_an_empty_string(self):
        department = make_department(description="")
        self.assertEqual(DepartmentSerializer(department).data["description"], "")

    def test_safe_links_keep_their_href(self):
        department = make_department(description=XSS_PAYLOAD)
        rendered = DepartmentSerializer(department).data["description"]
        self.assertIn('href="https://ok.go.ke"', rendered)


class DepartmentDescriptionApiTests(TestCase):
    """
    `GET /api/jobs/departments/` is AllowAny -- the landing page reads it to
    populate its department filter, so these descriptions reach unauthenticated
    visitors. That is precisely why the field is sanitized rather than trusted
    because only Admins can author it.
    """

    def setUp(self):
        self.client = APIClient()
        self.department = make_department(description=FORMATTED_PAYLOAD)
        self.hostile = make_department(name="Hostile Directorate", description=XSS_PAYLOAD)

    def test_the_public_endpoint_never_leaks_unsanitized_markup(self):
        response = self.client.get("/api/jobs/departments/")
        self.assertEqual(response.status_code, 200)

        body = response.content.decode()
        self.assertNotIn("<script", body.lower())
        self.assertNotIn("onerror", body.lower())
        self.assertNotIn("<iframe", body.lower())
        self.assertNotIn("javascript:", body.lower())
        self.assertNotIn("alert(", body.lower())

        # The legitimate formatted content is still there -- sanitizing must not
        # silently flatten real department mandates.
        self.assertIn("Core Functions", body)
        self.assertIn("<strong>", body)

    def test_an_anonymous_visitor_receives_formatted_legitimate_content(self):
        response = self.client.get("/api/jobs/departments/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        results = payload["results"] if isinstance(payload, dict) and "results" in payload else payload
        by_name = {d["name"]: d for d in results}

        self.assertIn("Geology Directorate", by_name)
        geology = by_name["Geology Directorate"]["description"]
        self.assertIn("<h3>", geology)
        self.assertIn("<strong>", geology)

    def test_a_staff_reader_also_receives_sanitized_content(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        staff = User.objects.create_user(
            username="desc_staff", email="desc_staff@petroleum.go.ke", password="pw", role="HR"
        )
        self.client.force_authenticate(user=staff)
        response = self.client.get("/api/jobs/departments/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("<script", response.content.decode().lower())
        self.assertNotIn("onerror", response.content.decode().lower())
