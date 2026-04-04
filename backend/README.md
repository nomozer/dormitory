# Dorm Backend (Python + C++)

Backend local cho hệ thống ký túc xá, dùng để:
- Cung cấp API dữ liệu động cho frontend.
- Tính analytics nâng cao bằng Python.
- Tăng tốc phần tính toán bằng C++ engine (nếu đã build).

## Cấu trúc tách lớp

- `backend/`: API, analytics, runtime scripts.
- `frontend/`: HTML/CSS/JS và dataset CSV (`frontend/data`).

## 1) Tạo venv an toàn (không tạo rác temp hệ thống)

```powershell
powershell -ExecutionPolicy Bypass -File backend/create_venv.ps1
```

Script sẽ:
- tạo `backend/.venv` với `--without-pip` để tránh lỗi `ensurepip` trên host bị khóa quyền temp.
- ép `TMP/TEMP` vào `backend/runtime/tmp`.

## Cài package Python chỉ trong `backend/.venv` (không dùng Python global)

```powershell
powershell -ExecutionPolicy Bypass -File backend/pip_venv.ps1 install <ten_goi>
```

Ví dụ:

```powershell
powershell -ExecutionPolicy Bypass -File backend/pip_venv.ps1 install playwright
```

## 2) Chạy backend Python

```powershell
powershell -ExecutionPolicy Bypass -File backend/run_backend.ps1
```

Mặc định API chạy tại `http://127.0.0.1:5050`.

Bạn có thể đổi host/port:

```powershell
$env:DORM_BACKEND_HOST="0.0.0.0"
$env:DORM_BACKEND_PORT="5050"
$env:DORM_BACKEND_ALLOW_NON_LOCALHOST="1"
powershell -ExecutionPolicy Bypass -File backend/run_backend.ps1
```

## 3) Build C++ analytics engine (tùy chọn)

```powershell
powershell -ExecutionPolicy Bypass -File backend/build_cpp.ps1
```

Sau khi build thành công sẽ có file:

`backend/bin/analytics_engine.exe`

Backend tự động dùng C++ engine khi file này tồn tại; nếu lỗi sẽ fallback về Python.

## 4) Dọn runtime và cô lập temp cũ

```powershell
powershell -ExecutionPolicy Bypass -File backend/cleanup_runtime.ps1
```

Script này:
- dọn `backend/runtime/tmp`
- dọn log cũ trong `backend/runtime/logs`
- tự động quarantine thư mục temp legacy (`.tmp_py`, `.tmp_pip`) nếu còn tồn tại

## 5) Bảo mật (khuyến nghị)

Biến môi trường hỗ trợ:

- `DORM_BACKEND_API_KEY`: bật key cho endpoint ghi (`POST /append`)
- `DORM_BACKEND_ALLOWED_ORIGINS`: whitelist CORS, ví dụ:
  `http://127.0.0.1:4173,http://localhost:4173,null`
- `DORM_BACKEND_MAX_BODY_BYTES`: giới hạn payload JSON (mặc định `131072`)
- `DORM_BACKEND_ALLOW_NON_LOCALHOST=1`: chỉ bật khi cần cho LAN

Ví dụ:

```powershell
$env:DORM_BACKEND_API_KEY="your-strong-key"
$env:DORM_BACKEND_ALLOWED_ORIGINS="http://127.0.0.1:4173,http://localhost:4173"
powershell -ExecutionPolicy Bypass -File backend/run_backend.ps1
```

## 6) Smoke test nhanh

```powershell
.\backend\.venv\Scripts\python.exe backend/smoke_test.py
```

Test sẽ kiểm tra:
- backend khởi động được
- API health/analytics hoạt động
- không phát sinh thư mục `.tmp*` mới ở root project

## 7) API chính

- `GET /api/health`
- `GET /api/analytics/overview`
- `GET /api/datasets`
- `GET /api/datasets/{name}?limit=200`
- `POST /api/datasets/{name}/append`

Dataset khả dụng:
- `students`
- `rooms`
- `contracts`
- `fees`
- `violations`
- `maintenance_requests`
- `attendance_logs`
