import { getState, updateState } from '../store/state.js';
import { showToast, showPrompt, showConfirm } from '../utils/dom.js';
import { formatCurrency, formatCompactRevenue, currentMonthYear } from '../utils/formatters.js';
import { escapeHtml } from '../utils/fp.js';

// ── Local UI State ──
let searchQuery = '';
let filterStatus = '';
let filterType = '';
let filterMonth = '';
let sortField = 'month';
let sortDir = 'desc';
let currentPage = 1;
let pageSize = 15;

const FEE_STATUS = {
    PAID: 'Đã thanh toán',
    UNPAID: 'Chưa thanh toán'
};

const normalizeFeeStatus = (status) => status === 'Chưa đóng' ? FEE_STATUS.UNPAID : status;
const isPaidFee = (fee) => normalizeFeeStatus(fee.status) === FEE_STATUS.PAID;

// ── Validation ──
const validateFee = (data) => {
    const errors = [];
    if (!data.room) errors.push('Vui lòng chọn phòng');
    if (!data.type) errors.push('Vui lòng chọn loại phí');
    const amount = parseInt(data.amount);
    if (!amount || amount <= 0) errors.push('Số tiền phải lớn hơn 0');
    if (amount > 100000000) errors.push('Số tiền vượt quá giới hạn (100 triệu)');
    if (!data.month || !/^\d{2}\/\d{4}$/.test(data.month)) errors.push('Tháng phải có dạng MM/YYYY');
    return errors;
};

