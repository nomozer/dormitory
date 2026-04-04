import { getState, updateState, APP_STATE_KEY } from '../store/state.js';
import { showToast, showConfirm } from '../utils/dom.js';
import { escapeHtml } from '../utils/fp.js';

const THEME_KEY = 'dorm_theme';
const PROFILE_KEY = 'dorm_admin_profile';

// ── Profile ──
const getProfile = () => {
    try {
        return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
    } catch {
        return {};
    }
};

const saveProfile = (data) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
};

const renderProfile = () => {
    const profile = getProfile();
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const phoneEl = document.getElementById('profile-phone');
    const roleEl = document.getElementById('profile-role');
    const avatarEl = document.getElementById('profile-avatar');

    if (nameEl) nameEl.value = profile.name || '';
    if (emailEl) emailEl.value = profile.email || '';
    if (phoneEl) phoneEl.value = profile.phone || '';
    if (roleEl) roleEl.value = profile.role || '';

    // Update avatar initials
    if (avatarEl) {
        const name = profile.name || 'Admin';
        const initials = name.split(' ').map((w) => w.charAt(0)).slice(0, 2).join('').toUpperCase() || 'AD';
        avatarEl.textContent = initials;
    }

    // Update sidebar avatar + name if visible
    updateSidebarProfile(profile);
};

const updateSidebarProfile = (profile) => {
    const btn = document.getElementById('user-menu-btn');
    if (!btn) return;
    const nameP = btn.querySelector('p.text-sm');
    const roleP = btn.querySelector('p.text-\\[0\\.65rem\\]');
    const avatar = btn.querySelector('div.w-\\[32px\\]');

    if (nameP && profile.name) nameP.textContent = profile.name;
    if (roleP && profile.role) roleP.textContent = profile.role;
    if (avatar && profile.name) {
        const initials = profile.name.split(' ').map((w) => w.charAt(0)).slice(0, 2).join('').toUpperCase();
        avatar.textContent = initials;
    }
};

// ── Data Stats ──
const renderDataStats = () => {
    const container = document.getElementById('data-stats-grid');
    if (!container) return;
    const state = getState();

    const stats = [
        { icon: 'school', label: 'Sinh viên', count: (state.students || []).length, color: 'text-blue-600', bg: 'bg-blue-50' },
        { icon: 'meeting_room', label: 'Phòng', count: (state.rooms || []).length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { icon: 'description', label: 'Hợp đồng', count: (state.contracts || []).length, color: 'text-amber-600', bg: 'bg-amber-50' },
        { icon: 'payments', label: 'Hóa đơn', count: (state.fees || []).length, color: 'text-violet-600', bg: 'bg-violet-50' },
        { icon: 'gavel', label: 'Vi phạm', count: (state.violations || []).length, color: 'text-rose-600', bg: 'bg-rose-50' }
    ];

    container.innerHTML = stats.map((s) => `
        <div class="${s.bg} rounded-xl p-3 text-center border border-slate-100/50">
            <span class="material-symbols-outlined ${s.color} text-[1.2rem]">${s.icon}</span>
            <p class="text-[18px] font-black ${s.color} mt-1">${s.count}</p>
            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${s.label}</p>
        </div>
    `).join('');
};

// ── Storage Info ──
const renderStorageInfo = () => {
    const label = document.getElementById('storage-size-label');
    const bar = document.getElementById('storage-bar');
    if (!label) return;

    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        totalSize += (localStorage.getItem(key) || '').length * 2; // UTF-16
    }
    const sizeKB = (totalSize / 1024).toFixed(1);
    const maxKB = 5120; // ~5MB typical limit
    const pct = Math.min(100, Math.round((totalSize / 1024 / maxKB) * 100));

    label.textContent = `${sizeKB} KB / ${maxKB} KB (${pct}%)`;
    if (bar) bar.style.width = `${pct}%`;
};

