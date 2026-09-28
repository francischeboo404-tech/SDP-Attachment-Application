from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    ROLE_CHOICES = (
        ("ADMIN", "Admin"),
        ("HR", "HR Manager"),
        ("APPLICANT", "Applicant"),
        ("DEPARTMENT_DIRECTOR", "Department Director"),
        ("DEPARTMENT", "Department User"),
    )
    email = models.EmailField("email address", unique=True, db_index=True)
    role = models.CharField(
        max_length=30, choices=ROLE_CHOICES, default="APPLICANT", db_index=True
    )
    department = models.ForeignKey(
        "jobs.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_users",
    )
    must_change_password = models.BooleanField(
        default=False,
        help_text="Designates whether the user must change their temporary password upon next login."
    )

    def __str__(self):
        return self.username


class Profile(models.Model):
    OPPORTUNITY_CHOICES = (
        ("ATTACHMENT", "Industrial Attachment"),
    )
    GENDER_CHOICES = (
        ("M", "Male"),
        ("F", "Female"),
        ("O", "Other"),
    )
    MARITAL_STATUS_CHOICES = (
        ("SINGLE", "Single"),
        ("MARRIED", "Married"),
        ("DIVORCED", "Divorced"),
        ("WIDOWED", "Widowed"),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    opportunity_type = models.CharField(
        max_length=20, choices=OPPORTUNITY_CHOICES, default="ATTACHMENT", db_index=True
    )
    middle_name = models.CharField(max_length=150, blank=True)
    dob = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True)
    marital_status = models.CharField(
        max_length=20, choices=MARITAL_STATUS_CHOICES, blank=True
    )
    postal_address = models.CharField(max_length=200, blank=True)
    nationality = models.CharField(max_length=100, default="Kenyan")
    phone_number = models.CharField(max_length=15, blank=True, db_index=True)
    id_number = models.CharField(max_length=20, blank=True, db_index=True)
    kra_pin = models.CharField(max_length=20, blank=True, db_index=True)
    nssf_number = models.CharField(max_length=20, blank=True)
    nhif_number = models.CharField(max_length=20, blank=True)
    county_of_residence = models.CharField(max_length=100, blank=True)

    # Merged Academic & Attachment Biodata
    institution_name = models.CharField(max_length=200, blank=True)
    qualification = models.CharField(max_length=100, blank=True)
    field_of_study = models.CharField(max_length=150, blank=True)
    joining_date = models.DateField(null=True, blank=True)
    # "Academic Standing / Grade Award" was removed from the applicant biodata.
    # It never fed the ATS score (see jobs.views.ApplicationListCreateView
    # .calculate_ats_score, which reads only documents and keyword overlap), so
    # removing it changed no applicant's score.

    # Next of Kin Details
    next_of_kin_name = models.CharField(max_length=150, blank=True)
    next_of_kin_relationship = models.CharField(max_length=100, blank=True)
    next_of_kin_phone = models.CharField(max_length=30, blank=True)
    next_of_kin_address = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return f"{self.user.username} Profile"


class Education(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="education")
    institution_name = models.CharField(max_length=200)
    qualification = models.CharField(max_length=100)
    field_of_study = models.CharField(max_length=150)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    current = models.BooleanField(default=False)


class Experience(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="experience")
    organization = models.CharField(max_length=200)
    employer_contact = models.CharField(max_length=100, blank=True)
    job_title = models.CharField(max_length=150)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    responsibilities = models.TextField(max_length=5000)


class Training(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="trainings")
    name = models.CharField(max_length=200)
    institution = models.CharField(max_length=200)
    # Validated to a sensible range — rejects obviously invalid years (e.g. 0, -1, 99999)
    year = models.IntegerField(
        validators=[MinValueValidator(1950), MaxValueValidator(2100)]
    )


