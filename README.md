# Digital Signage CMS

A modern, self-hosted digital signage CMS for managing Android TV clients on your LAN. Features device management, media scheduling, and real-time control.

## Features
- Device registration & monitoring
- Media upload & playlist management
- Scheduling
- Real-time device control
- Sleek React dashboard

## Quick Start

1. Clone this repo
2. Build and start all services:
   ```bash
   docker-compose up --build
   ```
3. Access the dashboard at [http://localhost:3000](http://localhost:3000)

## Directory Structure
- `backend/` — Node.js/Express API
- `frontend/` — React dashboard
- `media/` — Uploaded media files

## Requirements
- Docker & Docker Compose

---

For development, see backend/frontend README files for more info. 