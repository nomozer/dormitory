# Dormitory Management System (Modernized)

Giải pháp quản lý ký túc xá hiệu năng cao, tập trung vào tính module hóa và tối ưu hóa trải nghiệm nhà phát triển.

## Kiến trúc Hệ thống

Dự án được cấu trúc theo tiêu chuẩn công nghiệp, tách biệt rõ ràng giữa logic nghiệp vụ, dữ liệu và giao diện người dùng.

### Backend (`/backend`)
- **Engine**: FastAPI (Python 3.12+) với kiến trúc hướng dịch vụ.
- **Data Layer**: SQLite với các truy vấn SQL-native được tối ưu hóa.
- **Analytics**: Xử lý logic thống kê trực tiếp tại tầng CSDL để đạt hiệu suất tối đa.
- **Workflow**: Quản lý tập trung qua `manage.ps1`.

### Frontend (`/frontend`)
- **Stack**: Vanilla JS (ES6+) kết hợp Tailwind CSS cho giao diện hiện đại.
- **Core Engine**: `core.js` hợp nhất state management và API communication.

---

## Khởi chạy Hệ thống

Sử dụng script điều phối để khởi động đồng bộ cả Backend và Frontend:

```powershell
# Chạy toàn bộ hệ thống + tự động mở trình duyệt
powershell -ExecutionPolicy Bypass -File .\dev.ps1 -OpenBrowser
```

---

## Quản lý Backend (`/backend`)

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
- **API Documentation**: Swagger UI được tích hợp sẵn tại endpoint `/docs` (mặc định: `http://localhost:5050/docs`). URL cụ thể sẽ được hiển thị trong terminal sau khi khởi chạy.
- **Performance**: Xử lý Dashboard Analytics trực tiếp bằng SQL Aggregates trên SQLite, tối ưu hóa tốc độ và giảm thiểu I/O dư thừa.
- **Security**: Cấu hình CORS linh hoạt, mặc định hỗ trợ môi trường phát triển localhost.
