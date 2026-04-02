import { getState } from '../store/state.js';
import { createRafBatcher, rafThrottle, escapeHtml } from '../utils/fp.js';
import { formatCurrency, formatNumber, formatCompactRevenue } from '../utils/formatters.js';
import { fetchAdvancedOverview, getBackendBaseUrl } from '../services/backendApi.js';

let currentChartYear = 2026;
let hoveredBar = null;
let chartInteractivityBound = false;

const completedFeeStatuses = new Set(['Đã thanh toán', 'Đã thu']);
const scheduleDashboardRender = createRafBatcher();
const advancedMetricsTtlMs = 45000;

let advancedMetricsCache = null;
let advancedMetricsCachedAt = 0;
let advancedMetricsInFlight = null;

// ── Derived Stats from Real Data ──
const deriveDashboardStats = (state) => {
    const { students, rooms, fees, violations, contracts } = state;

    const totalStudents = students.length;
    const activeStudents = students.filter((s) => s.status === 'Đang ở').length;
    const availableRooms = rooms.filter((r) => r.occupied < r.capacity && r.status !== 'Đang bảo trì').length;
    const totalRooms = rooms.length;
    const totalOccupied = rooms.reduce((s, r) => s + (r.occupied || 0), 0);
    const totalCapacity = rooms.reduce((s, r) => s + (r.capacity || 0), 0);

    const paidFees = fees.filter((f) => completedFeeStatuses.has(f.status));
    const unpaidFees = fees.filter((f) => !completedFeeStatuses.has(f.status));
    const totalRevenue = paidFees.reduce((s, f) => s + (f.amount || 0), 0);
    const totalUnpaid = unpaidFees.reduce((s, f) => s + (f.amount || 0), 0);

    const maintenanceRooms = rooms.filter((r) => r.status === 'Đang bảo trì').length;
    const occupancyRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

    const unresolvedViolations = violations.filter((v) => v.status !== 'Đã giải quyết').length;
    const activeContracts = contracts.filter((c) => c.status === 'Hiệu lực').length;
    const expiringContracts = contracts.filter((c) => c.status === 'Sắp hết hạn').length;

    return {
        totalStudents, activeStudents,
        availableRooms, totalRooms, totalOccupied, totalCapacity,
        totalRevenue, totalUnpaid,
        maintenanceRooms, occupancyRate,
        unresolvedViolations, activeContracts, expiringContracts,
        // Donut segments
        occupiedRooms: totalRooms - availableRooms - maintenanceRooms,
    };
};

// ── Revenue Chart: Real data from fees grouped by month ──
const getMonthlyRevenueData = (fees, year) => {
    const months = Array.from({ length: 12 }, () => 0);

    fees.forEach((fee) => {
        if (!completedFeeStatuses.has(fee.status)) return;
        if (!fee.month) return;

        // Parse month format: "MM/YYYY" or "M/YYYY"
        const parts = fee.month.split('/');
        if (parts.length !== 2) return;

        const feeMonth = parseInt(parts[0], 10);
        const feeYear = parseInt(parts[1], 10);

        if (feeYear === year && feeMonth >= 1 && feeMonth <= 12) {
            months[feeMonth - 1] += fee.amount || 0;
        }
    });

    return months;
};

const getChartCeiling = (values) => {
    const maxValue = Math.max(...values);
    if (maxValue === 0) return 10000000; // Default 10M if no data
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
    return Math.ceil(maxValue / magnitude) * magnitude;
};

