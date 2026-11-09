# Scan the Barrier — Campus Accessibility Website
**Sport FOR ALL 3.0 — Sprint 2: Campaign Planning & Action**  
**Team Heal (Class 2A27)**  
*Team Members: Dorra Messaoud, Nour Gharbia, Ali Ben Kadhi, Amira Zouari, Riahi Seddik*

---

## 🎯 Campaign Purpose & Slogan
> **"Scan it. See it. Can't ignore it."**

This website serves as the interactive digital hub for the **Scan the Barrier** campus campaign. Students scan physical QR stickers placed directly on inaccessible spots (broken elevators, painful auditorium seating, etc.) and land directly on this website in their mobile browser—**no app download, no account required**.

---

## 🚀 Key Features

### 1. The Three (3) Core Problems Front and Center
1. **💺 Uncomfortable Classroom Seats:** Highlights physical pain, back strain, and lack of ergonomic seating for students with chronic pain conditions.
2. **🛗 No Elevators / Broken Elevators:** Highlights physical mobility barriers, forcing students on crutches or with fatigue/breathing impairments to navigate difficult staircases.
3. **⏳ Long Classes Without Breaks:** Highlights cognitive fatigue, pain flare-ups, and focus breakdown for students with ADHD or sensory sensitivities during 2–3 hour non-stop lectures.

### 2. Zero-Friction One-Click Counter (`+1`)
- Students don't need to write or fill out long forms when rushing between classes.
- Tapping **"✋ I have this problem (+1)"** immediately increments the live affected student counter in the SQLite database and visually acknowledges their voice.

### 3. Story Button ("Share what happened")
- For students who want to share qualitative feedback, tapping **"💬 Share what happened"** opens an anonymous modal.
- Students can share what occurred, how it hurt their day, and tag their impact area (e.g. *Physical Pain*, *Missed Class*, *ADHD / Sensory Overload*).
- Stories are displayed in a real-time "Student Voices" feed.

### 4. "+ Add Another Problem" Button
- If students experience a different barrier (e.g. heavy fire doors, poor acoustics, broken ramps, inaccessible restrooms), they can add it with one click.
- Once added, it joins the campus barrier list so other students can immediately tap `+1` on it too!

### 5. Administration & Statistics Dashboard (`/stats`)
- Designed specifically to present compelling data to the Dean, Faculty, and Facilities Management:
  - **Total Affected Student Reports** logged in real time.
  - **Breakdown by Category & Barrier Type** (Elevators vs. Seating vs. Class Duration).
  - **Days Unresolved Tracker** proving administrative delay.
  - **Qualitative Student Evidence** table showing real quotes.
  - **📥 Export to CSV:** Generates an Excel/Sheets compatible report.
  - **🖨️ Print / Save PDF:** One-click clean executive briefing view.

---

## 💻 How to Run the Website

### Step 1: Open Terminal in the Project Directory
```powershell
cd "C:\Users\doram\.gemini\antigravity\scratch\heal-barrier-website"
```

### Step 2: Start the Web Server
```powershell
npm start
```

### Step 3: Open in Browser
- **Student Voting / Barrier Map:** [http://localhost:3000](http://localhost:3000)
- **Administration Stats Dashboard:** [http://localhost:3000/stats](http://localhost:3000/stats)

---

## 🏷️ QR Code Links for Stickers
When generating QR code stickers to place around campus:
- **For Broken Elevators:** `http://<your-host>:3000/?problem=no-elevators`
- **For Painful Class Seating:** `http://<your-host>:3000/?problem=uncomfortable-seats`
- **For Classrooms (Long Classes):** `http://<your-host>:3000/?problem=long-classes`

When scanned, the website automatically scrolls to and highlights that exact barrier!
