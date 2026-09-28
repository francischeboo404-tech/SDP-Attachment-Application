from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    ProfileDetailView,
    EducationListCreateView,
    EducationDetailView,
    ExperienceListCreateView,
    ExperienceDetailView,
    TrainingListCreateView,
    TrainingDetailView,
    MembershipListCreateView,
    MembershipDetailView,
    DocumentListCreateView,
    DocumentDetailView,
    DocumentLimitsView,
    ProtectedMediaView,
    UserManagementListView,
    UserManagementDetailView,
    CustomTokenObtainPairView,
    DashboardStatsView,
    GoogleLoginView,
    AuditLogListView,
    SystemSettingListView,
    SystemSettingDetailView,
    ForcedPasswordChangeView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("google-login/", GoogleLoginView.as_view(), name="google_login"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("dashboard-stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("profile/", ProfileDetailView.as_view(), name="profile-detail"),
    path("education/", EducationListCreateView.as_view(), name="education-list"),
    path("education/<int:pk>/", EducationDetailView.as_view(), name="education-detail"),
    path("experience/", ExperienceListCreateView.as_view(), name="experience-list"),
    path(
        "experience/<int:pk>/", ExperienceDetailView.as_view(), name="experience-detail"
    ),
    path("training/", TrainingListCreateView.as_view(), name="training-list"),
    path("training/<int:pk>/", TrainingDetailView.as_view(), name="training-detail"),
    path("membership/", MembershipListCreateView.as_view(), name="membership-list"),
    path(
        "membership/<int:pk>/", MembershipDetailView.as_view(), name="membership-detail"
    ),
    path("documents/", DocumentListCreateView.as_view(), name="document-list"),
    path(
        "document-limits/",
        DocumentLimitsView.as_view(),
        name="document-limits",
    ),
    path("documents/<int:pk>/", DocumentDetailView.as_view(), name="document-detail"),
    path(
        "documents/<int:pk>/download/",
        ProtectedMediaView.as_view(),
        name="document-download",
    ),
    path("users/", UserManagementListView.as_view(), name="user-management-list"),
    path(
        "users/<int:pk>/",
        UserManagementDetailView.as_view(),
        name="user-management-detail",
    ),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs-list"),
    path("settings/", SystemSettingListView.as_view(), name="system-settings-list"),
    path("settings/<int:pk>/", SystemSettingDetailView.as_view(), name="system-settings-detail"),
    path("change-password-forced/", ForcedPasswordChangeView.as_view(), name="change-password-forced"),
]