// ── System Info ──
const renderSystemInfo = () => {
    const container = document.getElementById('system-info-grid');
    if (!container) return;

    const state = getState();
    const info = [
        ['Phiên bản ứng dụng', `v${state.version || '7'}.0`],
        ['Kiến trúc', 'Vanilla JS + ES Modules + Tailwind CSS'],
        ['Lưu trữ', 'localStorage (browser)'],
        ['Trình duyệt', navigator.userAgent.split(') ').pop() || navigator.userAgent],
        ['Ngôn ngữ', navigator.language || 'vi-VN'],
        ['Ngày hiện tại', new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })]
    ];

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${info.map(([k, v]) => `
                <div class="flex items-start gap-3 py-2">
                    <span class="text-[12px] font-bold text-slate-400 min-w-[140px] shrink-0">${escapeHtml(k)}</span>
                    <span class="text-[12px] font-medium text-slate-700 break-all">${escapeHtml(String(v))}</span>
                </div>
            `).join('')}
        </div>
    `;
};

// ── Export JSON ──
const exportJSON = () => {
    const state = getState();
    const profile = getProfile();
    const exportData = { ...state, _profile: profile, _exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DormManager_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Đã xuất bản sao lưu JSON!', 'success');
};

// ── Import JSON ──
const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.students && !data.rooms && !data.fees) {
                showToast('File JSON không đúng định dạng DormManager', 'error');
                return;
            }
            const confirmed = await showConfirm(
                'Nhập dữ liệu từ JSON',
                'Toàn bộ dữ liệu hiện tại sẽ được thay thế bởi dữ liệu từ file. Tiếp tục?',
                true
            );
            if (!confirmed) return;

            // Extract profile if exists
            if (data._profile) {
                saveProfile(data._profile);
                delete data._profile;
            }
            delete data._exportDate;

            // Replace full state
            localStorage.setItem(APP_STATE_KEY, JSON.stringify(data));
            showToast('Đã nhập dữ liệu thành công! Đang tải lại...', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } catch {
            showToast('File JSON không hợp lệ', 'error');
        }
    };
    reader.readAsText(file);
};

// ── Render all settings ──
export function renderSettings() {
    const state = getState();

    // Sidebar collapse toggle
    const collapseToggle = document.getElementById('setting-collapse-sidebar');
    if (collapseToggle) collapseToggle.checked = state.isSidebarCollapsed;

    // Dark mode toggle
    const darkToggle = document.getElementById('setting-dark-mode');
    if (darkToggle) darkToggle.checked = document.documentElement.classList.contains('dark');

    renderProfile();
    renderDataStats();
    renderStorageInfo();
    renderSystemInfo();
}

// ── Event Listeners ──
export function setupSettingsListeners() {
    // Profile form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(profileForm);
            const profile = {
                name: formData.get('adminName') || '',
                email: formData.get('adminEmail') || '',
                phone: formData.get('adminPhone') || '',
                role: formData.get('adminRole') || ''
            };

            // Validate
            if (profile.name && profile.name.trim().length < 2) {
                showToast('Tên phải có ít nhất 2 ký tự', 'error');
                return;
            }
            if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
                showToast('Email không hợp lệ', 'error');
                return;
            }

            saveProfile(profile);
            renderProfile();
            showToast('Đã lưu hồ sơ quản trị viên!', 'success');
        });
    }

    // Dark mode toggle
    const darkToggle = document.getElementById('setting-dark-mode');
    if (darkToggle) {
        darkToggle.addEventListener('change', (e) => {
            const theme = e.target.checked ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', e.target.checked);
            localStorage.setItem(THEME_KEY, theme);
            showToast(e.target.checked ? 'Đã bật chế độ tối' : 'Đã bật chế độ sáng', 'info');
        });
    }

    // Sidebar collapse
    const collapseToggle = document.getElementById('setting-collapse-sidebar');
    if (collapseToggle) {
        collapseToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            updateState({ isSidebarCollapsed: isChecked });
            const sidebar = document.getElementById('main-sidebar');
            const sidebarBtn = document.getElementById('sidebar-toggle');
            if (sidebar) {
                const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');
                if (isChecked !== isCurrentlyCollapsed && sidebarBtn) sidebarBtn.click();
            }
            showToast('Đã lưu thiết lập giao diện!', 'success');
        });
    }

    // Factory Reset
    const resetBtn = document.getElementById('btn-factory-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm(
                'Xác nhận Khôi phục gốc',
                'Hành động này sẽ XÓA TOÀN BỘ dữ liệu và tải lại từ CSV gốc. Không thể hoàn tác!',
                true
            );
            if (confirmed) {
                localStorage.removeItem(APP_STATE_KEY);
                localStorage.removeItem(PROFILE_KEY);
                showToast('Đang thiết lập lại hệ thống...', 'success');
                setTimeout(() => { window.location.href = 'index.html'; }, 1000);
            }
        });
    }

    // Clear Cache
    const cleanBtn = document.getElementById('btn-clear-cache');
    if (cleanBtn) {
        cleanBtn.addEventListener('click', () => {
            const keep = [APP_STATE_KEY, THEME_KEY, PROFILE_KEY, 'dorm_notif_read'];
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!keep.includes(key)) keysToRemove.push(key);
            }
            keysToRemove.forEach((k) => localStorage.removeItem(k));
            renderStorageInfo();
            showToast(`Đã dọn dẹp ${keysToRemove.length} mục rác!`, 'success');
        });
    }

    // Export JSON
    const exportBtn = document.getElementById('btn-export-json');
    if (exportBtn) exportBtn.addEventListener('click', exportJSON);

    // Import JSON
    const importInput = document.getElementById('btn-import-json');
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) importJSON(file);
            e.target.value = ''; // reset for re-select
        });
    }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('componentsLoaded', renderProfile);
    renderSettings();
    setupSettingsListeners();
});
