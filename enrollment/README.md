# Enrollment Service using BusyBox `httpd`

A lightweight enrollment web service built using **BusyBox httpd** and a **shell-based CGI script** for deploying Android apps and executing ADB-based automation commands remotely.

This solution is ideal for embedded systems, routers, SBCs, or internal automation environments where a minimal web backend is preferred over full web stacks such as Node.js, Django, or PHP.

---

## ✨ Features

- Runs using **BusyBox only** — no external web server stack required
- **CGI execution** of shell scripts via `.sh` file extension mapping
- Accepts parameters via **URL query string**
- Returns **Success / Failure** HTTP responses
- Generates detailed logging files per request
- Very lightweight and suitable for production use on constrained hardware

---

## ⚙ Requirements

| Component | Notes |
|-----------|-------|
| BusyBox with `httpd` | Must include CGI support |
| `adb` binary | Required for the enrollment process |
| `sh` / `bash` | Script interpreter |
| `log/` directory | Must be writable |

Tested on **BusyBox v1.36+**

---

## 📁 Directory Structure

www/

├── enroll.s # CGI script

└── log/ # Auto-generated logs

---

## Conf file

```
.sh:/bin/sh
```
---

## Start the server:

```sh
busybox httpd -f -p 8888 -c httpd.conf -h ./www
```
---

## Execution Flow

```
Incoming HTTP request
        │
        ▼
Parse QUERY_STRING → Extract parameters
        │
Execute adb commands (connect, install, push files)
        │
Write logs to /log/YYYY-MM-DD_HH:MM:SS
        │
        ├── Failure → Return text/plain + error details
        └── Success → Return text/plain "Success"
```

---


