# Parlay.AI 🎯

An AI-powered sports parlay builder with K-Means ML clustering, live odds integration, and hit rate tracking.

**Sports covered:** NBA · NFL · MLB · ⚽ Soccer (EPL + MLS)

---

## Features

- **K-Means Clustering** — groups games by 7 features (momentum, EV, line movement, variance, public lean, win probability, pace) into 4 risk/value profiles
- **AI Parlay Analysis** — Claude evaluates your slip and returns a STRONG PLAY / LEAN PLAY / AVOID verdict with strengths, risks, and confidence score
- **Live Odds** — connects to [The Odds API](https://the-odds-api.com) for real-time lines across DraftKings, FanDuel, BetMGM, Caesars, PointsBet
- **Odds Comparison** — best available line highlighted per game across all books
- **Hit Rate Tracker** — in-session parlay history with win/loss tracking, ROI, and EV sparkline
- **Auto-Builder** — picks the top 3 +EV legs across different sports automatically

---

## Local Development

### 1. Prerequisites

- [Node.js](https://nodejs.org) v18 or higher
- npm (comes with Node)

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/parlay-ai.git
cd parlay-ai
npm install
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for production

```bash
npm run build
```

The output goes into the `dist/` folder.

---

## Getting a Free Odds API Key

1. Go to [https://the-odds-api.com](https://the-odds-api.com)
2. Click **Get API Key** — no credit card required
3. Free tier gives **500 requests/month** (enough for ~50 full refreshes)
4. Paste the key into the banner at the top of the dashboard

---

## Deploying to Vercel (Recommended — Free)

### Option A: Deploy via Vercel CLI

```bash
npm install -g vercel
vercel
```

Follow the prompts. Vercel auto-detects Vite and sets the build command to `npm run build` and output dir to `dist`.

### Option B: Deploy via Vercel Dashboard

1. Push your code to GitHub (see below)
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. Import your GitHub repo
4. Vercel auto-detects Vite — just click **Deploy**
5. Your app is live at `https://parlay-ai.vercel.app` (or similar)

---

## Deploying to Netlify (Also Free)

### Option A: Drag and drop

```bash
npm run build
```

Then drag the `dist/` folder to [app.netlify.com/drop](https://app.netlify.com/drop).

### Option B: Connect to GitHub

1. Push to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Click **Deploy**

---

## Pushing to GitHub

```bash
# 1. Create a new repo on github.com (click + → New repository)
#    Name it: parlay-ai
#    Set to Public or Private
#    Do NOT initialize with README (you already have one)

# 2. In your project folder:
git init
git add .
git commit -m "Initial commit — Parlay.AI v2 with soccer + live odds"

# 3. Connect to your GitHub repo (replace YOUR_USERNAME):
git remote add origin https://github.com/YOUR_USERNAME/parlay-ai.git
git branch -M main
git push -u origin main
```

---

## Project Structure

```
parlay-ai/
├── index.html          # HTML entry point
├── vite.config.js      # Vite config
├── package.json        # Dependencies
├── .gitignore
└── src/
    ├── main.jsx        # React root
    └── App.jsx         # Full dashboard (clustering, builder, odds, history)
```

---

## Tech Stack

- **React 18** + **Vite** — frontend framework and build tool
- **K-Means clustering** — implemented from scratch in pure JS
- **The Odds API** — live sports odds (optional)
- **Anthropic Claude API** — AI parlay analysis via `claude-sonnet-4-20250514`
- **DM Mono + Bebas Neue** — typography

---

## Disclaimer

This tool is for entertainment and educational purposes only. Sports betting involves risk. Always gamble responsibly.
