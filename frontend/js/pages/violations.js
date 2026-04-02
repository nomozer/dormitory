import { getState, updateState } from '../store/state.js';
import { showToast, showPrompt, showConfirm } from '../utils/dom.js';
import { escapeHtml, pipe, debounce } from '../utils/fp.js';
import { todayISO, formatDate } from '../utils/formatters.js';

// ── Local UI State ──
let searchQuery = '';
let filterStatus = '';
let filterRoom = '';
let sortField = 'date';
let sortDir = 'desc';
let currentPage = 1;
let pageSize = 10;

// ── Status badge ──
const statusBadge = (status) => {
    const map = {
        'Chưa xử lý': 'bg-gradient-to-r from-rose-100 to-red-100 text-rose-700 border-rose-200',
        'Đang xử lý': 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 border-amber-200',
        'Đã giải quyết': 'bg-gradient-to-r from-emerald-100 to-green-100 text-green-700 border-green-200'
    };
    const cls = map[status] || 'bg-slate-100 text-slate-600 border-slate-200';
    return `<span class="px-2.5 py-1 text-xs font-bold rounded-full shadow-sm border ${cls} whitespace-nowrap">${escapeHtml(status)}</span>`;
};

// ── Comparison helpers ──
const compareVietnamese = (a, b) => String(a).localeCompare(String(b), 'vi', { sensitivity: 'base' });

