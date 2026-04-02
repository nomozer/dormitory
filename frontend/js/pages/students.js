import { getState, updateState } from '../store/state.js';
import { showToast, showPrompt, showConfirm } from '../utils/dom.js';
import { showTableSkeleton } from '../utils/skeleton.js';
import { escapeHtml } from '../utils/fp.js';

// ── Local UI State (not persisted) ──
let searchQuery = '';
let filterStatus = '';
let filterMajor = '';
let filterRoom = '';
let sortField = 'name';
let sortDir = 'asc'; // 'asc' | 'desc'
let currentPage = 1;
let pageSize = 15;
let initialLoad = true;

// ── Validation ──
const PHONE_RE = /^(0[1-9]\d{8})?$/;
const EMAIL_RE = /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^SV\d{4,}$/;

const validateStudent = (data, isEdit = false) => {
    const errors = [];
    if (!data.name || data.name.trim().length < 2) errors.push('Họ tên phải có ít nhất 2 ký tự');
    if (!isEdit && !ID_RE.test(data.id)) errors.push('MSSV phải có dạng SV + 4 chữ số trở lên (VD: SV1026)');
    if (!data.major || data.major.trim().length < 2) errors.push('Ngành học không được để trống');
    if (data.phone && !PHONE_RE.test(data.phone.replace(/\s/g, ''))) errors.push('SĐT không hợp lệ (10 số, bắt đầu bằng 0)');
    if (data.email && !EMAIL_RE.test(data.email.trim())) errors.push('Email không đúng định dạng');
    return errors;
};

