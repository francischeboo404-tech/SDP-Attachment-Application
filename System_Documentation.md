# Industrial Attachment Management System
## Complete System Documentation — Presentation & Demo Reference

---

> [!IMPORTANT]
> This document is the authoritative end-to-end reference for the Industrial Attachment Management System. It covers architecture, workflows, security, the ATS engine, and answers to anticipated audience questions.

---

## 1. System Overview

The **Industrial Attachment Management System** is a full-stack web application purpose-built for managing the end-to-end lifecycle of student industrial attachment applications within a public-sector or institutional setting (e.g., Kenya PSIP context).

It replaces manual, paper-based application processes with a digitised, merit-based, and auditable workflow — from vacancy posting through automated candidate scoring to final hiring.

### What problem does it solve?

| Before (Manual) | After (This System) |
|---|---|
| Paper application forms | Digital submission with document uploads |
| Subjective shortlisting | Objective, score-based ATS ranking |
| No status visibility for applicants | Real-time status updates per application |
| HR manually checks document completeness | System auto-verifies 9 required documents |
| No deadline enforcement | Server-side deadline gate — tamper-proof |
| Risk of duplicate applications | Database + backend constraint prevents duplicates |
| No audit trail | Every action timestamped and status-tracked |

---

## 2. Technology Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | React.js (Vite) + TailwindCSS | Fast, responsive SPA with real-time UI updates |
| **Backend** | Django + Django REST Framework | Mature, secure Python web framework with ORM |
| **Database** | SQLite (dev) / PostgreSQL (prod-ready) | Relational DB with enforced constraints |
| **Auth** | JWT (JSON Web Tokens) via `rest_framework_simplejwt` | Stateless, scalable authentication |
| **API** | RESTful JSON API | Clean separation between frontend and backend |
| **Security** | Rate limiting, CORS, input validation, password hashing | Multi-layer defence-in-depth |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER (React SPA)                    │
│  Vacancies │ My Applications │ Profile │ Dashboard          │
│  ManageJobs │ Analytics │ Documents │ Admin Panel           │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS / JSON REST API
                         │ (JWT Bearer Token on every request)
┌────────────────────────▼────────────────────────────────────┐
│                   DJANGO REST FRAMEWORK                      │
│                                                             │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │  /auth/  │  │   /jobs/    │  │     /accounts/       │  │
│  │  login   │  │  vacancies  │  │  profile, education  │  │
│  │  register│  │  applications│  │  experience, docs   │  │
│  │  refresh │  │  status PATCH│  │  trainings           │  │
│  └──────────┘  └─────────────┘  └──────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               ATS COMPOSITE ENGINE                  │   │
│  │  Gate 0a → Gate 0b → Gate 0c → Gate 1 → Score 1-4  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │ ORM Queries
┌────────────────────────▼────────────────────────────────────┐
│                      DATABASE                               │
│  Users │ Profiles │ Education │ Experience │ Trainings      │
│  Documents │ Jobs │ Applications │ Memberships              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. User Roles

The system has **three distinct roles**, each with a tailored interface and permissions:

### 4.1 APPLICANT
A student/candidate seeking industrial attachment.

**Can:**
- Register and build a complete profile
- Upload up to 18 document types
- Browse active vacancies with deadline countdowns
- Submit applications (with cover letter) for open vacancies
- Track all their applications and ATS scores in real-time
- See status updates as HR/Admin acts on their application

**Cannot:**
- See other applicants' data
- Post or edit vacancies
- Change their own application status

---

### 4.2 HR (Human Resources Manager)
Responsible for reviewing candidates and making hiring recommendations.

**Can:**
- View all applications across all vacancies
- Open the attachments modal to download and review documents
- Shortlist a candidate (status → SHORTLISTED)
- Mark a candidate as unsuccessful (status → REJECTED / "Not Our Unicorn")
- Hire a shortlisted candidate (status → HIRED)
- View analytics and application trends

**Cannot:**
- Create, edit, or delete vacancies (read-only on jobs)
- Delete application records

---

### 4.3 ADMIN
Full system control.

**Can do everything HR can, plus:**
- Create, edit, activate/deactivate, and delete vacancies
- Access full analytics dashboard
- Manage system-wide settings

