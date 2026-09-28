from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta, date
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock

from jobs.models import (
    Department,
    Job,
    Application,
    Notification,
    Deployment,
    Clearance,
    RecommendationLetterTemplate,
    RecommendationLetter,
    EligibilitySetting,
    Requisition,
)
from jobs.serializers import (
    DepartmentSerializer,
    RequisitionSerializer,
    JobSerializer,
    PublicJobSerializer,
    ApplicationSerializer,
    ClearanceSerializer,
    DeploymentSerializer,
    NotificationSerializer,
    RecommendationLetterTemplateSerializer,
    RecommendationLetterSerializer,
    EligibilitySettingSerializer,
    compute_derived_status,
)
from accounts.models import Profile, Document, AuditLog

User = get_user_model()


class JobsModelAndSerializerUnitTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dept = Department.objects.create(
            name="Exploration & Production",
            description="Upstream petroleum exploration",
            contact_email="exploration@petroleum.go.ke",
            contact_phone="020-1234567",
            typical_intake_capacity=10,
            is_active=True,
        )
        self.director = User.objects.create_user(
            username="dir_exploration",
            email="dir_exp@petroleum.go.ke",
            password="Password123!",
            first_name="David",
            last_name="Director",
            role="DEPARTMENT_DIRECTOR",
            department=self.dept,
        )
        self.dept.director = self.director
        self.dept.save()

        self.job = Job.objects.create(
            department=self.dept,
            title="Geology Attachee",
            description="Geological data analysis",
            requirements="Earth Sciences, GIS",
            job_type="ATTACHMENT",
            location="Nairobi HQ",
            slots_required=2,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=20),
            is_active=True,
        )
        self.applicant1 = User.objects.create_user(
            username="app_student1",
            email="student1@uni.ac.ke",
            password="Password123!",
            first_name="Alice",
            last_name="Attachee",
            role="APPLICANT",
        )
        self.applicant2 = User.objects.create_user(
            username="app_student2",
            email="student2@uni.ac.ke",
            password="Password123!",
            first_name="Bob",
            last_name="Attachee",
            role="APPLICANT",
        )

    def test_department_str_and_serializer_methods(self):
        self.assertEqual(str(self.dept), "Exploration & Production")
        ser = DepartmentSerializer(self.dept)
        self.assertEqual(ser.data["director_name"], "David Director")
        self.assertEqual(ser.data["director_email"], "dir_exp@petroleum.go.ke")
        self.assertEqual(ser.data["active_vacancies_count"], 1)
        self.assertEqual(ser.data["total_slots"], 2)

        # Department without director
        self.dept.director = None
        self.dept.save()
        ser_no_dir = DepartmentSerializer(self.dept)
        self.assertIsNone(ser_no_dir.data["director_name"])
        self.assertIsNone(ser_no_dir.data["director_email"])

    def test_job_properties_and_str(self):
        self.assertEqual(str(self.job), "Geology Attachee (Exploration & Production)")
        self.assertEqual(self.job.slots_filled, 0)
        self.assertFalse(self.job.is_full)

        # Create 1 successful application
        app1 = Application.objects.create(user=self.applicant1, job=self.job, status="SUCCESSFUL")
        self.assertEqual(self.job.slots_filled, 1)
        self.assertFalse(self.job.is_full)

        # Create 2nd successful application -> is_full becomes True
        app2 = Application.objects.create(user=self.applicant2, job=self.job, status="SUCCESSFUL")
        self.assertEqual(self.job.slots_filled, 2)
        self.assertTrue(self.job.is_full)

    def test_eligibility_setting_singleton_and_str(self):
        setting = EligibilitySetting.get_settings()
        self.assertIsNotNone(setting)
        self.assertEqual(setting.id, 1)
        self.assertIn("General Eligibility Setting", str(setting))

        # Serializer
        ser = EligibilitySettingSerializer(setting)
        self.assertEqual(ser.data["updated_by_name"], "System Default")

    def test_notification_str_and_serializer(self):
        notif = Notification.objects.create(
            recipient=self.applicant1,
            title="Application Accepted",
            message="Your application was successful.",
            notification_type="APPLICATION_UPDATE",
        )
        self.assertEqual(str(notif), "Notification: Application Accepted")
        ser = NotificationSerializer(notif)
        self.assertEqual(ser.data["recipient_name"], "Alice Attachee")

    def test_requisition_str_and_serializer(self):
        req = Requisition.objects.create(
            department=self.dept,
            requested_by=self.director,
            num_candidates_requested=3,
            duration_start=date(2026, 6, 1),
            duration_end=date(2026, 9, 1),
            requirements="Petroleum Engineering",
            justification="Q3 upstream exploration expansion",
            status="PENDING",
        )
        self.assertIn("Requisition #", str(req))
        ser = RequisitionSerializer(req)
        self.assertEqual(ser.data["requested_by_name"], "David Director")
        self.assertIsNone(ser.data["reviewed_by_name"])

    def test_clearance_file_validation(self):
        # Invalid file format (e.g. .exe)
        bad_file = SimpleUploadedFile("payload.exe", b"Binary content", content_type="application/octet-stream")
        ser = ClearanceSerializer(data={"final_report_file": bad_file}, partial=True)
        self.assertFalse(ser.is_valid())
        self.assertIn("final_report_file", ser.errors)
        self.assertIn("Only PDF and DOCX", str(ser.errors["final_report_file"]))

        # Valid PDF file
        good_pdf = SimpleUploadedFile("report.pdf", b"%PDF-1.4 Report content", content_type="application/pdf")
        ser_good = ClearanceSerializer(data={"final_report_file": good_pdf}, partial=True)
        self.assertTrue(ser_good.is_valid(), ser_good.errors)

    def test_compute_derived_status_edge_cases(self):
        app = Application.objects.create(user=self.applicant1, job=self.job, status="PENDING")
        self.assertEqual(compute_derived_status(app), "Pending Review")

        app.status = "REVIEWED"
        self.assertEqual(compute_derived_status(app), "Reviewed")

        app.status = "SUCCESSFUL"
        self.assertEqual(compute_derived_status(app), "Successful — Awaiting Deployment")

        app.status = "REJECTED"
        self.assertEqual(compute_derived_status(app), "Rejected")

        # Pass as direct strings
        self.assertEqual(compute_derived_status("SUCCESSFUL", "DEPLOYED", None), "Industrial Attachment Trainee")
        self.assertEqual(compute_derived_status("SUCCESSFUL", "EXITED", "PENDING_DEPARTMENT"), "Attachment Completed — Clearance in Progress")
        self.assertEqual(compute_derived_status("SUCCESSFUL", "EXITED", "CLEARED"), "Attachment Completed — Cleared")
        self.assertEqual(compute_derived_status("UNKNOWN_CUSTOM"), "UNKNOWN_CUSTOM")


class JobsViewsAndEndpointsUnitTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin_unit",
            email="admin_unit@petroleum.go.ke",
            password="Password123!",
            role="ADMIN",
        )
        self.hr = User.objects.create_user(
            username="hr_unit",
            email="hr_unit@petroleum.go.ke",
            password="Password123!",
            role="HR",
        )
        self.director_it = User.objects.create_user(
            username="dir_it_unit",
            email="dir_it@petroleum.go.ke",
            password="Password123!",
            role="DEPARTMENT_DIRECTOR",
        )
        self.dept_it = Department.objects.create(
            name="Information Technology Unit",
            description="ICT Services",
            contact_email="ict@petroleum.go.ke",
            director=self.director_it,
            is_active=True,
        )
        self.director_it.department = self.dept_it
        self.director_it.save()

        self.applicant = User.objects.create_user(
            username="applicant_unit",
            email="app_unit@university.ac.ke",
            password="Password123!",
            first_name="Jane",
            last_name="Attachee",
            role="APPLICANT",
        )
        self.job = Job.objects.create(
            department=self.dept_it,
            title="IT Attachee",
            description="Network & Web Support",
            requirements="Networking, Python",
            job_type="ATTACHMENT",
            location="Nairobi",
            slots_required=2,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
            is_active=True,
        )

    def test_available_directors_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        # Create unassigned director
        unassigned_dir = User.objects.create_user(
            username="free_director",
            email="free_dir@petroleum.go.ke",
            password="Password123!",
            role="DEPARTMENT_DIRECTOR",
        )
        res = self.client.get("/api/jobs/departments/directors-available/")
        self.assertEqual(res.status_code, 200)
        items = res.data.get("results", res.data) if isinstance(res.data, dict) else res.data
        unassigned_match = next((u for u in items if u["id"] == unassigned_dir.id), None)
        self.assertIsNotNone(unassigned_match)
        self.assertIsNone(unassigned_match["assigned_department_id"])

        assigned_match = next((u for u in items if u["id"] == self.director_it.id), None)
        self.assertIsNotNone(assigned_match)
        self.assertEqual(assigned_match["assigned_department_id"], self.dept_it.id)

    def test_notifications_mark_read_flow(self):
        notif = Notification.objects.create(
            recipient=self.applicant,
            title="Interview Alert",
            message="Your interview is scheduled.",
            notification_type="APPLICATION_UPDATE",
        )
        self.client.force_authenticate(user=self.applicant)

        # Mark single as read
        read_res = self.client.post(f"/api/jobs/notifications/{notif.id}/read/")
        self.assertEqual(read_res.status_code, 200)
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)

        # Mark all read
        Notification.objects.create(recipient=self.applicant, title="Alert 2", message="Msg 2")
        all_res = self.client.post("/api/jobs/notifications/mark-all-read/")
        self.assertEqual(all_res.status_code, 200)
        self.assertEqual(Notification.objects.filter(recipient=self.applicant, is_read=False).count(), 0)

    def test_recommendation_template_crud(self):
        self.client.force_authenticate(user=self.hr)
        # List templates
        l_res = self.client.get("/api/jobs/recommendations/templates/")
        self.assertEqual(l_res.status_code, 200)

        # Create template
        c_res = self.client.post("/api/jobs/recommendations/templates/", {
            "name": "Engineering Recommendation Letter",
            "body": "This certifies that {{full_name}} worked in {{department}}.",
            "is_default": True,
        }, format="json")
        self.assertEqual(c_res.status_code, 201)
        tmpl_id = c_res.data["id"]

        # Detail & Update
        d_res = self.client.patch(f"/api/jobs/recommendations/templates/{tmpl_id}/", {
            "name": "Updated Engineering Recommendation Letter"
        }, format="json")
        self.assertEqual(d_res.status_code, 200)

        # Delete
        del_res = self.client.delete(f"/api/jobs/recommendations/templates/{tmpl_id}/")
        self.assertEqual(del_res.status_code, 204)

    def test_analytics_and_reporting_endpoints(self):
        self.client.force_authenticate(user=self.hr)

        # Analytics dashboard
        an_res = self.client.get("/api/jobs/reports/analytics/")
        self.assertEqual(an_res.status_code, 200)
        self.assertIn("total_jobs", an_res.data)
        self.assertIn("departments_summary", an_res.data)
        self.assertIn("department_fill_rates", an_res.data)
        self.assertIn("conversion_funnel", an_res.data)

        # Director scoped analytics
        self.client.force_authenticate(user=self.director_it)
        dir_res = self.client.get("/api/jobs/reports/analytics/")
        self.assertEqual(dir_res.status_code, 200)
        self.assertEqual(dir_res.data.get("role"), "DEPARTMENT_DIRECTOR")
        self.assertIn("total_slots_required", dir_res.data)

        # Re-authenticate HR for CSV export
        self.client.force_authenticate(user=self.hr)

        # Export CSV fill-rates
        csv_res = self.client.get("/api/jobs/reports/export-csv/?report_type=fill-rates")
        self.assertEqual(csv_res.status_code, 200)
        self.assertEqual(csv_res["Content-Type"], "text/csv")

    def test_job_bulk_archive(self):
        # Archiving vacancies is HR-owned. Admin has read-only visibility of
        # recruitment data and must not be able to mutate it.
        self.client.force_authenticate(user=self.hr)
        job2 = Job.objects.create(
            department=self.dept_it,
            title="Second Job",
            description="Desc",
            requirements="Reqs",
            deadline=timezone.now() + timedelta(days=10),
        )
        res = self.client.post("/api/jobs/vacancies/bulk-archive/", {
            "job_ids": [self.job.id, job2.id],
            "action": "ARCHIVE",
        }, format="json")
        self.assertEqual(res.status_code, 200)
        self.job.refresh_from_db()
        job2.refresh_from_db()
        self.assertTrue(self.job.is_archived)
        self.assertTrue(job2.is_archived)

    def test_admin_cannot_bulk_archive_vacancies(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/jobs/vacancies/bulk-archive/", {
            "job_ids": [self.job.id],
            "action": "ARCHIVE",
        }, format="json")
        self.assertEqual(res.status_code, 403)
        self.job.refresh_from_db()
        self.assertFalse(self.job.is_archived, "A denied request must not mutate the vacancy")


