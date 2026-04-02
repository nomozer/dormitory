import { getState, updateState } from '../store/state.js';
import { showToast, showPrompt, showConfirm } from '../utils/dom.js';
import { formatCurrency } from '../utils/formatters.js';
import { escapeHtml } from '../utils/fp.js';

// ── Shared fee status set (consistent with dashboard.js) ──
const completedFeeStatuses = new Set(['Đã thanh toán', 'Đã thu']);

// ── Local UI State ──
let currentBuilding = null;
let searchQuery = '';
let filterStatus = '';
let filterType = '';
let filterFloor = '';

// ── Pure helpers ──
const matchId = (a, b) => String(a) === String(b);
const getMembersOf = (students, roomId) => students.filter((sv) => matchId(sv.room, roomId));
const getFeesOf = (fees, roomId) => fees.filter((f) => matchId(f.room, roomId));
const getContractOf = (contracts, roomId) => contracts.filter((c) => matchId(c.room, roomId));
const getViolationsOf = (violations, roomId) => violations.filter((v) => matchId(v.room, roomId));

// Derive room status from occupied/capacity
const deriveStatus = (room) => {
    if (room.status === 'Đang bảo trì') return 'Đang bảo trì';
    return room.occupied >= room.capacity ? 'Đã đầy' : 'Còn trống';
};

// ── Validation ──
const validateRoom = (data, existingIds = []) => {
    const errors = [];
    if (!data.roomNumber || !/^\d{3,4}$/.test(data.roomNumber)) errors.push('Số phòng phải là 3-4 chữ số (VD: 301)');
    if (existingIds.includes(String(data.roomNumber))) errors.push('Số phòng đã tồn tại!');
    if (!data.building) errors.push('Vui lòng chọn tòa nhà');
    if (!data.type) errors.push('Vui lòng chọn loại phòng');
    const cap = parseInt(data.capacity);
    if (!cap || cap < 1 || cap > 20) errors.push('Sức chứa phải từ 1-20 người');
    return errors;
};

