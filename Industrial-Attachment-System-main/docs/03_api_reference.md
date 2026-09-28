# API Reference & Endpoints

The system relies on Django REST Framework (DRF) acting under strict REST principles. Payload and response formatting universally operates with `application/json` (or `multipart/form-data` for file uploads).

## Authentication Flow (JWT)

Security operates on JSON Web Tokens.
1.  POST `/api/accounts/login/` with `username` and `password`.
2.  Receive `{ "access": "<token>", "refresh": "<token>" }`.
3.  Inject header onto all subsequent requests:
    `Authorization: Bearer <access_token>`

---

## 1. Accounts & Profile Module (`/api/accounts/`)

### Register
*   **Endpoint:** `POST /api/accounts/register/`
*   **Access:** Public
*   **Payload:** `username`, `password`, `email`, `role` (Optional, backend restricts ADMIN creation publicly)
*   **Response:** `201 Created`

### Fetch/Update Profile
*   **Endpoint:** `GET /api/accounts/profile/` |  `PATCH /api/accounts/profile/`
*   **Access:** Authenticated (IsAuthenticated)
*   **Description:** Returns nested serializers fetching `Profile`, `Education`, `Experience`, and all associated relational sets simultaneously.

### Document Upload
*   **Endpoint:** `POST /api/accounts/documents/`
*   **Headers:** `Content-Type: multipart/form-data`
*   **Payload:** `document_type` (Enum), `file` (Binary PDF/IMG).
*   **Constraint:** Handled via custom DRF ModelViewSets pushing logic checks to prevent duplicating document enums for the same user instance.

---

## 2. Jobs & ATS Module (`/api/jobs/`)

### List Vacancies
*   **Endpoint:** `GET /api/jobs/`
*   **Access:** Public (Read-Only) / Admin (Read-Write for all statuses)
*   **Description:** For public users, it filters exclusively `is_active=True`.

### Apply To Vacancy
*   **Endpoint:** `POST /api/jobs/{job_id}/apply/`
*   **Access:** Authenticated (Applicant Role)
*   **Description:** Validates completion of the Profile and submission of mandatory Documents. Returns `400 Bad Request` dynamically returning exactly which documents are missing if the validation logic fails.

### Applicant Tracking (Admin)
*   **Endpoint:** `GET /api/jobs/applications/` | `PATCH /api/jobs/applications/{id}/`
*   **Access:** Authenticated (IsAdminUser)
*   **Description:** Fetches flat or nested structures mapping the candidate to their uploaded PDF proofs. The `PATCH` verb is utilized to dynamically flip `status` from `PENDING` to `SHORTLISTED` or `HIRED`.

---

## Error Handling Standards

All validation errors emitted by the API return standard DRF `400 Bad Request` dictionaries mapping the failing key to an array of error messages.

```json
{
    "document_type": [
        "This field is required."
    ],
    "non_field_errors": [
        "You have already applied for this position."
    ]
}
```

Critical Server errors return `500 Internal Server Error` logged strictly to standard error (stderror) for tracking in DevOps infrastructure.
