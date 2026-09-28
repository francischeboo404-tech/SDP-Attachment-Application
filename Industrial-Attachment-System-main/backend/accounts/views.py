from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
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
from .serializers import (
    RegisterSerializer,
    ProfileSerializer,
    EducationSerializer,
    ExperienceSerializer,
    TrainingSerializer,
    ProfessionalMembershipSerializer,
    DocumentSerializer,
    UserManagementSerializer,
    CustomTokenObtainPairSerializer,
    AuditLogSerializer,
    SystemSettingSerializer,
    ForcedPasswordChangeSerializer,
)
from jobs.models import Application
import string
import random
from rest_framework_simplejwt.tokens import RefreshToken
from .utils import verify_google_token
from . import document_limits

User = get_user_model()


class AuthThrottle(AnonRateThrottle):
    """Strict IP-based throttle for login and registration endpoints."""
    scope = "auth"


class UploadThrottle(UserRateThrottle):
    """
    Per-user throttle for document file uploads.
    20 uploads/hour prevents disk-exhaustion DoS while allowing
    all 18 document types to be uploaded in a single session.
    """
    scope = "upload"


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [AuthThrottle]


class GoogleLoginView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_classes = [AuthThrottle]

    def post(self, request):
        token = request.data.get("tokenId")
        if not token:
            return Response(
                {"error": "Token is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            idinfo = verify_google_token(token)
            email = idinfo.get("email")
            if not email:
                return Response(
                    {"error": "No email returned from Google."}, status=status.HTTP_400_BAD_REQUEST
                )
            # Normalise to lowercase to prevent duplicate accounts via capitalisation
            # (e.g. "User@Gmail.com" and "user@gmail.com" are the same address).
            email = email.lower()
            first_name = idinfo.get("given_name", "")
            last_name  = idinfo.get("family_name", "")

            user = User.objects.filter(email__iexact=email).first()
            if not user:
                user = User.objects.create_user(
                    username=email,
                    email=email,
                    password="".join(
                        random.choices(string.ascii_letters + string.digits, k=16)
                    ),
                    first_name=first_name,
                    last_name=last_name,
                    role="APPLICANT",
                )

            refresh = RefreshToken.for_user(user)
            return Response(
                {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "email": user.email,
                        "role": user.role,
                        "is_superuser": user.is_superuser,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                    },
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class IsAdminUserRole(permissions.BasePermission):
    """
    Strict Admin-only permission for User Role Governance and Admin Management.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role == "ADMIN" or request.user.is_superuser



class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer
    throttle_classes = [AuthThrottle]


class ProfileDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self):
        obj, created = Profile.objects.get_or_create(user=self.request.user)
        return obj


class EducationListCreateView(generics.ListCreateAPIView):
    serializer_class = EducationSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        # Ordered explicitly: these models carry no Meta.ordering, so an
        # unordered queryset paginated by DRF can repeat or skip rows between
        # pages. Newest first matches how the profile renders the history.
        return Education.objects.filter(user=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class EducationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EducationSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return Education.objects.filter(user=self.request.user)


class ExperienceListCreateView(generics.ListCreateAPIView):
    serializer_class = ExperienceSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return Experience.objects.filter(user=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ExperienceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ExperienceSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return Experience.objects.filter(user=self.request.user)


class TrainingListCreateView(generics.ListCreateAPIView):
    serializer_class = TrainingSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return Training.objects.filter(user=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TrainingDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TrainingSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return Training.objects.filter(user=self.request.user)


class MembershipListCreateView(generics.ListCreateAPIView):
    serializer_class = ProfessionalMembershipSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return ProfessionalMembership.objects.filter(user=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class MembershipDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProfessionalMembershipSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return ProfessionalMembership.objects.filter(user=self.request.user)


class DocumentLimitsView(APIView):
    """
    Serves the enforced per-document-type upload size limits.

    The frontend builds its "National ID (Max 2MB)" labels and its client-side
    size check from this response, so the label the applicant reads is always
    the limit the server will actually apply. Hard-coding the number in the
    component is what previously let the UI claim 5 MB for seven document types
    while the API accepted 10 MB -- a label the browser enforced and the server
    did not.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        return Response(
            {
                "limits": document_limits.as_payload(),
                "default_max_bytes": document_limits.DEFAULT_MAX_BYTES,
                "default_label": document_limits.label_for(None),
                "absolute_max_bytes": document_limits.ABSOLUTE_MAX_BYTES,
            },
            status=status.HTTP_200_OK,
        )


class DocumentListCreateView(generics.ListCreateAPIView):
    serializer_class = DocumentSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_throttles(self):
        """
        Apply UploadThrottle (20/hour) only on POST requests (new file uploads).
        GET requests (listing existing documents) use the global user throttle
        so applicants can freely view their uploaded documents.
        """
        request = getattr(self, "request", None)
        if request and request.method == "POST":
            return [UploadThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        return Document.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DocumentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DocumentSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return Document.objects.filter(user=self.request.user)


class ProtectedMediaView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, pk, format=None):
        document = get_object_or_404(Document, pk=pk)

        # Check if the user is the owner, management, or the applicant's department director
        if document.user != request.user and request.user.role not in ["ADMIN", "HR"]:
            is_dept_authorized = False
            if request.user.role in ["DEPARTMENT_DIRECTOR", "DEPARTMENT"]:
                dept = getattr(request.user, "directed_department", None) or getattr(request.user, "department", None)
                if dept:
                    from jobs.models import Application, Deployment
                    is_dept_authorized = (
                        Application.objects.filter(user=document.user, job__department=dept).exists()
                        or Deployment.objects.filter(application__user=document.user, department=dept).exists()
                    )
            if not is_dept_authorized:
                from django.core.exceptions import PermissionDenied
                raise PermissionDenied("You do not have permission to view this file.")

        if not document.file:
            raise Http404("File not found")

        return FileResponse(document.file.open("rb"), content_type="application/pdf")


class UserManagementListView(generics.ListAPIView):
    serializer_class = UserManagementSerializer
    permission_classes = (IsAdminUserRole,)

    def get_queryset(self):
        return User.objects.all().order_by("-date_joined")


class UserManagementDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserManagementSerializer
    permission_classes = (IsAdminUserRole,)

    def get_queryset(self):
        return User.objects.all()

    def perform_update(self, serializer):
        user_before = self.get_object()
        old_role = user_before.role
        old_dept = user_before.department.name if user_before.department else None
        old_active = user_before.is_active

        updated_user = serializer.save()

        # Log Role Changes
        if old_role != updated_user.role:
            from .audit import log_audit_event
            log_audit_event(
                self.request,
                "ROLE_CHANGED",
                f"Changed role of user {updated_user.username} from {old_role} to {updated_user.role}",
                metadata={
                    "target_user_id": updated_user.id,
                    "target_username": updated_user.username,
                    "old_role": old_role,
                    "new_role": updated_user.role,
                }
            )

        # Log User Status / Department changes
        if old_active != updated_user.is_active:
            from .audit import log_audit_event
            action = "USER_ACTIVATED" if updated_user.is_active else "USER_DEACTIVATED"
            log_audit_event(
                self.request,
                action,
                f"{'Activated' if updated_user.is_active else 'Deactivated'} user account {updated_user.username}",
                metadata={"target_user_id": updated_user.id, "target_username": updated_user.username}
            )

    def perform_destroy(self, instance):
        from rest_framework.exceptions import ValidationError
        from .audit import log_audit_event

        # Prevent admin from deleting their own active account
        if instance == self.request.user:
            raise ValidationError({"detail": "Cannot delete your own active administrator account."})

        # Prevent deleting the last remaining active admin
        if instance.role == "ADMIN" and instance.is_active:
            other_admins = User.objects.filter(role="ADMIN", is_active=True).exclude(pk=instance.pk).count()
            if other_admins == 0:
                raise ValidationError({"detail": "Cannot delete the last remaining active Administrator account. Assign another Administrator first."})

        username = instance.username
        user_id = instance.id
        instance.delete()

        log_audit_event(
            self.request,
            "USER_DELETED",
            f"Permanently deleted user account {username}",
            metadata={"target_user_id": user_id, "target_username": username}
        )


class AuditLogListView(generics.ListAPIView):
    """
    Searchable, filterable, paginated read-only view of immutable system audit logs.
    Strictly Admin-only access.
    """
    serializer_class = AuditLogSerializer
    permission_classes = (IsAdminUserRole,)

    def get_queryset(self):
        from .models import AuditLog
        from django.db.models import Q

        qs = AuditLog.objects.select_related("actor").all()

        action = self.request.query_params.get("action")
        if action and action != "ALL":
            qs = qs.filter(action=action)

        actor_id = self.request.query_params.get("actor_id")
        if actor_id:
            qs = qs.filter(actor_id=actor_id)

        date_from = self.request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(target_description__icontains=search)
                | Q(action__icontains=search)
                | Q(actor__username__icontains=search)
                | Q(actor__email__icontains=search)
                | Q(ip_address__icontains=search)
            )

        return qs.order_by("-created_at")


class SystemSettingListView(generics.ListCreateAPIView):
    """
    Admin-only encrypted system settings & credentials management.
    Never exposes raw secrets; logs access and modifications in AuditLog.
    """
    serializer_class = SystemSettingSerializer
    permission_classes = (IsAdminUserRole,)

    def get_queryset(self):
        from .models import SystemSetting
        from .audit import log_audit_event

        # Log viewing of credentials & sensitive settings
        log_audit_event(
            self.request,
            "SETTINGS_VIEWED",
            "Administrator accessed system credentials and security configuration",
            metadata={"category_filter": self.request.query_params.get("category", "ALL")}
        )

        qs = SystemSetting.objects.select_related("updated_by").all()
        category = self.request.query_params.get("category")
        if category and category != "ALL":
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        from .audit import log_audit_event
        setting = serializer.save(updated_by=self.request.user)
        log_audit_event(
            self.request,
            "SETTINGS_CREATED",
            f"Configured new system setting / credential key: {setting.key}",
            metadata={"key": setting.key, "category": setting.category, "is_secret": setting.is_secret}
        )


class SystemSettingDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SystemSettingSerializer
    permission_classes = (IsAdminUserRole,)
    queryset = SystemSetting.objects.all()

    def perform_update(self, serializer):
        from .audit import log_audit_event
        setting = serializer.save(updated_by=self.request.user)
        log_audit_event(
            self.request,
            "SETTINGS_UPDATED",
            f"Updated system setting / credential key: {setting.key}",
            metadata={"key": setting.key, "category": setting.category, "is_secret": setting.is_secret}
        )

    def perform_destroy(self, instance):
        from .audit import log_audit_event
        key_name = instance.key
        log_audit_event(
            self.request,
            "SETTINGS_DELETED",
            f"Deleted system setting / credential key: {key_name}",
            metadata={"key": key_name}
        )
        instance.delete()


class ForcedPasswordChangeView(APIView):
    """
    Forces users created with temporary admin passwords to securely update their password.
    """
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        from .audit import log_audit_event
        serializer = ForcedPasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        new_pwd = serializer.validated_data["new_password"]
        user.set_password(new_pwd)
        user.must_change_password = False
        user.save()

        log_audit_event(
            request,
            "PASSWORD_CHANGED",
            f"User {user.username} successfully updated their temporary password",
            metadata={"user_id": user.id, "username": user.username}
        )

        return Response({"detail": "Password updated successfully. You now have full portal access."})


class DashboardStatsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        user = (
            User.objects.select_related("profile")
            .prefetch_related("education", "documents")
            .get(id=request.user.id)
        )
        # select_related("job") so we can read job.title without extra queries
        apps_list = list(
            Application.objects.filter(user=user)
            .select_related("job")
            .order_by("-applied_at")
        )
        applications_count = len(apps_list)

        latest_action     = "None"
        latest_status     = None
        latest_job_title  = None
        latest_applied_at = None

        if apps_list:
            latest_app        = apps_list[0]
            latest_status     = latest_app.status
            latest_job_title  = latest_app.job.title
            latest_applied_at = latest_app.applied_at.isoformat()
            # Human-readable action label includes the position name
            latest_action = f"{latest_app.get_status_display()}: {latest_app.job.title}"

        from .utils import calculate_profile_completion
        completion_data = calculate_profile_completion(user)

        response_data = {
            "applications_count": applications_count,
            "latest_action":      latest_action,
            "latest_status":      latest_status,
            "latest_job_title":   latest_job_title,
            "latest_applied_at":  latest_applied_at,
            "profile_completeness_percentage": completion_data["profile_completion"],
            **completion_data,
        }

        return Response(response_data)
