# HireFlow AI — Local Pipeline & Architecture Guide

This document explains how the HireFlow AI frontend, backend API, and offline pipelines interact during local development.

---

## The Core Concept

HireFlow AI does not run all of its intensive processing inside a single, blocking web server thread. The heavy background workloads—such as scraping job boards, calculating vector space embeddings, analyzing tech stacks, and running headless browser automations to submit forms—are decoupled into **modular, command-line driven pipelines**.

During development, you execute these steps sequentially using CLI scripts. In a production environment, these scripts are triggered automatically by task queues (e.g., Celery, Redis) or scheduled cron workers (Milestone 8 / Issue 26).

---

## End-to-End Developer Lifecycle

Follow these steps to experience the complete onboarding, discovery, scoring, and application flow locally:

### Step 1: User Onboarding
1. Start the backend API server and frontend dev server.
2. Visit `http://localhost:3000/profile` and complete the onboarding questionnaire (or upload your resume).
3. Submitting the form writes a new record to the `users` database table and stores the returned profile ID in your browser's `localStorage` as `hireflow_user_id`.

---

### Step 2: Scrape Job Listings
Before jobs can be matched to your profile, you need target listings in the database. Run the scrapers against career sites:
```bash
# Activate your virtual environment first
source venv/bin/activate

# Scrape an internship page (e.g., Anthropic)
PYTHONPATH=. python -m src.scrapers.lever_scraper --url "https://jobs.lever.co/anthropic" --mode internship
```
This inserts raw job listings into the `jobs` database table.

---

### Step 3: Spam Filtering & Quality Assessment
Filter out low-quality listings or vague job descriptions:
```bash
PYTHONPATH=. python -m src.agents.spam_filter --run
```
This updates the target job listings, marking spam flags (`is_spam`) and setting a quality confidence score (`spam_confidence`).

---

### Step 4: Rebuild the Semantic Search Index
To perform fast semantic searches, convert the non-spam job descriptions into 384-dimensional mathematical vectors and index them with FAISS:
```bash
PYTHONPATH=. python -m src.pipelines.embedding_pipeline --embed-jobs
```
This writes the index binary and metadata files to `data/faiss_index/`.

---

### Step 5: Run the Multi-Factor Match Scorer
Match the user profile against all available jobs in the database. The scorer blends semantic embedding distance with location, experience, target roles, and skill coverage:
```bash
PYTHONPATH=. python -m src.pipelines.match_scorer --user-id <YOUR_USER_ID>
```
This generates ranked `Application` records with a status of `planned` for the current week, complete with a `match_score` and list of `skill_gaps`.

---

### Step 6: Review & Refine on the Web
1. Navigate to the **Weekly Plan** page (`http://localhost:3000/weekly-plan`).
2. The page loads the planned applications for your active profile ID. You can:
   * View match percentages and skill gaps.
   * Click **Preview Resume** to review the tailored PDF generated for that specific role.
   * Click **Remove** to drop a job and see recommendations to swap in next-ranked alternatives.
3. Click **Confirm & Apply**. This updates the status of approved applications to `confirmed` in the database.

---

### Step 7: Headless Browser Submission (Form Filler)
Once applications are `confirmed`, the automation engine picks them up and uses headless browsers (Playwright) to navigate to the form, answer questions with LLM support, upload the tailored PDF resume, and submit:
```bash
PYTHONPATH=. python -m src.agents.application_agent --user-id <YOUR_USER_ID>
```
This moves the application to its final state (`applied`, `failed`, or `needs_action` for CAPTCHAs).

---

### Step 8: Live Status Tracking
Open the **Applications** page (`http://localhost:3000/applications`) in the browser. You'll see a live table updating with progress, including color-coded badges, clickable resume downloads, and toggleable apply links for any applications requiring manual action.