---

## 5. Core Workflows

### 5.1 Applicant Journey (End-to-End)

```
Register Account
      │
      ▼
Complete Profile
(Personal Info + Education + Experience + Documents)
      │
      ▼
Browse Vacancies Page
(Only active, non-expired vacancies shown)
      │
      ▼
Click "Submit Application"
      │
      ▼
Write Cover Letter (modal)
      │
      ▼
System Runs ATS Composite Scoring (auto)
      │
   ┌──┴──┐
Score < 25?   Score ≥ 25?
   │             │
REJECTED       SAVED to DB
(with           │
breakdown)      ▼
           Status: PENDING
                │
                ▼ (HR opens attachments)
           Status: REVIEWED
                │
          ┌─────┴──────┐
    Shortlisted?    Unsuccessful?
          │               │
   Status: SHORTLISTED  Status: REJECTED
          │             ("Not Our Unicorn")
          ▼
    HR clicks "Hire Candidate"
          │
          ▼
   Status: HIRED
   ("You're Hired!" banner shown)
```

---

### 5.2 HR/Admin Workflow

```
Login as HR/Admin
      │
      ▼
ManageJobs Page → Select a Vacancy
      │
      ▼
View Applications Table
(Name │ ATS Score │ Status │ View Attachments)
      │
      ▼
Click "View Attachments"
      │
   ┌──┴──────────────────────────────────────────┐
   │  Status auto-updates: PENDING → REVIEWED    │
   │  (Applicant can now see "Docs Reviewed")    │
   └──────────────────────────────────────────────┘
      │
      ▼
Review uploaded documents (download securely)
      │
      ▼
Make Decision:
  ┌────────────────────────────────────────┐
  │  GREEN button: "Shortlist Candidate"   │→ Status: SHORTLISTED
  │  ORANGE button: "Mark Unsuccessful"    │→ Status: REJECTED
  └────────────────────────────────────────┘
      │ (if shortlisted)
      ▼
  EMERALD button: "Hire Candidate"         → Status: HIRED
```

---

## 6. Application Status Lifecycle

| Status | Colour | Who Sets It | What It Means |
|---|---|---|---|
| **PENDING** | Yellow | System (on submission) | Awaiting HR review |
| **REVIEWED** | Purple | System (auto, on attachment view) | HR has opened the documents |
| **SHORTLISTED** | Blue | HR/Admin | Candidate is in consideration |
| **REJECTED** | Orange | HR/Admin | Candidate not progressing ("🦄 Not Our Unicorn") |
| **HIRED** | Emerald | HR/Admin | Candidate has been hired |

> [!NOTE]
> Status transitions are **one-way and intentional** — once HIRED or REJECTED, no further action buttons appear. This creates a clean, auditable decision trail.

---

## 7. The ATS (Applicant Tracking System) Engine

This is the core merit-based engine. It scores every applicant **automatically at the moment of submission** using a **4-dimension composite formula**.

### 7.1 Scoring Formula

```
ATS Score = D1 + D2 + D3 + D4   (capped at 100)
```

| Dimension | Weight | What it Measures |
|---|---|---|
| **D1: Required Documents** | **35 pts** | How many of the 9 mandated docs are uploaded |
| **D2: Job Keyword Match** | **30 pts** | How well the applicant's profile overlaps with the job description |
| **D3: Education Quality** | **25 pts** | Education records + highest qualification level |
| **D4: General Info** | **10 pts** | Profile identity/contact field completeness |
| **Total** | **100 pts** | |

**Minimum passing score: 25/100**

---

### 7.2 The 9 Required Documents (Dimension 1)

| # | Document | Purpose |
|---|---|---|
| 1 | National ID | Identity verification |
| 2 | Academic Transcripts | Academic qualifications proof |
| 3 | Institution Introduction Letter | Confirms active student enrollment |
| 4 | Resume / CV | Competence and experience summary |
| 5 | Certificate of Good Conduct | Character and background vetting |
| 6 | KRA PIN Certificate | Tax compliance (Kenya Revenue Authority) |
| 7 | NSSF Card | National Social Security Fund |
| 8 | SHA Card | Social Health Insurance (formerly NHIF) |
| 9 | Student ID | Active student status confirmation |

