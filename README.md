# GeekDS Digital Signage CMS

A modern, self-hosted digital signage CMS for managing Android TV clients on your LAN. Features device management, media scheduling, and real-time control.

---

## 🚀 Features
- Device registration & monitoring
- Media upload & playlist management
- Scheduling
- Real-time device control (reboot, shutdown, play playlist)
- Sleek React dashboard

---

## 🛠️ Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Node.js (v18+) and npm (for local development)
- Git

---

## ⚡ Quick Start (Recommended: Docker Compose)

1. **Clone the repo:**
   ```bash
   git clone https://github.com/MashaWaleed/GeekDS.git
   cd GeekDS
   ```
2. **Start all services:**
   ```bash
   docker compose up --build
   ```
3. **Access the dashboard:**
   - Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧑‍💻 Local Development (Hot Reload)

1. **Start the database in Docker:**
   ```bash
   docker compose up -d db
   ```
2. **Backend:**
   ```bash
   cd backend
   npm install
   export DATABASE_URL=postgres://postgres:postgres@localhost:5432/cms
   npm run dev
   ```
3. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm start
   ```
4. **Access the dashboard:**
   - Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Project Structure
- `backend/` — Node.js/Express API (TypeScript)
- `frontend/` — React dashboard (Material UI)
- `media/` — Uploaded media files
- `init.sql` — Database schema
- `API.md` — Full API documentation

---

## 📋 API Reference
See [API.md](./API.md) for all endpoints, request/response examples, and usage notes.

---

## 🧪 Testing the API
- Use [Postman](https://www.postman.com/) or `curl` to test endpoints (see API.md for examples).
- Register devices, upload media, create playlists/schedules, and send commands.
- All changes are reflected live in the dashboard.

---

## 🖥️ Using the Dashboard
- **Devices:** Register, monitor, and control all TV boxes.
- **Media:** Upload, list, and delete video files.
- **Playlists:** Create playlists and assign media.
- **Schedules:** Assign playlists to devices with start/end times.
- **Commands:** Send reboot/shutdown/play commands to devices.

---

## 🛠️ Troubleshooting
- **Database connection errors:** Ensure Docker is running and the `db` service is up.
- **Port conflicts:** Change ports in `docker-compose.yml` if needed.
- **Frontend/backend not updating:** Restart the dev servers after code changes.

---

## 🤝 Contributing
Pull requests and issues are welcome! See [API.md](./API.md) for backend specs.

---

## 📄 License
MIT 