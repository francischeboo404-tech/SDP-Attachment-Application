from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock
from django.utils import timezone
from datetime import date
from django.core.exceptions import ValidationError as DjangoValidationError

from accounts.models import (
    Profile,
    Education,
    Experience,
    Training,
    ProfessionalMembership,
    Document,
    AuditLog,
    SystemSetting,
)
from accounts.serializers import (
    UserSerializer,
    UserManagementSerializer,
    RegisterSerializer,
    ProfileSerializer,
    EducationSerializer,
    ExperienceSerializer,
    TrainingSerializer,
    ProfessionalMembershipSerializer,
    DocumentSerializer,
    AuditLogSerializer,
    SystemSettingSerializer,
    ForcedPasswordChangeSerializer,
    CustomTokenObtainPairSerializer,
)
from accounts.utils import (
    verify_recaptcha,
    verify_google_token,
    calculate_profile_completion,
)
from accounts.audit import (
    get_client_ip,
    sanitize_metadata,
    log_audit_event,
)
from accounts.backends import EmailBackend
from accounts.views import IsAdminUserRole
from jobs.models import Department, Job, Application

User = get_user_model()


class AccountsModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="Password123!",
            first_name="Test",
            last_name="User",
            role="APPLICANT",
        )

    def test_user_str_and_defaults(self):
        self.assertEqual(str(self.user), "testuser")
        self.assertFalse(self.user.must_change_password)
        self.assertIsNone(self.user.department)

    def test_profile_str_and_fields(self):
        profile, _ = Profile.objects.get_or_create(user=self.user)
        self.assertEqual(str(profile), "testuser Profile")
        self.assertEqual(profile.nationality, "Kenyan")
        self.assertEqual(profile.opportunity_type, "ATTACHMENT")

    def test_document_str(self):
        doc = Document.objects.create(
            user=self.user,
            document_type="NATIONAL_ID",
            file=SimpleUploadedFile("id.pdf", b"%PDF-1.4 dummy", content_type="application/pdf"),
        )
        self.assertEqual(str(doc), "testuser - National ID")

    def test_audit_log_str(self):
        log = AuditLog.objects.create(
            actor=self.user,
            action="LOGIN",
            target_description="User logged in",
        )
        self.assertIn("LOGIN by testuser: User logged in", str(log))

        # Anonymous / System audit log
        log_sys = AuditLog.objects.create(
            actor=None,
            action="SYSTEM_CRON",
            target_description="Nightly purge completed",
        )
        self.assertIn("SYSTEM_CRON by System: Nightly purge completed", str(log_sys))

    def test_system_setting_encryption_and_masking(self):
        setting = SystemSetting.objects.create(
            key="API_KEY",
            description="Third-party service key",
            is_secret=True,
            category="INTEGRATIONS",
        )
        self.assertEqual(str(setting), "API_KEY")

        # Empty value
        setting.set_value("")
        self.assertEqual(setting.get_value(), "")
        self.assertEqual(setting.get_masked_value(), "")

        # Non-secret setting
        setting.is_secret = False
        setting.set_plain_value("PublicConfigValue")
        setting.save()
        self.assertEqual(setting.get_plain_value(), "PublicConfigValue")
        self.assertEqual(setting.get_masked_value(), "PublicConfigValue")

        # Secret setting - short value (<= 4 chars)
        setting.is_secret = True
        setting.set_value("1234")
        setting.save()
        self.assertEqual(setting.get_masked_value(), "••••••••")

        # Secret setting - longer value (> 4 chars)
        setting.set_value("SuperSecretApiKey2026")
        setting.save()
        self.assertNotEqual(setting.encrypted_value, "SuperSecretApiKey2026")
        self.assertEqual(setting.get_value(), "SuperSecretApiKey2026")
        self.assertEqual(setting.get_masked_value(), "••••••••2026")

        # Corrupted encrypted_value returns empty string on decrypt failure
        setting.encrypted_value = "invalid_cipher_text_corrupt"
        self.assertEqual(setting.get_value(), "")

    def test_training_year_validation(self):
        # Valid training
        t = Training.objects.create(
            user=self.user,
            name="Leadership Workshop",
            institution="Petroleum Institute",
            year=2024,
        )
        t.full_clean()  # should not raise

        # Invalid year < 1950
        t_bad_low = Training(
            user=self.user,
            name="Ancient Workshop",
            institution="Institute",
            year=1940,
        )
        with self.assertRaises(DjangoValidationError):
            t_bad_low.full_clean()

        # Invalid year > 2100
        t_bad_high = Training(
            user=self.user,
            name="Future Workshop",
            institution="Institute",
            year=2150,
        )
        with self.assertRaises(DjangoValidationError):
            t_bad_high.full_clean()