**Score per document = 35 / 9 ≈ 3.89 points each**

> [!TIP]
> An applicant who uploads all 9 documents already starts at **35/100** before any keyword matching or education scoring. This incentivises document compliance from the outset.

---

### 7.3 Education Scoring (Dimension 3)

| Qualification | Score |
|---|---|
| PhD / Doctorate | 25/25 (10 base + 15 bonus) |
| Masters / MBA / MSc | 22/25 (10 base + 12 bonus) |
| Degree / Bachelor / BSc | 20/25 (10 base + 10 bonus) |
| Diploma / HND | 17/25 (10 base + 7 bonus) |
| Certificate | 15/25 (10 base + 5 bonus) |
| KCSE | 13/25 (10 base + 3 bonus) |
| No records | 0/25 |

---

### 7.4 Keyword Match (Dimension 2)

The system builds an **applicant keyword corpus** from:
- Education (qualification, field of study, institution, grade)
- Experience (job title, responsibilities, organisation)
- Trainings and professional memberships
- Uploaded document types + 18-category synonym expansion
- County of residence
- Cover letter text

This corpus is compared against the **job description + requirements** using set intersection after filtering English stop words. The overlap ratio is scaled to 30 points.

> [!NOTE]
> The synonym expansion means an applicant whose CV uses "CV" matches a job posting that says "resume". The ATS is not penalised by vocabulary differences.

---

### 7.5 Rejection Error Message (Example)

When a candidate scores below 25, they receive:

> *"Your composite ATS score is 3.3/100 (minimum 25 required). Score breakdown — Documents: 0.0/35 (0/9 required docs uploaded), Keyword Match: 0.0/30, Education: 0.0/25, General Info: 3.3/10. To improve: upload all 9 required documents, complete your profile fields, add Education & Experience records, and write a tailored Cover Letter."*

This tells the candidate **exactly what to fix** — no guesswork.

---

## 8. Security Architecture

### 8.1 Authentication
- **JWT tokens** with short access token lifetimes
- Token refresh mechanism for seamless re-authentication
- All API endpoints require `Authorization: Bearer <token>` (except registration and login)

### 8.2 Application Submission Gates (5 layers)

```
Gate 0a → Is the vacancy still active?
Gate 0b → Has the deadline passed? (server clock — browser-proof)
Gate 0c → Has this user already applied for this job? (pre-DB check)
Gate 1  → Is the profile sufficiently complete?
Gate 2  → Does the ATS composite score meet the minimum threshold?
```

Each gate returns a **clear, actionable error message**. No cryptic server errors reach the user.

### 8.3 Rate Limiting

| Endpoint | Limit |
|---|---|
| Application submission (POST) | 10/hour per user |
| Login attempts | 5/minute per IP |
| Global user requests | 1000/day per user |
| Global anonymous requests | 100/day per IP |

> [!WARNING]
> Rate limits are enforced at the API layer. Even direct API clients (e.g., Postman, curl) are subject to these limits. Exceeding them returns HTTP 429 Too Many Requests.

### 8.4 Database Constraints
- `Application.unique_together = (("user", "job"))` — hard DB-level duplicate prevention
- Prevents duplicate applications even if the API gate is somehow bypassed

### 8.5 Input Validation
- All serializer inputs validated (username 3–50 chars, password 8–128 chars, uppercase + lowercase required)
- Document types validated against an enumerated whitelist
- Deadline comparison uses UTC server time exclusively

### 8.6 CORS
- Configured to allow only the known frontend origin
- Blocks cross-origin requests from unknown domains

---

## 9. Frontend Pages Reference

| Page | Roles | Purpose |
|---|---|---|
| **Login / Register** | All | Authentication entry point |
| **Dashboard** | All | Overview stats + latest application status |
| **Vacancies** | Applicant | Browse open positions; submit applications |
| **My Applications** | Applicant | Track all submitted applications + ATS scores + status |
| **Profile** | Applicant | Edit personal info, education, experience, trainings, memberships |
| **Documents** | Applicant | Upload / manage the 18 document types |
| **ManageJobs** | HR, Admin | View applications per vacancy; shortlist/reject/hire |
| **PostJob** | Admin | Create / edit vacancies with deadlines |
| **Analytics** | HR, Admin | Charts: applications by period, status distribution, ATS averages |

