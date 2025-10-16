# Class Guardian Application Tutorial

This document explains the workflow of the Class Guardian attendance application for both Administrators and Students.

## The Two-Scan System

The core of this application is a two-scan attendance system designed to ensure students are present for the entire duration of a class session.

- **Scan 1 (Initial Check-in)**: This scan happens at the beginning of the class.
- **Scan 2 (Verification Scan)**: This scan happens at a later point, for example, after a mid-class break.

A student is only marked as fully **Present** if they complete **both** scans.

---

## For Administrators

### 1. Logging In & Dashboard
- Log in using your administrator credentials.
- The **Admin Dashboard** is your main control panel. From here, you can manage live sessions, register new users, and view live attendance data.

### 2. Starting a New Session
- Click the **"Start New Session"** button.
- A dialog will appear asking you to set a grace period (in minutes). Students who scan after this period will be marked as "Late".
- Upon starting, a unique QR code for the **first scan** will be displayed. The system also records your current location to ensure students are physically present.

### 3. Monitoring the First Scan
- As students scan the first QR code, the **Live Attendance Roster** on your dashboard will update in real-time.
- You can filter the list to see who is present, absent, or has left early.
- The stats cards at the top will also update, giving you a quick overview.

### 4. Activating the Second Scan
- When you are ready for the second check-in (e.g., after the class break), click the **"Activate Second Scan"** button.
- A **new, unique QR code** will be generated and displayed for the verification scan.

### 5. Monitoring the Second Scan
- As students complete the second scan, their status in the live roster will be updated.
- A student who successfully completes the second scan will have their final status changed from "Left Early" to **"Present"** or **"Late"**.

### 6. Ending the Session
- Once the class is over, click the **"End Session"** button.
- This action concludes the live session and **archives all attendance records** permanently in the database.
- Every student in the roster will have a final status:
    - **Present/Late**: Scanned both QR codes.
    - **Left Early**: Scanned only the first QR code.
    - **Absent**: Did not scan either QR code.

### 7. Viewing Historical Reports
- Navigate to the **"Students"** page from the sidebar.
- Here you will find a list of all past attendance sessions, ordered by date.
- You can expand any session to view the detailed attendance report for that day.
- From this view, you can:
    - **Download a PDF** of the session's attendance report.
    - **Edit** an individual student's attendance record if a manual correction is needed.

---

## For Students

### 1. Logging In & Dashboard
- Log in with your student credentials.
- Your dashboard will show you the status of the current attendance session.

### 2. Completing the First Scan
- When the administrator starts a session, they will display the first QR code.
- Click the **"Scan QR Code"** button on your dashboard.
- Your device will ask for camera and location permissions. You must grant these to proceed.
- Scan the QR code.
- Upon a successful scan, your status will update to show that you have completed the first scan. This record is **saved permanently** for the session. It will still be there even if you reload the page, close your browser, or log out and log back in.

### 3. Completing the Second Scan
- After the break, the administrator will activate the second scan and display a new QR code.
- Your dashboard will update to show that the second scan is active and will prompt you to scan again.
- Click the **"Scan QR Code"** button again and scan the new code.

### 4. Your Final Attendance Status
- Your final status for the session is determined as follows:
    - If you complete **both** scans, your final status will be **"Present"** (or **"Late"** if you scanned after the grace period).
    - If you complete **only the first scan**, your final status will be **"Left Early"**.
    - If you do not complete any scans, your status will remain **"Absent"**.

### 5. Viewing Your History
- You can view your own attendance history by navigating to the **"My History"** page from the sidebar. (Note: This feature is currently under development).
