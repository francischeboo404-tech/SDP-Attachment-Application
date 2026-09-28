from django.urls import path
from .views import (
    DepartmentListCreateView,
    DepartmentDetailView,
    AvailableDirectorsListView,
    RequisitionListCreateView,
    RequisitionDetailView,
    RequisitionReviewView,
    PublicVacancyListView,
    JobListCreateView,
    JobDetailView,
    JobArchiveToggleView,
    JobBulkArchiveView,
    ApplicationListCreateView,
    ApplicationDetailView,
    ApplicationStatusUpdateView,
    DeploymentListCreateView,
    DeploymentDetailView,
    DeploymentExitView,
    MyDeploymentView,
    NotificationListView,
    NotificationMarkReadView,
    NotificationMarkAllReadView,
    MyClearanceListView,
    ClearanceSubmitView,
    DepartmentClearanceQueueView,
    DepartmentClearanceReviewView,
    HRClearanceQueueView,
    HRClearanceReviewView,
    RecommendationLetterTemplateListCreateView,
    RecommendationLetterTemplateDetailView,
    RecommendationLetterGenerateView,
    RecommendationLetterListView,
    RecommendationLetterDetailView,
    RecommendationLetterDownloadView,
    AttacheesReportView,
    FillRatesReportView,
    ExportCSVReportView,
    AnalyticsView,
    DepartmentStaffingView,
    EligibilitySettingView,
    AtsScoringConfigurationView,
    ArchivesListView,
    ArchiveRestoreView,
    ArchivePurgeView,
)

urlpatterns = [
    # Archive Portal Endpoints
    path("archives/", ArchivesListView.as_view(), name="archives-list"),
    path("archives/<str:entity_type>/<int:pk>/restore/", ArchiveRestoreView.as_view(), name="archive-restore"),
    path("archives/<str:entity_type>/<int:pk>/purge/", ArchivePurgeView.as_view(), name="archive-purge"),

    # General Eligibility Settings
    path("eligibility-settings/", EligibilitySettingView.as_view(), name="eligibility-settings"),

    # ATS quality tier scoring thresholds (Admin-configurable, drives dashboard tiering)
    path("ats-scoring-configuration/", AtsScoringConfigurationView.as_view(), name="ats-scoring-configuration"),

    # 1.1 Departments & Directors
    path("departments/", DepartmentListCreateView.as_view(), name="department-list"),
    path("departments/<int:pk>/", DepartmentDetailView.as_view(), name="department-detail"),
    path("departments/directors-available/", AvailableDirectorsListView.as_view(), name="available-directors-list"),

    # 2. Requisitions Workflow
    path("requisitions/", RequisitionListCreateView.as_view(), name="requisition-list"),
    path("requisitions/<int:pk>/", RequisitionDetailView.as_view(), name="requisition-detail"),
    path("requisitions/<int:pk>/review/", RequisitionReviewView.as_view(), name="requisition-review"),

    # 1.3 Public Vacancies
    path("vacancies/public/", PublicVacancyListView.as_view(), name="public-vacancies-list"),

    # Vacancies (Management & Applicants)
    path("vacancies/", JobListCreateView.as_view(), name="job-list"),
    path("vacancies/<int:pk>/", JobDetailView.as_view(), name="job-detail"),
    path("vacancies/<int:pk>/archive/", JobArchiveToggleView.as_view(), name="job-archive-toggle"),
    path("vacancies/bulk-archive/", JobBulkArchiveView.as_view(), name="job-bulk-archive"),

    # Applications
    path("applications/", ApplicationListCreateView.as_view(), name="application-list"),
    path(
        "applications/<int:pk>/",
        ApplicationDetailView.as_view(),
        name="application-detail",
    ),
    path(
        "applications/<int:pk>/status/",
        ApplicationStatusUpdateView.as_view(),
        name="application-status-update",
    ),

    # 1.4 Deployments & Exit
    path("deployments/", DeploymentListCreateView.as_view(), name="deployment-list"),
    path("deployments/<int:pk>/", DeploymentDetailView.as_view(), name="deployment-detail"),
    path("deployments/<int:pk>/exit/", DeploymentExitView.as_view(), name="deployment-exit"),
    path("deployments/my-deployment/", MyDeploymentView.as_view(), name="my-deployment"),

    # 1.5 Dual Clearance Workflow
    path("clearance/my-clearances/", MyClearanceListView.as_view(), name="my-clearances"),
    path("clearance/<int:pk>/submit/", ClearanceSubmitView.as_view(), name="clearance-submit"),
    path("clearance/department-queue/", DepartmentClearanceQueueView.as_view(), name="department-clearance-queue"),
    path("clearance/<int:pk>/department-review/", DepartmentClearanceReviewView.as_view(), name="department-clearance-review"),
    path("clearance/hr-queue/", HRClearanceQueueView.as_view(), name="hr-clearance-queue"),
    path("clearance/<int:pk>/hr-review/", HRClearanceReviewView.as_view(), name="hr-clearance-review"),

    # 1.2 & 1.6 Recommendation Letter Templates & Generation
    path("recommendations/templates/", RecommendationLetterTemplateListCreateView.as_view(), name="recommendation-template-list"),
    path("recommendations/templates/<int:pk>/", RecommendationLetterTemplateDetailView.as_view(), name="recommendation-template-detail"),
    path("recommendations/generate/<int:deployment_id>/", RecommendationLetterGenerateView.as_view(), name="recommendation-letter-generate"),
    path("recommendations/", RecommendationLetterListView.as_view(), name="recommendation-letter-list"),
    path("recommendations/<int:pk>/", RecommendationLetterDetailView.as_view(), name="recommendation-letter-detail"),
    path("recommendations/<int:pk>/download/", RecommendationLetterDownloadView.as_view(), name="recommendation-letter-download"),

    # Notifications
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path("notifications/<int:pk>/read/", NotificationMarkReadView.as_view(), name="notification-mark-read"),
    path("notifications/mark-all-read/", NotificationMarkAllReadView.as_view(), name="notification-mark-all-read"),

    # Reporting and Exports
    path("reports/attachees/", AttacheesReportView.as_view(), name="attachees-report"),
    path("reports/fill-rates/", FillRatesReportView.as_view(), name="fill-rates-report"),
    path("reports/export-csv/", ExportCSVReportView.as_view(), name="export-csv-report"),
    path("reports/analytics/", AnalyticsView.as_view(), name="analytics-dashboard"),
    path("staffing/", DepartmentStaffingView.as_view(), name="department-staffing"),
]