---

## 10. Document Types (Full List — 18 Types)

| # | Key | Display Name |
|---|---|---|
| 1 | TRANSCRIPT | Academic Transcripts |
| 2 | NATIONAL_ID | National ID |
| 3 | RESUME | Resume / CV |
| 4 | COVER_LETTER | Cover Letter |
| 5 | INSTITUTION_INTRO | Introduction Letter from Institution |
| 6 | GOOD_CONDUCT | Certificate of Good Conduct |
| 7 | STUDENT_INSURANCE | Student Insurance Cover |
| 8 | STUDENT_ID | Copy of Student ID |
| 9 | NEXT_OF_KIN_ID | Copy of Next of Kin (ID & Phone) |
| 10 | KRA_PIN | KRA PIN Certificate |
| 11 | SHA_CARD | SHA Card |
| 12 | NSSF_CARD | NSSF Card |
| 13 | BIRTH_CERT | Birth Certificate |
| 14 | ACADEMIC_CERT | Academic Certificates |
| 15 | SECRETS_ACT_FORM | Official Secrets Act Form |
| 16 | PSIP_FORM | PSIP Intern Biodata Form |
| 17 | PASSPORT_PHOTOS | Two Colour Passport Photos (PDF) |
| 18 | ATM_CARD | ATM Card / Bank Details |

> [!NOTE]
> 9 of the 18 documents are **required** for ATS Dimension 1 scoring. All 18 document types contribute synonym keywords to Dimension 2 (keyword match) if uploaded.

---

## 11. Anticipated Questions & Answers

### Q: How is the ATS score calculated? Is it fair?
**A:** The ATS score is a transparent, 4-dimension composite out of 100 points. It is:
- **Objective** — same formula for every applicant, no human bias
- **Merit-based** — rewards document compliance, education quality, profile completeness, and job relevance
- **Explainable** — rejected applicants receive a full per-dimension breakdown with specific improvement guidance
- **Auditable** — the score is stored permanently with each application record

---

### Q: Can an applicant cheat the ATS by stuffing keywords?
**A:** Partially mitigated. The ATS Dimension 2 (keyword match) is capped at 30/100 points — so keyword stuffing in the cover letter alone can never push an applicant through if their document compliance (D1), education (D3), or profile completeness (D4) are lacking. A holistic score across all 4 dimensions is required to pass the 25-point threshold.

---

### Q: What happens if the deadline has passed?
**A:** Three independent layers block late submissions:
1. **Frontend**: The vacancy card shows "⛔ Applications Closed" and the button disappears
2. **Backend Gate 0b**: Server-side deadline check using UTC clock — cannot be bypassed by manipulating the browser or client timestamp
3. **No form is ever sent** to the server from a closed card

---

### Q: Can the same person apply twice for the same vacancy?
**A:** No. Three independent layers prevent this:
1. **Frontend**: `appliedJobIds` Set tracks already-applied jobs; card shows "✅ Already Applied"
2. **Backend Gate 0c**: Explicit DB query before ATS computation → returns clear 400 error
3. **Database**: `unique_together = (("user", "job"))` hard constraint — physically prevents duplicate rows

---

### Q: How does the applicant know what their status is?
**A:** The **My Applications** page shows every application card with:
- A colour-coded status badge (Pending / Reviewed / Shortlisted / Hired / Not Our Unicorn)
- A status footer message explaining what the current status means
- For HIRED: a full-width gradient celebration banner with congratulatory text
- The ATS score and a score bar with a label (Strong / Moderate / Needs Improvement)

---

### Q: How does the HR see that documents were reviewed?
**A:** When HR clicks **"View Attachments"**, the system automatically PATCHes the application status from `PENDING` → `REVIEWED`. The applicant's card immediately updates to show "👁 Docs Reviewed" on their My Applications page. The HR modal shows a purple "Documents Viewed" indicator and both action buttons (Shortlist / Unsuccessful).

---

### Q: Why is the rejection label "Not Our Unicorn"?
**A:** It is a deliberate, industry-standard humorous label used widely in HR and tech circles. It softens the rejection message while remaining clear and professional. The database status value remains `REJECTED` — only the display label shown to the applicant uses the humorous text. This can be changed to any label without a database migration.

