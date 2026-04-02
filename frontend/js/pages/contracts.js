import { getState, updateState } from '../store/state.js';
import { showToast, showPrompt, showConfirm } from '../utils/dom.js';
import { todayISO, formatDate } from '../utils/formatters.js';
import { escapeHtml } from '../utils/fp.js';

// ── Local UI State ──
let searchQuery = '';
let filterStatus = '';
let sortField = 'endDate';
let sortDir = 'asc';
let currentPage = 1;
let pageSize = 15;

// ── Auto-expiry check (pure) ──
const autoCheckExpiry = (contracts) => {
    const today = new Date();
    let changed = false;
    const updated = contracts.map((c) => {
        if (c.status === 'Hết hạn') return c;
        const end = new Date(c.endDate);
        const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0 && c.status !== 'Hết hạn') {
            changed = true;
            return { ...c, status: 'Hết hạn' };
        }
        if (daysLeft > 0 && daysLeft <= 30 && c.status === 'Hiệu lực') {
            changed = true;
            return { ...c, status: 'Sắp hết hạn' };
        }
        return c;
    });
    return { updated, changed };
};

// ── Validation ──
const validateContract = (data, existingContracts, isEdit = false) => {
    const errors = [];
    if (!isEdit && !data.student) errors.push('Vui lòng chọn sinh viên');
    if (!isEdit && !data.room) errors.push('Vui lòng chọn phòng');
    if (!data.startDate) errors.push('Ngày bắt đầu không được để trống');
    if (!data.endDate) errors.push('Ngày kết thúc không được để trống');
    if (data.startDate && data.endDate && data.startDate >= data.endDate) {
        errors.push('Ngày kết thúc phải sau ngày bắt đầu');
    }
    // Check duplicate: same student already has active contract
    if (!isEdit && data.student) {
        const svId = data.student.split(' - ')[0];
        const hasActive = existingContracts.some((c) => c.studentId === svId && c.status !== 'Hết hạn');
        if (hasActive) errors.push('Sinh viên này đã có hợp đồng đang hiệu lực');
    }
    return errors;
};

