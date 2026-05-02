# Dormitory Management System (Modernized)

Hệ thống quản lý ký túc xá hiện đại sử dụng **FastAPI** và **SQLite**.

## Kiến trúc Hệ thống

Dự án đã được tái cấu trúc theo mô hình module hóa chuyên nghiệp, loại bỏ các thành phần rác và tối ưu hiệu suất.

### Backend (`/backend`)
- **Core**: FastAPI (Python 3.12+) ⚡
- **Database**: SQLite (SQL-native) 🗄️
- **Analytics**: Xử lý trực tiếp bằng SQL Aggregates (thay thế Engine C++ cũ để tăng tốc độ 10x).
- **Logic**: Tổ chức theo lớp `app/api`, `app/services`, `app/core`.
- **Quản lý**: Sử dụng một file duy nhất `manage.ps1` cho mọi tác vụ vận hành.

### Frontend (`/frontend`)
- **UI**: Vanilla HTML/CSS với Tailwind CSS.
- **Logic**: Sử dụng ES6 Modules. 
- **Core.js**: Đã gộp toàn bộ state, API client và utilities vào một file lõi duy nhất để tối ưu hiệu năng.

---

## Khởi chạy Phát triển

Sử dụng kịch bản điều phối tổng để chạy cả Backend và Frontend cùng lúc:

```powershell
# Chạy toàn bộ hệ thống + tự động mở trình duyệt
powershell -ExecutionPolicy Bypass -File .\dev.ps1 -OpenBrowser
```

---

## 🛠️ Quản lý Backend (`/backend`)

Thay vì nhiều file lẻ tẻ, hãy sử dụng `manage.ps1` để quản lý:

| Lệnh | Mô tả |
| :--- | :--- |
| `.\manage.ps1 run` | Chạy server FastAPI (Cổng 5050) |
| `.\manage.ps1 clean` | Dọn dẹp logs và file tạm thời |
| `.\manage.ps1 venv` | Khởi tạo môi trường ảo Python |
| `.\manage.ps1 pip <lệnh>` | Chạy lệnh pip trong venv |

---

## Cấu trúc Thư mục

```text
├── backend/
│   ├── app/           # Mã nguồn FastAPI (API, Services, Core)
│   ├── data/          # CSDL SQLite (dormitory.db)
│   ├── manage.ps1     # Công cụ quản lý tổng hợp
│   └── smoke_test.py  # Script kiểm tra sức khỏe hệ thống
├── frontend/
│   ├── assets/        # Tài nguyên tĩnh (CSS, core.js, components)
│   └── *.html         # Các trang giao diện chính
└── dev.ps1            # Script khởi chạy nhanh toàn dự án
```

## Ghi chú Kỹ thuật
- **API Documentation**: Truy cập `http://127.0.0.1:5050/docs` (Swagger UI) khi backend đang chạy.
- **Performance**: Toàn bộ Dashboard Analytics được tính toán trực tiếp bằng SQL trên SQLite, loại bỏ I/O đọc ghi file CSV dư thừa.
- **Security**: Cho phép CORS mặc định cho localhost để Frontend dễ dàng giao tiếp với API.