class CompleteEndToEndWorkflowsIntegrationTests(TestCase):
    """
    Section 2: Integration testing — full workflows end-to-end.
    """
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="e2e_admin",
            email="admin@petroleum.go.ke",
            password="AdminPassword123!",
            first_name="Arthur",
            last_name="Admin",
            role="ADMIN",
        )
        self.hr = User.objects.create_user(
            username="e2e_hr",
            email="hr@petroleum.go.ke",
            password="HRPassword123!",
            first_name="Helen",
            last_name="HR",
            role="HR",
        )
        self.dept_petroleum = Department.objects.create(
            name="Directorate of Petroleum Exploration",
            description="Upstream exploration and survey",
            contact_email="petroleum@petroleum.go.ke",
            is_active=True,
        )
        self.director_petroleum = User.objects.create_user(
            username="dir_petroleum",
            email="dir_pet@petroleum.go.ke",
            password="Password123!",
            first_name="Peter",
            last_name="Petroleum",
            role="DEPARTMENT_DIRECTOR",
            department=self.dept_petroleum,
        )
        self.dept_petroleum.director = self.director_petroleum
        self.dept_petroleum.save()

        self.dept_renewable = Department.objects.create(
            name="Directorate of Renewable Energy",
            description="Solar, wind and geothermal",
            contact_email="renewable@petroleum.go.ke",
            is_active=True,
        )
        self.director_renewable = User.objects.create_user(
            username="dir_renewable",
            email="dir_ren@petroleum.go.ke",
            password="Password123!",
            first_name="Rachel",
            last_name="Renewable",
            role="DEPARTMENT_DIRECTOR",
            department=self.dept_renewable,
        )
        self.dept_renewable.director = self.director_renewable
        self.dept_renewable.save()

    def test_full_applicant_journey_continuous_workflow(self):
        """
        Full applicant journey:
        1. Register applicant account
        2. Complete 4-step Biodata wizard (Personal, Academic, Kin, Documents)
        3. View public vacancies -> Submit application
        4. HR reviews -> Shortlists -> Hires applicant
        5. HR deploys applicant to department
        6. Attachment completes -> Deployment Exited -> Clearance auto-initialized
        7. Attachee submits final report & notes
        8. Department supervisor clears attachee
        9. HR grants final clearance
        10. Recommendation letter generated with token replacement and downloaded
        """
        # Step 1: Register applicant
        reg_res = self.client.post("/api/accounts/register/", {
            "username": "student_sam",
            "email": "sam@university.ac.ke",
            "password": "SecurePassword123!",
            "first_name": "Sam",
            "last_name": "Student",
            "recaptcha": "test",
        }, format="json")
        self.assertEqual(reg_res.status_code, 201)
        student_user = User.objects.get(username="student_sam")

        # Authenticate as student
        self.client.force_authenticate(user=student_user)

        # Step 2: 4-step Biodata wizard
        # Step 2.1: Personal Details
        p_res = self.client.patch("/api/accounts/profile/", {
            "dob": "2002-04-10",
            "gender": "M",
            "marital_status": "SINGLE",
            "id_number": "33445566",
            "phone_number": "0711002200",
            "postal_address": "P.O. Box 777 Nairobi",
            "nationality": "Kenyan",
            "county_of_residence": "Nairobi",
        }, format="json")
        self.assertEqual(p_res.status_code, 200)

        # Step 2.2: Academic & Attachment details
        # The start date must still be in the future when this suite runs, so
        # it is derived from today rather than pinned to a fixed year.
        future_start = (timezone.localdate() + timedelta(days=60)).isoformat()
        a_res = self.client.patch("/api/accounts/profile/", {
            "institution_name": "University of Nairobi",
            "qualification": "BSc Geology",
            "field_of_study": "Earth Sciences",
            "joining_date": future_start,
        }, format="json")
        self.assertEqual(a_res.status_code, 200)

        # Step 2.3: Next of Kin details
        k_res = self.client.patch("/api/accounts/profile/", {
            "next_of_kin_name": "Margaret Student",
            "next_of_kin_relationship": "Mother",
            "next_of_kin_phone": "0722334455",
            "next_of_kin_address": "P.O. Box 777 Nairobi",
        }, format="json")
        self.assertEqual(k_res.status_code, 200)

        # Step 2.4: 10 Required Verification Documents
        required_doc_types = [
            "NATIONAL_ID", "RESUME", "COVER_LETTER", "INSTITUTION_INTRO",
            "STUDENT_INSURANCE", "STUDENT_ID", "NEXT_OF_KIN_ID",
            "TRANSCRIPT", "GOOD_CONDUCT", "PASSPORT_PHOTOS"
        ]
        for dt in required_doc_types:
            pdf_file = SimpleUploadedFile(f"{dt.lower()}.pdf", b"%PDF-1.4 Verification document", content_type="application/pdf")
            doc_res = self.client.post("/api/accounts/documents/", {
                "document_type": dt,
                "file": pdf_file,
            }, format="multipart")
            self.assertEqual(doc_res.status_code, 201)

        # Check dashboard stats confirm 100% profile completeness
        dash_res = self.client.get("/api/accounts/dashboard-stats/")
        self.assertEqual(dash_res.status_code, 200)
        self.assertTrue(dash_res.data["can_apply"])
        self.assertEqual(dash_res.data["profile_completion"], 100)

        # Create vacancy for Petroleum Exploration
        vacancy = Job.objects.create(
            department=self.dept_petroleum,
            title="Petroleum Geologist Attachee",
            description="Analyze core samples and seismic logs",
            requirements="Geology / Geophysics",
            job_type="ATTACHMENT",
            location="Nairobi HQ",
            slots_required=1,
            duration_weeks=12,
            deadline=timezone.now() + timedelta(days=30),
            is_active=True,
        )

        # Step 3: Student applies for vacancy
        apply_res = self.client.post("/api/jobs/applications/", {
            "job": vacancy.id,
            "cover_letter": "I am eager to contribute to petroleum exploration.",
        }, format="json")
        self.assertEqual(apply_res.status_code, 201)
        app_id = apply_res.data["id"]

        # Step 4: HR Review -> decision
        self.client.force_authenticate(user=self.hr)

        # 4.1 Reviewed
        self.client.patch(f"/api/jobs/applications/{app_id}/status/", {"status": "REVIEWED"}, format="json")
        # 4.2 Successful — the one permitted positive decision
        hire_res = self.client.patch(f"/api/jobs/applications/{app_id}/status/", {"status": "SUCCESSFUL"}, format="json")
        self.assertEqual(hire_res.status_code, 200)

        # Step 5: HR Deploys applicant
        dep_start = timezone.localdate() + timedelta(days=70)
        dep_res = self.client.post("/api/jobs/deployments/", {
            "application": app_id,
            "department": self.dept_petroleum.id,
            "start_date": dep_start.isoformat(),
            "planned_end_date": (dep_start + timedelta(days=90)).isoformat(),
        }, format="json")
        self.assertEqual(dep_res.status_code, 201)
        dep_id = dep_res.data["id"]

        # Step 6: Attachment concludes -> Deployment Exited
        exit_res = self.client.post(f"/api/jobs/deployments/{dep_id}/exit/", {
            "actual_end_date": (dep_start + timedelta(days=90)).isoformat()
        }, format="json")
        self.assertEqual(exit_res.status_code, 200)

        # Verify clearance is initialized
        clearance = Clearance.objects.get(deployment_id=dep_id)
        self.assertEqual(clearance.status, "PENDING_DEPARTMENT")

        # Step 7: Attachee submits final report & confirmation
        self.client.force_authenticate(user=student_user)
        report_pdf = SimpleUploadedFile("final_internship_report.pdf", b"%PDF-1.4 Final Report", content_type="application/pdf")
        sub_res = self.client.post(f"/api/jobs/clearance/{clearance.id}/submit/", {
            "user_notes": "Completed all core sample logging assignments.",
            "final_report_file": report_pdf,
        }, format="multipart")
        self.assertEqual(sub_res.status_code, 200)
        clearance.refresh_from_db()
        self.assertIsNotNone(clearance.final_report_submitted_at)

        # Step 8: Department supervisor approves clearance
        self.client.force_authenticate(user=self.director_petroleum)
        dept_clear_res = self.client.post(f"/api/jobs/clearance/{clearance.id}/department-review/", {
            "decision": "APPROVE",
            "department_notes": "All department lab equipment returned and logbook signed.",
        }, format="json")
        self.assertEqual(dept_clear_res.status_code, 200)
        clearance.refresh_from_db()
        self.assertTrue(clearance.department_cleared)
        self.assertEqual(clearance.status, "PENDING_HR")

        # Step 9: HR approves clearance
        self.client.force_authenticate(user=self.hr)
        hr_clear_res = self.client.post(f"/api/jobs/clearance/{clearance.id}/hr-review/", {
            "decision": "APPROVE",
            "hr_notes": "Institutional clearance granted.",
        }, format="json")
        self.assertEqual(hr_clear_res.status_code, 200)
        clearance.refresh_from_db()
        self.assertTrue(clearance.hr_cleared)
        self.assertEqual(clearance.status, "CLEARED")

        # Step 10: Recommendation Letter Generation
        tmpl = RecommendationLetterTemplate.objects.create(
            name="Official Ministry Recommendation Letter",
            body=(
                "To Whom It May Concern,\n"
                "This is to certify that {{full_name}} from {{institution_name}} "
                "successfully served as {{role_or_position}} in the {{department}} "
                "from {{start_date}} to {{end_date}}."
            ),
            is_default=True,
            created_by=self.hr,
        )

        gen_res = self.client.post(f"/api/jobs/recommendations/generate/{dep_id}/")
        self.assertEqual(gen_res.status_code, 201)
        letter_content = gen_res.data["letter"]["rendered_content"]
        self.assertIn("Sam Student", letter_content)
        self.assertIn("University of Nairobi", letter_content)
        self.assertIn("Directorate of Petroleum Exploration", letter_content)
        self.assertIn("Petroleum Geologist Attachee", letter_content)

        # Attachee can view and access their recommendation letter
        self.client.force_authenticate(user=student_user)
        letters_res = self.client.get("/api/jobs/recommendations/")
        self.assertEqual(letters_res.status_code, 200)
        items = letters_res.data.get("results", letters_res.data) if isinstance(letters_res.data, dict) else letters_res.data
        self.assertTrue(len(items) >= 1)

    def test_requisition_to_vacancy_and_isolation_workflow(self):
        """
        Workflow:
        1. Director Petroleum submits requisition
        2. Cross-department isolation: Director Renewable CANNOT view/act on Petroleum requisition
        3. HR approves requisition -> Job vacancy auto-created
        4. Public landing page lists new vacancy without leaking internal justification
        """
        self.client.force_authenticate(user=self.director_petroleum)
        req_start = timezone.localdate() + timedelta(days=45)
        req_res = self.client.post("/api/jobs/requisitions/", {
            "department": self.dept_petroleum.id,
            "num_candidates_requested": 5,
            "duration_start": req_start.isoformat(),
            "duration_end": (req_start + timedelta(days=90)).isoformat(),
            "requirements": "Seismic interpretation and Python",
            "justification": "High-priority national seismic mapping project.",
        }, format="json")
        self.assertEqual(req_res.status_code, 201)
        req_id = req_res.data["id"]

        # Isolation test: Director Renewable is denied access (403)
        self.client.force_authenticate(user=self.director_renewable)
        res_forbidden_get = self.client.get(f"/api/jobs/requisitions/{req_id}/")
        self.assertEqual(res_forbidden_get.status_code, 403)

        # HR review & approval
        self.client.force_authenticate(user=self.hr)
        approve_res = self.client.post(f"/api/jobs/requisitions/{req_id}/review/", {
            "action": "APPROVE",
            "review_notes": "Approved for Q3 Intake.",
            "job_title": "Seismic Data Processing Attachee (5 Slots)",
        }, format="json")
        self.assertEqual(approve_res.status_code, 200)
        job_id = approve_res.data["job_id"]

        # Check public endpoint
        self.client.logout()
        pub_res = self.client.get("/api/jobs/vacancies/public/")
        self.assertEqual(pub_res.status_code, 200)
        vacancies = pub_res.data.get("results", pub_res.data) if isinstance(pub_res.data, dict) else pub_res.data
        matching = [v for v in vacancies if v["id"] == job_id]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["slots_required"], 5)
        self.assertNotIn("justification", matching[0])
        self.assertNotIn("review_notes", matching[0])

    def test_role_and_department_management_guardrails(self):
        """
        Guardrails:
        1. Sole admin cannot self-demote or deactivate
        2. Assigning director role requires department
        3. Demoting director unlinks department director field
        4. Department delete blocked when jobs exist, safe deactivation succeeds, hard delete when isolated
        """
        self.client.force_authenticate(user=self.admin)

        # 1. Sole admin demotion blocked
        demote_res = self.client.patch(f"/api/accounts/users/{self.admin.id}/", {
            "role": "HR"
        }, format="json")
        self.assertEqual(demote_res.status_code, 400)
        self.assertIn("Cannot demote or deactivate the last remaining active Administrator", str(demote_res.data))

        # 2. Assigning director without department fails
        candidate_user = User.objects.create_user(
            username="candidate_dir",
            email="candidate@petroleum.go.ke",
            password="Password123!",
            role="APPLICANT",
        )
        bad_dir_res = self.client.patch(f"/api/accounts/users/{candidate_user.id}/", {
            "role": "DEPARTMENT_DIRECTOR"
        }, format="json")
        self.assertEqual(bad_dir_res.status_code, 400)
        self.assertIn("department", bad_dir_res.data)

        # 3. Assigning director with department succeeds and binds director
        isolated_dept = Department.objects.create(
            name="Energy Efficiency Directorate",
            is_active=True,
        )
        good_dir_res = self.client.patch(f"/api/accounts/users/{candidate_user.id}/", {
            "role": "DEPARTMENT_DIRECTOR",
            "department": isolated_dept.id,
        }, format="json")
        self.assertEqual(good_dir_res.status_code, 200)
        isolated_dept.refresh_from_db()
        self.assertEqual(isolated_dept.director, candidate_user)

        # Demote candidate -> unlinks director
        demote_candidate = self.client.patch(f"/api/accounts/users/{candidate_user.id}/", {
            "role": "APPLICANT"
        }, format="json")
        self.assertEqual(demote_candidate.status_code, 200)
        isolated_dept.refresh_from_db()
        self.assertIsNone(isolated_dept.director)

        # 4. Department delete with dependencies blocked
        Job.objects.create(
            department=self.dept_petroleum,
            title="Dependent Job",
            description="Desc",
            requirements="Reqs",
            deadline=timezone.now() + timedelta(days=10),
        )
        del_block = self.client.delete(f"/api/jobs/departments/{self.dept_petroleum.id}/")
        self.assertEqual(del_block.status_code, 400)
        self.assertTrue(del_block.data["has_dependencies"])

        # Deactivate department
        deact_res = self.client.delete(f"/api/jobs/departments/{self.dept_petroleum.id}/?deactivate=true")
        self.assertEqual(deact_res.status_code, 200)
        self.dept_petroleum.refresh_from_db()
        self.assertFalse(self.dept_petroleum.is_active)

        # Hard delete isolated department
        del_iso = self.client.delete(f"/api/jobs/departments/{isolated_dept.id}/")
        self.assertEqual(del_iso.status_code, 204)
        self.assertFalse(Department.objects.filter(id=isolated_dept.id).exists())


class JobsSecurityAndAccessControlTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dept_it = Department.objects.create(name="Information Technology")
        self.dept_finance = Department.objects.create(name="Finance & Accounts")

        self.hr = User.objects.create_user(
            username="hr_sec",
            email="hr_sec@example.com",
            password="Password123!",
            role="HR",
        )
        self.director_it = User.objects.create_user(
            username="dir_it_sec",
            email="dir_it_sec@example.com",
            password="Password123!",
            role="DEPARTMENT_DIRECTOR",
            department=self.dept_it,
        )
        self.director_finance = User.objects.create_user(
            username="dir_fin_sec",
            email="dir_fin_sec@example.com",
            password="Password123!",
            role="DEPARTMENT_DIRECTOR",
            department=self.dept_finance,
        )
        self.applicant_a = User.objects.create_user(
            username="applicant_a",
            email="applicant_a@example.com",
            password="Password123!",
            role="APPLICANT",
        )
        self.applicant_b = User.objects.create_user(
            username="applicant_b",
            email="applicant_b@example.com",
            password="Password123!",
            role="APPLICANT",
        )

        self.job_it = Job.objects.create(
            department=self.dept_it,
            title="Software Trainee",
            description="Build apps",
            requirements="Python",
            deadline=timezone.now() + timedelta(days=10),
        )
        self.app_a = Application.objects.create(user=self.applicant_a, job=self.job_it, status="SUCCESSFUL")
        self.app_b = Application.objects.create(user=self.applicant_b, job=self.job_it, status="SUCCESSFUL")

        self.dep_a = Deployment.objects.create(
            application=self.app_a,
            department=self.dept_it,
            start_date=timezone.now().date() - timedelta(days=90),
            planned_end_date=timezone.now().date(),
            actual_end_date=timezone.now().date(),
            status="EXITED",
        )
        self.clr_a = Clearance.objects.create(
            deployment=self.dep_a,
            status="CLEARED",
            department_cleared=True,
            hr_cleared=True,
            final_report_submitted_at=timezone.now(),
        )
        self.letter_a = RecommendationLetter.objects.create(
            deployment=self.dep_a,
            rendered_content="Letter content for Applicant A",
            generated_by=self.hr,
        )

    def test_idor_prevention_on_recommendation_letter_detail(self):
        # Applicant A can retrieve their own letter
        self.client.force_authenticate(user=self.applicant_a)
        res_a = self.client.get(f"/api/jobs/recommendations/{self.letter_a.id}/")
        self.assertEqual(res_a.status_code, 200)

        # Applicant B cannot retrieve Applicant A's letter (returns 404 due to queryset filtering)
        self.client.force_authenticate(user=self.applicant_b)
        res_b = self.client.get(f"/api/jobs/recommendations/{self.letter_a.id}/")
        self.assertEqual(res_b.status_code, 404)

    def test_idor_prevention_on_notification_mark_read(self):
        notif_a = Notification.objects.create(
            recipient=self.applicant_a,
            title="Private Alert A",
            message="Only for A",
            is_read=False,
        )

        # Applicant B tries to mark Applicant A's notification as read
        self.client.force_authenticate(user=self.applicant_b)
        res_b = self.client.post(f"/api/jobs/notifications/{notif_a.id}/read/")
        self.assertEqual(res_b.status_code, 404)
        notif_a.refresh_from_db()
        self.assertFalse(notif_a.is_read)

        # Applicant A marks their own notification
        self.client.force_authenticate(user=self.applicant_a)
        res_a = self.client.post(f"/api/jobs/notifications/{notif_a.id}/read/")
        self.assertEqual(res_a.status_code, 200)
        notif_a.refresh_from_db()
        self.assertTrue(notif_a.is_read)

    def test_cross_department_clearance_boundary_enforced(self):
        # Reset self.clr_a to PENDING_DEPARTMENT
        self.clr_a.status = "PENDING_DEPARTMENT"
        self.clr_a.department_cleared = False
        self.clr_a.save()

        # Finance Director tries to approve IT department clearance
        self.client.force_authenticate(user=self.director_finance)
        res_fin = self.client.post(f"/api/jobs/clearance/{self.clr_a.id}/department-review/", {
            "decision": "APPROVE",
            "department_notes": "Cross-dept tamper attempt",
        }, format="json")
        self.assertEqual(res_fin.status_code, 403)
        self.clr_a.refresh_from_db()
        self.assertFalse(self.clr_a.department_cleared)

        # IT Director can approve
        self.client.force_authenticate(user=self.director_it)
        res_it = self.client.post(f"/api/jobs/clearance/{self.clr_a.id}/department-review/", {
            "decision": "APPROVE",
            "department_notes": "Authorized IT approval",
        }, format="json")
        self.assertEqual(res_it.status_code, 200)
        self.clr_a.refresh_from_db()
        self.assertTrue(self.clr_a.department_cleared)


