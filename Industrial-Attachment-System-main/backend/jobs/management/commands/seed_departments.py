from django.core.management.base import BaseCommand
from jobs.models import Department

DEPARTMENTS = [
    {
        "name": "Information Communication Technology (ICT)",
        "description": "Oversees software infrastructure, network security, digital systems, and technical innovation within the State Department.",
        "contact_email": "ict@petroleum.go.ke",
        "is_active": True,
    },
    {
        "name": "Petroleum Operations & Regulation",
        "description": "Responsible for technical policy formulation, monitoring upstream, midstream, and downstream operations, and regulatory compliance.",
        "contact_email": "operations@petroleum.go.ke",
        "is_active": True,
    },
    {
        "name": "Human Resource Management & Development",
        "description": "Coordinates workforce planning, talent acquisition, staff training, performance monitoring, and industrial attachment placements.",
        "contact_email": "hr@petroleum.go.ke",
        "is_active": True,
    },
    {
        "name": "Finance & Accounting",
        "description": "Manages budgeting, financial accounting, statutory reporting, expenditure control, and fiscal accountability.",
        "contact_email": "finance@petroleum.go.ke",
        "is_active": True,
    },
    {
        "name": "Supply Chain Management",
        "description": "Directs procurement processes, asset management, vendor relationships, and inventory compliance.",
        "contact_email": "procurement@petroleum.go.ke",
        "is_active": True,
    },
    {
        "name": "Legal Services",
        "description": "Provides legal counsel, contract vetting, litigation management, and regulatory advisory.",
        "contact_email": "legal@petroleum.go.ke",
        "is_active": True,
    },
    {
        "name": "Internal Audit & Quality Assurance",
        "description": "Conducts risk assessments, internal controls evaluations, governance reviews, and audit compliance.",
        "contact_email": "audit@petroleum.go.ke",
        "is_active": True,
    },
    {
        "name": "Corporate Communications & Public Relations",
        "description": "Handles media relations, stakeholder engagement, public communications, and brand positioning.",
        "contact_email": "communications@petroleum.go.ke",
        "is_active": True,
    },
]


class Command(BaseCommand):
    help = "Seeds initial starter departments for the State Department for Petroleum"

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        for dept_data in DEPARTMENTS:
            obj, created = Department.objects.get_or_create(
                name=dept_data["name"],
                defaults={
                    "description": dept_data["description"],
                    "contact_email": dept_data["contact_email"],
                    "is_active": dept_data["is_active"],
                },
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created department: {obj.name}"))
            else:
                updated_count += 1
                self.stdout.write(self.style.NOTICE(f"Department already exists: {obj.name}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded departments: {created_count} created, {updated_count} existing."
            )
        )
