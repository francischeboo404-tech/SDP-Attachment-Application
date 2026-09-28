import os
import re
from rest_framework import serializers
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import (
    Profile,
    Education,
    Experience,
    Training,
    ProfessionalMembership,
    Document,
    AuditLog,
    SystemSetting,
)
from .utils import verify_recaptcha
from . import document_limits
from .date_rules import backdated_error, changed_to_backdated

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    recaptcha = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        recaptcha_token = attrs.pop("recaptcha", None)
        if not verify_recaptcha(recaptcha_token):
            raise serializers.ValidationError(
                {"recaptcha": "Invalid reCAPTCHA. Please try again."}
            )

        data = super().validate(attrs)
        data["user"] = {
            "id": self.user.id,
            "username": self.user.username,
            "email": self.user.email,
            "role": self.user.role,
            "department": self.user.department_id,
            "department_name": self.user.department.name if self.user.department else None,
            "is_superuser": self.user.is_superuser,
            "first_name": self.user.first_name,
            "last_name": self.user.last_name,
            "must_change_password": self.user.must_change_password,
        }
        return data


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True, default="System")
    actor_email = serializers.CharField(source="actor.email", read_only=True, default="")
    actor_role = serializers.CharField(source="actor.role", read_only=True, default="")

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor",
            "actor_username",
            "actor_email",
            "actor_role",
            "action",
            "target_description",
            "metadata",
            "ip_address",
            "created_at",
        )
        read_only_fields = fields


class SystemSettingSerializer(serializers.ModelSerializer):
    masked_value = serializers.CharField(source="get_masked_value", read_only=True)
    raw_value = serializers.CharField(write_only=True, required=False, allow_blank=True)
    value = serializers.CharField(write_only=True, required=False, allow_blank=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True, default=None)

    class Meta:
        model = SystemSetting
        fields = (
            "id",
            "key",
            "description",
            "is_secret",
            "category",
            "masked_value",
            "raw_value",
            "value",
            "updated_at",
            "updated_by",
            "updated_by_username",
        )
        read_only_fields = ("id", "masked_value", "updated_at", "updated_by", "updated_by_username")

    def create(self, validated_data):
        raw_val = validated_data.pop("raw_value", None)
        if raw_val is None:
            raw_val = validated_data.pop("value", "")
        else:
            validated_data.pop("value", None)
        request = self.context.get("request")
        if request and hasattr(request, "user") and request.user and request.user.is_authenticated and "updated_by" not in validated_data:
            validated_data["updated_by"] = request.user
        setting = SystemSetting(**validated_data)
        if raw_val:
            setting.set_value(raw_val)
        setting.save()
        return setting

    def update(self, instance, validated_data):
        raw_val = validated_data.pop("raw_value", None)
        if raw_val is None:
            raw_val = validated_data.pop("value", None)
        else:
            validated_data.pop("value", None)
        request = self.context.get("request")
        if request and hasattr(request, "user") and request.user and request.user.is_authenticated and "updated_by" not in validated_data:
            validated_data["updated_by"] = request.user
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if raw_val is not None:
            instance.set_value(raw_val)
        instance.save()
        return instance


class ForcedPasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True)
    confirm_password = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        user = self.context.get("request").user
        if not user.check_password(attrs.get("old_password")):
            raise serializers.ValidationError({"old_password": "Current temporary password is incorrect."})

        new_pwd = attrs.get("new_password")
        if new_pwd != attrs.get("confirm_password"):
            raise serializers.ValidationError({"confirm_password": "New passwords do not match."})

        try:
            password_validation.validate_password(new_pwd, user)
        except DjangoValidationError as err:
            raise serializers.ValidationError({"new_password": list(err.messages)})

        return attrs


class UserSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "role", "department", "department_name", "first_name", "last_name", "must_change_password")


class UserManagementSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "role",
            "department",
            "department_name",
            "first_name",
            "last_name",
            "is_active",
            "date_joined",
        )
        read_only_fields = ("username", "email", "date_joined")

    def validate(self, attrs):
        request = self.context.get("request")
        new_role = attrs.get("role", getattr(self.instance, "role", None))
        new_department = attrs.get("department", getattr(self.instance, "department", None))
        new_is_active = attrs.get("is_active", getattr(self.instance, "is_active", True))

        if request and request.user:
            # Check permissions for role or status change
            if "role" in attrs and self.instance and self.instance.role != new_role:
                if not (request.user.role == "ADMIN" or request.user.is_superuser):
                    raise serializers.ValidationError(
                        {"role": "Only administrators can change user roles."}
                    )

            # Prevent demoting or deactivating the last remaining active ADMIN
            if self.instance and self.instance.role == "ADMIN" and self.instance.is_active:
                will_remain_active_admin = (new_role == "ADMIN") and new_is_active
                if not will_remain_active_admin:
                    other_admins = User.objects.filter(role="ADMIN", is_active=True).exclude(pk=self.instance.pk).count()
                    if other_admins == 0:
                        raise serializers.ValidationError(
                            {"role": "Cannot demote or deactivate the last remaining active Administrator account. Assign another Administrator first."}
                        )

        # Enforce that department-linked roles must have an assigned department
        if new_role in ["DEPARTMENT_DIRECTOR", "DEPARTMENT"]:
            if not new_department:
                role_label = "Department Director" if new_role == "DEPARTMENT_DIRECTOR" else "Department User"
                raise serializers.ValidationError(
                    {"department": f"A department must be assigned when granting the {role_label} role."}
                )

        return attrs

    def update(self, instance, validated_data):
        from jobs.models import Department
        old_role = instance.role
        new_role = validated_data.get("role", old_role)
        new_dept = validated_data.get("department", instance.department)

        # If demoting away from DEPARTMENT_DIRECTOR, clear any director link on their department
        if old_role == "DEPARTMENT_DIRECTOR" and new_role != "DEPARTMENT_DIRECTOR":
            Department.objects.filter(director=instance).update(director=None)

        # If demoting away from department roles to APPLICANT/HR/ADMIN, clear user's department link
        if old_role in ["DEPARTMENT_DIRECTOR", "DEPARTMENT"] and new_role not in ["DEPARTMENT_DIRECTOR", "DEPARTMENT"]:
            if "department" not in validated_data:
                instance.department = None

        # If granting DEPARTMENT_DIRECTOR role, assign this user as director of that department
        if new_role == "DEPARTMENT_DIRECTOR" and new_dept:
            new_dept.director = instance
            new_dept.save(update_fields=["director"])

        return super().update(instance, validated_data)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    recaptcha = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "recaptcha",
        )

    def validate_recaptcha(self, value):
        if not verify_recaptcha(value):
            raise serializers.ValidationError("Invalid reCAPTCHA. Please try again.")
        return value

    def validate_username(self, value):
        # Enforce a sensible length range; the model allows up to 150 chars by default
        # which could enable user-enumeration via absurdly long usernames.
        if len(value) < 3:
            raise serializers.ValidationError(
                "Username must be at least 3 characters long."
            )
        if len(value) > 50:
            raise serializers.ValidationError(
                "Username must not exceed 50 characters."
            )
        return value

    def validate_password(self, value):
        # NIST SP 800-63B: no arbitrary upper bound below 64 chars.
        # Cap at 128 to prevent DoS via expensive bcrypt hashing of huge strings.
        if len(value) < 8:
            raise serializers.ValidationError(
                "Password must be at least 8 characters long."
            )
        if len(value) > 128:
            raise serializers.ValidationError(
                "Password must not exceed 128 characters."
            )
        if not re.search(r"[A-Z]", value):
            raise serializers.ValidationError(
                "Password must contain at least one uppercase letter."
            )
        if not re.search(r"[a-z]", value):
            raise serializers.ValidationError(
                "Password must contain at least one lowercase letter."
            )
        if not re.search(r"[0-9]", value):
            raise serializers.ValidationError(
                "Password must contain at least one number."
            )
        if not re.search(r"[^A-Za-z0-9]", value):
            raise serializers.ValidationError(
                "Password must contain at least one special character."
            )
        return value

    def validate_email(self, value):
        # Case-insensitive check prevents duplicate accounts via capitalisation tricks
        # (e.g. "User@X.com" vs "user@x.com" must be treated as the same address).
        normalised = value.lower()
        if User.objects.filter(email__iexact=normalised).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return normalised

    def create(self, validated_data):
        # Pop helper fields that are not User model attributes before ORM creation
        validated_data.pop("recaptcha", None)
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            role="APPLICANT",
        )
        return user


class ProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(
        source="user.first_name", required=False, allow_blank=True
    )
    last_name = serializers.CharField(
        source="user.last_name", required=False, allow_blank=True
    )
    email = serializers.EmailField(
        source="user.email", required=False, allow_blank=True
    )

    class Meta:
        model = Profile
        exclude = ("user",)

    def validate(self, attrs):
        """
        Reject the retired "Academic Standing / Grade Award" field explicitly.

        DRF's ModelSerializer silently discards input keys that do not map to a
        model field, so without this a client replaying an old saved draft would
        get a 200 and believe the grade had been recorded when nothing was
        stored. The field was removed from the biodata and never fed the ATS
        score, so a clear error is the honest outcome.
        """
        if "grade_award" in self.initial_data:
            raise serializers.ValidationError(
                {
                    "grade_award": (
                        "The 'Academic Standing / Grade Award' field has been removed "
                        "and is no longer accepted or scored. Please resubmit without it."
                    )
                }
            )

        user_data = attrs.get("user", {})
        if "email" in user_data and self.instance:
            new_email = user_data["email"].lower()
            current_user_pk = self.instance.user.pk if hasattr(self.instance, "user") else None
            if User.objects.filter(email__iexact=new_email).exclude(pk=current_user_pk).exists():
                raise serializers.ValidationError(
                    {"email": "This email address is already in use by another account."}
                )
        return attrs

    def validate_joining_date(self, value):
        # The student is declaring when their attachment will begin, so it
        # cannot already be behind them. A profile saved before this rule
        # existed keeps its stored date untouched: re-saving it unchanged is
        # not new backdating, and the student must not be locked out of fixing
        # an unrelated field because of it.
        stored = self.instance.joining_date if self.instance else None
        if changed_to_backdated(stored, value):
            raise serializers.ValidationError(
                backdated_error("Intended attachment start date")
            )
        return value

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        if user_data:
            user = instance.user
            if "first_name" in user_data:
                user.first_name = user_data["first_name"]
            if "last_name" in user_data:
                user.last_name = user_data["last_name"]
            if "email" in user_data:
                new_email = user_data["email"].lower()
                if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
                    raise serializers.ValidationError(
                        {"email": "This email address is already in use by another account."}
                    )
                user.email = new_email
            user.save()
        return super().update(instance, validated_data)


class EducationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Education
        exclude = ("user",)

    def to_internal_value(self, data):
        if "end_date" in data and data["end_date"] == "":
            data = data.copy()
            data["end_date"] = None
        return super().to_internal_value(data)

    def validate(self, attrs):
        current = attrs.get("current", False)
        end_date = attrs.get("end_date")

        if not current and not end_date:
            raise serializers.ValidationError({
                "end_date": "End date is required when current is False."
            })

        return attrs


class ExperienceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Experience
        exclude = ("user",)

    def to_internal_value(self, data):
        # Mirror EducationSerializer: treat an empty end_date string as None so
        # the frontend can send "" instead of null without a date-format error.
        if "end_date" in data and data["end_date"] == "":
            data = data.copy()
            data["end_date"] = None
        return super().to_internal_value(data)

    def validate(self, attrs):
        is_current = attrs.get("is_current", False)
        end_date   = attrs.get("end_date")
        if not is_current and not end_date:
            raise serializers.ValidationError({
                "end_date": "End date is required when this is not your current position."
            })
        return attrs


class TrainingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Training
        exclude = ("user",)


class ProfessionalMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfessionalMembership
        exclude = ("user",)


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        exclude = ("user",)

    def validate(self, attrs):
        """
        The size cap depends on ``document_type``, which is a sibling field
        rather than part of ``validate_file``, so it is applied here once both
        values are available. A blank or absent type falls back to the default
        limit, which is the strictest one, so an unrecognised type cannot be
        used to obtain a larger allowance.
        """
        attrs = super().validate(attrs)
        uploaded = attrs.get("file")
        document_type = attrs.get("document_type")
        if uploaded is None or not hasattr(uploaded, "size"):
            return attrs
        max_bytes = document_limits.max_bytes_for(document_type)
        if uploaded.size > max_bytes:
            raise serializers.ValidationError(
                {
                    "file": (
                        f"File size must not exceed "
                        f"{document_limits.human_size(max_bytes)} "
                        f"(your file is {uploaded.size / (1024 * 1024):.1f} MB)."
                    )
                }
            )
        return attrs

    def validate_file(self, value):
        """
        Security gate for uploaded files.

        Enforces:
        - PDF-only (by file extension AND MIME type)
        - A hard absolute size ceiling (see ``ABSOLUTE_MAX_BYTES``)

        The per-document-type cap is enforced in ``validate`` because it needs
        ``document_type``. The ceiling here is what stops a request that
        declares an unknown document type from exceeding the global limit, and
        it also mirrors Django's framework-level upload guard so the two can
        never disagree.

        Rationale: accepting arbitrary file types would allow uploading
        executable scripts, HTML phishing pages, or ZIP bombs.
        The size cap prevents disk-exhaustion DoS attacks.
        """
        # Extension check
        ext = os.path.splitext(value.name)[1].lower()
        if ext != ".pdf":
            raise serializers.ValidationError(
                "Only PDF files are accepted. Please upload a .pdf file."
            )

        # MIME type check (InMemoryUploadedFile and TemporaryUploadedFile expose content_type)
        allowed_mimes = {"application/pdf", "application/x-pdf"}
        content_type = getattr(value, "content_type", None)
        if content_type and content_type not in allowed_mimes:
            raise serializers.ValidationError(
                "Invalid file type detected. The server only accepts application/pdf."
            )

        # Absolute size ceiling. The per-type limit is applied in validate().
        if value.size > document_limits.ABSOLUTE_MAX_BYTES:
            raise serializers.ValidationError(
                f"File size must not exceed "
                f"{document_limits.human_size(document_limits.ABSOLUTE_MAX_BYTES)} "
                f"(your file is {value.size / (1024 * 1024):.1f} MB)."
            )

        return value


