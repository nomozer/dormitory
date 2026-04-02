# Dormitory System Workspace

## Folder layout

- `backend/`: Python API, C++ analytics engine, runtime scripts.
- `frontend/`: static web app (HTML/CSS/JS) + CSV datasets.
- `skills/`: internal skill assets.

## Run in development

### One-command mode (backend + frontend)

```powershell
powershell -ExecutionPolicy Bypass -File .\dev.ps1
```

Mac dinh script chay backend/frontend o che do an cua so terminal con.

Optional:

```powershell
powershell -ExecutionPolicy Bypass -File .\dev.ps1 -OpenBrowser
```

Neu can debug bang cua so process con:

```powershell
powershell -ExecutionPolicy Bypass -File .\dev.ps1 -ShowChildWindows
```

### 1) Start backend

```powershell
powershell -ExecutionPolicy Bypass -File backend/run_backend.ps1
```

### 2) Start frontend (new terminal)

```powershell
python -m http.server 4173
```

Open:

- `http://127.0.0.1:4173/frontend/index.html`

## Notes

- Backend reads datasets from `frontend/data`.
- Advanced analytics panel calls backend at `http://127.0.0.1:5050` by default.
