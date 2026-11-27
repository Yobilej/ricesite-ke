# Ricesite KE – CSC429 prototype

A web rice marketplace: farmers publish rice listings, buyers search and send enquiries, an administrator manages accounts and listings.

## 1. Run it on your computer (first time)

1. Install **Node.js (LTS version)** from https://nodejs.org (needs version 22.13 or newer). Check with `node -v` in a terminal.
2. Unzip this folder, e.g. to `Documents/ricesite-ke`.
3. Open a terminal **inside the folder** (Windows: open the folder, type `cmd` in the address bar, press Enter).
4. Run: `node server.js`
5. Open **http://localhost:3000** in Chrome. Stop the server with `Ctrl + C`.

No `npm install` is needed. The database file `ricesite.db` is created automatically on the first run, with demo data.

## 2. Demo accounts

| Role | Email | Password |
|---|---|---|
| Administrator | admin@ricesite.ke | Admin@123 |
| Farmer | farmer@demo.ke | Farmer@123 |
| Buyer | buyer@demo.ke | Buyer@123 |

(Delete `ricesite.db` and restart to reset everything to this demo data.)

## 3. How the files fit together

- `server.js` – the backend: database tables (USER, RICE_LISTING, ENQUIRY from your ERD), login/security, and the API.
- `public/index.html` – everything the user sees (HTML + CSS + JavaScript).
- `ricesite.db` – the database file (created on first run).

## 4. Saving your work safely

1. **Keep one project folder** and always edit files inside it (VS Code is a good free editor: https://code.visualstudio.com).
2. **Back up with Git + GitHub** (this also gives you the "working prototype link" Chapter 5.5 asks for):
   - Install Git, create a free GitHub account, make a new repository called `ricesite-ke`.
   - In the project folder: `git init`, `git add .`, `git commit -m "First version"`, then follow GitHub's "push an existing repository" commands.
   - After each work session: `git add .` → `git commit -m "what I changed"` → `git push`.
3. Also copy the folder to a flash disk or Google Drive once a week.

## 5. Showing it to your supervisor

- **Before the day:** run it once on the exact laptop you will use, log in as all three roles, and take screenshots for Chapter 5 (each with a figure number and caption, e.g. "Figure 5.1: Farmer listing form").
- **Demo order (about 5 minutes), matching your objectives:**
  1. Register a new farmer, log in, show profile editing (objective 3).
  2. Farmer publishes a listing, then deactivates and re-activates it (objective 4).
  3. Log out, browse and search as a buyer, open a listing and send an enquiry (objective 5).
  4. Log back in as the farmer and show the enquiry arrive; mark it responded.
  5. Log in as admin: show the summary, suspend an account, remove a listing (objective 6).
- **Backup plan:** keep your screenshots and a short screen recording (Windows: Win + G) in case the laptop or Wi-Fi misbehaves. It runs offline, so no internet is needed.
- **Be honest about status:** your deck says interviews and testing results must only be reported once actually done. Present what is built, and mark testing as Pass / Fail / Not Tested truthfully.
- **Be ready for these questions:** *Why SQLite and not MySQL?* (easy setup for a prototype; the tables follow the same relational design and can move to MySQL). *How are passwords protected?* (salted scrypt hashes, role-checked routes, server-side validation).

## 6. Known limits of this first version

Prototype only: sessions are held in memory (everyone is logged out when the server restarts), there is no email/SMS, no image upload, no HTTPS, and it has not been formally tested yet. These are good items for your Chapter 5.7 recommendations.
