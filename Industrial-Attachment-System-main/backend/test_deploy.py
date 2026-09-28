import requests
import time

print("Waiting for deployment...")
for _ in range(60):
    try:
        res = requests.get('https://youth-portal-backend.onrender.com/force-migrate/')
        if res.status_code != 404:
            print('DEPLOYMENT FINISHED! STATUS:', res.status_code)
            print('OUTPUT:', res.text[:200])
            break
        print("Still 404, waiting 10s...")
    except Exception as e:
        print("Error:", e)
    time.sleep(10)
