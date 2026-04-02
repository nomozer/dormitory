#include <algorithm>
#include <cmath>
#include <cstdint>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

using Row = std::unordered_map<std::string, std::string>;

std::string trim(const std::string& input) {
    std::size_t start = 0;
    while (start < input.size() && std::isspace(static_cast<unsigned char>(input[start])) != 0) {
        ++start;
    }

    std::size_t end = input.size();
    while (end > start && std::isspace(static_cast<unsigned char>(input[end - 1])) != 0) {
        --end;
    }

    return input.substr(start, end - start);
}

std::vector<std::string> parseCsvLine(const std::string& line) {
    std::vector<std::string> columns;
    std::string current;
    bool inQuotes = false;

    for (std::size_t i = 0; i < line.size(); ++i) {
        const char c = line[i];

        if (c == '"') {
            if (inQuotes && i + 1 < line.size() && line[i + 1] == '"') {
                current.push_back('"');
                ++i;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (c == ',' && !inQuotes) {
            columns.push_back(trim(current));
            current.clear();
        } else {
            current.push_back(c);
        }
    }

    columns.push_back(trim(current));
    return columns;
}

std::vector<Row> readCsvFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        return {};
    }

    std::string headerLine;
    if (!std::getline(file, headerLine)) {
        return {};
    }

    if (!headerLine.empty() && static_cast<unsigned char>(headerLine[0]) == 0xEF) {
        // Strip UTF-8 BOM if present.
        if (headerLine.size() >= 3 &&
            static_cast<unsigned char>(headerLine[1]) == 0xBB &&
            static_cast<unsigned char>(headerLine[2]) == 0xBF) {
            headerLine = headerLine.substr(3);
        }
    }

    const std::vector<std::string> headers = parseCsvLine(headerLine);
    std::vector<Row> rows;

    std::string line;
    while (std::getline(file, line)) {
        if (trim(line).empty()) {
            continue;
        }

        const std::vector<std::string> values = parseCsvLine(line);
        Row row;
        for (std::size_t i = 0; i < headers.size(); ++i) {
            row[headers[i]] = i < values.size() ? values[i] : "";
        }
        rows.push_back(std::move(row));
    }

    return rows;
}

int toInt(const std::string& value, int fallback = 0) {
    try {
        if (value.empty()) return fallback;
        std::size_t pos = 0;
        const int result = std::stoi(value, &pos, 10);
        if (pos == 0) return fallback;
        return result;
    } catch (...) {
        return fallback;
    }
}

std::string lowerAscii(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return value;
}

bool startsWithDateIso(const std::string& value) {
    if (value.size() < 10) return false;
    for (int i = 0; i < 10; ++i) {
        const char c = value[i];
        if ((i == 4 || i == 7) && c != '-') return false;
        if (i != 4 && i != 7 && !std::isdigit(static_cast<unsigned char>(c))) return false;
    }
    return true;
}

bool parseIsoDate(const std::string& value, std::tm& outTm) {
    if (!startsWithDateIso(value)) {
        return false;
    }

    std::tm tmDate = {};
    tmDate.tm_year = toInt(value.substr(0, 4), 1970) - 1900;
    tmDate.tm_mon = toInt(value.substr(5, 2), 1) - 1;
    tmDate.tm_mday = toInt(value.substr(8, 2), 1);
    tmDate.tm_hour = 0;
    tmDate.tm_min = 0;
    tmDate.tm_sec = 0;
    tmDate.tm_isdst = -1;

    outTm = tmDate;
    return true;
}

int daysUntil(const std::string& isoDate) {
    std::tm target = {};
    if (!parseIsoDate(isoDate, target)) {
        return 1'000'000;
    }

    const std::time_t targetTime = std::mktime(&target);
    const std::time_t now = std::time(nullptr);
    const double diffSeconds = std::difftime(targetTime, now);
    return static_cast<int>(std::ceil(diffSeconds / 86400.0));
}

int daysAgo(const std::string& isoDateOrDateTime) {
    std::tm dateValue = {};
    if (!parseIsoDate(isoDateOrDateTime.substr(0, 10), dateValue)) {
        return 1'000'000;
    }

    const std::time_t eventTime = std::mktime(&dateValue);
    const std::time_t now = std::time(nullptr);
    const double diffSeconds = std::difftime(now, eventTime);
    return static_cast<int>(std::floor(diffSeconds / 86400.0));
}

bool isPaidStatus(const std::string& status) {
    return status == "Đã thanh toán" || status == "Đã thu";
}

bool isMaintenancePending(const std::string& status) {
    return status == "Mới" || status == "Đang xử lý" ||
           status == "Open" || status == "In Progress";
}

bool isAttendanceOnTime(const std::string& status) {
    const std::string normalized = lowerAscii(trim(status));
    return normalized == "ontime" || normalized == "on_time" || normalized == "đúng giờ";
}