class ProfessionalMembership(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    body_name = models.CharField(max_length=200)
    membership_number = models.CharField(max_length=100)
    status = models.CharField(max_length=50)


class Document(models.Model):
    DOCUMENT_TYPES = (
        ("NATIONAL_ID", "National ID"),
        ("RESUME", "Resume/CV"),
        ("COVER_LETTER", "Cover Letter"),
        ("INSTITUTION_INTRO", "Introduction Letter from Institution"),
        ("STUDENT_INSURANCE", "Student Insurance Cover"),
        ("STUDENT_ID", "Copy of Student ID"),
        ("NEXT_OF_KIN_ID", "Copy of Next of Kin (ID & Phone)"),
        ("TRANSCRIPT", "Transcripts"),
        ("GOOD_CONDUCT", "Certificate of Good Conduct"),
        ("PASSPORT_PHOTOS", "Two Colour Passport Photos (PDF)"),
        # "KRA_PIN" (KRA PIN Certificate) was removed from the required upload
        # set and replaced by TRANSCRIPT and GOOD_CONDUCT. The separate Step 1
        # `Profile.kra_pin` biodata field is unrelated and is retained.
        # Commented out types per requirements (retained in comments for future reference):
        # ("SHA_CARD", "SHA Card"),
        # ("NSSF_CARD", "NSSF Card"),
        # ("BIRTH_CERT", "Birth Certificate"),
        # ("ACADEMIC_CERT", "Academic Certificates"),
        # ("SECRETS_ACT_FORM", "Official Secrets Act Form"),
        # ("PSIP_FORM", "PSIP Intern Biodata Form"),
        # ("ATM_CARD", "ATM Card / Bank Details"),
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="documents")
    document_type = models.CharField(
        max_length=20, choices=DOCUMENT_TYPES, db_index=True
    )
    file = models.FileField(upload_to="secure_docs/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "document_type")

    def __str__(self):
        return f"{self.user.username} - {self.get_document_type_display()}"


class AuditLog(models.Model):
    """
    Immutable audit trail for all sensitive operations across the system.
    """
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
        db_index=True,
    )
    action = models.CharField(max_length=64, db_index=True)
    target_description = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        actor_name = self.actor.username if self.actor else "System"
        return f"[{self.created_at.strftime('%Y-%m-%d %H:%M')}] {self.action} by {actor_name}: {self.target_description}"


class SystemSetting(models.Model):
    """
    Encrypted configuration and credentials storage for Admin-configured parameters.
    Values are encrypted at rest and never exposed unmasked to the frontend.
    """
    key = models.CharField(max_length=100, unique=True, db_index=True)
    encrypted_value = models.TextField(blank=True)
    description = models.CharField(max_length=255, blank=True)
    is_secret = models.BooleanField(default=True)
    category = models.CharField(max_length=50, default="GENERAL")
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_settings"
    )

    class Meta:
        ordering = ["category", "key"]

    def __str__(self):
        return self.key

    @staticmethod
    def _get_cipher():
        import base64
        import hashlib
        from django.conf import settings
        from cryptography.fernet import Fernet
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        return Fernet(key)

    def set_value(self, raw_value):
        if not raw_value:
            self.encrypted_value = ""
            return
        cipher = self._get_cipher()
        self.encrypted_value = cipher.encrypt(raw_value.encode("utf-8")).decode("utf-8")

    def set_plain_value(self, raw_value):
        return self.set_value(raw_value)

    def get_value(self):
        if not self.encrypted_value:
            return ""
        try:
            cipher = self._get_cipher()
            return cipher.decrypt(self.encrypted_value.encode("utf-8")).decode("utf-8")
        except Exception:
            return ""

    def get_plain_value(self):
        return self.get_value()

    def get_masked_value(self):
        raw = self.get_value()
        if not raw:
            return ""
        if not self.is_secret:
            return raw
        if len(raw) <= 4:
            return "••••••••"
        return f"••••••••{raw[-4:]}"

