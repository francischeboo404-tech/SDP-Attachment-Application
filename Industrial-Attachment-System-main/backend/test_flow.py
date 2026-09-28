import requests

BASE_URL = "http://localhost:8000/api"

def main():
    print("Testing flows...")
    session = requests.Session()
    
    # Login Admin
    print("1. Logging in as admin...")
    res = session.post(f"{BASE_URL}/accounts/login/", json={"username": "f@gmail.com", "password": "TestP@123", "recaptcha": "test"})
    if res.status_code != 200:
        print("Admin login failed:", res.text)
        return
    admin_token = res.json()["access"]
    print("Admin token obtained.")
    
    # Post Job
    print("2. Admin posting job...")
    headers = {"Authorization": f"Bearer {admin_token}"}
    job_data = {
        "title": "Test Internship",
        "description": "Test description",
        "requirements": "Python, Django",
        "job_type": "ATTACHMENT",
        "location": "Nairobi",
        "deadline": "2026-12-31T23:59:59Z"
    }
    res = session.post(f"{BASE_URL}/jobs/vacancies/", json=job_data, headers=headers)
    if res.status_code != 201:
        print("Admin post job failed:", res.text)
        # We don't return here if it fails because we might want to test Applicant anyway, 
        # but let's assume it fails here.
    else:
        job_id = res.json()["id"]
        print(f"Job posted successfully. ID: {job_id}")

    # Register Applicant
    print("3. Register Applicant...")
    app_data = {
        "username": "testapplicant@gmail.com",
        "email": "testapplicant@gmail.com",
        "password": "Password123!",
        "first_name": "Test",
        "last_name": "App",
        "recaptcha": "test"
    }
    res = session.post(f"{BASE_URL}/accounts/register/", json=app_data)
    if res.status_code not in [201, 400]:
        print("Applicant register failed:", res.text)
        return
    elif res.status_code == 400 and "already exists" not in str(res.text):
        print("Applicant register 400:", res.text)
    
    print("4. Login Applicant...")
    res = session.post(f"{BASE_URL}/accounts/login/", json={"username": "testapplicant@gmail.com", "password": "Password123!", "recaptcha": "test"})
    if res.status_code != 200:
        print("Applicant login failed:", res.text)
        return
    app_token = res.json()["access"]
    app_headers = {"Authorization": f"Bearer {app_token}"}

    print("5. Configure Applicant Profile...")
    prof_data = {
        "opportunity_type": "ATTACHMENT",
        "middle_name": "M",
        "dob": "2000-01-01",
        "gender": "M",
        "marital_status": "SINGLE",
        "postal_address": "123 Box",
        "phone_number": "0700000000",
        "id_number": "12345678",
        "kra_pin": "A123456789Z",
        "county_of_residence": "Nairobi"
    }
    res = session.put(f"{BASE_URL}/accounts/profile/", json=prof_data, headers=app_headers)
    print("Profile configured:", res.text)
    
    print("6. Applicant adding Education & Experience...")
    session.post(f"{BASE_URL}/accounts/education/", json={
        "institution_name": "University",
        "qualification": "BSc",
        "field_of_study": "Computer Science",
        "start_date": "2020-01-01",
        "end_date": "2024-01-01",
        "current": False
    }, headers=app_headers)
    
    session.post(f"{BASE_URL}/accounts/experience/", json={
        "organization": "Tech Corp",
        "job_title": "Python Developer",
        "start_date": "2024-01-01",
        "responsibilities": "Django"
    }, headers=app_headers)

    print("7. Applying for Job...")
    try:
        res = session.post(f"{BASE_URL}/jobs/applications/", json={"job": job_id}, headers=app_headers)
        print("Job Apply Response:", res.status_code, res.text)
    except NameError:
        print("Cannot apply, job_id not defined.")

if __name__ == "__main__":
    main()