std::string getOrEmpty(const Row& row, const std::string& key) {
    auto it = row.find(key);
    if (it == row.end()) return "";
    return it->second;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 6) {
        std::cerr << "Usage: analytics_engine <rooms.csv> <students.csv> <fees.csv> "
                     "<violations.csv> <contracts.csv> [maintenance_requests.csv] "
                     "[attendance_logs.csv]\n";
        return 1;
    }

    const std::vector<Row> rooms = readCsvFile(argv[1]);
    const std::vector<Row> students = readCsvFile(argv[2]);
    const std::vector<Row> fees = readCsvFile(argv[3]);
    const std::vector<Row> violations = readCsvFile(argv[4]);
    const std::vector<Row> contracts = readCsvFile(argv[5]);
    const std::vector<Row> maintenance = argc >= 7 ? readCsvFile(argv[6]) : std::vector<Row>{};
    const std::vector<Row> attendance = argc >= 8 ? readCsvFile(argv[7]) : std::vector<Row>{};

    int totalRooms = static_cast<int>(rooms.size());
    int totalCapacity = 0;
    int totalOccupied = 0;
    int availableRooms = 0;
    int maintenanceRooms = 0;
    int overcrowdedRooms = 0;

    for (const auto& room : rooms) {
        const int capacity = toInt(getOrEmpty(room, "capacity"), 0);
        const int occupied = toInt(getOrEmpty(room, "occupied"), 0);
        const std::string status = getOrEmpty(room, "status");

        totalCapacity += capacity;
        totalOccupied += occupied;

        if (status == "Đang bảo trì") {
            ++maintenanceRooms;
        }
        if (occupied > capacity && capacity > 0) {
            ++overcrowdedRooms;
        }
        if (status != "Đang bảo trì" && occupied < capacity) {
            ++availableRooms;
        }
    }

    std::int64_t totalRevenue = 0;
    std::int64_t totalUnpaid = 0;
    int unpaidInvoices = 0;
    for (const auto& fee : fees) {
        const int amount = toInt(getOrEmpty(fee, "amount"), 0);
        const std::string status = getOrEmpty(fee, "status");
        if (isPaidStatus(status)) {
            totalRevenue += amount;
        } else {
            totalUnpaid += amount;
            ++unpaidInvoices;
        }
    }

    int unresolvedViolations = 0;
    for (const auto& violation : violations) {
        const std::string status = getOrEmpty(violation, "status");
        if (status != "Đã giải quyết") {
            ++unresolvedViolations;
        }
    }

    int activeContracts = 0;
    int expiringContracts = 0;
    for (const auto& contract : contracts) {
        const std::string status = getOrEmpty(contract, "status");
        if (status == "Hiệu lực") {
            ++activeContracts;
        }

        int daysLeft = daysUntil(getOrEmpty(contract, "endDate"));
        if (status == "Sắp hết hạn" || (status == "Hiệu lực" && daysLeft >= 0 && daysLeft <= 30)) {
            ++expiringContracts;
        }
    }

    int pendingMaintenance = 0;
    for (const auto& request : maintenance) {
        if (isMaintenancePending(getOrEmpty(request, "status"))) {
            ++pendingMaintenance;
        }
    }

    int attendanceEvents7d = 0;
    int attendanceOnTime7d = 0;
    for (const auto& log : attendance) {
        const int diff = daysAgo(getOrEmpty(log, "eventTime"));
        if (diff >= 0 && diff <= 6) {
            ++attendanceEvents7d;
            if (isAttendanceOnTime(getOrEmpty(log, "status"))) {
                ++attendanceOnTime7d;
            }
        }
    }

    const double occupancyRate = totalCapacity > 0
        ? (static_cast<double>(totalOccupied) / static_cast<double>(totalCapacity)) * 100.0
        : 0.0;

    const double attendanceOnTimeRate7d = attendanceEvents7d > 0
        ? (static_cast<double>(attendanceOnTime7d) / static_cast<double>(attendanceEvents7d)) * 100.0
        : 100.0;

    const int occupancyRiskScore = static_cast<int>(std::round(std::min(
        100.0,
        occupancyRate * 0.55 +
        static_cast<double>(unresolvedViolations) * 1.8 +
        static_cast<double>(pendingMaintenance) * 2.5 +
        static_cast<double>(unpaidInvoices) * 0.8
    )));

    std::cout << "engine=cpp\n";
    std::cout << "total_rooms=" << totalRooms << "\n";
    std::cout << "available_rooms=" << availableRooms << "\n";
    std::cout << "maintenance_rooms=" << maintenanceRooms << "\n";
    std::cout << "overcrowded_rooms=" << overcrowdedRooms << "\n";
    std::cout << "total_capacity=" << totalCapacity << "\n";
    std::cout << "total_occupied=" << totalOccupied << "\n";
    std::cout << "total_revenue=" << totalRevenue << "\n";
    std::cout << "total_unpaid=" << totalUnpaid << "\n";
    std::cout << "unpaid_invoice_count=" << unpaidInvoices << "\n";
    std::cout << "unresolved_violations=" << unresolvedViolations << "\n";
    std::cout << "active_contracts=" << activeContracts << "\n";
    std::cout << "expiring_contracts=" << expiringContracts << "\n";
    std::cout << "pending_maintenance=" << pendingMaintenance << "\n";
    std::cout << "attendance_events_7d=" << attendanceEvents7d << "\n";
    std::cout << "attendance_ontime_7d=" << attendanceOnTime7d << "\n";
    std::cout << "occupancy_risk_score=" << occupancyRiskScore << "\n";
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "occupancy_rate=" << occupancyRate << "\n";
    std::cout << "attendance_on_time_rate_7d=" << attendanceOnTimeRate7d << "\n";

    return 0;
}