class ApplicantOutcomeEmailAndOptimizationTests(TestCase):
    def setUp(self):
        from django.core import mail
        from django.core.cache import cache
        mail.outbox = []
        cache.clear()

        self.client = APIClient()
        self.hr = User.objects.create_user(
            username="hr_officer",
            email="hr@petroleum.go.ke",
            password="Password123!",
            first_name="Helen",
            last_name="Resource",
            role="HR",
        )
        self.dept = Department.objects.create(
            name="Renewable Energy",
            description="Clean energy research",
            contact_email="renewable@petroleum.go.ke",
            is_active=True,
        )
        self.job = Job.objects.create(
            department=self.dept,
            title="Solar Energy Attachee",
            description="Solar PV analysis",
            requirements="Physics, Engineering",
            job_type="ATTACHMENT",
            slots_required=3,
            deadline=timezone.now() + timedelta(days=15),
            is_active=True,
        )
        self.applicant = User.objects.create_user(
            username="candidate_jane",
            email="jane.doe@university.ac.ke",
            password="Password123!",
            first_name="Jane",
            last_name="Doe",
            role="APPLICANT",
        )
        self.application = Application.objects.create(
            user=self.applicant,
            job=self.job,
            status="PENDING",
        )

    def test_successful_status_transition_triggers_email_and_updates_notified_fields(self):
        from django.core import mail

        self.application.status = "SUCCESSFUL"
        self.application.save()

        self.application.refresh_from_db()
        self.assertEqual(self.application.status, "SUCCESSFUL")
        self.assertEqual(self.application.outcome_notified_status, "SUCCESSFUL")
        self.assertIsNotNone(self.application.outcome_notified_at)

        # Verify email was sent
        self.assertEqual(len(mail.outbox), 1)
        sent_mail = mail.outbox[0]
        self.assertEqual(sent_mail.to, ["jane.doe@university.ac.ke"])
        self.assertIn("Opportunity Granted", sent_mail.subject)
        self.assertIn("Jane Doe", sent_mail.body)
        self.assertIn("Next Operational Steps", sent_mail.body)
        self.assertIn("State Department for Petroleum", sent_mail.body)

    def test_rejected_status_transition_triggers_respectful_outcome_email(self):
        from django.core import mail

        self.application.status = "REJECTED"
        self.application.save()

        self.application.refresh_from_db()
        self.assertEqual(self.application.status, "REJECTED")
        self.assertEqual(self.application.outcome_notified_status, "REJECTED")
        self.assertIsNotNone(self.application.outcome_notified_at)

        self.assertEqual(len(mail.outbox), 1)
        sent_mail = mail.outbox[0]
        self.assertEqual(sent_mail.to, ["jane.doe@university.ac.ke"])
        self.assertIn("Application Outcome", sent_mail.subject)
        self.assertIn("regret to inform you", sent_mail.body)
        self.assertIn("Solar Energy Attachee", sent_mail.body)

    def test_unrelated_save_does_not_duplicate_email(self):
        from django.core import mail

        # First transition into SUCCESSFUL
        self.application.status = "SUCCESSFUL"
        self.application.save()
        self.assertEqual(len(mail.outbox), 1)

        # Clear outbox
        mail.outbox = []

        # Re-save with no status change
        self.application.refresh_from_db()
        self.application.save()

        # Ensure NO duplicate email is sent
        self.assertEqual(len(mail.outbox), 0)

    def test_email_delivery_failure_does_not_rollback_status_and_logs_audit(self):
        from django.core import mail

        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=Exception("SMTP Outage 500")):
            self.application.status = "SUCCESSFUL"
            self.application.save()

        self.application.refresh_from_db()
        # Status MUST still be SUCCESSFUL (robust failure isolation)
        self.assertEqual(self.application.status, "SUCCESSFUL")

        # Verify audit log entry
        audit_log = AuditLog.objects.filter(action="EMAIL_DELIVERY_FAILED").first()
        self.assertIsNotNone(audit_log)
        self.assertIn("SMTP Outage", audit_log.target_description)
        self.assertEqual(audit_log.metadata["recipient_email"], "jane.doe@university.ac.ke")

    def test_application_status_update_view_triggers_outcome_notification(self):
        from django.core import mail

        self.client.force_authenticate(user=self.hr)
        response = self.client.patch(
            f"/api/jobs/applications/{self.application.id}/status/",
            {"status": "SUCCESSFUL"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, "SUCCESSFUL")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["jane.doe@university.ac.ke"])

    def test_public_vacancies_caching_and_signal_invalidation(self):
        from django.core.cache import cache
        from jobs.signals import CACHE_KEY_PUBLIC_VACANCIES

        # Initial call populates cache
        res1 = self.client.get("/api/jobs/vacancies/public/")
        self.assertEqual(res1.status_code, 200)
        cached_data = cache.get(CACHE_KEY_PUBLIC_VACANCIES)
        self.assertIsNotNone(cached_data)

        # Second call returns cached content
        res2 = self.client.get("/api/jobs/vacancies/public/")
        self.assertEqual(res2.status_code, 200)

        # Creating or modifying a job invalidates cache via signal
        Job.objects.create(
            department=self.dept,
            title="Geothermal Analyst",
            description="Geothermal field study",
            requirements="Earth Sciences",
            job_type="ATTACHMENT",
            slots_required=1,
            deadline=timezone.now() + timedelta(days=10),
            is_active=True,
        )
        self.assertIsNone(cache.get(CACHE_KEY_PUBLIC_VACANCIES))

    def test_department_list_query_count_optimized(self):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        # Create multiple departments and jobs to test N+1 query elimination
        for i in range(5):
            d = Department.objects.create(name=f"Test Dept {i}", is_active=True)
            Job.objects.create(
                department=d,
                title=f"Job {i}",
                slots_required=2,
                deadline=timezone.now() + timedelta(days=10),
                is_active=True,
            )

        with CaptureQueriesContext(connection) as queries:
            response = self.client.get("/api/jobs/departments/")
            self.assertEqual(response.status_code, 200)

        # All departments are serialized with active_vacancies_count and total_slots in minimal constant queries
        self.assertLessEqual(len(queries), 3)