---

### Q: Is the system secure from unauthorised access?
**A:** Yes. Multiple layers of security are in place:
- JWT authentication required on all protected endpoints
- Role-based permission classes on every API view
- Rate limiting prevents brute-force and spam attacks
- All passwords hashed using Django's PBKDF2 algorithm
- Input validation prevents injection and oversized payloads
- CORS restricts cross-origin API access
- Database constraints enforce data integrity at the lowest level

---

### Q: What prevents an HR person from accidentally hiring before reviewing documents?
**A:** The modal enforces a state-driven button flow:
- **PENDING/REVIEWED** → shows Shortlist + Unsuccessful buttons only
- **SHORTLISTED** → shows "Candidate Shortlisted" badge + Hire button
- **HIRED/REJECTED** → shows final status badge only, no action buttons

The "Hire Candidate" button only appears after a candidate has been **explicitly shortlisted**. It is physically impossible to hire a PENDING candidate.

---

### Q: How does the system handle large numbers of applicants?
**A:** The backend uses:
- `select_related` and `prefetch_related` on all queries — prevents N+1 database query problems
- Django's ORM queryset caching
- Paginated API responses
- The frontend polls every 2 seconds for live vacancy updates (lightweight GET request)

---

### Q: Can the ATS minimum score be adjusted?
**A:** Yes. The `ATS_MINIMUM_SCORE` constant in `backend/jobs/views.py` (line ~40) can be changed from `25.0` to any value between 0 and 100 without any database migration or frontend changes. The rejection error message automatically reflects the new threshold.

---

### Q: What is the maximum possible ATS score?
**A:** 100.0 — achieved by:
- All 9 required documents uploaded (35 pts)
- 100% keyword overlap with job description (30 pts)
- PhD-level qualification (25 pts)
- All 6 profile identity fields filled (10 pts)

---

## 12. Data Models Summary

```
User (Django AbstractUser)
 ├── role: ADMIN | HR | APPLICANT
 └── Profile (OneToOne)
      ├── gender, dob, marital_status
      ├── phone_number, id_number, kra_pin
      ├── nssf_number, nhif_number
      └── county_of_residence, nationality

Education (FK → User) [many]
 └── institution, qualification, field_of_study, grade, dates

Experience (FK → User) [many]
 └── organization, job_title, responsibilities, dates

Training (FK → User) [many]
 └── name, institution, year

ProfessionalMembership (FK → User) [many]
 └── body_name, membership_number, status

Document (FK → User) [many, up to 18 types]
 └── document_type (enum), file (PDF upload)

Job (Vacancy)
 └── title, description, requirements, location
     deadline, is_active, department, job_type

Application (FK → User + Job)
 └── cover_letter, ats_score, status, applied_at
     unique_together: (user, job)  ← DB-level duplicate prevention
```

---

## 13. Known Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| ATS runs at submission time only | Score reflects profile at time of application — prevents gaming by updating profile after submission |
| Deadline enforced server-side only | Client clocks can be manipulated; server UTC is the single source of truth |
| `REVIEWED` status is auto-set | Ensures HR cannot claim they reviewed without the system recording it — creates an audit trail |
| Rate limit on POST /applications | Prevents automated flooding; 10/hour is generous for legitimate applicants |
| Humor label for rejection | Research shows softer rejection language improves candidate experience and employer brand |
| 9 required documents weighted at 35% | Document compliance is verifiable and non-falsifiable; it should carry the heaviest weight |

---

## 14. Deployment Notes

| Environment | Configuration |
|---|---|
| **Development** | `npm run dev` (frontend, port 5173) + `python manage.py runserver` (backend, port 8000) |
| **Production** | Build frontend with `npm run build`, serve with Nginx; backend with Gunicorn + Nginx proxy |
| **Database** | Switch `DATABASES` in `settings.py` to PostgreSQL for production |
| **Static/Media files** | Configure `MEDIA_ROOT` and serve via Nginx in production |
| **Environment variables** | `SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` |

---

*Document prepared: June 2026 | System: Industrial Attachment Management System v1.0*
