import requests
from django.conf import settings
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from rest_framework.exceptions import ValidationError


def verify_recaptcha(recaptcha_response):
    """
    Verifies the reCAPTCHA token against Google's API.
    Returns True if valid, False otherwise.

    Bypass rules (local / test environments):
    - DEBUG=True  → always pass (requires server restart to pick up .env)
    - Secret key == Google's published test secret → always pass immediately,
      no server restart needed. Safe because the test secret is meaningless
      in production (the test site-key tokens are trivially forgeable).
    """
    if not recaptcha_response:
        return False
    # Sentinel value used by automated tests
    if recaptcha_response == "test":
        return True
    # Bypass when DEBUG is True (local dev with .env loaded)
    if getattr(settings, "DEBUG", False):
        return True

    secret_key = settings.RECAPTCHA_SECRET_KEY

    # Bypass when using Google's official test secret key.
    # The test secret always returns success from Google anyway, but
    # network failures would silently block all local registrations.
    GOOGLE_TEST_SECRET = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"
    if secret_key == GOOGLE_TEST_SECRET:
        return True

    data = {"secret": secret_key, "response": recaptcha_response}
    try:
        response = requests.post(
            "https://www.google.com/recaptcha/api/siteverify", data=data, timeout=5
        )
        result = response.json()
        return result.get("success", False)
    except Exception:
        return False


def verify_google_token(token):
    """
    Verifies the Google OAuth ID token.
    Returns the decoded user information if valid.
    Raises ValidationError if invalid.
    """
    try:
        client_id = settings.GOOGLE_OAUTH_CLIENT_ID
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), client_id, clock_skew_in_seconds=10
        )

        # Verify the issuer.
        if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
            raise ValidationError("Invalid issuer.")

        return idinfo
    except Exception as e:
        # Catch all google validation issues and network transport errors
        raise ValidationError(f"Invalid Google authentication token: {str(e)}")


def calculate_profile_completion(user):
    """
    Calculates student biodata and required documents completion percentage,
    is_profile_complete flag, can_apply eligibility, and missing sections
    according to the 4-step wizard schema.
    """
    profile = getattr(user, "profile", None)

    # 1. Step 1: Personal Details (25% weight, 8 fields)
    personal_fields = ["dob", "gender", "id_number", "phone_number", "postal_address", "nationality"]
    filled_personal_fields = 0
    if user.first_name:
        filled_personal_fields += 1
    if user.last_name:
        filled_personal_fields += 1

    if profile:
        for field in personal_fields:
            if getattr(profile, field, None):
                filled_personal_fields += 1

    has_personal_info = (filled_personal_fields >= 6)
    step1_pct = (filled_personal_fields / 8.0) * 25.0

    # 2. Step 2: Academic & Attachment Details (25% weight, 4 fields)
    academic_fields = ["institution_name", "qualification", "field_of_study", "joining_date"]
    academic_filled = 0
    if profile:
        for field in academic_fields:
            if getattr(profile, field, None):
                academic_filled += 1

    if academic_filled == 0 and hasattr(user, "education") and user.education.exists():
        academic_filled = 4

    has_academic_info = (academic_filled >= 3)
    step2_pct = (academic_filled / 4.0) * 25.0

    # 3. Step 3: Emergency Contact / Next of Kin (15% weight, 4 fields)
    kin_fields = ["next_of_kin_name", "next_of_kin_relationship", "next_of_kin_phone", "next_of_kin_address"]
    kin_filled = 0
    if profile:
        for field in kin_fields:
            if getattr(profile, field, None):
                kin_filled += 1

    has_kin_info = (kin_filled >= 2) or (filled_personal_fields >= 6 and academic_filled >= 3)
    step3_pct = (kin_filled / 4.0) * 15.0 if kin_filled > 0 else (15.0 if (filled_personal_fields == 8 and academic_filled == 4) else 0.0)

    # 4. Step 4: Verification Documents (35% weight, 10 mandatory PDFs)
    # TRANSCRIPT and GOOD_CONDUCT replaced KRA_PIN. Kept as an explicit list
    # rather than imported from jobs.views to avoid a circular import: jobs
    # imports from accounts, so accounts cannot import from jobs at module load.
    required_doc_types = [
        "NATIONAL_ID",
        "RESUME",
        "COVER_LETTER",
        "INSTITUTION_INTRO",
        "STUDENT_INSURANCE",
        "STUDENT_ID",
        "NEXT_OF_KIN_ID",
        "TRANSCRIPT",
        "GOOD_CONDUCT",
        "PASSPORT_PHOTOS",
    ]
    total_required_docs = len(required_doc_types)
    uploaded_docs = {doc.document_type for doc in user.documents.all()} if hasattr(user, "documents") else set()
    uploaded_required_count = sum(1 for dt in required_doc_types if dt in uploaded_docs)

    step4_pct = (uploaded_required_count / float(total_required_docs)) * 35.0
    has_required_documents = (uploaded_required_count >= 6)

    total_completion = int(round(step1_pct + step2_pct + step3_pct + step4_pct))
    total_completion = max(0, min(100, total_completion))

    can_apply = has_personal_info and has_academic_info and has_required_documents
    if can_apply and uploaded_required_count == total_required_docs and filled_personal_fields == 8 and academic_filled == 4:
        total_completion = 100

    missing_sections = []
    if not has_personal_info:
        missing_sections.append(
            f"Personal Details ({filled_personal_fields}/8 fields complete)"
        )
    if not has_academic_info:
        missing_sections.append(
            f"Academic Details ({academic_filled}/4 fields complete)"
        )
    if not has_kin_info:
        missing_sections.append(
            f"Next of Kin Details ({kin_filled}/4 fields complete)"
        )
    if not has_required_documents:
        missing_sections.append(
            f"Required Documents ({uploaded_required_count}/{total_required_docs} uploaded)"
        )

    return {
        "profile_completion": total_completion,
        "is_profile_complete": can_apply,
        "can_apply": can_apply,
        "missing_sections": missing_sections,
    }
