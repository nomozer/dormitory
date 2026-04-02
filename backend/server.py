from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from analytics import compute_overview, is_cpp_available
from config import (
    ALLOW_LOCAL_DEV_ORIGIN_PREFIXES,
    ALLOWED_ORIGINS,
    LOCAL_DEV_ORIGIN_PREFIXES,
    ALLOW_NON_LOCALHOST,
    API_KEY,
    DEFAULT_DATASET_LIMIT,
    HOST,
    MAX_DATASET_LIMIT,
    MAX_JSON_BODY_BYTES,
    PORT,
)
from runtime_env import cleanup_runtime_tmp, configure_temp_env, quarantine_legacy_temp_dirs
from storage import append_row, list_datasets, read_rows


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "DormBackend"
    sys_version = ""

    def version_string(self) -> str:
        return self.server_version

    def log_message(self, fmt: str, *args) -> None:
        # Keep logs concise and avoid leaking User-Agent or sensitive details.
        print("%s - %s" % (self.log_date_time_string(), fmt % args))

    def _is_origin_allowed(self, origin: str | None) -> bool:
        if not origin:
            return False
        if origin in ALLOWED_ORIGINS:
            return True
        if ALLOW_LOCAL_DEV_ORIGIN_PREFIXES:
            return any(origin.startswith(prefix) for prefix in LOCAL_DEV_ORIGIN_PREFIXES)
        return False

    def _set_headers(self, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")

        origin = self.headers.get("Origin")
        if self._is_origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key")
        self.end_headers()

    def _write_json(self, payload: dict, status: int = 200) -> None:
        self._set_headers(status)
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def _read_json_body(self) -> dict:
        content_type = (self.headers.get("Content-Type") or "").lower()
        if "application/json" not in content_type:
            raise ValueError("Content-Type must be application/json")

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Invalid Content-Length")

        if length <= 0:
            return {}
        if length > MAX_JSON_BODY_BYTES:
            raise ValueError(f"Body too large (max {MAX_JSON_BODY_BYTES} bytes)")

        raw = self.rfile.read(length).decode("utf-8", errors="strict")
        return json.loads(raw) if raw else {}

    def _require_api_key(self) -> bool:
        if not API_KEY:
            return True
        provided = (self.headers.get("X-API-Key") or "").strip()
        return provided == API_KEY

    @staticmethod
    def _extract_dataset_from_get_path(path: str) -> str | None:
        prefix = "/api/datasets/"
        if not path.startswith(prefix):
            return None
        dataset = unquote(path[len(prefix):]).strip().lower()
        if not dataset or "/" in dataset:
            return None
        return dataset

    @staticmethod
    def _extract_dataset_from_append_path(path: str) -> str | None:
        prefix = "/api/datasets/"
        suffix = "/append"
        if not (path.startswith(prefix) and path.endswith(suffix)):
            return None
        dataset = unquote(path[len(prefix):-len(suffix)]).strip().lower()
        if not dataset or "/" in dataset:
            return None
        return dataset

    def do_OPTIONS(self) -> None:
        self._set_headers(204)

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query)

            if path == "/api/health":
                self._write_json(
                    {
                        "ok": True,
                        "service": "dorm-backend",
                        "cpp_available": is_cpp_available(),
                        "datasets": list_datasets(),
                        "security": {
                            "api_key_required_for_write": bool(API_KEY),
                            "allowed_origins": sorted(ALLOWED_ORIGINS),
                            "allowed_origin_prefixes": list(LOCAL_DEV_ORIGIN_PREFIXES),
                            "max_body_bytes": MAX_JSON_BODY_BYTES,
                        },
                    }
                )
                return

            if path == "/api/analytics/overview":
                prefer_cpp = query.get("prefer_cpp", ["1"])[0] not in {"0", "false", "False"}
                data = compute_overview(prefer_cpp=prefer_cpp)
                self._write_json(data)
                return

            if path == "/api/datasets":
                self._write_json({"ok": True, "items": list_datasets()})
                return

            dataset_name = self._extract_dataset_from_get_path(path)
            if dataset_name is not None:
                limit_raw = query.get("limit", [str(DEFAULT_DATASET_LIMIT)])[0]
                try:
                    limit = max(1, min(MAX_DATASET_LIMIT, int(limit_raw)))
                except Exception:
                    limit = DEFAULT_DATASET_LIMIT

                try:
                    rows = read_rows(dataset_name, limit=limit)
                except KeyError:
                    self._write_json({"ok": False, "error": f"Unknown dataset: {dataset_name}"}, status=404)
                    return

                self._write_json({"ok": True, "dataset": dataset_name, "rows": rows})
                return

            self._write_json({"ok": False, "error": "Not found"}, status=404)
        except Exception:
            self._write_json({"ok": False, "error": "Internal server error"}, status=500)

    def do_POST(self) -> None:
        try:
            if not self._require_api_key():
                self._write_json({"ok": False, "error": "Unauthorized"}, status=401)
                return

            parsed = urlparse(self.path)
            path = parsed.path
            dataset_name = self._extract_dataset_from_append_path(path)
            if dataset_name is None:
                self._write_json({"ok": False, "error": "Not found"}, status=404)
                return

            try:
                body = self._read_json_body()
            except json.JSONDecodeError:
                self._write_json({"ok": False, "error": "Invalid JSON body"}, status=400)
                return
            except ValueError as exc:
                self._write_json({"ok": False, "error": str(exc)}, status=400)
                return

            try:
                row = append_row(dataset_name, body)
            except KeyError:
                self._write_json({"ok": False, "error": f"Unknown dataset: {dataset_name}"}, status=404)
                return
            except FileNotFoundError as exc:
                self._write_json({"ok": False, "error": str(exc)}, status=404)
                return
            except ValueError as exc:
                self._write_json({"ok": False, "error": str(exc)}, status=400)
                return

            self._write_json({"ok": True, "dataset": dataset_name, "row": row}, status=201)
        except Exception:
            self._write_json({"ok": False, "error": "Internal server error"}, status=500)


def run_server() -> None:
    configure_temp_env()
    quarantined = quarantine_legacy_temp_dirs()
    cleanup = cleanup_runtime_tmp(max_age_hours=24)

    bind_host = HOST if ALLOW_NON_LOCALHOST else "127.0.0.1"
    server = ThreadingHTTPServer((bind_host, PORT), ApiHandler)
    server.daemon_threads = True

    print(f"Dorm backend running at http://{bind_host}:{PORT}")
    if quarantined:
        print(f"Quarantined legacy temp dirs: {', '.join(quarantined)}")
    print(
        "Runtime cleanup: "
        f"removed_files={cleanup['removed_files']} "
        f"removed_dirs={cleanup['removed_dirs']} "
        f"skipped={cleanup['skipped']}"
    )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
