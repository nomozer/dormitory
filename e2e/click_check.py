from __future__ import annotations

import json
import sys
from dataclasses import dataclass, asdict
from typing import Callable

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:4173"


@dataclass
class StepResult:
    name: str
    ok: bool
    detail: str = ""


def run_step(name: str, fn: Callable[[], None], out: list[StepResult]) -> None:
    try:
        fn()
        out.append(StepResult(name=name, ok=True))
    except Exception as exc:  # noqa: BLE001
        out.append(StepResult(name=name, ok=False, detail=str(exc)))


def main() -> int:
    step_results: list[StepResult] = []
    page_errors: list[str] = []
    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        page.on("pageerror", lambda exc: page_errors.append(str(exc)))
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text)
            if msg.type == "error"
            else None,
        )

        def goto(path: str, selector: str) -> None:
            last_exc: Exception | None = None
            for attempt in range(5):
                try:
                    page.goto(
                        f"{BASE_URL}{path}",
                        wait_until="domcontentloaded",
                        timeout=20000,
                    )
                    page.wait_for_selector(selector, state="attached", timeout=15000)
                    return
                except Exception as exc:  # noqa: BLE001
                    last_exc = exc
                    msg = str(exc)
                    is_retryable = (
                        "ERR_NETWORK_ACCESS_DENIED" in msg
                        or "interrupted by another navigation" in msg
                    )
                    if is_retryable:
                        page.wait_for_timeout(600)
                        continue
                    raise
            if last_exc:
                raise last_exc

        # 1) login
        def step_login() -> None:
            goto("/login.html", "#login-form")
            page.fill("#username", "admin")
            page.fill("#password", "123456")
            page.click("#login-form button[type='submit']")
            page.wait_for_url(
                "**/index.html", timeout=12000, wait_until="domcontentloaded"
            )
            page.wait_for_selector("#stat-students", timeout=15000)

        run_step("login", step_login, step_results)

        # 2) dashboard
        def step_dashboard() -> None:
            page.wait_for_selector("#year-filter-btn", timeout=12000)
            page.click("#year-filter-btn")
            page.wait_for_timeout(250)
            year_items = page.locator("#year-filter-list .year-select-item")
            if year_items.count() > 0:
                year_items.first.click()
            page.wait_for_selector("#recent-transactions-list", timeout=12000)

        run_step("dashboard", step_dashboard, step_results)

        # 3) students
        def step_students() -> None:
            goto("/students.html", "#search-student-input")
            page.fill("#search-student-input", "SV1001")
            page.select_option("#filter-status", "Đang ở")
            page.select_option("#page-size-select", "10")
            page.fill("#search-student-input", "")
            page.select_option("#filter-status", "")

        run_step("students", step_students, step_results)

        # 4) rooms
        def step_rooms() -> None:
            goto("/rooms.html", "#room-count-label")
            cards = page.locator(".room-card")
            if cards.count() > 0:
                cards.first.click()
                page.wait_for_selector("#room-detail-panel", timeout=12000)
                page.click(".close-detail-btn")

        run_step("rooms", step_rooms, step_results)

        # 5) fees
        def step_fees() -> None:
            goto("/fees.html", "#search-fee-input")
            page.fill("#search-fee-input", "GD")
            page.select_option("#filter-fee-status", "Chưa thanh toán")
            page.select_option("#fee-page-size", "10")
            page.fill("#search-fee-input", "")
            page.select_option("#filter-fee-status", "")

        run_step("fees", step_fees, step_results)

        # 6) contracts
        def step_contracts() -> None:
            goto("/contracts.html", "#search-contract-input")
            page.fill("#search-contract-input", "HD")
            page.select_option("#filter-contract-status", "Hiệu lực")
            page.select_option("#ct-page-size", "10")
            page.fill("#search-contract-input", "")
            page.select_option("#filter-contract-status", "")

        run_step("contracts", step_contracts, step_results)

        # 7) violations
        def step_violations() -> None:
            goto("/violations.html", "#violation-search")
            page.fill("#violation-search", "SV")
            page.select_option("#violation-filter-status", "Chưa xử lý")
            page.select_option("#violation-page-size", "10")
            page.fill("#violation-search", "")
            page.select_option("#violation-filter-status", "")

        run_step("violations", step_violations, step_results)

        # 8) reports
        def step_reports() -> None:
            goto("/reports.html", "#export-excel-btn")
            page.select_option("#export-type-select", "students")
            page.select_option("#export-type-select", "all")

        run_step("reports", step_reports, step_results)

        # 9) settings
        def step_settings() -> None:
            goto("/settings.html", "#profile-form")
            dark_mode = page.locator("#setting-dark-mode")
            dark_mode_toggle = page.locator(
                "#setting-dark-mode"
            ).locator("xpath=ancestor::label[1]")
            dark_mode_toggle.click()
            dark_mode_toggle.click()
            page.wait_for_selector("#system-info-grid", timeout=10000)

        run_step("settings", step_settings, step_results)

        context.close()
        browser.close()

    output = {
        "steps": [asdict(item) for item in step_results],
        "page_errors": page_errors,
        "console_errors": console_errors,
    }
    print(json.dumps(output, ensure_ascii=False))

    all_ok = all(item.ok for item in step_results)
    if not all_ok:
        return 1
    if page_errors:
        return 2
    # Ignore generic network noise in console from optional backend calls.
    significant_console = [
        msg
        for msg in console_errors
        if "ERR_CONNECTION_REFUSED" not in msg
        and "Failed to fetch" not in msg
        and "ERR_NETWORK_ACCESS_DENIED" not in msg
    ]
    return 3 if significant_console else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PlaywrightTimeoutError as exc:
        print(json.dumps({"fatal": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