const formatChartLabel = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(0)}Tr`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return String(value);
};

// ── Recent Transactions (from real fees data) ──
const renderRecentTransactions = (fees, students) => {
    const container = document.getElementById('recent-transactions-list');
    if (!container) return;

    // Get latest 5 fees
    const recentFees = [...fees]
        .sort((a, b) => {
            // Sort by month descending
            const parseMonth = (m) => {
                if (!m) return 0;
                const [month, year] = m.split('/').map(Number);
                return (year || 0) * 100 + (month || 0);
            };
            return parseMonth(b.month) - parseMonth(a.month);
        })
        .slice(0, 5);

    if (recentFees.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center text-slate-400">
                <span class="material-symbols-outlined text-4xl mb-2 block text-slate-300">receipt_long</span>
                <p class="text-[13px] font-medium">Chưa có giao dịch nào</p>
            </div>`;
        return;
    }

    container.innerHTML = recentFees.map((fee) => {
        const isPaid = completedFeeStatuses.has(fee.status);
        const amountText = isPaid
            ? `<span class="text-[14px] font-black text-[#53795d] tracking-tight">+ ${formatCompactRevenue(fee.amount)}</span>`
            : `<span class="text-[14px] font-black text-amber-600 tracking-tight">${formatCompactRevenue(fee.amount)}</span>`;

        const statusDot = isPaid
            ? '<span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>'
            : '<span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>';

        const initial = fee.room ? String(fee.room).charAt(0) : 'P';

        return `
        <div class="flex items-center justify-between group py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors px-2 -mx-2 rounded-xl">
            <div class="flex items-center gap-3.5">
                <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm shrink-0">${escapeHtml(initial)}</div>
                <div>
                    <h4 class="text-[13px] font-bold text-slate-800 leading-tight flex items-center gap-2">
                        ${statusDot}
                        ${escapeHtml(fee.type)} - P.${escapeHtml(String(fee.room))}
                    </h4>
                    <p class="text-[11px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">${escapeHtml(fee.month || '')} | ${escapeHtml(fee.status)}</p>
                </div>
            </div>
            ${amountText}
        </div>`;
    }).join('');
};

// ── Dynamic Donut Chart ──
const CIRCUMFERENCE = 2 * Math.PI * 38; // ~238.76

const renderDonutChart = (stats) => {
    const donutContainer = document.getElementById('donut-chart-svg');
    const legendContainer = document.getElementById('donut-legend');
    const pieTotal = document.getElementById('pie-total');
    if (!donutContainer) return;

    const total = stats.totalRooms || 1;
    const segments = [
        { label: 'Đang ở', value: stats.occupiedRooms, color: '#98bda4' },
        { label: 'Còn trống', value: stats.availableRooms, color: '#ebdaba' },
        { label: 'Bảo trì', value: stats.maintenanceRooms, color: '#c4e1e1' },
        { label: 'Nợ phí', value: Math.max(0, total - stats.occupiedRooms - stats.availableRooms - stats.maintenanceRooms), color: '#b1b4cb' }
    ].filter((s) => s.value > 0);

    if (pieTotal) pieTotal.textContent = stats.totalRooms;

    // Build SVG circles
    let offset = 0;
    const gapSize = segments.length > 1 ? 3 : 0;

    const segmentCircles = segments.map((seg) => {
        const pct = seg.value / total;
        const dashLength = pct * CIRCUMFERENCE - gapSize;
        const dashArray = `${Math.max(0, dashLength)} ${CIRCUMFERENCE}`;
        const dashOffset = -offset;
        offset += pct * CIRCUMFERENCE;

        return `<circle cx="50" cy="50" r="38" fill="transparent" stroke="${seg.color}" stroke-width="22" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" class="donut-segment cursor-pointer transition-all duration-500"></circle>`;
    }).join('');

    // Gap circles (white separators)
    let gapOffset = 0;
    const gapCircles = segments.map((seg) => {
        const pct = seg.value / total;
        const result = `<circle cx="50" cy="50" r="38" fill="transparent" stroke="var(--color-surface, white)" stroke-width="24" stroke-dasharray="${gapSize} ${CIRCUMFERENCE - gapSize}" stroke-dashoffset="${-gapOffset}"></circle>`;
        gapOffset += pct * CIRCUMFERENCE;
        return result;
    }).join('');

    donutContainer.innerHTML = `
        <circle cx="50" cy="50" r="38" fill="transparent" stroke="var(--color-border, #f1f5f9)" stroke-width="22"></circle>
        ${segmentCircles}
        ${gapCircles}
    `;

    // Legend
    if (legendContainer) {
        legendContainer.innerHTML = segments.map((seg) => `
            <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${seg.color}"></span>
                <span class="text-[11px] font-bold text-slate-500 uppercase tracking-widest truncate">${escapeHtml(seg.label)} (${seg.value})</span>
            </div>
        `).join('');
    }
};

