import { getState } from '../store/state.js';
import { showToast } from '../utils/dom.js';
import { formatCurrency, formatCompactRevenue, formatDate, exportToExcel } from '../utils/formatters.js';
import { escapeHtml } from '../utils/fp.js';

// ── Shared fee status set (consistent across modules) ──
const completedFeeStatuses = new Set(['Đã thanh toán', 'Đã thu']);

// ── KPI Cards ──
const renderKPICards = (state) => {
    const container = document.getElementById('report-kpi-cards');
    if (!container) return;

    const fees = state.fees || [];
    const students = state.students || [];
    const rooms = state.rooms || [];
    const contracts = state.contracts || [];
    const violations = state.violations || [];

    const totalRevenue = fees.filter((f) => completedFeeStatuses.has(f.status)).reduce((s, f) => s + (f.amount || 0), 0);
    const totalCapacity = rooms.reduce((s, r) => s + (r.capacity || 0), 0);
    const totalOccupied = rooms.reduce((s, r) => s + (r.occupied || 0), 0);
    const occRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
    const activeContracts = contracts.filter((c) => c.status === 'Hiệu lực').length;
    const unresolvedViolations = violations.filter((v) => v.status !== 'Đã giải quyết').length;

    const kpis = [
        { icon: 'payments', label: 'Doanh thu đã thu', value: formatCompactRevenue(totalRevenue), sub: formatCurrency(totalRevenue), color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
        { icon: 'groups', label: 'Tỷ lệ lấp đầy', value: `${occRate}%`, sub: `${totalOccupied}/${totalCapacity} chỗ`, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
        { icon: 'description', label: 'HĐ hiệu lực', value: activeContracts, sub: `/ ${contracts.length} tổng`, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
        { icon: 'gavel', label: 'Vi phạm chưa xử lý', value: unresolvedViolations, sub: `/ ${violations.length} tổng`, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' }
    ];

    container.innerHTML = kpis.map((k) => `
        <div class="${k.bg} rounded-xl p-4 border ${k.border} animate-slide-up">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center">
                    <span class="material-symbols-outlined ${k.color}">${k.icon}</span>
                </div>
                <div>
                    <p class="text-[22px] font-black ${k.color}">${k.value}</p>
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${k.label}</p>
                    <p class="text-[11px] font-semibold ${k.color} opacity-60 mt-0.5">${k.sub}</p>
                </div>
            </div>
        </div>
    `).join('');
};

// ── Monthly Revenue Bar Chart (last 6 months) ──
const renderRevenueChart = (state) => {
    const chartEl = document.getElementById('revenue-chart');
    const labelsEl = document.getElementById('revenue-chart-labels');
    if (!chartEl || !labelsEl) return;

    const fees = state.fees || [];

    // Get last 6 months
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    }

    const data = months.map((m) => {
        const paid = fees.filter((f) => f.month === m && completedFeeStatuses.has(f.status)).reduce((s, f) => s + (f.amount || 0), 0);
        const unpaid = fees.filter((f) => f.month === m && !completedFeeStatuses.has(f.status)).reduce((s, f) => s + (f.amount || 0), 0);
        return { month: m, paid, unpaid, total: paid + unpaid };
    });

    const maxVal = Math.max(...data.map((d) => d.total), 1);

    chartEl.innerHTML = data.map((d) => {
        const paidH = Math.max(2, (d.paid / maxVal) * 160);
        const unpaidH = Math.max(0, (d.unpaid / maxVal) * 160);
        return `
        <div class="flex-1 flex flex-col items-center gap-1 group relative">
            <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                Thu: ${formatCompactRevenue(d.paid)} / Nợ: ${formatCompactRevenue(d.unpaid)}
            </div>
            ${d.unpaid > 0 ? `<div class="w-full rounded-t-lg bg-rose-200 transition-all duration-500" style="height:${unpaidH}px"></div>` : ''}
            <div class="w-full ${d.unpaid > 0 ? '' : 'rounded-t-lg'} rounded-b-lg bg-primary transition-all duration-500" style="height:${paidH}px"></div>
        </div>`;
    }).join('');

    labelsEl.innerHTML = data.map((d) => `
        <div class="flex-1 text-center text-[10px] font-bold text-slate-400">${d.month.split('/')[0]}/${d.month.split('/')[1].slice(2)}</div>
    `).join('');
};

// ── Building Occupancy Horizontal Bars ──
const renderBuildingOccupancy = (state) => {
    const container = document.getElementById('building-occupancy-chart');
    if (!container) return;

    const rooms = state.rooms || [];
    const buildings = [...new Set(rooms.map((r) => r.building))].filter(Boolean).sort();

    if (buildings.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Chưa có dữ liệu phòng</p>';
        return;
    }

    container.innerHTML = buildings.map((b) => {
        const bRooms = rooms.filter((r) => r.building === b);
        const cap = bRooms.reduce((s, r) => s + (r.capacity || 0), 0);
        const occ = bRooms.reduce((s, r) => s + (r.occupied || 0), 0);
        const rate = cap > 0 ? Math.round((occ / cap) * 100) : 0;
        const barColor = rate >= 90 ? 'bg-rose-500' : rate >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

        return `
        <div>
            <div class="flex items-center justify-between mb-1.5">
                <span class="text-[12px] font-bold text-slate-700">${escapeHtml(b)}</span>
                <span class="text-[11px] font-bold text-slate-500">${occ}/${cap} — <span class="${rate >= 90 ? 'text-rose-600' : rate >= 70 ? 'text-amber-600' : 'text-emerald-600'}">${rate}%</span></span>
            </div>
            <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full ${barColor} rounded-full transition-all duration-700" style="width:${rate}%"></div>
            </div>
        </div>`;
    }).join('');
};

// ── Contract Status Donut ──
const renderContractDonut = (state) => {
    const chartEl = document.getElementById('contract-donut-chart');
    const legendEl = document.getElementById('contract-donut-legend');
    if (!chartEl || !legendEl) return;

    const contracts = state.contracts || [];
    const groups = [
        { label: 'Hiệu lực', count: contracts.filter((c) => c.status === 'Hiệu lực').length, color: '#10b981' },
        { label: 'Sắp hết hạn', count: contracts.filter((c) => c.status === 'Sắp hết hạn').length, color: '#f59e0b' },
        { label: 'Hết hạn', count: contracts.filter((c) => c.status === 'Hết hạn').length, color: '#f43f5e' }
    ];
    const total = groups.reduce((s, g) => s + g.count, 0) || 1;

    // SVG Donut
    const size = 120;
    const stroke = 20;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    const segments = groups.filter((g) => g.count > 0).map((g) => {
        const pct = g.count / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${g.color}" stroke-width="${stroke}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}" class="donut-segment" />`;
        offset += dash;
        return seg;
    }).join('');

    chartEl.innerHTML = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="${stroke}" />
            ${segments}
            <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" class="text-[20px] font-black fill-slate-700">${total}</text>
        </svg>`;

    legendEl.innerHTML = groups.map((g) => `
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full" style="background:${g.color}"></div>
                <span class="text-[12px] font-medium text-slate-600">${g.label}</span>
            </div>
            <span class="text-[12px] font-bold text-slate-700">${g.count} <span class="text-slate-400 font-normal">(${Math.round((g.count / total) * 100)}%)</span></span>
        </div>
    `).join('');
};

// ── Fee Type Breakdown ──
const renderFeeTypeBreakdown = (state) => {
    const container = document.getElementById('fee-type-breakdown');
    if (!container) return;

    const fees = state.fees || [];
    const typeMap = {};
    fees.forEach((f) => {
        const t = f.type || 'Khác';
        typeMap[t] = (typeMap[t] || 0) + (f.amount || 0);
    });

    const entries = Object.entries(typeMap).sort((a, b) => b[1] - a[1]);
    const maxAmount = entries.length > 0 ? entries[0][1] : 1;
    const colors = ['bg-primary', 'bg-emerald-500', 'bg-amber-500', 'bg-blue-500', 'bg-violet-500', 'bg-rose-500'];

    if (entries.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Chưa có dữ liệu</p>';
        return;
    }

    container.innerHTML = entries.map(([type, amount], i) => {
        const pct = Math.round((amount / maxAmount) * 100);
        return `
        <div>
            <div class="flex items-center justify-between mb-1">
                <span class="text-[12px] font-semibold text-slate-600">${escapeHtml(type)}</span>
                <span class="text-[11px] font-bold text-slate-700">${formatCompactRevenue(amount)}</span>
            </div>
            <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full ${colors[i % colors.length]} rounded-full transition-all duration-500" style="width:${pct}%"></div>
            </div>
        </div>`;
    }).join('');
};

// ── Violations Table ──
const renderViolationsTable = (state) => {
    const tbody = document.getElementById('rep-violations');
    const countLabel = document.getElementById('violation-count-label');
    if (!tbody) return;

    const violations = state.violations || [];
    if (countLabel) {
        const unresolved = violations.filter((v) => v.status !== 'Đã giải quyết').length;
        countLabel.textContent = `${unresolved} chưa xử lý / ${violations.length} tổng`;
    }

    if (violations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-12 text-center text-slate-400 font-medium text-[13px]">Danh sách trống. Ký túc xá đang rất nề nếp!</td></tr>';
        return;
    }

    const sorted = [...violations].sort((a, b) => new Date(b.date) - new Date(a.date));

    const badgeMap = {
        'Đã giải quyết': 'text-green-700 bg-green-50 border-green-200/50',
        'Đang xử lý': 'text-amber-700 bg-amber-50 border-amber-200/50'
    };
    const defaultBadge = 'text-rose-700 bg-rose-50 border-rose-200/50';

    tbody.innerHTML = sorted.map((v, i) => `
        <tr class="animate-fade-in hover:bg-[#f8fafc]/50 transition-colors" style="animation-delay: ${i * 25 + 50}ms">
            <td class="px-6 py-4 text-[13px] font-bold text-slate-800">Phòng ${escapeHtml(String(v.room))}</td>
            <td class="px-6 py-4">
                <span class="text-[13px] font-bold text-slate-800">${escapeHtml(v.studentName)}</span>
                <span class="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold">${escapeHtml(v.studentId)}</span>
            </td>
            <td class="px-6 py-4 text-[12px] font-semibold text-slate-500">${formatDate(v.date)}</td>
            <td class="px-6 py-4">
                <span class="text-[12px] font-medium text-slate-600 truncate block max-w-[250px]" title="${escapeHtml(v.reason)}">${escapeHtml(v.reason)}</span>
                <span class="text-[10px] font-bold text-rose-500 mt-0.5 inline-block">${v.points} điểm</span>
            </td>
            <td class="px-6 py-4 text-right">
                <span class="px-2.5 py-1 text-[11px] font-bold rounded-lg border ${badgeMap[v.status] || defaultBadge}">${escapeHtml(v.status)}</span>
            </td>
        </tr>
    `).join('');
};

// ── Multi-Sheet Excel Export ──
const buildExportRows = (type, state) => {
    const timestamp = new Date().toLocaleDateString('vi-VN');

    if (type === 'students') {
        return [
            ['DANH SÁCH SINH VIÊN KÝ TÚC XÁ'], ['Ngày xuất', timestamp], [],
            ['MSSV', 'Họ tên', 'Phòng', 'Ngành', 'SĐT', 'Email', 'Trạng thái'],
            ...(state.students || []).map((s) => [s.id, s.name, s.room, s.major, s.phone || '', s.email || '', s.status])
        ];
    }
    if (type === 'rooms') {
        return [
            ['DANH SÁCH PHÒNG Ở'], ['Ngày xuất', timestamp], [],
            ['Số phòng', 'Loại', 'Tòa', 'Tầng', 'Sức chứa', 'Đang ở', 'Trạng thái'],
            ...(state.rooms || []).map((r) => [r.id, r.type, r.building, r.floor, r.capacity, r.occupied, r.status])
        ];
    }
    if (type === 'fees') {
        return [
            ['BÁO CÁO HOÁ ĐƠN & THU PHÍ'], ['Ngày xuất', timestamp], [],
            ['Mã HĐ', 'Phòng', 'Loại phí', 'Tháng', 'Số tiền', 'Trạng thái'],
            ...(state.fees || []).map((f) => [f.id, f.room, f.type, f.month, f.amount, f.status])
        ];
    }
    if (type === 'contracts') {
        return [
            ['BÁO CÁO HỢP ĐỒNG'], ['Ngày xuất', timestamp], [],
            ['Mã HĐ', 'MSSV', 'Sinh viên', 'Phòng', 'Ngày BĐ', 'Ngày KT', 'Trạng thái'],
            ...(state.contracts || []).map((c) => [c.id, c.studentId, c.studentName, c.room, c.startDate, c.endDate, c.status])
        ];
    }
    if (type === 'violations') {
        return [
            ['BÁO CÁO VI PHẠM KỶ LUẬT'], ['Ngày xuất', timestamp], [],
            ['Mã VP', 'Sinh viên', 'MSSV', 'Phòng', 'Lý do', 'Điểm', 'Ngày', 'Trạng thái'],
            ...(state.violations || []).map((v) => [v.id, v.studentName, v.studentId, v.room, v.reason, v.points, v.date, v.status])
        ];
    }

    // 'all' — combined summary
    const totalPaid = (state.fees || []).filter((f) => completedFeeStatuses.has(f.status)).reduce((s, f) => s + (f.amount || 0), 0);
    const totalUnpaid = (state.fees || []).filter((f) => !completedFeeStatuses.has(f.status)).reduce((s, f) => s + (f.amount || 0), 0);
    return [
        ['BÁO CÁO TỔNG HỢP KÝ TÚC XÁ'], ['Ngày xuất', timestamp], [],
        ['CHỈ SỐ', 'GIÁ TRỊ'],
        ['Tổng sinh viên', (state.students || []).length],
        ['Tổng phòng', (state.rooms || []).length],
        ['Tổng hợp đồng', (state.contracts || []).length],
        ['HĐ hiệu lực', (state.contracts || []).filter((c) => c.status === 'Hiệu lực').length],
        ['Tổng doanh thu đã thu', totalPaid],
        ['Tổng nợ chưa thu', totalUnpaid],
        ['Vi phạm chưa xử lý', (state.violations || []).filter((v) => v.status !== 'Đã giải quyết').length],
        [],
        ['--- DANH SÁCH SINH VIÊN ---'], [],
        ['MSSV', 'Họ tên', 'Phòng', 'Ngành', 'Trạng thái'],
        ...(state.students || []).map((s) => [s.id, s.name, s.room, s.major, s.status]),
        [],
        ['--- HOÁ ĐƠN ---'], [],
        ['Mã HĐ', 'Phòng', 'Loại phí', 'Tháng', 'Số tiền', 'Trạng thái'],
        ...(state.fees || []).map((f) => [f.id, f.room, f.type, f.month, f.amount, f.status]),
        [],
        ['--- VI PHẠM ---'], [],
        ['Mã VP', 'Sinh viên', 'Phòng', 'Lý do', 'Điểm', 'Ngày', 'Trạng thái'],
        ...(state.violations || []).map((v) => [v.id, v.studentName, v.room, v.reason, v.points, v.date, v.status])
    ];
};

const FILE_NAMES = {
    all: 'Bao_cao_tong_hop_KTX',
    students: 'Danh_sach_sinh_vien',
    rooms: 'Danh_sach_phong',
    fees: 'Bao_cao_hoa_don',
    contracts: 'Bao_cao_hop_dong',
    violations: 'Bao_cao_vi_pham'
};

// ── Main Render ──
function renderReports() {
    const state = getState();
    renderKPICards(state);
    renderRevenueChart(state);
    renderBuildingOccupancy(state);
    renderContractDonut(state);
    renderFeeTypeBreakdown(state);
    renderViolationsTable(state);
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('stateChanged', renderReports);

    // Render immediately if data exists
    const state = getState();
    if ((state.students || []).length > 0 || (state.fees || []).length > 0) {
        renderReports();
    }

    // Export Excel
    const exportBtn = document.getElementById('export-excel-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const typeSelect = document.getElementById('export-type-select');
            const type = typeSelect ? typeSelect.value : 'all';
            const state = getState();
            const rows = buildExportRows(type, state);
            const filename = `${FILE_NAMES[type] || 'Bao_cao'}_${new Date().toISOString().split('T')[0]}.xls`;
            exportToExcel(filename, rows);
            showToast(`Đã xuất ${filename} thành công!`, 'success');
        });
    }
});