// ── Filter → Sort → Paginate ──
const filterContracts = (contracts) => {
    const q = searchQuery.toLowerCase().trim();
    return contracts.filter((c) => {
        if (filterStatus && c.status !== filterStatus) return false;
        if (q) {
            const haystack = `${c.id} ${c.studentName} ${c.studentId} ${c.room}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
};

const sortContracts = (contracts) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...contracts].sort((a, b) => {
        const va = String(a[sortField] || '');
        const vb = String(b[sortField] || '');
        return va.localeCompare(vb, 'vi', { sensitivity: 'base' }) * dir;
    });
};

const paginate = (arr) => arr.slice((currentPage - 1) * pageSize, currentPage * pageSize);
const totalPages = (len) => Math.max(1, Math.ceil(len / pageSize));

// ── Status badge ──
const statusBadge = (status) => {
    const map = {
        'Hiệu lực': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'Sắp hết hạn': 'bg-amber-50 text-amber-700 border-amber-200',
        'Hết hạn': 'bg-rose-50 text-rose-700 border-rose-200'
    };
    const cls = map[status] || map['Hiệu lực'];
    return `<span class="px-2.5 py-1 text-[11px] font-bold rounded-full border ${cls}">${escapeHtml(status)}</span>`;
};

// ── Days left indicator ──
const daysLeftLabel = (endDate) => {
    const days = Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return '<span class="text-[10px] text-rose-500 font-bold">Đã hết hạn</span>';
    if (days <= 30) return `<span class="text-[10px] text-amber-600 font-bold">Còn ${days} ngày</span>`;
    return `<span class="text-[10px] text-slate-400">Còn ${days} ngày</span>`;
};

// ── Stats bar ──
const renderStats = () => {
    const container = document.getElementById('contract-stats-bar');
    if (!container) return;
    const state = getState();
    const contracts = state.contracts || [];
    const active = contracts.filter((c) => c.status === 'Hiệu lực').length;
    const expiring = contracts.filter((c) => c.status === 'Sắp hết hạn').length;
    const expired = contracts.filter((c) => c.status === 'Hết hạn').length;

    const stats = [
        { icon: 'description', label: 'Tổng hợp đồng', value: contracts.length, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
        { icon: 'verified', label: 'Hiệu lực', value: active, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
        { icon: 'schedule', label: 'Sắp hết hạn', value: expiring, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
        { icon: 'event_busy', label: 'Hết hạn', value: expired, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' }
    ];

    container.innerHTML = stats.map((s) => `
        <div class="${s.bg} rounded-xl p-4 border ${s.border} flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center">
                <span class="material-symbols-outlined ${s.color}">${s.icon}</span>
            </div>
            <div>
                <p class="text-[20px] font-black ${s.color}">${s.value}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${s.label}</p>
            </div>
        </div>
    `).join('');
};

// ── Pagination controls ──
const renderPagination = (total) => {
    const container = document.getElementById('ct-pagination-controls');
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
    document.querySelectorAll('#contracts-table-body').forEach(() => {});
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
export function renderContracts() {
    const state = getState();
    const tbody = document.getElementById('contracts-table-body');
    if (!tbody) return;

    renderStats();

    const all = state.contracts || [];
    const filtered = filterContracts(all);
    const sorted = sortContracts(filtered);
    const tp = totalPages(sorted.length);
    if (currentPage > tp) currentPage = tp;
    const pageData = paginate(sorted);

    // Count label
    const countEl = document.getElementById('contract-count-label');
    if (countEl) countEl.textContent = filtered.length === all.length ? `Tổng: ${all.length} hợp đồng` : `${filtered.length} / ${all.length} hợp đồng`;

    updateSortIndicators();
    renderPagination(sorted.length);

    if (pageData.length === 0) {
        const isFiltered = searchQuery || filterStatus;
        tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center">
            <div class="flex flex-col items-center justify-center text-slate-400">
                <span class="material-symbols-outlined text-6xl mb-4 text-slate-200">${isFiltered ? 'filter_list_off' : 'contract'}</span>
                <p class="text-sm font-medium">${isFiltered ? 'Không tìm thấy hợp đồng phù hợp' : 'Chưa có hợp đồng nào'}</p>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = pageData.map((ct, i) => {
        const delay = i * 25 + 50;
        return `
        <tr class="animate-fade-in hover:bg-slate-50/50 transition-colors" style="animation-delay: ${delay}ms">
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-sm font-bold text-primary">${escapeHtml(ct.id)}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle">
                <p class="text-sm font-bold text-main">${escapeHtml(ct.studentName)}</p>
                <p class="text-[0.65rem] uppercase tracking-wider text-muted font-bold mt-1 bg-slate-100 inline-block px-2 py-0.5 rounded-md">${escapeHtml(ct.studentId)}</p>
            </td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-sm font-bold text-main">Phòng ${escapeHtml(String(ct.room))}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-sm font-medium text-muted">${formatDate(ct.startDate)}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle">
                <div class="text-sm font-medium text-muted">${formatDate(ct.endDate)}</div>
                ${daysLeftLabel(ct.endDate)}
            </td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle">${statusBadge(ct.status)}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-right">
                <button class="renew-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" data-id="${escapeHtml(ct.id)}" title="Gia hạn"><span class="material-symbols-outlined text-[1.15rem]">autorenew</span></button>
                <button class="edit-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-primary hover:bg-blue-50 transition-colors" data-id="${escapeHtml(ct.id)}" title="Chỉnh sửa"><span class="material-symbols-outlined text-[1.15rem]">edit</span></button>
                <button class="delete-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-danger hover:bg-rose-50 transition-colors" data-id="${escapeHtml(ct.id)}" title="Xóa"><span class="material-symbols-outlined text-[1.15rem]">delete</span></button>
            </td>
        </tr>`;
    }).join('');
}

// ── Event Listeners ──
export function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('search-contract-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; currentPage = 1; renderContracts(); });
    }

    // Filter
    const filterSelect = document.getElementById('filter-contract-status');
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => { filterStatus = e.target.value; currentPage = 1; renderContracts(); });
    }

    // Page size
    const pageSizeEl = document.getElementById('ct-page-size');
    if (pageSizeEl) {
        pageSizeEl.addEventListener('change', (e) => { pageSize = parseInt(e.target.value, 10); currentPage = 1; renderContracts(); });
    }

    // Pagination
    const pagCtrl = document.getElementById('ct-pagination-controls');
    if (pagCtrl) {
        pagCtrl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (!btn || btn.disabled) return;
            const p = parseInt(btn.dataset.page, 10);
            if (p >= 1 && p !== currentPage) { currentPage = p; renderContracts(); }
        });
    }

    // Sort
    document.querySelectorAll('.sortable-th').forEach((th) => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (sortField === field) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
            else { sortField = field; sortDir = 'asc'; }
            currentPage = 1;
            renderContracts();
        });
    });

    // Add contract
    const addBtn = document.getElementById('add-contract-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const state = getState();
            const studentOptions = state.students.filter((s) => s.status !== 'Đã rời đi').map((s) => `${s.id} - ${s.name}`);
            const roomOptions = state.rooms.filter((r) => r.status !== 'Đang bảo trì').map((r) => `${r.id} - ${r.building}`);
            const data = await showPrompt('Tạo Hợp Đồng Mới', [
                { name: 'student', label: 'Sinh viên *', type: 'select', options: studentOptions, placeholder: '-- Chọn sinh viên --', required: true },
                { name: 'room', label: 'Phòng *', type: 'select', options: roomOptions, placeholder: '-- Chọn phòng --', required: true },
                { name: 'startDate', label: 'Ngày bắt đầu *', type: 'date', value: todayISO(), required: true },
                { name: 'endDate', label: 'Ngày kết thúc *', type: 'date', required: true }
            ]);
            if (!data) return;

            const errors = validateContract(data, state.contracts);
            if (errors.length > 0) { showToast(errors[0], 'error'); return; }

            const studentId = data.student.split(' - ')[0];
            const studentName = data.student.split(' - ').slice(1).join(' - ');
            const roomId = data.room.split(' - ')[0];
            const newCt = {
                id: `HD${Date.now().toString().slice(-4)}`,
                studentId, studentName,
                room: roomId,
                startDate: data.startDate,
                endDate: data.endDate,
                status: 'Hiệu lực'
            };
            updateState({ contracts: [newCt, ...state.contracts] });
            showToast(`Đã tạo hợp đồng ${newCt.id} thành công!`, 'success');
        });
    }

    // Table interactions
    const tbody = document.getElementById('contracts-table-body');
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const renewBtn = e.target.closest('.renew-btn');
            const editBtn = e.target.closest('.edit-btn');
            const deleteBtn = e.target.closest('.delete-btn');

            // Renew (quick extend)
            if (renewBtn) {
                const id = renewBtn.dataset.id;
                const state = getState();
                const ct = state.contracts.find((c) => c.id === id);
                if (!ct) return;
                const data = await showPrompt(`Gia hạn HĐ ${ct.id}`, [
                    { name: 'endDate', label: 'Gia hạn đến ngày *', type: 'date', value: ct.endDate, required: true }
                ]);
                if (!data || !data.endDate) return;
                if (data.endDate <= ct.startDate) { showToast('Ngày gia hạn phải sau ngày bắt đầu', 'error'); return; }
                const updatedContracts = state.contracts.map((c) =>
                    c.id === id ? { ...c, endDate: data.endDate, status: 'Hiệu lực' } : c
                );
                updateState({ contracts: updatedContracts });
                showToast(`Đã gia hạn HĐ ${ct.id} đến ${formatDate(data.endDate)}`, 'success');
            }

            // Edit (full)
            if (editBtn) {
                const id = editBtn.dataset.id;
                const state = getState();
                const ct = state.contracts.find((c) => c.id === id);
                if (!ct) return;
                const data = await showPrompt(`Chỉnh sửa HĐ ${ct.id}`, [
                    { name: 'startDate', label: 'Ngày bắt đầu', type: 'date', value: ct.startDate, required: true },
                    { name: 'endDate', label: 'Ngày kết thúc', type: 'date', value: ct.endDate, required: true },
                    { name: 'status', label: 'Trạng thái', type: 'select', value: ct.status, options: ['Hiệu lực', 'Sắp hết hạn', 'Hết hạn'], required: true }
                ]);
                if (!data) return;
                if (data.startDate && data.endDate && data.startDate >= data.endDate) {
                    showToast('Ngày kết thúc phải sau ngày bắt đầu', 'error');
                    return;
                }
                const updatedContracts = state.contracts.map((c) =>
                    c.id === id ? { ...c, startDate: data.startDate || c.startDate, endDate: data.endDate || c.endDate, status: data.status || c.status } : c
                );
                updateState({ contracts: updatedContracts });
                showToast('Cập nhật hợp đồng thành công!', 'success');
            }

            // Delete
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                const state = getState();
                const ct = state.contracts.find((c) => c.id === id);
                const confirmed = await showConfirm('Xóa Hợp Đồng', `Xóa vĩnh viễn hợp đồng ${ct ? ct.id : ''}?`, true);
                if (!confirmed) return;
                updateState({ contracts: state.contracts.filter((c) => c.id !== id) });
                showToast('Đã xóa hợp đồng!', 'success');
            }
        });
    }

    window.addEventListener('stateChanged', renderContracts);
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    // Auto-check expiry on page load
    const state = getState();
    const { updated, changed } = autoCheckExpiry(state.contracts || []);
    if (changed) {
        updateState({ contracts: updated });
        showToast('Đã tự động cập nhật trạng thái hợp đồng hết hạn', 'info');
    }
    renderContracts();
    setupEventListeners();
});
