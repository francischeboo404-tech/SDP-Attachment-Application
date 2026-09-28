from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = "Seeds the database with an initial admin user"

    def handle(self, *args, **options):
        User = get_user_model()
        username = "f@gmail.com"
        password = "TestP@123"

        if not User.objects.filter(username=username).exists():
            User.objects.create_superuser(
                username=username, email=username, password=password, role="ADMIN"
            )
            self.stdout.write(
                self.style.SUCCESS(f'Successfully created admin user "{username}"')
            )
        else:
            self.stdout.write(
                self.style.WARNING(f'Admin user "{username}" already exists')
            )
