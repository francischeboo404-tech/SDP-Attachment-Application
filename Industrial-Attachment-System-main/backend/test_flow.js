const BASE_URL = "http://127.0.0.1:8000/api";

async function main() {
    console.log("Testing flows...");
    
    // 1. Login Admin
    console.log("1. Logging in as admin...");
    let res = await fetch(`${BASE_URL}/accounts/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "f@gmail.com", password: "TestP@123", recaptcha: "test" })
    });
    if (!res.ok) {
        console.log("Admin login failed:", await res.text());
        return;
    }
    const adminData = await res.json();
    const admin_token = adminData.access;
    console.log("Admin token obtained.");
    
    // 2. Post Job
    console.log("2. Admin posting job...");
    let job_id;
    res = await fetch(`${BASE_URL}/jobs/vacancies/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${admin_token}`
        },
        body: JSON.stringify({
            title: "Test Internship",
            description: "Test description",
            requirements: "Python, Django",
            job_type: "ATTACHMENT",
            location: "Nairobi",
            deadline: "2026-12-31T23:59:59Z"
        })
    });
    if (!res.ok) {
        console.log("Admin post job failed:", await res.text());
    } else {
        const jobData = await res.json();
        job_id = jobData.id;
        console.log(`Job posted successfully. ID: ${job_id}`);
    }

    // 3. Register Applicant
    console.log("3. Register Applicant...");
    const app_username = `testapp${Date.now()}@gmail.com`;
    res = await fetch(`${BASE_URL}/accounts/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: app_username,
            email: app_username,
            password: "Password123!",
            first_name: "Test",
            last_name: "App",
            recaptcha: "test"
        })
    });
    if (!res.ok && res.status !== 400) {
        console.log("Applicant register failed:", await res.text());
        return;
    }
    
    // 4. Login Applicant
    console.log("4. Login Applicant...");
    res = await fetch(`${BASE_URL}/accounts/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: app_username, password: "Password123!", recaptcha: "test" })
    });
    if (!res.ok) {
        console.log("Applicant login failed:", await res.text());
        return;
    }
    const appData = await res.json();
    const app_token = appData.access;

    // 5. Configure Applicant Profile
    console.log("5. Configure Applicant Profile...");
    res = await fetch(`${BASE_URL}/accounts/profile/`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${app_token}`
        },
        body: JSON.stringify({
            opportunity_type: "ATTACHMENT",
            middle_name: "M",
            dob: "2000-01-01",
            gender: "M",
            marital_status: "SINGLE",
            postal_address: "123 Box",
            phone_number: "0700000000",
            id_number: "12345678",
            kra_pin: "A123456789Z",
            county_of_residence: "Nairobi"
        })
    });
    console.log("Profile configured status:", res.status, await res.text());
    
    // 6. Applicant adding Education & Experience
    console.log("6. Applicant adding Education...");
    await fetch(`${BASE_URL}/accounts/education/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${app_token}`
        },
        body: JSON.stringify({
            institution_name: "University",
            qualification: "BSc",
            field_of_study: "Computer Science",
            start_date: "2020-01-01",
            end_date: "2024-01-01",
            current: false
        })
    });
    
    console.log("Applicant adding Experience...");
    await fetch(`${BASE_URL}/accounts/experience/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${app_token}`
        },
        body: JSON.stringify({
            organization: "Tech Corp",
            job_title: "Python Developer",
            start_date: "2024-01-01",
            responsibilities: "Django"
        })
    });

    // 7. Uploading Documents
    console.log("7. Uploading Documents...");
    const internshipDocs = ['NATIONAL_ID', 'KRA_PIN', 'SHA_CARD', 'NSSF_CARD', 'BIRTH_CERT', 'ACADEMIC_CERT', 'SECRETS_ACT_FORM', 'PSIP_FORM', 'PASSPORT_PHOTOS', 'ATM_CARD'];
    
    for (const doc of internshipDocs) {
        const formData = new FormData();
        formData.append('document_type', doc);
        // Create a dummy file blob for upload
        const blob = new Blob(['dummy pdf content'], { type: 'application/pdf' });
        formData.append('file', blob, `${doc}.pdf`);

        const docRes = await fetch(`${BASE_URL}/accounts/documents/`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${app_token}`
            },
            body: formData
        });
        if (!docRes.ok) {
            console.log(`Failed to upload ${doc}:`, await docRes.text());
        }
    }

    // 8. Applying for Job
    if (job_id) {
        console.log("8. Applying for Job...");
        res = await fetch(`${BASE_URL}/jobs/applications/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${app_token}`
            },
            body: JSON.stringify({ job: job_id })
        });
        console.log("Job Apply Response:", res.status, await res.text());
    } else {
        console.log("No job_id to apply to.");
    }
}

main().catch(console.error);