// ── Pure: Filter → Sort → Paginate pipeline ──
const filterStudents = (students) => {
    const q = searchQuery.toLowerCase().trim();
    return students.filter((sv) => {
        if (filterStatus && sv.status !== filterStatus) return false;
        if (filterMajor && sv.major !== filterMajor) return false;
        if (filterRoom && String(sv.room) !== filterRoom) return false;
        if (q) {
            const haystack = `${sv.name} ${sv.id} ${sv.phone || ''} ${sv.email || ''} ${sv.room} ${sv.major}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
};

const compareVietnamese = (a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' });

const sortStudents = (students) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...students].sort((a, b) => {
        const valA = String(a[sortField] || '');
        const valB = String(b[sortField] || '');
        return compareVietnamese(valA, valB) * dir;
    });
};

const paginateStudents = (students) => {
    const start = (currentPage - 1) * pageSize;
    return students.slice(start, start + pageSize);
};

const getTotalPages = (totalItems) => Math.max(1, Math.ceil(totalItems / pageSize));

// ── Populate dynamic filter dropdowns ──
const populateFilterDropdowns = () => {
    const state = getState();
    const students = state.students || [];

    // Unique majors
    const majors = [...new Set(students.map((s) => s.major).filter(Boolean))].sort(compareVietnamese);
    const majorSelect = document.getElementById('filter-major');
    if (majorSelect) {
        const current = majorSelect.value;
        majorSelect.innerHTML = '<option value="">Tất cả ngành</option>' +
            majors.map((m) => `<option value="${escapeHtml(m)}" ${current === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
    }

    // Unique rooms
    const rooms = [...new Set(students.map((s) => String(s.room)).filter((r) => r && r !== 'Chưa xếp'))].sort();
    const roomSelect = document.getElementById('filter-room');
    if (roomSelect) {
        const current = roomSelect.value;
        roomSelect.innerHTML = '<option value="">Tất cả phòng</option>' +
            rooms.map((r) => `<option value="${escapeHtml(r)}" ${current === r ? 'selected' : ''}>Phòng ${escapeHtml(r)}</option>`).join('');
    }
};

// ── Render Sort Indicators ──
const updateSortIndicators = () => {
    document.querySelectorAll('.sortable-th').forEach((th) => {
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        const field = th.dataset.sort;
        if (field === sortField) {
            icon.textContent = sortDir === 'asc' ? '↑' : '↓';
            icon.style.opacity = '1';
        } else {
            icon.textContent = '↕';
            icon.style.opacity = '0.4';
        }
    });
};

// ── Render Pagination Controls ──
const renderPagination = (totalItems) => {
    const container = document.getElementById('pagination-controls');
    if (!container) return;

    const totalPages = getTotalPages(totalItems);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const btnBase = 'w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-semibold transition-colors';
    const btnActive = `${btnBase} bg-primary text-white`;
    const btnNormal = `${btnBase} text-slate-500 hover:bg-slate-100`;
    const btnDisabled = `${btnBase} text-slate-300 cursor-not-allowed`;

    const pages = [];
    // Previous
    pages.push(`<button class="${currentPage === 1 ? btnDisabled : btnNormal}" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}><span class="material-symbols-outlined text-[1rem]">chevron_left</span></button>`);

    // Page numbers with ellipsis
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    if (start > 1) {
        pages.push(`<button class="${btnNormal}" data-page="1">1</button>`);
        if (start > 2) pages.push(`<span class="w-8 h-8 flex items-center justify-center text-slate-400 text-xs">...</span>`);
    }

    for (let i = start; i <= end; i++) {
        pages.push(`<button class="${i === currentPage ? btnActive : btnNormal}" data-page="${i}">${i}</button>`);
    }

    if (end < totalPages) {
        if (end < totalPages - 1) pages.push(`<span class="w-8 h-8 flex items-center justify-center text-slate-400 text-xs">...</span>`);
        pages.push(`<button class="${btnNormal}" data-page="${totalPages}">${totalPages}</button>`);
    }

    // Next
    pages.push(`<button class="${currentPage === totalPages ? btnDisabled : btnNormal}" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}><span class="material-symbols-outlined text-[1rem]">chevron_right</span></button>`);

    container.innerHTML = pages.join('');
};

// ── Student Count Label ──
const updateCountLabel = (filtered, total) => {
    const label = document.getElementById('student-count-label');
    if (label) {
        label.textContent = filtered === total
            ? `Tổng: ${total} sinh viên`
            : `${filtered} / ${total} sinh viên`;
    }
};

// ── Status Badge Renderer ──
const statusConfig = {
    'Đang ở': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    'Mới': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    'Đã rời đi': { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' }
};

const renderStatusBadge = (status) => {
    const cfg = statusConfig[status] || statusConfig['Mới'];
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.bg} ${cfg.text}">
        <span class="w-1.5 h-1.5 rounded-full ${cfg.dot}"></span>${escapeHtml(status)}
    </span>`;
};

// ── Main Render ──
export function renderStudents() {
    const state = getState();
    const tbody = document.getElementById('students-table-body');
    if (!tbody) return;

    const allStudents = state.students || [];
    const filtered = filterStudents(allStudents);
    const sorted = sortStudents(filtered);
    const totalPages = getTotalPages(sorted.length);

    // Clamp page
    if (currentPage > totalPages) currentPage = totalPages;

    const pageData = paginateStudents(sorted);

    updateCountLabel(filtered.length, allStudents.length);
    updateSortIndicators();
    renderPagination(sorted.length);

    // Empty state
    if (pageData.length === 0) {
        const isFiltered = searchQuery || filterStatus || filterMajor || filterRoom;
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center">
                    <div class="flex flex-col items-center justify-center text-slate-400">
                        <span class="material-symbols-outlined text-6xl mb-4 text-slate-200">${isFiltered ? 'filter_list_off' : 'group_off'}</span>
                        <p class="text-[13px] font-medium">${isFiltered ? 'Không tìm thấy sinh viên phù hợp bộ lọc.' : 'Chưa có sinh viên nào, hãy thêm mới!'}</p>
                        ${isFiltered ? '<button class="mt-3 text-primary text-[12px] font-bold hover:underline" id="clear-filters-btn">Xóa bộ lọc</button>' : ''}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pageData.map((sv, index) => {
        const delay = index * 25 + 50;
        const char0 = (sv.name || '?').charAt(0);
        const contactParts = [
            sv.phone ? `<span class="text-slate-400">SĐT: ${escapeHtml(sv.phone)}</span>` : '',
            sv.email ? `<span class="text-slate-400">${escapeHtml(sv.email)}</span>` : ''
        ].filter(Boolean).join(' · ');
        const contactLine = contactParts ? `<p class="text-[11px] mt-0.5 tracking-tight">${contactParts}</p>` : '';

        return `
        <tr class="animate-fade-in hover:bg-[#f8fafc]/50 transition-colors" style="animation-delay: ${delay}ms">
            <td class="p-4 px-6 border-b border-slate-100 align-middle">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shadow-inner text-sm">${escapeHtml(char0)}</div>
                    <div class="min-w-0">
                        <p class="text-[14px] font-bold text-slate-800 truncate">${escapeHtml(sv.name)}</p>
                        <p class="text-[11px] font-semibold text-slate-500 mt-0.5 bg-slate-100 inline-block px-1.5 py-[1px] rounded">${escapeHtml(sv.id)}</p>
                        ${contactLine}
                    </div>
                </div>
            </td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-[13px] font-bold text-slate-800 tracking-tight">Phòng ${escapeHtml(String(sv.room || 'Chưa xếp'))}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-[13px] font-medium text-slate-500">${escapeHtml(sv.major)}</td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle">
                <div class="relative inline-block">
                    <select class="status-select pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-[10px] text-[12px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer transition-colors hover:bg-slate-100" data-id="${escapeHtml(sv.id)}">
                        <option value="Mới" ${sv.status === 'Mới' ? 'selected' : ''}>Mới</option>
                        <option value="Đang ở" ${sv.status === 'Đang ở' ? 'selected' : ''}>Đang ở</option>
                        <option value="Đã rời đi" ${sv.status === 'Đã rời đi' ? 'selected' : ''}>Đã rời đi</option>
                    </select>
                    <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[1rem]">expand_more</span>
                </div>
            </td>
            <td class="p-4 px-6 border-b border-slate-100 align-middle text-right w-[100px]">
                <button class="edit-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-primary hover:bg-blue-50 transition-colors" data-id="${escapeHtml(sv.id)}" title="Chỉnh sửa"><span class="material-symbols-outlined text-[1.15rem]">edit</span></button>
                <button class="delete-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" data-id="${escapeHtml(sv.id)}" title="Xóa"><span class="material-symbols-outlined text-[1.15rem]">delete</span></button>
            </td>
        </tr>`;
    }).join('');
}

// ── Room dropdown options from state ──
const getRoomOptions = () => {
    const state = getState();
    return (state.rooms || [])
        .filter((r) => r.status === 'Còn trống')
        .map((r) => `${r.id}`)
        .sort();
};

// ── Event Listeners ──
export function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('search-student-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            currentPage = 1;
            renderStudents();
        });
    }

    // Filters
    const bindFilter = (id, setter) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', (e) => {
                setter(e.target.value);
                currentPage = 1;
                renderStudents();
            });
        }
    };
    bindFilter('filter-status', (v) => { filterStatus = v; });
    bindFilter('filter-major', (v) => { filterMajor = v; });
    bindFilter('filter-room', (v) => { filterRoom = v; });

    // Page size
    const pageSizeSelect = document.getElementById('page-size-select');
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value, 10);
            currentPage = 1;
            renderStudents();
        });
    }

    // Pagination clicks
    const paginationContainer = document.getElementById('pagination-controls');
    if (paginationContainer) {
        paginationContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (!btn || btn.disabled) return;
            const page = parseInt(btn.dataset.page, 10);
            if (page >= 1 && page !== currentPage) {
                currentPage = page;
                renderStudents();
                // Scroll table into view
                document.getElementById('students-table-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // Sort headers
    document.querySelectorAll('.sortable-th').forEach((th) => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (sortField === field) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortDir = 'asc';
            }
            currentPage = 1;
            renderStudents();
        });
    });

    // Add student
    const addBtn = document.getElementById('add-student-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const roomOpts = getRoomOptions();
            const data = await showPrompt('Thêm Sinh Viên', [
                { name: 'name', label: 'Họ và tên *', placeholder: 'VD: Nguyễn Văn A', required: true },
                { name: 'id', label: 'MSSV *', placeholder: 'VD: SV1026', required: true },
                { name: 'major', label: 'Khoa / Ngành học *', placeholder: 'VD: CNTT', required: true },
                { name: 'phone', label: 'Số điện thoại', placeholder: 'VD: 0901234567', required: false },
                { name: 'email', label: 'Email', placeholder: 'VD: sv@gmail.com', required: false },
                { name: 'room', label: 'Xếp phòng', type: 'select', placeholder: '-- Chọn phòng --', options: roomOpts, required: false }
            ]);
            if (!data) return;

            // Validate
            const errors = validateStudent(data);
            if (errors.length > 0) {
                showToast(errors[0], 'error');
                return;
            }

            const state = getState();
            if (state.students.some((s) => s.id === data.id)) {
                showToast('MSSV đã tồn tại trong hệ thống!', 'error');
                return;
            }

            const newSv = {
                id: data.id.trim(),
                name: data.name.trim(),
                major: data.major.trim(),
                phone: (data.phone || '').replace(/\s/g, ''),
                email: (data.email || '').trim(),
                room: data.room || 'Chưa xếp',
                status: 'Mới'
            };
            updateState({ students: [newSv, ...state.students] });
            populateFilterDropdowns();
            showToast(`Đã thêm sinh viên ${newSv.name} thành công!`, 'success');
        });
    }

    // Table interactions (edit, delete, status change, clear filters)
    const tbody = document.getElementById('students-table-body');
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            // Clear filters button in empty state
            const clearBtn = e.target.closest('#clear-filters-btn');
            if (clearBtn) {
                searchQuery = '';
                filterStatus = '';
                filterMajor = '';
                filterRoom = '';
                const searchEl = document.getElementById('search-student-input');
                if (searchEl) searchEl.value = '';
                ['filter-status', 'filter-major', 'filter-room'].forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                currentPage = 1;
                renderStudents();
                return;
            }

            // Edit
            const editBtn = e.target.closest('.edit-btn');
            if (editBtn) {
                const id = editBtn.dataset.id;
                const state = getState();
                const student = state.students.find((s) => s.id === id);
                if (!student) return;

                const roomOpts = getRoomOptions();
                // Ensure current room is in options even if full
                if (student.room && !roomOpts.includes(String(student.room))) {
                    roomOpts.unshift(String(student.room));
                }

                const data = await showPrompt('Chỉnh sửa Sinh Viên', [
                    { name: 'name', label: 'Họ và tên *', value: student.name, required: true },
                    { name: 'major', label: 'Khoa / Ngành học *', value: student.major, required: true },
                    { name: 'phone', label: 'Số điện thoại', value: student.phone || '', required: false },
                    { name: 'email', label: 'Email', value: student.email || '', required: false },
                    { name: 'room', label: 'Xếp phòng', type: 'select', options: roomOpts, value: String(student.room || ''), required: false }
                ]);
                if (!data) return;

                const errors = validateStudent(data, true);
                if (errors.length > 0) {
                    showToast(errors[0], 'error');
                    return;
                }

                const updatedStudents = state.students.map((s) =>
                    s.id === id ? {
                        ...s,
                        name: data.name.trim(),
                        major: data.major.trim(),
                        phone: (data.phone || '').replace(/\s/g, ''),
                        email: (data.email || '').trim(),
                        room: data.room || s.room
                    } : s
                );
                updateState({ students: updatedStudents });
                populateFilterDropdowns();
                showToast('Cập nhật thông tin thành công!', 'success');
            }

            // Delete
            const deleteBtn = e.target.closest('.delete-btn');
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                const state = getState();
                const sv = state.students.find((s) => s.id === id);
                const confirmed = await showConfirm(
                    'Xóa Sinh Viên',
                    `Bạn có chắc chắn muốn xóa ${sv ? sv.name : 'sinh viên này'}? Dữ liệu không thể khôi phục.`,
                    true
                );
                if (confirmed) {
                    const nextStudents = state.students.filter((s) => s.id !== id);
                    updateState({ students: nextStudents });
                    populateFilterDropdowns();
                    showToast('Đã xóa sinh viên khỏi hệ thống!', 'success');
                }
            }
        });

        // Status change
        tbody.addEventListener('change', (e) => {
            const statusSelect = e.target.closest('.status-select');
            if (statusSelect) {
                const id = statusSelect.dataset.id;
                const val = statusSelect.value;
                const state = getState();
                updateState({
                    students: state.students.map((s) => s.id === id ? { ...s, status: val } : s)
                });
                showToast('Đã cập nhật trạng thái cư trú', 'success');
            }
        });
    }

    // Listen for external state changes
    window.addEventListener('stateChanged', () => {
        populateFilterDropdowns();
        renderStudents();
    });
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    const state = getState();
    if (state.students.length === 0 && initialLoad) {
        showTableSkeleton('students-table-body', 5, 5);
    }
    populateFilterDropdowns();
    renderStudents();
    setupEventListeners();
    initialLoad = false;
});