// ── FP Pipeline ──
const filterViolations = (violations) => {
    const q = searchQuery.toLowerCase().trim();
    return violations.filter((v) => {
        if (filterStatus && v.status !== filterStatus) return false;
        if (filterRoom && v.room !== filterRoom) return false;
        if (q) {
            const haystack = `${v.room} ${v.studentName} ${v.studentId} ${v.reason} ${v.date}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
};

const sortViolations = (violations) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...violations].sort((a, b) => {
        switch (sortField) {
            case 'room': return dir * compareVietnamese(a.room, b.room);
            case 'studentName': return dir * compareVietnamese(a.studentName, b.studentName);
            case 'date': return dir * (new Date(a.date) - new Date(b.date));
            case 'points': return dir * ((a.points || 0) - (b.points || 0));
            default: return 0;
        }
    });
};

const paginateViolations = (violations) => {
    const start = (currentPage - 1) * pageSize;
    return violations.slice(start, start + pageSize);
};

const processViolations = pipe(filterViolations, sortViolations);

// ── Stats Bar ──
const renderStatsBar = () => {
    const container = document.getElementById('violation-stats-bar');
    if (!container) return;
    const violations = getState().violations || [];

    const total = violations.length;
    const pending = violations.filter((v) => v.status === 'Chưa xử lý').length;
    const processing = violations.filter((v) => v.status === 'Đang xử lý').length;
    const resolved = violations.filter((v) => v.status === 'Đã giải quyết').length;

    const stats = [
        { icon: 'gavel', label: 'Tổng vi phạm', value: total, sub: '', color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
        { icon: 'error', label: 'Chưa xử lý', value: pending, sub: '', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
        { icon: 'pending', label: 'Đang xử lý', value: processing, sub: '', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
        { icon: 'check_circle', label: 'Đã giải quyết', value: resolved, sub: total > 0 ? `${Math.round((resolved / total) * 100)}%` : '0%', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
    ];

    container.innerHTML = stats.map((s) => `
        <div class="${s.bg} rounded-2xl p-4 border ${s.border} shadow-sm">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center">
                    <span class="material-symbols-outlined ${s.color} text-[1.3rem]">${s.icon}</span>
                </div>
                <div>
                    <p class="text-[22px] font-black ${s.color} leading-none">${s.value}</p>
                    <p class="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-wider">${s.label}</p>
                    ${s.sub ? `<p class="text-[10px] font-medium text-slate-400">${s.sub}</p>` : ''}
                </div>
            </div>
        </div>
    `).join('');
};

// ── Populate Room Filter ──
const populateRoomFilter = () => {
    const select = document.getElementById('violation-filter-room');
    if (!select) return;
    const violations = getState().violations || [];
    const rooms = [...new Set(violations.map((v) => v.room).filter(Boolean))].sort(compareVietnamese);
    const current = select.value;
    select.innerHTML = '<option value="">Tất cả phòng</option>' +
        rooms.map((r) => `<option value="${escapeHtml(r)}"${r === current ? ' selected' : ''}>Phòng ${escapeHtml(r)}</option>`).join('');
};

// ── Sort Indicators ──
const updateSortIndicators = () => {
    document.querySelectorAll('.sortable-th[data-sort]').forEach((th) => {
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        if (th.dataset.sort === sortField) {
            icon.textContent = sortDir === 'asc' ? '↑' : '↓';
        } else {
            icon.textContent = '⇕';
        }
    });
};

// ── Count Label ──
const updateCountLabel = (filtered, total) => {
    const el = document.getElementById('violation-count-label');
    if (el) el.textContent = `${filtered} / ${total} vi phạm`;
};

// ── Pagination ──
const renderPagination = (totalItems) => {
    const container = document.getElementById('violation-pagination');
    if (!container) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const btnCls = (active) => active
        ? 'w-8 h-8 rounded-lg bg-primary text-white text-[12px] font-bold flex items-center justify-center'
        : 'w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 text-[12px] font-medium flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer';

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    // Prev
    pages.push(`<button class="${btnCls(false)} ${currentPage === 1 ? 'opacity-40 pointer-events-none' : ''}" data-page="${currentPage - 1}">‹</button>`);

    if (start > 1) {
        pages.push(`<button class="${btnCls(currentPage === 1)}" data-page="1">1</button>`);
        if (start > 2) pages.push('<span class="text-slate-400 text-xs px-1">…</span>');
    }
    for (let i = start; i <= end; i++) {
        pages.push(`<button class="${btnCls(i === currentPage)}" data-page="${i}">${i}</button>`);
    }
    if (end < totalPages) {
        if (end < totalPages - 1) pages.push('<span class="text-slate-400 text-xs px-1">…</span>');
        pages.push(`<button class="${btnCls(currentPage === totalPages)}" data-page="${totalPages}">${totalPages}</button>`);
    }

    // Next
    pages.push(`<button class="${btnCls(false)} ${currentPage === totalPages ? 'opacity-40 pointer-events-none' : ''}" data-page="${currentPage + 1}">›</button>`);

    container.innerHTML = pages.join('');
};

// ── Main Render ──
export function renderViolations() {
    const state = getState();
    const tbody = document.getElementById('violations-table-body');
    if (!tbody) return;

    const allViolations = state.violations || [];
    const processed = processViolations(allViolations);
    const paginated = paginateViolations(processed);

    renderStatsBar();
    updateSortIndicators();
    updateCountLabel(processed.length, allViolations.length);
    renderPagination(processed.length);

    if (paginated.length === 0) {
        const hasFilters = searchQuery || filterStatus || filterRoom;
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-12 text-center">
                    <div class="flex flex-col items-center justify-center text-slate-400">
                        <span class="material-symbols-outlined text-6xl mb-4 text-slate-200">${hasFilters ? 'filter_list_off' : 'gavel'}</span>
                        <p class="text-sm font-medium">${hasFilters ? 'Không tìm thấy vi phạm phù hợp' : 'Không có bản ghi vi phạm nào'}</p>
                        ${hasFilters ? '<button class="mt-3 text-primary text-[13px] font-bold hover:underline clear-filters-btn">Xóa bộ lọc</button>' : ''}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = paginated.map((v, index) => {
        const delay = index * 30 + 50;
        return `
        <tr class="animate-fade-in hover:bg-slate-50/50 transition-colors" style="animation-delay: ${delay}ms">
            <td class="p-4 px-6 align-middle text-[13px] font-bold text-slate-800">Phòng ${escapeHtml(v.room)}</td>
            <td class="p-4 px-6 align-middle">
                <p class="text-[13px] font-bold text-slate-800">${escapeHtml(v.studentName)}</p>
                <p class="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1 bg-slate-100 inline-block px-2 py-0.5 rounded-md">${escapeHtml(v.studentId)}</p>
            </td>
            <td class="p-4 px-6 align-middle text-[13px] font-medium text-slate-500">${escapeHtml(formatDate(v.date))}</td>
            <td class="p-4 px-6 align-middle text-[13px] font-medium text-slate-700 max-w-[250px]">
                <p class="line-clamp-2" title="${escapeHtml(v.reason)}">${escapeHtml(v.reason)}</p>
            </td>
            <td class="p-4 px-6 align-middle text-[13px] font-bold text-rose-600">${v.points || 0}</td>
            <td class="p-4 px-6 align-middle">
                <button class="status-btn" data-id="${escapeHtml(v.id)}" title="Nhấn để đổi trạng thái">
                    ${statusBadge(v.status)}
                </button>
            </td>
            <td class="p-4 px-6 align-middle text-right">
                <div class="flex items-center justify-end gap-1">
                    <button class="edit-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" data-id="${escapeHtml(v.id)}" title="Sửa">
                        <span class="material-symbols-outlined text-[1.1rem]">edit</span>
                    </button>
                    <button class="delete-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" data-id="${escapeHtml(v.id)}" title="Xóa">
                        <span class="material-symbols-outlined text-[1.1rem]">delete</span>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// ── Clear All Filters ──
const clearAllFilters = () => {
    searchQuery = '';
    filterStatus = '';
    filterRoom = '';
    currentPage = 1;
    const searchEl = document.getElementById('violation-search');
    const statusEl = document.getElementById('violation-filter-status');
    const roomEl = document.getElementById('violation-filter-room');
    if (searchEl) searchEl.value = '';
    if (statusEl) statusEl.value = '';
    if (roomEl) roomEl.value = '';
    renderViolations();
};

// ── Validate ──
const validateViolation = (data) => {
    if (!data.student) return 'Vui lòng chọn sinh viên';
    if (!data.reason || data.reason.trim().length < 3) return 'Lý do phải có ít nhất 3 ký tự';
    const pts = parseInt(data.points);
    if (isNaN(pts) || pts > 0) return 'Điểm trừ phải là số âm hoặc 0';
    if (pts < -100) return 'Điểm trừ không được vượt quá -100';
    return null;
};

// ── Event Listeners ──
export function setupEventListeners() {
    // Search (debounced)
    const searchEl = document.getElementById('violation-search');
    if (searchEl) {
        searchEl.addEventListener('input', debounce((e) => {
            searchQuery = e.target.value;
            currentPage = 1;
            renderViolations();
        }, 250));
    }

    // Status filter
    const statusEl = document.getElementById('violation-filter-status');
    if (statusEl) {
        statusEl.addEventListener('change', (e) => {
            filterStatus = e.target.value;
            currentPage = 1;
            renderViolations();
        });
    }

    // Room filter
    const roomEl = document.getElementById('violation-filter-room');
    if (roomEl) {
        roomEl.addEventListener('change', (e) => {
            filterRoom = e.target.value;
            currentPage = 1;
            renderViolations();
        });
    }

    // Sortable headers
    document.querySelectorAll('.sortable-th[data-sort]').forEach((th) => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (sortField === field) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortDir = 'asc';
            }
            currentPage = 1;
            renderViolations();
        });
    });

    // Page size
    const pageSizeEl = document.getElementById('violation-page-size');
    if (pageSizeEl) {
        pageSizeEl.addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value) || 10;
            currentPage = 1;
            renderViolations();
        });
    }

    // Pagination clicks
    const paginationEl = document.getElementById('violation-pagination');
    if (paginationEl) {
        paginationEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (!btn) return;
            const page = parseInt(btn.dataset.page);
            if (page >= 1) {
                currentPage = page;
                renderViolations();
            }
        });
    }

    // Add violation
    const addBtn = document.getElementById('add-violation-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const state = getState();
            const studentOptions = (state.students || [])
                .filter((s) => s.status === 'Đang ở')
                .map((s) => `${s.id} - ${s.name} (P.${s.room})`);

            if (studentOptions.length === 0) {
                showToast('Không có sinh viên nào đang ở để ghi nhận vi phạm', 'error');
                return;
            }

            const data = await showPrompt('Ghi nhận Vi phạm', [
                { name: 'student', label: 'Sinh viên vi phạm', type: 'select', options: studentOptions, placeholder: 'Chọn sinh viên', required: true },
                { name: 'reason', label: 'Lý do vi phạm', required: true },
                { name: 'points', label: 'Trừ điểm', type: 'number', value: '-5', required: true }
            ]);
            if (!data) return;

            const err = validateViolation(data);
            if (err) { showToast(err, 'error'); return; }

            const svId = data.student.split(' - ')[0];
            const svName = data.student.split(' - ')[1]?.split(' (')[0] || '';
            const svRoom = (state.students || []).find((s) => s.id === svId)?.room || '';
            const newV = {
                id: 'KL' + Date.now().toString().slice(-4),
                room: svRoom,
                studentName: svName,
                studentId: svId,
                date: todayISO(),
                reason: data.reason.trim(),
                points: parseInt(data.points) || -5,
                status: 'Chưa xử lý'
            };
            updateState({ violations: [newV, ...state.violations] });
            populateRoomFilter();
            showToast('Đã thêm vi phạm mới!', 'success');
        });
    }

    // Table delegation: status, edit, delete, clear filters
    const tbody = document.getElementById('violations-table-body');
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const statusBtn = e.target.closest('.status-btn');
            const editBtn = e.target.closest('.edit-btn');
            const deleteBtn = e.target.closest('.delete-btn');
            const clearBtn = e.target.closest('.clear-filters-btn');

            if (clearBtn) {
                clearAllFilters();
                return;
            }

            if (statusBtn) {
                const id = statusBtn.dataset.id;
                const state = getState();
                const cycleStatus = (s) =>
                    s === 'Chưa xử lý' ? 'Đang xử lý'
                    : s === 'Đang xử lý' ? 'Đã giải quyết'
                    : 'Chưa xử lý';
                const updatedViolations = state.violations.map((v) =>
                    v.id === id ? { ...v, status: cycleStatus(v.status) } : v
                );
                updateState({ violations: updatedViolations });
                showToast('Cập nhật trạng thái thành công!', 'success');
                return;
            }

            if (editBtn) {
                const id = editBtn.dataset.id;
                const state = getState();
                const v = state.violations.find((x) => x.id === id);
                if (!v) return;

                const data = await showPrompt('Sửa Vi phạm', [
                    { name: 'reason', label: 'Lý do vi phạm', value: v.reason, required: true },
                    { name: 'points', label: 'Trừ điểm', type: 'number', value: String(v.points || -5), required: true },
                    { name: 'status', label: 'Trạng thái', type: 'select', options: ['Chưa xử lý', 'Đang xử lý', 'Đã giải quyết'], value: v.status, required: true }
                ]);
                if (!data) return;

                if (!data.reason || data.reason.trim().length < 3) {
                    showToast('Lý do phải có ít nhất 3 ký tự', 'error');
                    return;
                }
                const pts = parseInt(data.points);
                if (isNaN(pts) || pts > 0 || pts < -100) {
                    showToast('Điểm trừ phải từ -100 đến 0', 'error');
                    return;
                }

                const updatedViolations = state.violations.map((x) =>
                    x.id === id ? { ...x, reason: data.reason.trim(), points: pts, status: data.status } : x
                );
                updateState({ violations: updatedViolations });
                showToast('Đã cập nhật vi phạm!', 'success');
                return;
            }

            if (deleteBtn) {
                const confirmed = await showConfirm('Xóa Vi phạm', 'Xóa bản ghi kỷ luật này? Không thể hoàn tác.', true);
                if (confirmed) {
                    const id = deleteBtn.dataset.id;
                    const state = getState();
                    updateState({ violations: state.violations.filter((v) => v.id !== id) });
                    populateRoomFilter();
                    showToast('Đã xóa vi phạm!', 'success');
                }
            }
        });
    }

    // State changes
    window.addEventListener('stateChanged', () => {
        renderViolations();
    });
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    populateRoomFilter();
    renderViolations();
    setupEventListeners();
});