// ── Stats Bar ──
const renderStatsBar = () => {
    const container = document.getElementById('room-stats-bar');
    if (!container) return;
    const state = getState();
    const rooms = state.rooms || [];
    const totalCapacity = rooms.reduce((s, r) => s + (r.capacity || 0), 0);
    const totalOccupied = rooms.reduce((s, r) => s + (r.occupied || 0), 0);
    const available = rooms.filter((r) => r.status !== 'Đang bảo trì' && r.occupied < r.capacity).length;
    const maintenance = rooms.filter((r) => r.status === 'Đang bảo trì').length;
    const occupancyRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

    const stats = [
        { icon: 'meeting_room', label: 'Tổng phòng', value: rooms.length, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
        { icon: 'check_circle', label: 'Còn trống', value: available, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
        { icon: 'groups', label: 'Tỷ lệ lấp đầy', value: `${occupancyRate}%`, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
        { icon: 'build', label: 'Bảo trì', value: maintenance, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' }
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

// ── Populate floor filter ──
const populateFloorFilter = () => {
    const state = getState();
    const floors = [...new Set((state.rooms || []).map((r) => r.floor))].filter(Boolean).sort((a, b) => a - b);
    const el = document.getElementById('filter-room-floor');
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="">Tất cả tầng</option>' +
        floors.map((f) => `<option value="${f}" ${String(current) === String(f) ? 'selected' : ''}>Tầng ${f}</option>`).join('');
};

// ── Filter rooms ──
const filterRooms = (rooms) => {
    const q = searchQuery.toLowerCase().trim();
    return rooms.filter((r) => {
        if (filterStatus && deriveStatus(r) !== filterStatus && r.status !== filterStatus) return false;
        if (filterType && r.type !== filterType) return false;
        if (filterFloor && String(r.floor) !== String(filterFloor)) return false;
        if (q) {
            const haystack = `${r.id} ${r.type} ${r.building} tầng ${r.floor}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
};

// ── Room Detail Modal ──
function showRoomDetail(roomId) {
    const state = getState();
    const room = state.rooms.find((r) => matchId(r.id, roomId));
    if (!room) return;

    const members = getMembersOf(state.students, roomId);
    const fees = getFeesOf(state.fees, roomId);
    const contracts = getContractOf(state.contracts, roomId);
    const violations = getViolationsOf(state.violations, roomId);

    const paidFees = fees.filter((f) => completedFeeStatuses.has(f.status));
    const unpaidFees = fees.filter((f) => !completedFeeStatuses.has(f.status));
    const totalPaid = paidFees.reduce((s, f) => s + (f.amount || 0), 0);
    const totalUnpaid = unpaidFees.reduce((s, f) => s + (f.amount || 0), 0);
    const percent = room.capacity ? Math.round((room.occupied / room.capacity) * 100) : 0;

    const membersHtml = members.length === 0
        ? '<div class="py-6 text-center text-slate-400 text-[13px] font-medium">Chưa có thành viên nào trong phòng</div>'
        : members.map((sv) => {
            const initial = sv.name ? sv.name.charAt(0) : '?';
            const contract = contracts.find((c) => matchId(c.studentId, sv.id));
            const statusMap = {
                'Đang ở': '<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-green-50 text-green-700 border border-green-200/50">Đang ở</span>',
                'Mới': '<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200/50">Mới</span>'
            };
            const statusBadge = statusMap[sv.status] || '<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-500">Đã rời đi</span>';

            return `
            <div class="flex items-center gap-3 py-3 px-2 border-b border-slate-100/80 last:border-0 group/member hover:bg-slate-50/50 rounded-lg transition-colors -mx-1">
                <div class="w-9 h-9 rounded-full bg-[#e6efeb] text-[#3d6b4f] flex items-center justify-center text-[13px] font-bold shrink-0">${escapeHtml(initial)}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="text-[13px] font-bold text-slate-800 truncate">${escapeHtml(sv.name)}</span>
                        ${statusBadge}
                    </div>
                    <div class="flex items-center gap-3 mt-0.5">
                        <span class="text-[11px] text-slate-400 font-semibold">${escapeHtml(sv.id)}</span>
                        <span class="text-[11px] text-slate-400">•</span>
                        <span class="text-[11px] text-slate-400 font-medium">${escapeHtml(sv.major || '')}</span>
                    </div>
                    ${contract ? `<span class="text-[10px] text-slate-400 mt-0.5 inline-block">HĐ: ${escapeHtml(contract.startDate)} → ${escapeHtml(contract.endDate)}</span>` : ''}
                </div>
                <button class="remove-member-btn opacity-0 group-hover/member:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all shrink-0" data-sv-id="${escapeHtml(sv.id)}" data-room-id="${escapeHtml(String(roomId))}" title="Chuyển đi">
                    <span class="material-symbols-outlined text-[16px]">person_remove</span>
                </button>
            </div>`;
        }).join('');

    const feesHtml = fees.length === 0
        ? '<div class="py-4 text-center text-slate-400 text-[13px] font-medium">Chưa có hóa đơn</div>'
        : fees.slice(0, 10).map((f) => {
            const isPaid = completedFeeStatuses.has(f.status);
            return `
            <div class="flex items-center justify-between py-2.5 border-b border-slate-100/60 last:border-0">
                <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center ${isPaid ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}">
                        <span class="material-symbols-outlined text-[14px]">${isPaid ? 'check_circle' : 'schedule'}</span>
                    </div>
                    <div>
                        <span class="text-[12px] font-bold text-slate-700">${escapeHtml(f.type)}</span>
                        <span class="text-[10px] text-slate-400 ml-1.5">${escapeHtml(f.month)}</span>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-[12px] font-bold ${isPaid ? 'text-green-700' : 'text-amber-700'}">${formatCurrency(f.amount)}</span>
                </div>
            </div>`;
        }).join('');

    const violationsHtml = violations.length === 0 ? '' : `
        <div class="mt-5">
            <h4 class="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[14px] text-rose-500">gavel</span> Vi phạm (${violations.length})
            </h4>
            ${violations.map((v) => `
            <div class="flex items-start gap-2.5 py-2 border-b border-slate-100/60 last:border-0">
                <div class="w-6 h-6 rounded-md bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 mt-0.5">
                    <span class="material-symbols-outlined text-[12px]">warning</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-[12px] font-semibold text-slate-700">${escapeHtml(v.reason)}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(v.studentName)} • ${escapeHtml(v.date)} • <span class="text-rose-500 font-bold">${v.points} điểm</span></p>
                </div>
            </div>`).join('')}
        </div>`;

    // Build overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-start justify-end animate-fade-in opacity-0 transition-opacity duration-200';
    overlay.id = 'room-detail-overlay';

    overlay.innerHTML = `
    <div class="room-detail-panel w-full max-w-[480px] h-full bg-white shadow-2xl transform translate-x-full transition-transform duration-300 ease-out flex flex-col" id="room-detail-panel">
        <div class="p-6 border-b border-slate-100 shrink-0">
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-4">
                    <div class="w-14 h-14 bg-gradient-to-br from-[#e6efeb] to-[#d4e5da] flex items-center justify-center rounded-2xl text-[#3d6b4f] text-xl font-black relative overflow-hidden border border-[#3d6b4f]/10">
                        <span class="relative z-10">${escapeHtml(String(room.id))}</span>
                        <div class="absolute bottom-0 left-0 right-0 bg-[#3d6b4f]/15 transition-all" style="height: ${percent}%"></div>
                    </div>
                    <div>
                        <h3 class="font-lexend font-bold text-[18px] text-slate-800">${escapeHtml(room.type)}</h3>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">${escapeHtml(room.building)} • Tầng ${room.floor}</span>
                        </div>
                    </div>
                </div>
                <button class="close-detail-btn w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="grid grid-cols-3 gap-3">
                <div class="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <p class="text-[20px] font-black text-slate-800">${room.occupied}<span class="text-[12px] text-slate-400 font-bold">/${room.capacity}</span></p>
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Thành viên</p>
                </div>
                <div class="bg-green-50/80 rounded-xl p-3 text-center border border-green-100">
                    <p class="text-[20px] font-black text-green-700">${paidFees.length}</p>
                    <p class="text-[10px] text-green-600 font-bold uppercase tracking-wider mt-0.5">Đã đóng</p>
                </div>
                <div class="bg-amber-50/80 rounded-xl p-3 text-center border border-amber-100">
                    <p class="text-[20px] font-black text-amber-700">${unpaidFees.length}</p>
                    <p class="text-[10px] text-amber-600 font-bold uppercase tracking-wider mt-0.5">Chưa thanh toán</p>
                </div>
            </div>
        </div>
        <div class="flex-1 overflow-y-auto p-6 space-y-5">
            <div>
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-[12px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[14px] text-[#3d6b4f]">group</span> Thành viên phòng
                    </h4>
                    <button class="add-member-btn text-[11px] font-bold text-primary hover:text-[#1046b6] transition-colors flex items-center gap-1" data-room-id="${escapeHtml(String(roomId))}">
                        <span class="material-symbols-outlined text-[14px]">person_add</span> Thêm
                    </button>
                </div>
                <div class="bg-slate-50/50 rounded-2xl border border-slate-100 px-3 py-1">${membersHtml}</div>
            </div>
            <div>
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-[12px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[14px] text-amber-500">receipt_long</span> Hóa đơn & Thanh toán
                    </h4>
                </div>
                <div class="bg-slate-50/50 rounded-2xl border border-slate-100 px-4 py-2">${feesHtml}</div>
                <div class="grid grid-cols-2 gap-3 mt-3">
                    <div class="bg-green-50/60 rounded-xl p-3 border border-green-100/80">
                        <p class="text-[10px] font-bold text-green-600 uppercase tracking-wider">Đã thu</p>
                        <p class="text-[14px] font-black text-green-700 mt-1">${formatCurrency(totalPaid)}</p>
                    </div>
                    <div class="bg-amber-50/60 rounded-xl p-3 border border-amber-100/80">
                        <p class="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Còn nợ</p>
                        <p class="text-[14px] font-black text-amber-700 mt-1">${formatCurrency(totalUnpaid)}</p>
                    </div>
                </div>
            </div>
            ${violationsHtml}
        </div>
        <div class="p-4 border-t border-slate-100 shrink-0 flex gap-3 bg-white">
            <button class="add-fee-btn flex-1 bg-white border border-slate-200 text-slate-700 py-2.5 rounded-xl text-[12px] font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5" data-room-id="${escapeHtml(String(roomId))}">
                <span class="material-symbols-outlined text-[16px]">add_card</span> Tạo hóa đơn
            </button>
            <button class="add-member-btn flex-1 bg-[#3d6b4f] hover:bg-[#2f5440] text-white py-2.5 rounded-xl text-[12px] font-bold transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-[#3d6b4f]/20" data-room-id="${escapeHtml(String(roomId))}">
                <span class="material-symbols-outlined text-[16px]">person_add</span> Xếp sinh viên
            </button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    const panel = overlay.querySelector('#room-detail-panel');

    requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        requestAnimationFrame(() => panel.classList.remove('translate-x-full'));
    });

    const closePanel = () => {
        panel.classList.add('translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.close-detail-btn').addEventListener('click', closePanel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });

    // Escape key to close
    const onEsc = (e) => { if (e.key === 'Escape') { closePanel(); document.removeEventListener('keydown', onEsc); } };
    document.addEventListener('keydown', onEsc);

    // Add member
    overlay.querySelectorAll('.add-member-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const state = getState();
            const room = state.rooms.find((r) => matchId(r.id, roomId));
            if (room && room.occupied >= room.capacity) {
                showToast('Phòng đã đầy, không thể thêm thành viên!', 'error');
                return;
            }
            const unassigned = state.students.filter((s) => !s.room || s.room === 'Chưa xếp');
            if (unassigned.length === 0) {
                showToast('Không còn sinh viên nào chưa được xếp phòng!', 'info');
                return;
            }
            const options = unassigned.map((s) => `${s.id} - ${s.name}`);
            const data = await showPrompt(`Xếp sinh viên vào Phòng ${roomId}`, [
                { name: 'student', label: 'Chọn sinh viên', type: 'select', options, placeholder: '-- Chọn sinh viên --', required: true }
            ]);
            if (!data || !data.student) return;
            const svId = data.student.split(' - ')[0];
            const updatedStudents = state.students.map((s) =>
                matchId(s.id, svId) ? { ...s, room: String(roomId), status: 'Đang ở' } : s
            );
            const updatedRooms = state.rooms.map((r) => {
                if (!matchId(r.id, roomId)) return r;
                const newOccupied = (r.occupied || 0) + 1;
                return { ...r, occupied: newOccupied, status: newOccupied >= r.capacity ? 'Đã đầy' : 'Còn trống' };
            });
            updateState({ students: updatedStudents, rooms: updatedRooms });
            closePanel();
            showToast(`Đã xếp sinh viên vào phòng ${roomId}!`, 'success');
            setTimeout(() => showRoomDetail(roomId), 350);
        });
    });

    // Remove member
    overlay.querySelectorAll('.remove-member-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const svId = btn.dataset.svId;
            const state = getState();
            const sv = state.students.find((s) => matchId(s.id, svId));
            const confirmed = await showConfirm(
                'Chuyển sinh viên',
                `Bạn có chắc muốn chuyển ${sv ? sv.name : 'sinh viên này'} ra khỏi phòng ${roomId}?`,
                true
            );
            if (!confirmed) return;
            const updatedStudents = state.students.map((s) =>
                matchId(s.id, svId) ? { ...s, room: 'Chưa xếp', status: 'Đã rời đi' } : s
            );
            const updatedRooms = state.rooms.map((r) => {
                if (!matchId(r.id, roomId)) return r;
                const newOccupied = Math.max(0, (r.occupied || 0) - 1);
                return { ...r, occupied: newOccupied, status: r.status === 'Đang bảo trì' ? 'Đang bảo trì' : (newOccupied >= r.capacity ? 'Đã đầy' : 'Còn trống') };
            });
            updateState({ students: updatedStudents, rooms: updatedRooms });
            closePanel();
            showToast('Đã chuyển sinh viên ra khỏi phòng!', 'success');
            setTimeout(() => showRoomDetail(roomId), 350);
        });
    });

    // Add fee
    overlay.querySelectorAll('.add-fee-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const now = new Date();
            const defaultMonth = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
            const data = await showPrompt(`Tạo hóa đơn cho Phòng ${roomId}`, [
                { name: 'type', label: 'Loại phí', type: 'select', options: ['Tiền phòng', 'Điện & Nước', 'Dịch vụ giặt ủi', 'Phí vi phạm', 'Phí khác'], required: true },
                { name: 'amount', label: 'Số tiền (VNĐ)', placeholder: 'VD: 2500000', type: 'number', required: true },
                { name: 'month', label: 'Tháng', value: defaultMonth, placeholder: 'VD: 03/2026', required: true },
                { name: 'status', label: 'Trạng thái', type: 'select', options: ['Chưa thanh toán', 'Đã thanh toán'], required: true }
            ]);
            if (!data || !data.amount || parseInt(data.amount) <= 0) {
                if (data) showToast('Số tiền phải lớn hơn 0', 'error');
                return;
            }
            const state = getState();
            const newFee = {
                id: `GD${roomId}-${Date.now().toString().slice(-4)}`,
                room: String(roomId),
                type: data.type,
                amount: parseInt(data.amount),
                month: data.month,
                status: data.status
            };
            updateState({ fees: [newFee, ...state.fees] });
            closePanel();
            showToast('Đã tạo hóa đơn thành công!', 'success');
            setTimeout(() => showRoomDetail(roomId), 350);
        });
    });
}

// ── Render Rooms Grid ──
export function renderRooms() {
    const state = getState();
    const container = document.getElementById('rooms-grid');
    const tabsContainer = document.getElementById('building-tabs');
    if (!container) return;

    // Stats
    renderStatsBar();

    let buildings = [...new Set(state.rooms.map((r) => r.building))].filter(Boolean).sort();
    if (buildings.length === 0) buildings = ['Tòa A'];
    if (!currentBuilding || !buildings.includes(currentBuilding)) currentBuilding = buildings[0];

    if (tabsContainer) {
        tabsContainer.innerHTML = buildings.map((b) => `
            <button class="building-tab pb-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${currentBuilding === b ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}" data-building="${escapeHtml(b)}">
                ${escapeHtml(b)}
            </button>
        `).join('');
    }

    // Apply building + filters
    const buildingRooms = state.rooms.filter((r) => (r.building || 'Tòa A') === currentBuilding);
    const filteredRooms = filterRooms(buildingRooms);

    // Count label
    const countLabel = document.getElementById('room-count-label');
    if (countLabel) {
        countLabel.textContent = filteredRooms.length === buildingRooms.length
            ? `${currentBuilding}: ${buildingRooms.length} phòng`
            : `${filteredRooms.length} / ${buildingRooms.length} phòng`;
    }

    if (filteredRooms.length === 0) {
        const isFiltered = searchQuery || filterStatus || filterType || filterFloor;
        container.innerHTML = `
            <div class="col-span-full py-16 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-slate-100 border-dashed animate-fade-in">
                <span class="material-symbols-outlined text-6xl mb-4 text-slate-200">${isFiltered ? 'filter_list_off' : 'sensor_door'}</span>
                <p class="text-sm font-medium">${isFiltered ? 'Không có phòng nào phù hợp bộ lọc' : `Chưa có phòng nào trong ${escapeHtml(currentBuilding)}`}</p>
                ${isFiltered
                    ? '<button id="clear-room-filters-btn" class="mt-4 px-6 py-2 bg-primary/10 text-primary font-bold rounded-xl hover:bg-primary/20 transition-colors">Xóa bộ lọc</button>'
                    : '<button id="empty-add-room-btn" class="mt-4 px-6 py-2 bg-primary/10 text-primary font-bold rounded-xl hover:bg-primary/20 transition-colors">Tạo phòng đầu tiên</button>'
                }
            </div>
        `;
        const emptyBtn = document.getElementById('empty-add-room-btn');
        if (emptyBtn) emptyBtn.addEventListener('click', () => document.getElementById('add-room-btn')?.click());
        const clearBtn = document.getElementById('clear-room-filters-btn');
        if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);
        return;
    }

    container.innerHTML = filteredRooms.map((room, index) => {
        const members = getMembersOf(state.students, room.id);
        const isMaintenance = room.status === 'Đang bảo trì';
        const isAvailable = !isMaintenance && room.occupied < room.capacity;

        let statusBadge;
        if (isMaintenance) {
            statusBadge = '<span class="px-2.5 py-1 bg-gradient-to-r from-slate-100 to-slate-200 text-slate-600 text-xs font-bold rounded-full shadow-sm border border-slate-300/50">BẢO TRÌ</span>';
        } else if (isAvailable) {
            statusBadge = `<span class="px-2.5 py-1 bg-gradient-to-r from-emerald-100 to-green-100 text-green-700 text-xs font-bold rounded-full shadow-sm border border-green-200/50">CÒN TRỐNG ${room.capacity - room.occupied}</span>`;
        } else {
            statusBadge = '<span class="px-2.5 py-1 bg-gradient-to-r from-rose-100 to-red-100 text-rose-700 text-xs font-bold rounded-full shadow-sm border border-rose-200/50">ĐÃ ĐẦY</span>';
        }

        const percent = room.capacity ? (room.occupied / room.capacity) * 100 : 0;
        const delay = index * 60 + 80;

        const avatarRow = members.slice(0, 3).map((sv) =>
            `<div class="w-6 h-6 rounded-full bg-[#e6efeb] text-[#3d6b4f] flex items-center justify-center text-[9px] font-bold border-2 border-white -ml-1.5 first:ml-0">${escapeHtml((sv.name || '?').charAt(0))}</div>`
        ).join('');
        const extraCount = members.length > 3 ? `<span class="text-[10px] font-bold text-slate-400 ml-1">+${members.length - 3}</span>` : '';

        return `
            <div class="room-card bg-white rounded-3xl shadow-soft border border-slate-100 p-6 animate-slide-up hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer" style="animation-delay: ${delay}ms;" data-room-id="${escapeHtml(String(room.id))}">
                <div class="flex justify-between items-center mb-5">
                    ${statusBadge}
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="edit-room-btn w-8 h-8 rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-primary hover:bg-blue-50 transition-colors" data-id="${escapeHtml(String(room.id))}" title="Chỉnh sửa"><span class="material-symbols-outlined text-[1.25rem]">edit</span></button>
                        <button class="delete-room-btn w-8 h-8 rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-danger hover:bg-rose-50 transition-colors" data-id="${escapeHtml(String(room.id))}" title="Xóa"><span class="material-symbols-outlined text-[1.25rem]">delete</span></button>
                    </div>
                </div>
                <div class="flex items-center gap-5 mb-5">
                    <div class="w-[60px] h-[60px] bg-gradient-to-br from-[#e6efeb] to-[#d4e5da] flex items-center justify-center rounded-2xl text-[#3d6b4f] text-2xl font-black relative overflow-hidden border border-[#3d6b4f]/10 shadow-inner">
                        <span class="relative z-10">${escapeHtml(String(room.id))}</span>
                        <div class="absolute bottom-0 left-0 right-0 bg-[#3d6b4f]/15 transition-all duration-700 ease-out" style="height: ${percent}%;"></div>
                    </div>
                    <div>
                        <h3 class="font-lexend font-bold text-[1.125rem] text-main">${escapeHtml(room.type)}</h3>
                        <p class="text-[0.65rem] text-muted font-bold uppercase mt-1 tracking-widest bg-slate-100 inline-block px-2 py-0.5 rounded-md">Tầng ${room.floor}</p>
                    </div>
                </div>
                <div class="flex items-center mb-4 min-h-[28px]">
                    ${avatarRow ? `<div class="flex items-center">${avatarRow}${extraCount}</div>` : '<span class="text-[11px] text-slate-400 font-medium italic">Chưa có thành viên</span>'}
                </div>
                <div class="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                    <div class="flex justify-between items-end mb-3">
                        <span class="text-xs font-bold text-muted uppercase tracking-wider">Sĩ số</span>
                        <span class="text-sm font-black text-main">${room.occupied} <span class="text-muted font-bold text-xs">/ ${room.capacity} SV</span></span>
                    </div>
                    <div class="w-full h-2.5 bg-slate-200/60 rounded-full overflow-hidden shadow-inner">
                        <div class="h-full bg-gradient-to-r from-[#3d6b4f] to-[#5a9a6e] rounded-full transition-all duration-700 ease-out" style="width: ${percent}%;"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ── Clear all filters ──
const clearAllFilters = () => {
    searchQuery = '';
    filterStatus = '';
    filterType = '';
    filterFloor = '';
    const ids = ['search-room-input', 'filter-room-status', 'filter-room-type', 'filter-room-floor'];
    ids.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderRooms();
};

// ── Event Listeners ──
export function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('search-room-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderRooms();
        });
    }

    // Filters
    const bindFilter = (id, setter) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', (e) => { setter(e.target.value); renderRooms(); });
    };
    bindFilter('filter-room-status', (v) => { filterStatus = v; });
    bindFilter('filter-room-type', (v) => { filterType = v; });
    bindFilter('filter-room-floor', (v) => { filterFloor = v; });

    // Add room
    const addBtn = document.getElementById('add-room-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const state = getState();
            const existingIds = state.rooms.map((r) => String(r.id));
            const data = await showPrompt('Thêm Phòng Mới', [
                { name: 'roomNumber', label: 'Số phòng *', placeholder: 'VD: 301', required: true },
                { name: 'building', label: 'Tòa nhà *', type: 'select', placeholder: 'Chọn tòa nhà', options: ['Tòa A', 'Tòa B', 'Tòa C', 'Tòa D'], required: true },
                { name: 'type', label: 'Loại phòng *', type: 'select', placeholder: 'Chọn loại phòng', options: ['Phòng Tiêu Chuẩn', 'Phòng Cao Cấp', 'Phòng VIP'], required: true },
                { name: 'capacity', label: 'Sức chứa (1-20)', placeholder: '4', type: 'number', required: true }
            ]);
            if (!data) return;

            const errors = validateRoom(data, existingIds);
            if (errors.length > 0) {
                showToast(errors[0], 'error');
                return;
            }

            const building = data.building || currentBuilding || 'Tòa A';
            const newRoom = {
                id: data.roomNumber,
                type: data.type || 'Phòng Tiêu Chuẩn',
                capacity: parseInt(data.capacity) || 4,
                occupied: 0,
                floor: Math.floor(parseInt(data.roomNumber) / 100) || 1,
                building,
                status: 'Còn trống'
            };
            updateState({ rooms: [newRoom, ...state.rooms] });
            populateFloorFilter();
            showToast(`Đã thêm phòng ${data.roomNumber} ở ${building} thành công!`, 'success');
        });
    }

    // Building tabs
    const tabsContainer = document.getElementById('building-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.building-tab');
            if (tabBtn) {
                currentBuilding = tabBtn.dataset.building;
                renderRooms();
            }
        });
    }

    // Room grid interactions
    const grid = document.getElementById('rooms-grid');
    if (grid) {
        grid.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-room-btn');
            const deleteBtn = e.target.closest('.delete-room-btn');

            if (!editBtn && !deleteBtn) {
                const card = e.target.closest('.room-card');
                if (card) {
                    showRoomDetail(card.dataset.roomId);
                    return;
                }
            }

            if (editBtn) {
                e.stopPropagation();
                const id = editBtn.dataset.id;
                const state = getState();
                const room = state.rooms.find((r) => matchId(r.id, id));
                if (!room) return;

                const data = await showPrompt(`Chỉnh sửa Phòng ${room.id}`, [
                    { name: 'type', label: 'Loại phòng', value: room.type, type: 'select', options: ['Phòng Tiêu Chuẩn', 'Phòng Cao Cấp', 'Phòng VIP'] },
                    { name: 'capacity', label: 'Sức chứa (tối đa)', value: String(room.capacity), type: 'number' },
                    { name: 'status', label: 'Trạng thái', value: room.status, type: 'select', options: ['Còn trống', 'Đã đầy', 'Đang bảo trì'] }
                ]);
                if (!data) return;

                const newCap = parseInt(data.capacity) || room.capacity;
                if (newCap < 1 || newCap > 20) {
                    showToast('Sức chứa phải từ 1-20', 'error');
                    return;
                }
                if (newCap < room.occupied) {
                    showToast(`Sức chứa không thể nhỏ hơn số người đang ở (${room.occupied})`, 'error');
                    return;
                }

                const updatedRooms = state.rooms.map((r) => {
                    if (!matchId(r.id, id)) return r;
                    const status = data.status || deriveStatus({ ...r, capacity: newCap });
                    return { ...r, type: data.type || r.type, capacity: newCap, status };
                });
                updateState({ rooms: updatedRooms });
                populateFloorFilter();
                showToast('Cập nhật phòng thành công!', 'success');
            }

            if (deleteBtn) {
                e.stopPropagation();
                const id = deleteBtn.dataset.id;
                const state = getState();
                const room = state.rooms.find((r) => matchId(r.id, id));
                const members = room ? getMembersOf(state.students, room.id) : [];

                if (members.length > 0) {
                    showToast(`Phòng ${id} đang có ${members.length} sinh viên. Hãy chuyển hết SV trước khi xóa.`, 'error');
                    return;
                }

                const confirmed = await showConfirm('Xóa Phòng', `Bạn có chắc chắn muốn xóa phòng ${id}?`, true);
                if (confirmed) {
                    updateState({ rooms: state.rooms.filter((r) => !matchId(r.id, id)) });
                    populateFloorFilter();
                    showToast('Đã xóa phòng!', 'success');
                }
            }
        });
    }

    window.addEventListener('stateChanged', () => {
        populateFloorFilter();
        renderRooms();
    });
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    populateFloorFilter();
    renderRooms();
    setupEventListeners();
});
