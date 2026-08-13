# Prototype Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild `docs/prototype` as TradingView-like multi-page shell per `docs/superpowers/specs/2026-08-09-prototype-redesign-design.md`.

**Architecture:** Four workspace HTML files + shared CSS/JS; Lightweight Charts CDN on Charts/Strategy; dark default + light toggle.

**Tech Stack:** Static HTML/CSS/JS, Lightweight Charts 4.x CDN, IBM Plex fonts CDN.

## Global Constraints

- TF chips only: `5m`, `15m`, `1h`, `4h`
- VI labels + EN trading terms
- No commit unless user asks
- Remove obsolete prototype pages after new ones work

---

### Task 1: Shared tokens, shell CSS/JS, mock data

**Files:**
- Create: `docs/prototype/assets/css/tokens.css`, `shell.css`, `pages.css`
- Create: `docs/prototype/assets/js/shell.js`, `mock-data.js`
- Delete: old `prototype.css`, `nav.js` when replaced

- [ ] **Step 1:** Write CSS variables for dark/light + shell layout (top bar, workspace fill)
- [ ] **Step 2:** Write `shell.js` (theme `csl-theme`, active nav, `csl-theme-change` event)
- [ ] **Step 3:** Write `mock-data.js` (OHLC generators per TF, leaderboard, news, trades)

### Task 2: Workspace HTML pages

**Files:**
- Create/overwrite: `index.html`, `charts.html`, `lab.html`, `strategy.html`, `news.html`
- Delete: `dashboard.html`, `strategies.html`, `search.html`, `leaderboard.html`, `strategy-detail.html`

- [ ] **Step 1:** Build shared header markup on all pages
- [ ] **Step 2:** Implement each workspace body per spec layouts

### Task 3: Chart scripts

**Files:**
- Create: `charts-page.js`, `strategy-page.js`

- [ ] **Step 1:** 2×2 Lightweight Charts + TF switch + overlay toggles
- [ ] **Step 2:** Strategy detail chart with markers + MA + S/R lines; follow theme

### Task 4: Docs cleanup

- [ ] **Step 1:** Update README prototype section
- [ ] **Step 2:** Mark redesign spec status implemented
- [ ] **Step 3:** Verify files exist; smoke open structure