// ── Populate dynamic filter dropdowns ──
const populateFilterDropdowns = () => {
    const state = getState();
    const fees = state.fees || [];

    // Types
    const types = [...new Set(fees.map((f) => f.type).filter(Boolean))].sort();
    const typeEl = document.getElementById('filter-fee-type');
    if (typeEl) {
        const cur = typeEl.value;
        typeEl.innerHTML = '<option value="">Tất cả khoản mục</option>' +
            types.map((t) => `<option value="${escapeHtml(t)}" ${cur === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
    }

    // Months
    const months = [...new Set(fees.map((f) => f.month).filter(Boolean))].sort((a, b) => {
        const [ma, ya] = a.split('/').map(Number);
        const [mb, yb] = b.split('/').map(Number);
        return yb - ya || mb - ma;
    });
    const monthEl = document.getElementById('filter-fee-month');
    if (monthEl) {
        const cur = monthEl.value;
        monthEl.innerHTML = '<option value="">Tất cả tháng</option>' +
            months.map((m) => `<option value="${escapeHtml(m)}" ${cur === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
    }
};

// ── Filter → Sort → Paginate pipeline ──
const filterFees = (fees) => {
    const q = searchQuery.toLowerCase().trim();
    return fees.filter((f) => {
        if (filterStatus && normalizeFeeStatus(f.status) !== normalizeFeeStatus(filterStatus)) return false;
        if (filterType && f.type !== filterType) return false;
        if (filterMonth && f.month !== filterMonth) return false;
        if (q) {
            const haystack = `${f.id} ${f.room} ${f.type} ${f.month}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
};

const sortFees = (fees) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...fees].sort((a, b) => {
        if (sortField === 'amount') return ((a.amount || 0) - (b.amount || 0)) * dir;
        if (sortField === 'month') {
            const [ma, ya] = (a.month || '').split('/').map(Number);
            const [mb, yb] = (b.month || '').split('/').map(Number);
            return ((ya * 12 + ma) - (yb * 12 + mb)) * dir;
        }
        const va = String(a[sortField] || '');
        const vb = String(b[sortField] || '');
        return va.localeCompare(vb, 'vi', { sensitivity: 'base' }) * dir;
    });
};

const paginate = (arr) => arr.slice((currentPage - 1) * pageSize, currentPage * pageSize);
const totalPages = (len) => Math.max(1, Math.ceil(len / pageSize));

// ── Stats bar ──
const renderStats = () => {
    const container = document.getElementById('fee-stats-bar');
    if (!container) return;
    const fees = (getState().fees || []);
    const totalRevenue = fees.reduce((s, f) => s + (f.amount || 0), 0);
    const paid = fees.filter(isPaidFee);
    const unpaid = fees.filter((f) => !isPaidFee(f));
    const totalPaid = paid.reduce((s, f) => s + (f.amount || 0), 0);
    const totalUnpaid = unpaid.reduce((s, f) => s + (f.amount || 0), 0);
    const paidRate = fees.length > 0 ? Math.round((paid.length / fees.length) * 100) : 0;

    const stats = [
        { icon: 'receipt_long', label: 'Tổng hóa đơn', value: fees.length, sub: formatCompactRevenue(totalRevenue), color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
        { icon: 'check_circle', label: 'Đã thanh toán', value: paid.length, sub: formatCompactRevenue(totalPaid), color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
        { icon: 'pending', label: 'Chưa thanh toán', value: unpaid.length, sub: formatCompactRevenue(totalUnpaid), color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' },
        { icon: 'trending_up', label: 'Tỷ lệ thu', value: `${paidRate}%`, sub: `${paid.length}/${fees.length}`, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' }
    ];

    container.innerHTML = stats.map((s) => `
        <div class="${s.bg} rounded-xl p-4 border ${s.border} flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center">
                <span class="material-symbols-outlined ${s.color}">${s.icon}</span>
            </div>
            <div>
                <p class="text-[20px] font-black ${s.color}">${s.value}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${s.label}</p>
                <p class="text-[11px] font-semibold ${s.color} opacity-70 mt-0.5">${s.sub}</p>
            </div>
        </div>
    `).join('');
};

// ── Status badge ──
const statusBadge = (status, feeId) => {
    const normalizedStatus = normalizeFeeStatus(status);
    const isPaid = normalizedStatus === FEE_STATUS.PAID;
    const cls = isPaid
        ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-green-700 border-green-200'
        : 'bg-gradient-to-r from-rose-100 to-red-100 text-rose-700 border-rose-200';
    return `<button class="status-btn inline-flex items-center" data-id="${escapeHtml(feeId)}" title="Click để thay đổi trạng thái">
        <span class="px-3 py-1 text-xs font-bold rounded-full shadow-sm border hover:shadow-md transition-all whitespace-nowrap ${cls}">${escapeHtml(normalizedStatus)}</span>
    </button>`;
};

// ── Pagination ──
const renderPagination = (total) => {
    const container = document.getElementById('fee-pagination-controls');
    if (!container) return;
    const tp = totalPages(total);
    if (tp <= 1) { container.innerHTML = ''; return; }

    const btn = (page, label, disabled) => {
        const base = 'w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-semibold transition-colors';
        const cls = disabled ? `${base} text-slate-300 cursor-not-allowed`
            : page === currentPage ? `${base} bg-primary text-white`
            : `${base} text-slate-500 hover:bg-slate-100`;
        return `<button class="${cls}" data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    };

    let html = btn(currentPage - 1, '<span class="material-symbols-outlined text-[1rem]">chevron_left</span>', currentPage === 1);
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(tp, start + 4);
    if (start > 1) html += btn(1, '1', false) + (start > 2 ? '<span class="w-8 h-8 flex items-center justify-center text-slate-400 text-xs">...</span>' : '');
    for (let i = start; i <= end; i++) html += btn(i, String(i), false);
    if (end < tp) html += (end < tp - 1 ? '<span class="w-8 h-8 flex items-center justify-center text-slate-400 text-xs">...</span>' : '') + btn(tp, String(tp), false);
    html += btn(currentPage + 1, '<span class="material-symbols-outlined text-[1rem]">chevron_right</span>', currentPage === tp);

    container.innerHTML = html;
};

// ── Sort indicators ──
const updateSortIndicators = () => {
    document.querySelectorAll('.sortable-th').forEach((th) => {
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        if (th.dataset.sort === sortField) {
            icon.textContent = sortDir === 'asc' ? '↑' : '↓';
            icon.style.opacity = '1';
        } else {
            icon.textContent = '↕';
            icon.style.opacity = '0.4';
        }
    });
};

// ── Main Render ──
export function renderFees() {
    const state = getState();
    const tbody = document.getElementById('fees-table-body');
    if (!tbody) return;

    renderStats();

    const all = state.fees || [];
    const filtered = filterFees(all);
    const sorted = sortFees(filtered);
    const tp = totalPages(sorted.length);
    if (currentPage > tp) currentPage = tp;
    const pageData = paginate(sorted);

    // Count label
    const countEl = document.getElementById('fee-count-label');
    if (countEl) countEl.textContent = filtered.length === all.length ? `Tổng: ${all.length} hóa đơn` : `${filtered.length} / ${all.length} hóa đơn`;

    updateSortIndicators();
    renderPagination(sorted.length);

    if (pageData.length === 0) {
        const isFiltered = searchQuery || filterStatus || filterType || filterMonth;
        tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center">
            <div class="flex flex-col items-center justify-center text-slate-400">
                <span class="material-symbols-outlined text-6xl mb-4 text-slate-200">${isFiltered ? 'filter_list_off' : 'receipt_long'}</span>
                <p class="text-sm font-medium">${isFiltered ? 'Không tìm thấy hóa đơn phù hợp' : 'Chưa có hóa đơn nào'}</p>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = pageData.map((fee, i) => {
        const delay = i * 25 + 50;
        return `
        <tr class="animate-fade-in hover:bg-slate-50/50 transition-colors" style="animation-delay: ${delay}ms">
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-sm font-bold text-primary opacity-80">${escapeHtml(fee.id)}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-sm font-bold text-main">Phòng ${escapeHtml(String(fee.room))}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-sm font-medium text-muted">${escapeHtml(fee.type || 'Phí phòng')}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-sm font-medium text-muted bg-slate-50/50">${escapeHtml(fee.month)}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-sm font-black text-main">${formatCurrency(fee.amount)}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle">${statusBadge(fee.status, fee.id)}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-right">
                <button class="edit-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-primary hover:bg-blue-50 transition-colors" data-id="${escapeHtml(fee.id)}" title="Chỉnh sửa"><span class="material-symbols-outlined text-[1.15rem]">edit</span></button>
                <button class="delete-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-danger hover:bg-rose-50 transition-colors" data-id="${escapeHtml(fee.id)}" title="Xóa"><span class="material-symbols-outlined text-[1.15rem]">delete</span></button>
            </td>
        </tr>`;
    }).join('');
}

// ── Event Listeners ──
export function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('search-fee-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; currentPage = 1; renderFees(); });
    }

    // Filters
    const bindFilter = (id, setter) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', (e) => { setter(e.target.value); currentPage = 1; renderFees(); });
    };
    bindFilter('filter-fee-status', (v) => { filterStatus = v; });
    bindFilter('filter-fee-type', (v) => { filterType = v; });
    bindFilter('filter-fee-month', (v) => { filterMonth = v; });

    // Page size
    const pageSizeEl = document.getElementById('fee-page-size');
    if (pageSizeEl) {
        pageSizeEl.addEventListener('change', (e) => { pageSize = parseInt(e.target.value, 10); currentPage = 1; renderFees(); });
    }

    // Pagination
    const pagCtrl = document.getElementById('fee-pagination-controls');
    if (pagCtrl) {
        pagCtrl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (!btn || btn.disabled) return;
            const p = parseInt(btn.dataset.page, 10);
            if (p >= 1 && p !== currentPage) { currentPage = p; renderFees(); }
        });
    }

    // Sort headers
    document.querySelectorAll('.sortable-th').forEach((th) => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (sortField === field) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
            else { sortField = field; sortDir = 'asc'; }
            currentPage = 1;
            renderFees();
        });
    });

    // Add fee
    const addBtn = document.getElementById('add-fee-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const state = getState();
            const roomOptions = (state.rooms || []).map((r) => String(r.id)).sort();
            const data = await showPrompt('Lập Hóa Đơn Mới', [
                { name: 'room', label: 'Phòng *', type: 'select', options: roomOptions, placeholder: '-- Chọn phòng --', required: true },
                { name: 'type', label: 'Loại phí *', type: 'select', options: ['Tiền phòng', 'Điện & Nước', 'Dịch vụ giặt ủi', 'Phí vi phạm', 'Phí khác'], required: true },
                { name: 'amount', label: 'Số tiền (VNĐ) *', type: 'number', placeholder: 'VD: 2500000', required: true },
                { name: 'month', label: 'Tháng (MM/YYYY) *', placeholder: 'VD: 04/2026', value: currentMonthYear(), required: true }
            ]);
            if (!data) return;

            const errors = validateFee(data);
            if (errors.length > 0) { showToast(errors[0], 'error'); return; }

            const newFee = {
                id: `GD${data.room}-${Date.now().toString().slice(-3)}`,
                room: data.room,
                type: data.type,
                amount: parseInt(data.amount),
                month: data.month,
                status: FEE_STATUS.UNPAID
            };
            updateState({ fees: [newFee, ...state.fees] });
            populateFilterDropdowns();
            showToast('Đã tạo hóa đơn thành công!', 'success');
        });
    }

    // Table interactions
    const tbody = document.getElementById('fees-table-body');
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const statusBtn = e.target.closest('.status-btn');
            const editBtn = e.target.closest('.edit-btn');
            const deleteBtn = e.target.closest('.delete-btn');

            // Toggle status
            if (statusBtn) {
                const id = statusBtn.dataset.id;
                const state = getState();
                const updatedFees = state.fees.map((f) =>
                    f.id === id ? { ...f, status: isPaidFee(f) ? FEE_STATUS.UNPAID : FEE_STATUS.PAID } : f
                );
                updateState({ fees: updatedFees });
                showToast('Đã cập nhật thanh toán!', 'success');
            }

            // Edit (full form)
            if (editBtn) {
                const id = editBtn.dataset.id;
                const state = getState();
                const fee = state.fees.find((f) => f.id === id);
                if (!fee) return;

                const roomOptions = (state.rooms || []).map((r) => String(r.id)).sort();
                if (!roomOptions.includes(String(fee.room))) roomOptions.unshift(String(fee.room));

                const data = await showPrompt(`Chỉnh sửa HĐ ${fee.id}`, [
                    { name: 'room', label: 'Phòng', type: 'select', options: roomOptions, value: String(fee.room), required: true },
                    { name: 'type', label: 'Loại phí', type: 'select', options: ['Tiền phòng', 'Điện & Nước', 'Dịch vụ giặt ủi', 'Phí vi phạm', 'Phí khác'], value: fee.type, required: true },
                    { name: 'amount', label: 'Số tiền (VNĐ)', type: 'number', value: String(fee.amount), required: true },
                    { name: 'month', label: 'Tháng (MM/YYYY)', value: fee.month, required: true },
                    { name: 'status', label: 'Trạng thái', type: 'select', options: [FEE_STATUS.UNPAID, FEE_STATUS.PAID], value: normalizeFeeStatus(fee.status), required: true }
                ]);
                if (!data) return;

                const amount = parseInt(data.amount);
                if (!amount || amount <= 0) { showToast('Số tiền phải lớn hơn 0', 'error'); return; }

                const updatedFees = state.fees.map((f) =>
                    f.id === id ? {
                        ...f,
                        room: data.room || f.room,
                        type: data.type || f.type,
                        amount,
                        month: data.month || f.month,
                        status: normalizeFeeStatus(data.status || f.status)
                    } : f
                );
                updateState({ fees: updatedFees });
                populateFilterDropdowns();
                showToast('Cập nhật hóa đơn thành công!', 'success');
            }

            // Delete
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                const state = getState();
                const fee = state.fees.find((f) => f.id === id);
                const confirmed = await showConfirm('Xóa Hóa Đơn', `Hủy bỏ vĩnh viễn hóa đơn ${fee ? fee.id : ''}?`, true);
                if (!confirmed) return;
                updateState({ fees: state.fees.filter((f) => f.id !== id) });
                populateFilterDropdowns();
                showToast('Đã xóa hóa đơn!', 'success');
            }
        });
    }

    window.addEventListener('stateChanged', () => {
        populateFilterDropdowns();
        renderFees();
    });
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    populateFilterDropdowns();
    renderFees();
    setupEventListeners();
});
