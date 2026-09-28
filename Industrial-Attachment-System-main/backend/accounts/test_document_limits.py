"""
Verifies that the per-document-type upload size limits are a single source of
truth and that each one matches what the API actually enforces.

The defect these guard against: the browser enforced 5 MB for seven of the nine
document types while the API accepted a flat 10 MB for all of them. An applicant
was shown a 5 MB label, blocked at 5 MB locally, and the server would still have
taken a 9 MB file had the request bypassed the UI. The limits now live in
accounts/document_limits.py, are enforced per type in DocumentSerializer, and
are served to the frontend from /api/accounts/document-limits/.
"""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from accounts import document_limits
from accounts.models import Document, User

LIMITS_ENDPOINT = "/api/accounts/document-limits/"
DOCUMENTS_ENDPOINT = "/api/accounts/documents/"


def pdf_of_size(size_bytes, name="test.pdf"):
    """
    A PDF payload of exactly ``size_bytes``.

    The size is exact rather than approximate because these tests assert on
    boundary behaviour: "limit - 1" must be accepted and "limit" rejected. A
    payload whose length depended on a header size would shift every boundary
    by that many bytes and test the wrong thing.
    """
    header = b"%PDF-1.4\n"
    if size_bytes < len(header):
        raise ValueError("size_bytes is too small to hold a PDF header")
    return SimpleUploadedFile(
        name,
        header + b"0" * (size_bytes - len(header)),
        content_type="application/pdf",
    )


class DocumentLimitSourceOfTruthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="doc_limits",
            email="doc_limits@uni.ac.ke",
            password="Password123!",
            role="APPLICANT",
        )
        self.client.force_authenticate(self.user)

    def test_every_required_document_type_has_a_limit(self):
        from jobs.views import REQUIRED_DOCUMENTS

        for document_type in REQUIRED_DOCUMENTS:
            with self.subTest(document_type=document_type):
                self.assertIn(document_type, document_limits.DOCUMENT_MAX_BYTES)

    def test_limits_are_positive_and_within_the_absolute_ceiling(self):
        for document_type, limit in document_limits.DOCUMENT_MAX_BYTES.items():
            with self.subTest(document_type=document_type):
                self.assertGreater(limit, 0)
                self.assertLessEqual(limit, document_limits.ABSOLUTE_MAX_BYTES)

    def test_the_label_and_the_byte_limit_are_generated_from_the_same_value(self):
        """A label that says 2MB must be backed by exactly 2MB."""
        for document_type, limit in document_limits.DOCUMENT_MAX_BYTES.items():
            with self.subTest(document_type=document_type):
                label = document_limits.label_for(document_type)
                expected_mb = limit // (1024 * 1024)
                self.assertIn(f"{expected_mb}MB", label)
                self.assertEqual(label, f"Max {expected_mb}MB")

    def test_the_api_serves_the_same_limits_the_serializer_enforces(self):
        """The frontend builds its labels from this response."""
        response = self.client.get(LIMITS_ENDPOINT)
        self.assertEqual(response.status_code, 200)
        served = response.json()["limits"]
        for document_type, limit in document_limits.DOCUMENT_MAX_BYTES.items():
            with self.subTest(document_type=document_type):
                self.assertEqual(
                    served[document_type]["max_bytes"],
                    document_limits.max_bytes_for(document_type),
                )
                self.assertEqual(
                    served[document_type]["label"],
                    document_limits.label_for(document_type),
                )

    def test_the_limits_endpoint_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(LIMITS_ENDPOINT).status_code, 401)