class AccountsSerializerTests(TestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Human Resources", is_active=True)
        self.admin = User.objects.create_user(
            username="admin_user",
            email="admin@example.com",
            password="AdminPassword123!",
            role="ADMIN",
        )
        self.user = User.objects.create_user(
            username="applicant_user",
            email="applicant@example.com",
            password="ApplicantPassword123!",
            role="APPLICANT",
        )

    def test_register_serializer_validation(self):
        # Valid registration
        valid_data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePassword123!",
            "first_name": "New",
            "last_name": "User",
            "recaptcha": "test",
        }
        ser = RegisterSerializer(data=valid_data)
        self.assertTrue(ser.is_valid(), ser.errors)
        user = ser.save()
        self.assertEqual(user.username, "newuser")
        self.assertEqual(user.email, "newuser@example.com")
        self.assertEqual(user.role, "APPLICANT")

        # Invalid recaptcha
        with patch("accounts.serializers.verify_recaptcha", return_value=False):
            ser_bad_captcha = RegisterSerializer(data=valid_data)
            self.assertFalse(ser_bad_captcha.is_valid())
            self.assertIn("recaptcha", ser_bad_captcha.errors)

        # Username too short
        bad_uname_short = valid_data.copy()
        bad_uname_short["username"] = "ab"
        ser = RegisterSerializer(data=bad_uname_short)
        self.assertFalse(ser.is_valid())
        self.assertIn("username", ser.errors)

        # Username too long (> 50 chars)
        bad_uname_long = valid_data.copy()
        bad_uname_long["username"] = "a" * 51
        ser = RegisterSerializer(data=bad_uname_long)
        self.assertFalse(ser.is_valid())
        self.assertIn("username", ser.errors)

        # Password validations:
        # Too short (< 8 chars)
        p_short = valid_data.copy()
        p_short["password"] = "Pass1!"
        ser = RegisterSerializer(data=p_short)
        self.assertFalse(ser.is_valid())
        self.assertIn("password", ser.errors)

        # Too long (> 128 chars)
        p_long = valid_data.copy()
        p_long["password"] = "P1!" + "a" * 130
        ser = RegisterSerializer(data=p_long)
        self.assertFalse(ser.is_valid())
        self.assertIn("password", ser.errors)

        # Missing uppercase
        p_no_upper = valid_data.copy()
        p_no_upper["password"] = "password123!"
        ser = RegisterSerializer(data=p_no_upper)
        self.assertFalse(ser.is_valid())
        self.assertIn("password", ser.errors)

        # Missing lowercase
        p_no_lower = valid_data.copy()
        p_no_lower["password"] = "PASSWORD123!"
        ser = RegisterSerializer(data=p_no_lower)
        self.assertFalse(ser.is_valid())
        self.assertIn("password", ser.errors)

        # Missing number
        p_no_num = valid_data.copy()
        p_no_num["password"] = "Password!!!!"
        ser = RegisterSerializer(data=p_no_num)
        self.assertFalse(ser.is_valid())
        self.assertIn("password", ser.errors)

        # Missing special char
        p_no_special = valid_data.copy()
        p_no_special["password"] = "Password1234"
        ser = RegisterSerializer(data=p_no_special)
        self.assertFalse(ser.is_valid())
        self.assertIn("password", ser.errors)

        # Duplicate email (case-insensitive)
        dup_email = valid_data.copy()
        dup_email["email"] = "NEWUSER@EXAMPLE.COM"
        ser = RegisterSerializer(data=dup_email)
        self.assertFalse(ser.is_valid())
        self.assertIn("email", ser.errors)

    def test_custom_token_obtain_pair_serializer(self):
        data = {
            "username": "applicant_user",
            "password": "ApplicantPassword123!",
            "recaptcha": "test",
        }
        ser = CustomTokenObtainPairSerializer(data=data)
        self.assertTrue(ser.is_valid(), ser.errors)
        res_data = ser.validated_data
        self.assertIn("access", res_data)
        self.assertIn("refresh", res_data)
        self.assertEqual(res_data["user"]["username"], "applicant_user")
        self.assertEqual(res_data["user"]["role"], "APPLICANT")

        # Invalid recaptcha
        with patch("accounts.serializers.verify_recaptcha", return_value=False):
            ser_bad_cap = CustomTokenObtainPairSerializer(data=data)
            self.assertFalse(ser_bad_cap.is_valid())
            self.assertIn("recaptcha", ser_bad_cap.errors)

    def test_profile_serializer_update(self):
        profile, _ = Profile.objects.get_or_create(user=self.user)
        ser = ProfileSerializer(
            instance=profile,
            data={
                "phone_number": "0711223344",
                "postal_address": "P.O. Box 500 Nairobi",
                "first_name": "UpdatedFirst",
                "last_name": "UpdatedLast",
                "email": "updated_email@example.com",
            },
            partial=True,
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        ser.save()
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "UpdatedFirst")
        self.assertEqual(self.user.last_name, "UpdatedLast")
        self.assertEqual(self.user.email, "updated_email@example.com")

        # Updating email to one already owned by another user fails
        ser_dup = ProfileSerializer(
            instance=profile,
            data={"email": "admin@example.com"},
            partial=True,
        )
        self.assertFalse(ser_dup.is_valid())
        self.assertIn("email", ser_dup.errors)

    def test_experience_serializer_validation(self):
        # is_current=False without end_date fails
        ser_bad = ExperienceSerializer(data={
            "organization": "Tech Corp",
            "job_title": "Intern",
            "start_date": "2023-01-01",
            "is_current": False,
            "responsibilities": "Coding",
        })
        self.assertFalse(ser_bad.is_valid())
        self.assertIn("end_date", ser_bad.errors)

        # is_current=True with empty string end_date passes and converts to None
        ser_current = ExperienceSerializer(data={
            "organization": "Tech Corp",
            "job_title": "Intern",
            "start_date": "2023-01-01",
            "end_date": "",
            "is_current": True,
            "responsibilities": "Coding",
        })
        self.assertTrue(ser_current.is_valid(), ser_current.errors)
        self.assertIsNone(ser_current.validated_data.get("end_date"))

    def test_document_serializer_file_validation(self):
        # Non-PDF extension fails
        txt_file = SimpleUploadedFile("resume.txt", b"plain text content", content_type="text/plain")
        ser_txt = DocumentSerializer(data={"document_type": "RESUME", "file": txt_file})
        self.assertFalse(ser_txt.is_valid())
        self.assertIn("file", ser_txt.errors)
        self.assertIn("Only PDF files are accepted", str(ser_txt.errors["file"]))

        # Invalid MIME type for pdf extension fails
        fake_pdf = SimpleUploadedFile("virus.pdf", b"executable bytes", content_type="application/octet-stream")
        ser_mime = DocumentSerializer(data={"document_type": "RESUME", "file": fake_pdf})
        self.assertFalse(ser_mime.is_valid())
        self.assertIn("file", ser_mime.errors)
        self.assertIn("Invalid file type detected", str(ser_mime.errors["file"]))

        # Oversized file fails. Every document type shares the 2 MB ceiling, so
        # the reported limit is that one figure rather than a per-type
        # allowance; the wording comes from document_limits.human_size().
        large_content = b"%PDF-1.4 " + (b"0" * (3 * 1024 * 1024 + 100))
        large_pdf = SimpleUploadedFile("large.pdf", large_content, content_type="application/pdf")
        ser_large = DocumentSerializer(data={"document_type": "RESUME", "file": large_pdf})
        self.assertFalse(ser_large.is_valid())
        self.assertIn("file", ser_large.errors)
        self.assertIn("must not exceed 2MB", str(ser_large.errors["file"]))

        # Valid PDF succeeds
        valid_pdf = SimpleUploadedFile("valid.pdf", b"%PDF-1.4 sample bytes", content_type="application/pdf")
        ser_valid = DocumentSerializer(data={"document_type": "RESUME", "file": valid_pdf})
        self.assertTrue(ser_valid.is_valid(), ser_valid.errors)

        # The cap is uniform, so NATIONAL_ID is refused at the same 2 MB
        # threshold as every other type.
        over_limit = SimpleUploadedFile(
            "nid.pdf",
            b"%PDF-1.4 " + (b"0" * (3 * 1024 * 1024 + 100)),
            content_type="application/pdf",
        )
        ser_five = DocumentSerializer(data={"document_type": "NATIONAL_ID", "file": over_limit})
        self.assertFalse(ser_five.is_valid())
        self.assertIn("must not exceed 2MB", str(ser_five.errors["file"]))

    def test_training_and_membership_serializers(self):
        # TrainingSerializer
        t_ser = TrainingSerializer(data={
            "name": "Safety Training",
            "institution": "EPRA",
            "year": 2025,
        })
        self.assertTrue(t_ser.is_valid(), t_ser.errors)

        # ProfessionalMembershipSerializer
        m_ser = ProfessionalMembershipSerializer(data={
            "body_name": "Engineers Board of Kenya",
            "membership_number": "EBK-12345",
            "status": "ACTIVE",
        })
        self.assertTrue(m_ser.is_valid(), m_ser.errors)

    def test_system_setting_serializer_create_and_update(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        req = MagicMock(user=self.admin)

        # Create setting
        ser = SystemSettingSerializer(
            data={
                "key": "DATABASE_ENCRYPTION_KEY",
                "value": "VerySecretKey999!",
                "description": "AES Key for DB encryption",
                "is_secret": True,
                "category": "SECURITY",
            },
            context={"request": req}
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        setting = ser.save()
        self.assertEqual(setting.key, "DATABASE_ENCRYPTION_KEY")
        self.assertEqual(setting.get_value(), "VerySecretKey999!")
        self.assertEqual(setting.updated_by, self.admin)

        # Update setting with new secret value
        ser_update = SystemSettingSerializer(
            instance=setting,
            data={"value": "NewUpdatedSecret111!"},
            context={"request": req},
            partial=True,
        )
        self.assertTrue(ser_update.is_valid(), ser_update.errors)
        updated_setting = ser_update.save()
        self.assertEqual(updated_setting.get_value(), "NewUpdatedSecret111!")


class AccountsUtilsAndAuditTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="audit_user",
            email="audit@example.com",
            password="Password123!",
            first_name="Audit",
            last_name="Tester",
        )

    def test_get_client_ip(self):
        self.assertIsNone(get_client_ip(None))

        # Direct REMOTE_ADDR
        req_direct = MagicMock()
        req_direct.META = {"REMOTE_ADDR": "192.168.1.50"}
        self.assertEqual(get_client_ip(req_direct), "192.168.1.50")

        # X-Forwarded-For with multiple proxies
        req_proxied = MagicMock()
        req_proxied.META = {
            "HTTP_X_FORWARDED_FOR": "10.0.0.1, 10.0.0.2, 10.0.0.3",
            "REMOTE_ADDR": "127.0.0.1",
        }
        self.assertEqual(get_client_ip(req_proxied), "10.0.0.1")

    def test_sanitize_metadata(self):
        # Non-dict return unchanged
        self.assertEqual(sanitize_metadata("not_a_dict"), "not_a_dict")

        raw_meta = {
            "user_id": 42,
            "username": "johndoe",
            "password": "CleartextPassword!",
            "access_token": "jwt_token_here",
            "client_secret": "sensitive_oauth_secret",
            "nested_config": {
                "secret_key": "api_secret",
                "regular_setting": "allowed_value",
            },
            "credentials_list": [
                {"token": "token_1", "info": "ok"},
                "plain_string_item",
            ],
        }
        sanitized = sanitize_metadata(raw_meta)
        self.assertEqual(sanitized["user_id"], 42)
        self.assertEqual(sanitized["username"], "johndoe")
        self.assertEqual(sanitized["password"], "[REDACTED_SECRET]")
        self.assertEqual(sanitized["access_token"], "[REDACTED_SECRET]")
        self.assertEqual(sanitized["client_secret"], "[REDACTED_SECRET]")
        self.assertEqual(sanitized["nested_config"]["secret_key"], "[REDACTED_SECRET]")
        self.assertEqual(sanitized["nested_config"]["regular_setting"], "allowed_value")
        self.assertEqual(sanitized["credentials_list"][0]["token"], "[REDACTED_SECRET]")
        self.assertEqual(sanitized["credentials_list"][0]["info"], "ok")
        self.assertEqual(sanitized["credentials_list"][1], "plain_string_item")

    def test_log_audit_event_various_invocations(self):
        # With request object
        mock_req = MagicMock()
        mock_req.user = self.user
        mock_req.META = {"REMOTE_ADDR": "127.0.0.1"}

        log1 = log_audit_event(
            request_or_actor=mock_req,
            action="TEST_ACTION_1",
            target_description="Testing via mock request",
            metadata={"secret_value": "hide_me"},
        )
        self.assertIsNotNone(log1)
        self.assertEqual(log1.actor, self.user)
        self.assertEqual(log1.metadata["secret_value"], "[REDACTED_SECRET]")

        # With direct User instance
        log2 = log_audit_event(
            request_or_actor=self.user,
            action="TEST_ACTION_2",
            target_description="Testing via user instance",
            ip_address="192.168.1.100",
        )
        self.assertIsNotNone(log2)
        self.assertEqual(log2.actor, self.user)
        self.assertEqual(log2.ip_address, "192.168.1.100")

        # Exception fallback
        with patch("accounts.models.AuditLog.objects.create", side_effect=Exception("DB Error")):
            log_fail = log_audit_event(action="SHOULD_FAIL")
            self.assertIsNone(log_fail)

    def test_verify_recaptcha_scenarios(self):
        # Empty response
        self.assertFalse(verify_recaptcha(""))
        self.assertFalse(verify_recaptcha(None))

        # "test" sentinel value
        self.assertTrue(verify_recaptcha("test"))

        # Remote API call with success
        with patch("requests.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"success": True}
            mock_post.return_value = mock_resp
            with self.settings(DEBUG=False, RECAPTCHA_SECRET_KEY="custom_prod_secret_key"):
                self.assertTrue(verify_recaptcha("valid_client_token"))

        # Remote API call with failure
        with patch("requests.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"success": False}
            mock_post.return_value = mock_resp
            with self.settings(DEBUG=False, RECAPTCHA_SECRET_KEY="custom_prod_secret_key"):
                self.assertFalse(verify_recaptcha("invalid_client_token"))

        # Remote API network timeout / exception
        with patch("requests.post", side_effect=Exception("Connection Timeout")):
            with self.settings(DEBUG=False, RECAPTCHA_SECRET_KEY="custom_prod_secret_key"):
                self.assertFalse(verify_recaptcha("client_token"))

    def test_verify_google_token_scenarios(self):
        from rest_framework.exceptions import ValidationError as DRFValidationError
        # Valid token
        with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
            mock_verify.return_value = {
                "iss": "accounts.google.com",
                "email": "google_user@example.com",
                "given_name": "Google",
                "family_name": "User",
            }
            res = verify_google_token("valid_token_string")
            self.assertEqual(res["email"], "google_user@example.com")

        # Invalid issuer
        with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
            mock_verify.return_value = {
                "iss": "fraudulent.issuer.com",
                "email": "bad@example.com",
            }
            with self.assertRaises(DRFValidationError) as ctx:
                verify_google_token("token_bad_iss")
            self.assertIn("Invalid issuer", str(ctx.exception))

        # Token decoding failure / exception
        with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=Exception("Invalid signature")):
            with self.assertRaises(DRFValidationError) as ctx:
                verify_google_token("corrupt_token")
            self.assertIn("Invalid Google authentication token", str(ctx.exception))

    def test_calculate_profile_completion_steps(self):
        u = User.objects.create_user(
            username="calc_user",
            email="calc@example.com",
            password="Password123!",
        )
        # 1. Fresh user: low completion (only default nationality "Kenyan" is set)
        stats0 = calculate_profile_completion(u)
        self.assertTrue(stats0["profile_completion"] <= 5)
        self.assertFalse(stats0["can_apply"])
        self.assertFalse(stats0["is_profile_complete"])
        self.assertTrue(len(stats0["missing_sections"]) >= 3)

        # 2. Add first & last name, profile personal fields
        u.first_name = "Jane"
        u.last_name = "Doe"
        u.save()

        profile, _ = Profile.objects.get_or_create(user=u)
        profile.dob = date(2001, 1, 1)
        profile.gender = "F"
        profile.id_number = "12345678"
        profile.phone_number = "0712345678"
        profile.postal_address = "Box 100"
        profile.nationality = "Kenyan"
        profile.save()

        stats1 = calculate_profile_completion(User.objects.select_related("profile").get(pk=u.pk))
        self.assertTrue(stats1["profile_completion"] >= 20)

        # 3. Add academic details
        profile.institution_name = "Technical University"
        profile.qualification = "Diploma"
        profile.field_of_study = "Information Technology"
        profile.joining_date = date(2026, 5, 1)
        profile.save()

        stats2 = calculate_profile_completion(User.objects.select_related("profile").get(pk=u.pk))
        self.assertTrue(stats2["profile_completion"] >= 45)

        # 4. Add Next of Kin details
        profile.next_of_kin_name = "John Doe"
        profile.next_of_kin_relationship = "Father"
        profile.next_of_kin_phone = "0700112233"
        profile.next_of_kin_address = "Box 100"
        profile.save()

        stats3 = calculate_profile_completion(User.objects.select_related("profile").get(pk=u.pk))
        self.assertTrue(stats3["profile_completion"] >= 60)

        # 5. Upload all 10 required documents
        required_doc_types = [
            "NATIONAL_ID", "RESUME", "COVER_LETTER", "INSTITUTION_INTRO",
            "STUDENT_INSURANCE", "STUDENT_ID", "NEXT_OF_KIN_ID",
            "TRANSCRIPT", "GOOD_CONDUCT", "PASSPORT_PHOTOS"
        ]
        for dt in required_doc_types:
            Document.objects.create(
                user=u,
                document_type=dt,
                file=SimpleUploadedFile(f"{dt}.pdf", b"%PDF-1.4 dummy", content_type="application/pdf"),
            )

        stats4 = calculate_profile_completion(User.objects.select_related("profile").prefetch_related("documents").get(pk=u.pk))
        self.assertEqual(stats4["profile_completion"], 100)
        self.assertTrue(stats4["can_apply"])
        self.assertTrue(stats4["is_profile_complete"])
        self.assertEqual(stats4["missing_sections"], [])


class AccountsPermissionAndBackendTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="perm_admin",
            email="perm_admin@example.com",
            password="Password123!",
            role="ADMIN",
        )
        self.hr = User.objects.create_user(
            username="perm_hr",
            email="perm_hr@example.com",
            password="Password123!",
            role="HR",
        )
        self.applicant = User.objects.create_user(
            username="perm_applicant",
            email="perm_applicant@example.com",
            password="Password123!",
            role="APPLICANT",
        )

    def test_is_admin_user_role_permission(self):
        perm = IsAdminUserRole()
        req = MagicMock()

        # Anonymous / unauthenticated
        req.user = None
        self.assertFalse(perm.has_permission(req, None))

        mock_anon = MagicMock(is_authenticated=False)
        req.user = mock_anon
        self.assertFalse(perm.has_permission(req, None))

        # Applicant denied
        req.user = self.applicant
        self.assertFalse(perm.has_permission(req, None))

        # HR denied
        req.user = self.hr
        self.assertFalse(perm.has_permission(req, None))

        # Admin allowed
        req.user = self.admin
        self.assertTrue(perm.has_permission(req, None))

        # Superuser allowed regardless of role
        self.applicant.is_superuser = True
        req.user = self.applicant
        self.assertTrue(perm.has_permission(req, None))

    def test_email_backend_authentication(self):
        backend = EmailBackend()

        # Empty username
        self.assertIsNone(backend.authenticate(None, username="", password="Password123!"))
        self.assertIsNone(backend.authenticate(None, username=None, password="Password123!"))

        # Authenticate by exact email
        user_by_email = backend.authenticate(None, username="perm_admin@example.com", password="Password123!")
        self.assertEqual(user_by_email, self.admin)

        # Authenticate by uppercase email
        user_by_email_upper = backend.authenticate(None, username="PERM_ADMIN@EXAMPLE.COM", password="Password123!")
        self.assertEqual(user_by_email_upper, self.admin)

        # Authenticate by username
        user_by_uname = backend.authenticate(None, username="perm_admin", password="Password123!")
        self.assertEqual(user_by_uname, self.admin)

        # Wrong password
        user_wrong_pw = backend.authenticate(None, username="perm_admin@example.com", password="WrongPassword!")
        self.assertIsNone(user_wrong_pw)

        # Non-existent user
        user_none = backend.authenticate(None, username="nonexistent@example.com", password="Password123!")
        self.assertIsNone(user_none)

        # Hardcoded fallback admin "f@gmail.com"
        hardcoded_user = backend.authenticate(None, username="f@gmail.com", password="TestP@123")
        self.assertIsNotNone(hardcoded_user)
        self.assertEqual(hardcoded_user.email, "f@gmail.com")
        self.assertEqual(hardcoded_user.role, "ADMIN")


class AccountsViewsEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="view_admin",
            email="vadmin@example.com",
            password="Password123!",
            role="ADMIN",
        )
        self.hr = User.objects.create_user(
            username="view_hr",
            email="vhr@example.com",
            password="Password123!",
            role="HR",
        )
        self.applicant = User.objects.create_user(
            username="view_applicant",
            email="vapplicant@example.com",
            password="Password123!",
            role="APPLICANT",
        )

    def test_google_login_view(self):
        # Missing token
        res_empty = self.client.post("/api/accounts/google-login/", {}, format="json")
        self.assertEqual(res_empty.status_code, 400)
        self.assertIn("Token is required", res_empty.data["error"])

        # Valid Google token for new user
        with patch("accounts.views.verify_google_token") as mock_verify:
            mock_verify.return_value = {
                "iss": "accounts.google.com",
                "email": "new_google_student@university.ac.ke",
                "given_name": "Google",
                "family_name": "Student",
            }
            res = self.client.post("/api/accounts/google-login/", {"tokenId": "mock_google_id_token"}, format="json")
            self.assertEqual(res.status_code, 200)
            self.assertIn("access", res.data)
            self.assertIn("refresh", res.data)
            self.assertEqual(res.data["user"]["email"], "new_google_student@university.ac.ke")

        # Invalid Google token
        with patch("accounts.views.verify_google_token", side_effect=Exception("Invalid token signature")):
            res_bad = self.client.post("/api/accounts/google-login/", {"tokenId": "bad_token"}, format="json")
            self.assertEqual(res_bad.status_code, 400)

    def test_profile_crud_endpoints(self):
        self.client.force_authenticate(user=self.applicant)
        # GET profile
        res_get = self.client.get("/api/accounts/profile/")
        self.assertEqual(res_get.status_code, 200)

        # PATCH profile
        res_patch = self.client.patch("/api/accounts/profile/", {
            "middle_name": "Grace",
            "county_of_residence": "Nairobi",
            "first_name": "Jane",
            "last_name": "Doe",
        }, format="json")
        self.assertEqual(res_patch.status_code, 200)
        self.applicant.refresh_from_db()
        self.assertEqual(self.applicant.first_name, "Jane")

    def test_education_experience_training_membership_crud(self):
        self.client.force_authenticate(user=self.applicant)

        # 1. Education
        edu_res = self.client.post("/api/accounts/education/", {
            "institution_name": "Kenyatta University",
            "qualification": "BSc",
            "field_of_study": "Computer Science",
            "start_date": "2021-09-01",
            "end_date": "2025-07-01",
            "current": False,
        }, format="json")
        self.assertEqual(edu_res.status_code, 201)
        edu_id = edu_res.data["id"]

        edu_list = self.client.get("/api/accounts/education/")
        self.assertEqual(edu_list.status_code, 200)

        edu_del = self.client.delete(f"/api/accounts/education/{edu_id}/")
        self.assertEqual(edu_del.status_code, 204)

        # 2. Experience
        exp_res = self.client.post("/api/accounts/experience/", {
            "organization": "Nairobi Tech",
            "job_title": "Software Intern",
            "start_date": "2024-01-01",
            "is_current": True,
            "responsibilities": "Building APIs",
        }, format="json")
        self.assertEqual(exp_res.status_code, 201)
        exp_id = exp_res.data["id"]

        exp_list = self.client.get("/api/accounts/experience/")
        self.assertEqual(exp_list.status_code, 200)

        exp_del = self.client.delete(f"/api/accounts/experience/{exp_id}/")
        self.assertEqual(exp_del.status_code, 204)

        # 3. Training
        trn_res = self.client.post("/api/accounts/training/", {
            "name": "Cloud Computing Fundamentals",
            "institution": "AWS Academy",
            "year": 2025,
        }, format="json")
        self.assertEqual(trn_res.status_code, 201)
        trn_id = trn_res.data["id"]

        trn_list = self.client.get("/api/accounts/training/")
        self.assertEqual(trn_list.status_code, 200)

        trn_del = self.client.delete(f"/api/accounts/training/{trn_id}/")
        self.assertEqual(trn_del.status_code, 204)

        # 4. Membership
        mem_res = self.client.post("/api/accounts/membership/", {
            "body_name": "Computer Society of Kenya",
            "membership_number": "CSK-9988",
            "status": "ACTIVE",
        }, format="json")
        self.assertEqual(mem_res.status_code, 201)
        mem_id = mem_res.data["id"]

        mem_list = self.client.get("/api/accounts/membership/")
        self.assertEqual(mem_list.status_code, 200)

        mem_del = self.client.delete(f"/api/accounts/membership/{mem_id}/")
        self.assertEqual(mem_del.status_code, 204)

    def test_document_upload_and_download_permissions(self):
        self.client.force_authenticate(user=self.applicant)

        # Upload document
        pdf = SimpleUploadedFile("national_id.pdf", b"%PDF-1.4 National ID binary content", content_type="application/pdf")
        upload_res = self.client.post("/api/accounts/documents/", {
            "document_type": "NATIONAL_ID",
            "file": pdf,
        }, format="multipart")
        self.assertEqual(upload_res.status_code, 201)
        doc_id = upload_res.data["id"]

        # Owner can download
        dl_owner = self.client.get(f"/api/accounts/documents/{doc_id}/download/")
        self.assertEqual(dl_owner.status_code, 200)
        self.assertEqual(dl_owner["Content-Type"], "application/pdf")

        # Other applicant cannot download (403)
        other_applicant = User.objects.create_user(
            username="other_applicant",
            email="other@example.com",
            password="Password123!",
            role="APPLICANT",
        )
        self.client.force_authenticate(user=other_applicant)
        dl_other = self.client.get(f"/api/accounts/documents/{doc_id}/download/")
        self.assertEqual(dl_other.status_code, 403)

        # HR can download
        self.client.force_authenticate(user=self.hr)
        dl_hr = self.client.get(f"/api/accounts/documents/{doc_id}/download/")
        self.assertEqual(dl_hr.status_code, 200)

        # Admin can download
        self.client.force_authenticate(user=self.admin)
        dl_admin = self.client.get(f"/api/accounts/documents/{doc_id}/download/")
        self.assertEqual(dl_admin.status_code, 200)


class AccountsSecurityAndAccessControlTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="sec_admin",
            email="sec_admin@example.com",
            password="AdminPassword123!",
            role="ADMIN",
            is_staff=True,
        )
        self.applicant = User.objects.create_user(
            username="sec_applicant",
            email="sec_applicant@example.com",
            password="ApplicantPassword123!",
            role="APPLICANT",
        )
        self.victim = User.objects.create_user(
            username="victim_applicant",
            email="victim@example.com",
            password="VictimPassword123!",
            role="APPLICANT",
        )

    def test_privilege_escalation_blocked_on_non_admin(self):
        # Applicant attempts to promote themselves to ADMIN via profile or user management
        self.client.force_authenticate(user=self.applicant)

        # Attempt to access user management list/update
        res = self.client.get("/api/accounts/users/")
        self.assertEqual(res.status_code, 403)

        res_patch = self.client.patch(f"/api/accounts/users/{self.applicant.id}/", {"role": "ADMIN"})
        self.assertEqual(res_patch.status_code, 403)

        # Ensure role remains APPLICANT
        self.applicant.refresh_from_db()
        self.assertEqual(self.applicant.role, "APPLICANT")

    def test_audit_logs_and_system_settings_restricted_to_admin(self):
        self.client.force_authenticate(user=self.applicant)

        # Audit logs blocked
        res_audit = self.client.get("/api/accounts/audit-logs/")
        self.assertEqual(res_audit.status_code, 403)

        # System settings blocked
        res_settings = self.client.get("/api/accounts/settings/")
        self.assertEqual(res_settings.status_code, 403)

    def test_admin_cannot_delete_self_or_last_remaining_admin(self):
        self.client.force_authenticate(user=self.admin)

        # Admin cannot delete their own account
        res_self_del = self.client.delete(f"/api/accounts/users/{self.admin.id}/")
        self.assertEqual(res_self_del.status_code, 400)
        self.assertTrue(User.objects.filter(id=self.admin.id).exists())

        # Admin cannot demote last remaining admin
        res_demote = self.client.patch(f"/api/accounts/users/{self.admin.id}/", {"role": "APPLICANT"})
        self.assertEqual(res_demote.status_code, 400)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, "ADMIN")

    def test_department_director_document_access_scoping(self):
        from datetime import timedelta
        from django.utils import timezone
        from jobs.models import Department, Job, Application

        dept_geo = Department.objects.create(name="Geosciences")
        dept_ict = Department.objects.create(name="ICT Unit")

        director_geo = User.objects.create_user(
            username="dir_geo",
            email="geo@example.com",
            password="Password123!",
            role="DEPARTMENT_DIRECTOR",
            department=dept_geo,
        )
        director_ict = User.objects.create_user(
            username="dir_ict",
            email="ict@example.com",
            password="Password123!",
            role="DEPARTMENT_DIRECTOR",
            department=dept_ict,
        )

        job_geo = Job.objects.create(
            department=dept_geo,
            title="Geologist Trainee",
            description="Explore",
            requirements="Earth science",
            deadline=timezone.now() + timedelta(days=5),
        )
        Application.objects.create(user=self.victim, job=job_geo)

        # Victim uploads a document
        self.client.force_authenticate(user=self.victim)
        pdf = SimpleUploadedFile("cert.pdf", b"%PDF-1.4 Cert", content_type="application/pdf")
        upload_res = self.client.post("/api/accounts/documents/", {"document_type": "STUDENT_ID", "file": pdf}, format="multipart")
        doc_id = upload_res.data["id"]

        # Geosciences director CAN download (victim applied to geosciences)
        self.client.force_authenticate(user=director_geo)
        dl_geo = self.client.get(f"/api/accounts/documents/{doc_id}/download/")
        self.assertEqual(dl_geo.status_code, 200)

        # ICT director CANNOT download (victim did not apply to ICT) -> 403
        self.client.force_authenticate(user=director_ict)
        dl_ict = self.client.get(f"/api/accounts/documents/{doc_id}/download/")
        self.assertEqual(dl_ict.status_code, 403)