// ── Violations/Maintenance Summary ──
const renderViolationsSummary = (violations) => {
    const container = document.getElementById('violations-summary-list');
    if (!container) return;

    const recent = [...violations]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 4);

    if (recent.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center text-slate-400">
                <span class="material-symbols-outlined text-4xl mb-2 block text-slate-300">verified</span>
                <p class="text-[13px] font-medium">Không có vi phạm nào cần xử lý</p>
            </div>`;
        return;
    }

    container.innerHTML = recent.map((v) => {
        const statusColors = {
            'Chưa xử lý': 'bg-rose-100 text-rose-600',
            'Đang xử lý': 'bg-amber-100 text-amber-600',
            'Đã giải quyết': 'bg-green-100 text-green-600'
        };
        const badgeClass = statusColors[v.status] || statusColors['Chưa xử lý'];
        const initial = v.studentName ? v.studentName.charAt(0) : '?';

        return `
        <div class="flex items-center justify-between group py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors px-2 -mx-2 rounded-xl">
            <div class="flex items-center gap-3.5">
                <div class="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center font-bold text-sm shrink-0">
                    <span class="material-symbols-outlined text-[1.1rem]">warning</span>
                </div>
                <div>
                    <h4 class="text-[13px] font-bold text-slate-800 leading-tight">${escapeHtml(v.reason)}</h4>
                    <p class="text-[11px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">P.${escapeHtml(String(v.room))} | ${escapeHtml(v.studentName)} | ${escapeHtml(v.date)}</p>
                </div>
            </div>
            <span class="px-2 py-1 text-[10px] font-bold rounded-lg ${badgeClass} whitespace-nowrap">${escapeHtml(v.status)}</span>
        </div>`;
    }).join('');
};

// ── Advanced Analytics Panel (Python API + C++ Engine) ──
const setAdvancedStatus = (message, tone = 'muted') => {
    const statusEl = document.getElementById('advanced-analytics-status');
    if (!statusEl) return;

    const colorMap = {
        ok: 'text-emerald-600',
        warn: 'text-amber-600',
        error: 'text-rose-600',
        muted: 'text-slate-400'
    };

    statusEl.className = `text-[12px] font-semibold mb-4 ${colorMap[tone] || colorMap.muted}`;
    statusEl.textContent = message;
};

const renderAdvancedCards = (payload) => {
    const grid = document.getElementById('advanced-analytics-grid');
    if (!grid) return;

    const metrics = payload.metrics || {};
    const engine = String(payload.engine || metrics.engine || 'python').toUpperCase();
    const generatedAt = metrics.generated_at || '';
    const timeText = generatedAt
        ? new Date(generatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : '--:--';

    const cards = [
        {
            label: 'Bảo trì đang mở',
            value: formatNumber(metrics.pending_maintenance || 0),
            hint: `Phòng bảo trì: ${formatNumber(metrics.maintenance_rooms || 0)}`,
            icon: 'construction',
            tone: 'text-amber-700',
            bg: 'bg-amber-50'
        },
        {
            label: 'Đúng giờ 7 ngày',
            value: `${Number(metrics.attendance_on_time_rate_7d || 0).toFixed(1)}%`,
            hint: `${formatNumber(metrics.attendance_ontime_7d || 0)} / ${formatNumber(metrics.attendance_events_7d || 0)} lượt`,
            icon: 'schedule',
            tone: 'text-blue-700',
            bg: 'bg-blue-50'
        },
        {
            label: 'Cảnh báo quá tải',
            value: formatNumber(metrics.overcrowded_rooms || 0),
            hint: `Risk score: ${formatNumber(metrics.occupancy_risk_score || 0)} / 100`,
            icon: 'warning',
            tone: 'text-rose-700',
            bg: 'bg-rose-50'
        },
        {
            label: 'Nợ phí hiện tại',
            value: formatNumber(metrics.unpaid_invoice_count || 0),
            hint: formatCurrency(metrics.total_unpaid || 0),
            icon: 'payments',
            tone: 'text-slate-700',
            bg: 'bg-slate-50'
        }
    ];

    grid.innerHTML = cards.map((card) => `
        <div class="${card.bg} rounded-xl p-4 border border-slate-100">
            <div class="flex items-center justify-between">
                <span class="text-[11px] uppercase tracking-wider font-bold text-slate-500">${escapeHtml(card.label)}</span>
                <span class="material-symbols-outlined text-[1.1rem] ${card.tone}">${card.icon}</span>
            </div>
            <p class="mt-2 text-[1.5rem] leading-none font-black ${card.tone}">${escapeHtml(String(card.value))}</p>
            <p class="mt-2 text-[11px] font-semibold text-slate-500">${escapeHtml(card.hint)}</p>
        </div>
    `).join('');

    const tone = engine === 'CPP' ? 'ok' : 'warn';
    setAdvancedStatus(`Đồng bộ lúc ${timeText} • Engine: ${engine}`, tone);
};

const buildLocalFallbackOverview = () => {
    const state = getState();
    const stats = deriveDashboardStats(state);
    const rooms = state.rooms || [];
    const unpaidInvoiceCount = (state.fees || []).filter((fee) => !completedFeeStatuses.has(fee.status)).length;
    const overcrowdedRooms = rooms.filter((room) =>
        (Number(room.occupied) || 0) > (Number(room.capacity) || 0) && (Number(room.capacity) || 0) > 0
    ).length;

    const occupancyRiskScore = Math.round(Math.min(
        100,
        stats.occupancyRate * 0.55 +
        stats.unresolvedViolations * 1.8 +
        unpaidInvoiceCount * 0.8
    ));

    return {
        ok: true,
        engine: 'browser-local',
        metrics: {
            pending_maintenance: 0,
            maintenance_rooms: stats.maintenanceRooms,
            attendance_on_time_rate_7d: 0,
            attendance_ontime_7d: 0,
            attendance_events_7d: 0,
            overcrowded_rooms: overcrowdedRooms,
            occupancy_risk_score: occupancyRiskScore,
            unpaid_invoice_count: unpaidInvoiceCount,
            total_unpaid: stats.totalUnpaid,
            generated_at: new Date().toISOString()
        }
    };
};

const renderAdvancedUnavailable = (error) => {
    const fallbackPayload = buildLocalFallbackOverview();
    renderAdvancedCards(fallbackPayload);
    const reason = error?.message ? ` (${error.message})` : '';
    setAdvancedStatus(`Backend chưa kết nối, đang dùng dữ liệu local${reason} • URL: ${getBackendBaseUrl()}`, 'warn');
};

async function loadAdvancedAnalytics(force = false) {
    const grid = document.getElementById('advanced-analytics-grid');
    if (!grid) return;

    const now = Date.now();
    if (!force && advancedMetricsCache && now - advancedMetricsCachedAt < advancedMetricsTtlMs) {
        renderAdvancedCards(advancedMetricsCache);
        return;
    }

    if (advancedMetricsInFlight) return;

    setAdvancedStatus('Đang đồng bộ dữ liệu từ backend...', 'muted');
    advancedMetricsInFlight = fetchAdvancedOverview({ timeoutMs: 3200, preferCpp: true })
        .then((payload) => {
            advancedMetricsCache = payload;
            advancedMetricsCachedAt = Date.now();
            renderAdvancedCards(payload);
        })
        .catch((error) => {
            renderAdvancedUnavailable(error);
        })
        .finally(() => {
            advancedMetricsInFlight = null;
        });
}

function bindAdvancedAnalyticsActions() {
    const refreshBtn = document.getElementById('advanced-refresh-btn');
    if (!refreshBtn || refreshBtn.dataset.bound === '1') return;

    refreshBtn.dataset.bound = '1';
    refreshBtn.addEventListener('click', () => loadAdvancedAnalytics(true));
}

// ── Main Render ──
function renderDashboard() {
    const state = getState();
    const stats = deriveDashboardStats(state);

    // Stats Cards
    const eleStudents = document.getElementById('stat-students');
    if (eleStudents) eleStudents.textContent = formatNumber(stats.totalStudents);

    const eleActive = document.getElementById('stat-active-students');
    if (eleActive) eleActive.textContent = `Đang ở: ${stats.activeStudents}`;

    const eleRooms = document.getElementById('stat-rooms');
    if (eleRooms) eleRooms.textContent = formatNumber(stats.availableRooms);

    const eleRoomsTotal = document.getElementById('stat-rooms-total');
    if (eleRoomsTotal) eleRoomsTotal.textContent = `Tổng: ${stats.totalRooms} phòng`;

    const eleFees = document.getElementById('stat-fees');
    if (eleFees) eleFees.textContent = formatCompactRevenue(stats.totalRevenue);

    const eleUnpaid = document.getElementById('stat-unpaid');
    if (eleUnpaid) eleUnpaid.textContent = `Chưa thu: ${formatCompactRevenue(stats.totalUnpaid)}`;

    const eleOccupancy = document.getElementById('stat-occupancy-rate');
    if (eleOccupancy) eleOccupancy.textContent = `${stats.occupancyRate}%`;

    const eleContracts = document.getElementById('stat-contracts-info');
    if (eleContracts) eleContracts.textContent = `HĐ: ${stats.activeContracts} hiệu lực, ${stats.expiringContracts} sắp hết`;

    const eleViolations = document.getElementById('stat-violations-count');
    if (eleViolations) eleViolations.textContent = stats.unresolvedViolations;

    // Occupancy bar
    const occBar = document.getElementById('occupancy-bar');
    if (occBar) occBar.style.width = `${stats.occupancyRate}%`;

    // Donut Chart
    renderDonutChart(stats);

    // Revenue Chart
    setupYearDropdown();
    renderRevenueChart(currentChartYear, state.fees);
    setupChartInteractivity();

    // Dynamic Lists
    renderRecentTransactions(state.fees, state.students);
    renderViolationsSummary(state.violations);

    // Advanced backend-powered analytics
    bindAdvancedAnalyticsActions();
    loadAdvancedAnalytics();
}

// ── Year Dropdown ──
function setupYearDropdown() {
    const list = document.getElementById('year-filter-list');
    const popup = document.getElementById('year-filter-popup');
    const btn = document.getElementById('year-filter-btn');
    const textSpan = document.getElementById('year-filter-text');

    if (!list || !popup || !btn || !textSpan || list.children.length > 0) return;

    const buildYearOptionClass = (isCurrent) => [
        'w-full text-left px-4 py-2.5 text-[13px] font-semibold transition-colors year-select-item',
        isCurrent ? 'bg-primary/10 text-primary' : 'text-slate-700 hover:bg-slate-50 hover:text-primary'
    ].join(' ');

    const togglePopup = (show) => {
        popup.classList.toggle('opacity-0', !show);
        popup.classList.toggle('invisible', !show);
        popup.classList.toggle('scale-95', !show);
        popup.classList.toggle('opacity-100', show);
        popup.classList.toggle('visible', show);
        popup.classList.toggle('scale-100', show);
    };

    list.innerHTML = Array.from({ length: 8 }, (_, offset) => 2030 - offset)
        .map((year) => `
            <button class="${buildYearOptionClass(year === currentChartYear)}" data-year="${year}">
                Năm ${year}
            </button>
        `)
        .join('');

    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        togglePopup(popup.classList.contains('invisible'));
    });

    document.addEventListener('click', (event) => {
        if (!popup.contains(event.target) && !btn.contains(event.target)) {
            togglePopup(false);
        }
    });

    list.addEventListener('click', (event) => {
        const item = event.target.closest('.year-select-item');
        if (!item) return;

        const selectedYear = Number(item.dataset.year);
        currentChartYear = selectedYear;
        textSpan.textContent = `Năm ${selectedYear}`;

        list.querySelectorAll('.year-select-item').forEach((button) => {
            button.className = buildYearOptionClass(Number(button.dataset.year) === selectedYear);
        });

        togglePopup(false);
        renderRevenueChart(selectedYear, getState().fees);
    });
}

// ── Revenue Chart (real fee data) ──
function renderRevenueChart(selectedYear, fees) {
    const barsContainer = document.getElementById('chart-bars');
    const yLabelsContainer = document.getElementById('chart-y-labels');
    if (!barsContainer) return;

    hoveredBar = null;
    hideTooltip();

    const monthlyData = getMonthlyRevenueData(fees || getState().fees, selectedYear);
    const ceilMax = getChartCeiling(monthlyData);
    const hasData = monthlyData.some((v) => v > 0);

    if (yLabelsContainer) {
        yLabelsContainer.innerHTML = [ceilMax, ceilMax * 0.75, ceilMax * 0.5, 0]
            .map((value) => `<span>${value === 0 ? '0' : formatChartLabel(value)}</span>`)
            .join('');
    }

    if (!hasData) {
        barsContainer.innerHTML = `
            <div class="absolute inset-0 flex items-center justify-center text-slate-400">
                <div class="text-center">
                    <span class="material-symbols-outlined text-3xl mb-2 block text-slate-300">bar_chart</span>
                    <p class="text-[12px] font-medium">Chưa có dữ liệu thanh toán năm ${selectedYear}</p>
                </div>
            </div>`;
        return;
    }

    barsContainer.innerHTML = monthlyData
        .map((value, index) => {
            const heightPct = ceilMax > 0 ? (value / ceilMax) * 100 : 0;
            const month = index + 1;

            return `
                <div class="relative flex-1 flex flex-col items-center justify-end h-full group">
                    <div class="w-full bg-[#e6efeb] rounded-[4px] sm:rounded-t-md cursor-pointer chart-bar-item transition-all duration-300" style="height: ${heightPct}%" data-val="${value}" data-month="${month}" data-year="${selectedYear}" tabindex="0"></div>
                    <span class="absolute -bottom-7 text-[10px] sm:text-[12px] font-bold text-slate-400 group-hover:text-slate-700 transition-colors">T${month}</span>
                </div>
            `;
        })
        .join('');
}

// ── Chart Interactivity ──
function setupChartInteractivity() {
    if (chartInteractivityBound) return;

    const barsContainer = document.getElementById('chart-bars');
    if (!barsContainer) return;

    const handleMove = rafThrottle((event) => {
        const bar = event.target.closest('.chart-bar-item');
        if (!bar || !barsContainer.contains(bar)) {
            hideTooltip();
            return;
        }
        showTooltipForBar(bar);
    });

    barsContainer.addEventListener('pointermove', handleMove);
    barsContainer.addEventListener('pointerleave', hideTooltip);
    barsContainer.addEventListener('focusin', (event) => {
        const bar = event.target.closest('.chart-bar-item');
        if (bar) showTooltipForBar(bar);
    });
    barsContainer.addEventListener('focusout', hideTooltip);

    chartInteractivityBound = true;
}

function showTooltipForBar(bar) {
    const tooltip = document.getElementById('chart-tooltip');
    const tooltipValue = document.getElementById('tooltip-value');
    const tooltipLabel = document.getElementById('tooltip-label');
    const chartContainer = document.getElementById('revenue-chart-container');
    if (!tooltip || !tooltipValue || !tooltipLabel || !chartContainer) return;

    const value = Number(bar.dataset.val || 0);
    const month = bar.dataset.month || '1';
    const year = bar.dataset.year || currentChartYear;

    tooltipValue.textContent = formatCurrency(value);
    tooltipLabel.textContent = `THÁNG ${month}, ${year}`;

    const rect = bar.getBoundingClientRect();
    const containerRect = chartContainer.getBoundingClientRect();
    tooltip.style.left = `${rect.left - containerRect.left + (rect.width / 2)}px`;
    tooltip.style.bottom = `${rect.height + 40}px`;

    if (hoveredBar && hoveredBar !== bar) {
        hoveredBar.classList.remove('is-active', 'bar-striped');
    }
    hoveredBar = bar;
    hoveredBar.classList.add('is-active', 'bar-striped');

    tooltip.classList.remove('opacity-0');
    tooltip.classList.add('opacity-100');
}

function hideTooltip() {
    const tooltip = document.getElementById('chart-tooltip');
    if (hoveredBar) {
        hoveredBar.classList.remove('is-active', 'bar-striped');
        hoveredBar = null;
    }
    if (tooltip) {
        tooltip.classList.remove('opacity-100');
        tooltip.classList.add('opacity-0');
    }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    scheduleDashboardRender(renderDashboard);
    window.addEventListener('stateChanged', () => scheduleDashboardRender(renderDashboard));
});