class PerDocumentTypeEnforcementTests(TestCase):
    """
    Proves the API enforces each type's own limit, which is what the labels
    claim. Uses one byte over the limit so the assertions are exact.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="doc_enforce",
            email="doc_enforce@uni.ac.ke",
            password="Password123!",
            role="APPLICANT",
        )
        self.client.force_authenticate(self.user)

    def _upload(self, document_type, size_bytes):
        return self.client.post(
            DOCUMENTS_ENDPOINT,
            {"document_type": document_type, "file": pdf_of_size(size_bytes)},
            format="multipart",
        )

    def test_every_document_type_shares_the_same_two_megabyte_ceiling(self):
        """
        The uniform cap: every type, without exception, is 2 MB.

        Previously the types ranged from 2 MB to 10 MB. Pinning the equality
        here is deliberate -- a future "just let resumes be bigger" edit must
        be a conscious change to this policy, not a quiet one to a dict.
        """
        two_mb = 2 * 1024 * 1024
        for document_type, limit in document_limits.DOCUMENT_MAX_BYTES.items():
            with self.subTest(document_type=document_type):
                self.assertEqual(limit, two_mb)

    def test_an_unknown_document_type_gets_no_larger_allowance(self):
        """
        An unrecognised type must not be a way to obtain a bigger allowance.
        The strict default and the uniform per-type cap now coincide, so this
        passes for that reason rather than by a separately-chosen default.
        """
        self.assertEqual(
            document_limits.max_bytes_for("NOT_A_REAL_TYPE"),
            document_limits.max_bytes_for("NATIONAL_ID"),
        )

    def test_a_type_rejects_a_file_just_over_the_ceiling(self):
        """NATIONAL_ID is representative: 2 MB + 1 byte must fail."""
        limit = document_limits.max_bytes_for("NATIONAL_ID")
        response = self._upload("NATIONAL_ID", limit + 1)
        self.assertEqual(response.status_code, 400)
        self.assertIn("2MB", str(response.json()))

    def test_every_required_type_rejects_a_file_just_over_the_ceiling(self):
        from jobs.views import REQUIRED_DOCUMENTS

        one_over = document_limits.max_bytes_for("NATIONAL_ID") + 1
        for document_type in REQUIRED_DOCUMENTS:
            with self.subTest(document_type=document_type):
                response = self._upload(document_type, one_over)
                self.assertEqual(response.status_code, 400, response.content)

    def test_a_file_above_two_megabytes_is_now_rejected(self):
        """
        The behaviour that changed. A 6 MB resume was previously accepted under
        its old 10 MB allowance; the uniform 2 MB ceiling must refuse it.
        """
        response = self._upload("RESUME", 6 * 1024 * 1024)
        self.assertEqual(response.status_code, 400)
        self.assertIn("2MB", str(response.json()))

    def test_a_file_exactly_at_the_ceiling_is_accepted(self):
        """The boundary is inclusive; "Max 2MB" must actually permit 2MB."""
        limit = document_limits.max_bytes_for("STUDENT_ID")
        response = self._upload("STUDENT_ID", limit)
        self.assertEqual(response.status_code, 201, response.content)

    def test_an_unknown_document_type_is_rejected_when_over_the_ceiling(self):
        """An unrecognised type must not be a way to obtain a bigger allowance."""
        response = self._upload("NOT_A_REAL_TYPE", 3 * 1024 * 1024)
        self.assertEqual(response.status_code, 400)

    def test_the_non_pdf_gate_still_applies(self):
        response = self.client.post(
            DOCUMENTS_ENDPOINT,
            {
                "document_type": "RESUME",
                "file": SimpleUploadedFile("evil.exe", b"MZ", content_type="application/x-msdownload"),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)


class TwoMegabyteDocumentTypeTests(TestCase):
    """
    TRANSCRIPT and GOOD_CONDUCT replaced KRA PIN Certificate and are capped at
    2 MB each -- the strictest limits in the system. These lock that in, since a
    2 MB cap is easy to regress by copying a neighbouring entry.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="two_mb",
            email="two_mb@uni.ac.ke",
            password="Password123!",
            role="APPLICANT",
        )
        self.client.force_authenticate(self.user)

    def test_both_new_types_are_capped_at_two_megabytes(self):
        for document_type in ("TRANSCRIPT", "GOOD_CONDUCT"):
            with self.subTest(document_type=document_type):
                self.assertEqual(
                    document_limits.max_bytes_for(document_type), 2 * 1024 * 1024
                )
                self.assertEqual(document_limits.label_for(document_type), "Max 2MB")

    def test_a_file_at_two_megabytes_is_accepted(self):
        for document_type in ("TRANSCRIPT", "GOOD_CONDUCT"):
            with self.subTest(document_type=document_type):
                response = self.client.post(
                    DOCUMENTS_ENDPOINT,
                    {
                        "document_type": document_type,
                        "file": pdf_of_size(2 * 1024 * 1024),
                    },
                    format="multipart",
                )
                self.assertEqual(response.status_code, 201, response.content)

    def test_a_file_one_byte_over_two_megabytes_is_rejected(self):
        for document_type in ("TRANSCRIPT", "GOOD_CONDUCT"):
            with self.subTest(document_type=document_type):
                response = self.client.post(
                    DOCUMENTS_ENDPOINT,
                    {
                        "document_type": document_type,
                        "file": pdf_of_size(2 * 1024 * 1024 + 1),
                    },
                    format="multipart",
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("2MB", str(response.json()))

    def test_the_rejection_names_the_two_megabyte_limit(self):
        response = self.client.post(
            DOCUMENTS_ENDPOINT,
            {
                "document_type": "TRANSCRIPT",
                "file": pdf_of_size(4 * 1024 * 1024),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("must not exceed 2MB", str(response.json()))

    def test_the_api_advertises_two_megabytes_for_both(self):
        response = self.client.get(LIMITS_ENDPOINT)
        limits = response.json()["limits"]
        for document_type in ("TRANSCRIPT", "GOOD_CONDUCT"):
            with self.subTest(document_type=document_type):
                self.assertEqual(limits[document_type]["label"], "Max 2MB")
                self.assertEqual(limits[document_type]["max_bytes"], 2 * 1024 * 1024)

    def test_the_default_limit_is_the_strictest_two_megabytes(self):
        self.assertEqual(document_limits.DEFAULT_MAX_BYTES, 2 * 1024 * 1024)
