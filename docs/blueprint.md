# **App Name**: Class Guardian

## Core Features:

- QR Code Generation: Admin generates a unique, time-limited QR code for each class session that can refresh every minute. Display this using a tool that can use an LLM if a database entry indicates high incidence of absences. The LLM tool would choose an optimal time for display.
- Attendance Marking: Students scan the QR code within the specified time to be marked Present. A rolling count should be maintained of number of present/total
- Late Arrival Tracking: If a student scans the QR code after the allowed time, the system records their arrival as Late and calculates how many minutes late they are.
- Second QR Code Verification: A second QR code can be displayed during or at the end of the class to verify continued presence.
- Admin Dashboard: Admin interface to generate QR codes, view attendance records, and manage class sessions.
- Student Attendance History: Students can view their own attendance history, including dates, times, and any late arrivals.
- QR Data storage: Cloud database storage for users and QR codes

## Style Guidelines:

- Primary color: Deep navy blue (#243A73), conveying trustworthiness and focus.
- Background color: Light gray (#F0F4F8), providing a clean, unobtrusive backdrop.
- Accent color: Vibrant sky blue (#4FC3F7), used sparingly for interactive elements and highlights, creating a sense of action.
- Body and headline font: 'Inter', a sans-serif with a modern and neutral feel.
- Use simple, clear icons to represent attendance status, actions, and navigation elements.
- A clean and organized layout with clear visual hierarchy to make attendance information easily accessible.
- Subtle animations for QR code scanning feedback and attendance updates.