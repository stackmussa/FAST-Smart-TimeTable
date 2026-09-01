# FAST-NUCES Smart Timetable & Faculty Portal

## System Overview
A robust, automated full-stack application built to dynamically extract, cache, and display live class schedules and faculty directory information for FAST-NUCES. The system consists of a Python-based intelligent scraper for dynamic Google Sheets parsing and a responsive, offline-first Next.js React frontend.

## Core Specifications & Features

### 1. Intelligent Data Pipeline & Web Scraping
* **Dynamic Tab Discovery:** The Python Playwright scraper actively analyzes live Google Sheets to auto-discover the active schedule tabs for different departments (Computing, Management, Engineering), bypassing hardcoded layout limits.
* **Resilient Header Parsing:** Utilizes custom Regex and heuristic matching to identify dates and days even when sheet headers frequently change formatting (e.g., dynamically matching "Saturday (Sep. 05, 2026)" instead of strict "Saturday" strings).
* **Automated Sync via GitHub Actions:** A cron job strictly executes every 15 minutes, triggering the backend scraper to fetch updates. It utilizes content-hashing to preserve the `last_updated` metadata hash and prevent redundant repository commits if no structural changes exist.

### 2. Multi-File Architecture & Aggregation
* **Granular JSON Output:** Timetable data is completely decoupled into three independent JSON endpoints (`computing.json`, `management.json`, `engineering.json`), allowing independent caching, precise updates, and significantly faster payload fetching.
* **Cache-Busting Integration:** The Next.js frontend utilizes strict `no-store` headers and appends dynamic timestamp parameters (`?t=Date.now()`) to bypass CDN layers and ensure the absolute latest timetable is always presented.

### 3. Advanced Frontend & UI (Timetable Viewer)
* **Smart Filter Cascading:** Dynamic multi-level dropdown filters (School → Department → Batch → Section → Day). Selecting a higher-level filter seamlessly cascades to dynamically restrict valid choices for lower levels.
* **Intelligent Filter Persistence:** All dropdown selections are cached into client-side `localStorage`. Upon returning to the application, all previous filter preferences are automatically restored.
* **Live Connection Monitoring:** The application actively listens for standard Web API `online`/`offline` network events, rendering a live status badge. If the network drops, it immediately falls back to rendering the schedule from local memory.

### 4. Offline-First Faculty Finder
* **Client-Side CSV Parsing:** A highly customized frontend parser streams the `papaparse` CSV object to dynamically assemble faculty profiles, handling complex nested spreadsheet grouping natively on the client.
* **Real-Time Live Search:** A lightning-fast search bar instantly filters the faculty grid by evaluating matches against Faculty Names, Offices, Emails, and Titles simultaneously as the user types.
* **Gmail Deep Linking:** Automatically converts parsed faculty email addresses into deep-linked Gmail compose URLs for immediate native communication.

### 5. Mobile-First & Responsive UX
* **Adaptive Navigation:** Features a seamless tab router that displays as standard header tabs on desktop, and automatically snaps to a native iOS/Android style fixed bottom navigation bar on mobile devices.
* **Touch Optimization:** Incorporates strict mobile UI principles by forcing 16px (`text-base`) fonts in inputs to prevent iOS auto-zooming, and establishing minimum `44x44px` tap targets across all interactive buttons and links.
