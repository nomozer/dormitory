// Core application logic for Vanilla HTML/CSS architecture
import { getState, updateState } from './store/state.js';
import { showToast } from './utils/dom.js';
import { debounce, escapeHtml } from './utils/fp.js';
import { formatCurrency, formatDate } from './utils/formatters.js';

// ── Dark Mode (runs before DOM to prevent flash) ──
const THEME_KEY = 'dorm_theme';

const getPreferredTheme = () => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
};

// Apply immediately to prevent flash of wrong theme
applyTheme(getPreferredTheme());

// ── Component Loader ──
const loadComponent = async (containerId, url, transform) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const res = await fetch(url);
        let html = await res.text();
        if (transform) html = transform(html);
        container.innerHTML = html;
    } catch (e) {
        console.error(`Failed to load ${url}`, e);
    }
};

const getActivePage = () => {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const pageMap = {
        'index.html': 'index',
        'students.html': 'students',
        'rooms.html': 'rooms',
        'contracts.html': 'contracts',
        'fees.html': 'fees',
        'violations.html': 'violations',
        'reports.html': 'reports'
    };
    return pageMap[path] || '';
};

const markActiveSidebar = (html) => {
    const activePage = getActivePage();
    return html.replace(/\$\{active_([a-z]+)\}/g, (_, p1) =>
        activePage === p1 ? 'active' : ''
    );
};

async function loadComponents() {
    await Promise.all([
        loadComponent('sidebar-container', 'components/sidebar.html', markActiveSidebar),
        loadComponent('header-container', 'components/header.html')
    ]);
    initInteractions();
}

// ── UI Interactions ──
const toggleClasses = (el, add, remove) => {
    el.classList.add(...add);
    el.classList.remove(...remove);
};

function initInteractions() {
    // Sidebar Toggle
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('main-sidebar');
    const state = getState();

    if (state.isSidebarCollapsed && sidebar) {
        sidebar.classList.add('collapsed');
        if (toggleBtn) toggleBtn.querySelector('span').textContent = 'left_panel_open';
    }

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            toggleBtn.querySelector('span').textContent = isCollapsed ? 'left_panel_open' : 'left_panel_close';
            updateState({ isSidebarCollapsed: isCollapsed });
        });
    }

    // Dark Mode Toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isDark = document.documentElement.classList.contains('dark');
            const newTheme = isDark ? 'light' : 'dark';
            applyTheme(newTheme);
            showToast(newTheme === 'dark' ? 'Đã bật chế độ tối' : 'Đã bật chế độ sáng', 'info');
        });
    }

    // Listen for OS theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_KEY)) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });

    // ── Global Search ──
    initGlobalSearch();

    // ── Notification System ──
    initNotifications();

    // Profile menu toggle
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userMenuPopup = document.getElementById('user-menu-popup');
    if (userMenuBtn && userMenuPopup) {
        const showMenu = ['opacity-100', 'translate-y-0'];
        const hideMenu = ['invisible', 'opacity-0', 'translate-y-2'];

        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = !userMenuPopup.classList.contains('invisible');
            if (isVisible) {
                toggleClasses(userMenuPopup, hideMenu, showMenu);
            } else {
                toggleClasses(userMenuPopup, showMenu, hideMenu);
            }
        });

        document.addEventListener('click', (e) => {
            if (!userMenuPopup.contains(e.target) && !userMenuBtn.contains(e.target)) {
                toggleClasses(userMenuPopup, hideMenu, showMenu);
            }
        });
    }
}

// ── Global Search ──
const PAGE_MAP = {
    students: 'students.html',
    rooms: 'rooms.html',
    contracts: 'contracts.html',
    fees: 'fees.html',
    violations: 'violations.html'
};

const ICON_MAP = {
    students: 'school',
    rooms: 'meeting_room',
    contracts: 'description',
    fees: 'payments',
    violations: 'gavel'
};

const LABEL_MAP = {
    students: 'Sinh viên',
    rooms: 'Phòng',
    contracts: 'Hợp đồng',
    fees: 'Phí',
    violations: 'Vi phạm'
};

const searchCollections = (query) => {
    const state = getState();
    const q = query.toLowerCase().trim();
    if (!q || q.length < 2) return [];

    const results = [];
    const limit = 5; // max per category

    // Search students
    (state.students || []).forEach((s) => {
        if (results.filter((r) => r.type === 'students').length >= limit) return;
        const haystack = `${s.name} ${s.id} ${s.room} ${s.major}`.toLowerCase();
        if (haystack.includes(q)) {
            results.push({
                type: 'students',
                title: s.name,
                subtitle: `${s.id} • Phòng ${s.room}`,
                id: s.id
            });
        }
    });

    // Search rooms
    (state.rooms || []).forEach((r) => {
        if (results.filter((res) => res.type === 'rooms').length >= limit) return;
        const haystack = `${r.id} ${r.building} ${r.type} ${r.status}`.toLowerCase();
        if (haystack.includes(q)) {
            results.push({
                type: 'rooms',
                title: `Phòng ${r.id}`,
                subtitle: `${r.building} • ${r.type} • ${r.status}`,
                id: r.id
            });
        }
    });

    // Search contracts
    (state.contracts || []).forEach((c) => {
        if (results.filter((res) => res.type === 'contracts').length >= limit) return;
        const haystack = `${c.id} ${c.studentName} ${c.studentId} ${c.room}`.toLowerCase();
        if (haystack.includes(q)) {
            results.push({
                type: 'contracts',
                title: c.id,
                subtitle: `${c.studentName} • Phòng ${c.room}`,
                id: c.id
            });
        }
    });

    // Search violations
    (state.violations || []).forEach((v) => {
        if (results.filter((res) => res.type === 'violations').length >= limit) return;
        const haystack = `${v.studentName} ${v.studentId} ${v.reason} ${v.room}`.toLowerCase();
        if (haystack.includes(q)) {
            results.push({
                type: 'violations',
                title: v.studentName,
                subtitle: `${v.reason} • ${v.status}`,
                id: v.id
            });
        }
    });

    return results;
};

const renderSearchResults = (results, query) => {
    if (results.length === 0) {
        return `<div class="px-4 py-6 text-center text-sm text-slate-400">
            <span class="material-symbols-outlined text-2xl mb-1 block">search_off</span>
            Không tìm thấy kết quả cho "<strong>${escapeHtml(query)}</strong>"
        </div>`;
    }

    // Group by type
    const grouped = results.reduce((acc, item) => {
        (acc[item.type] = acc[item.type] || []).push(item);
        return acc;
    }, {});

    return Object.entries(grouped)
        .map(([type, items]) => `
            <div class="search-group">
                <div class="px-4 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50">
                    ${escapeHtml(LABEL_MAP[type])}
                </div>
                ${items.map((item) => `
                    <a href="${PAGE_MAP[type]}" class="search-result-item flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors">
                        <span class="material-symbols-outlined text-[1.2rem] text-slate-400">${ICON_MAP[type]}</span>
                        <div class="min-w-0 flex-1">
                            <div class="text-sm font-medium text-slate-700 truncate">${escapeHtml(item.title)}</div>
                            <div class="text-xs text-slate-400 truncate">${escapeHtml(item.subtitle)}</div>
                        </div>
                    </a>
                `).join('')}
            </div>
        `).join('');
};

function initGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-results-dropdown');
    const clearBtn = document.getElementById('search-clear-btn');
    if (!input || !dropdown) return;

    const performSearch = debounce((query) => {
        if (query.length < 2) {
            dropdown.classList.add('hidden');
            return;
        }
        const results = searchCollections(query);
        dropdown.innerHTML = renderSearchResults(results, query);
        dropdown.classList.remove('hidden');
    }, 250);

    input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (clearBtn) clearBtn.classList.toggle('hidden', val.length === 0);
        performSearch(val);
    });

    // Clear button
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.classList.add('hidden');
            dropdown.classList.add('hidden');
            input.focus();
        });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('search-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Ctrl+K shortcut to focus search
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            input.focus();
            input.select();
        }
        // Escape to close
        if (e.key === 'Escape' && document.activeElement === input) {
            input.blur();
            dropdown.classList.add('hidden');
        }
    });
}

// ── Notification System ──
const NOTIF_READ_KEY = 'dorm_notif_read';
const paidFeeStatuses = new Set(['Đã thanh toán', 'Đã thu']);

const getReadNotifIds = () => {
    try {
        return JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || '[]');
    } catch {
        return [];
    }
};

const deriveNotifications = () => {
    const state = getState();
    const notifications = [];
    const today = new Date();

    // Unpaid fees
    (state.fees || []).filter((f) => !paidFeeStatuses.has(f.status)).forEach((f) => {
        notifications.push({
            id: `fee-${f.id}`,
            icon: 'payments',
            color: 'text-rose-500',
            bg: 'bg-rose-50',
            title: `Phí chưa thanh toán: ${escapeHtml(f.id)}`,
            detail: `Phòng ${escapeHtml(String(f.room))} • ${formatCurrency(f.amount)}`,
            page: 'fees.html',
            priority: 2
        });
    });

    // Expiring contracts (within 30 days or already expired)
    (state.contracts || []).forEach((c) => {
        if (c.status === 'Hết hạn') {
            notifications.push({
                id: `contract-expired-${c.id}`,
                icon: 'event_busy',
                color: 'text-rose-500',
                bg: 'bg-rose-50',
                title: `Hợp đồng hết hạn: ${escapeHtml(c.id)}`,
                detail: `${escapeHtml(c.studentName)} • Hết hạn ${formatDate(c.endDate)}`,
                page: 'contracts.html',
                priority: 1
            });
        } else if (c.status === 'Sắp hết hạn' || (c.endDate && c.status === 'Hiệu lực')) {
            const end = new Date(c.endDate);
            const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 30 && daysLeft > 0) {
                notifications.push({
                    id: `contract-expiring-${c.id}`,
                    icon: 'schedule',
                    color: 'text-amber-500',
                    bg: 'bg-amber-50',
                    title: `Hợp đồng sắp hết hạn: ${escapeHtml(c.id)}`,
                    detail: `${escapeHtml(c.studentName)} • Còn ${daysLeft} ngày`,
                    page: 'contracts.html',
                    priority: 2
                });
            }
        }
    });

    // Unresolved violations
    (state.violations || []).forEach((v) => {
        if (v.status === 'Chưa xử lý') {
            notifications.push({
                id: `violation-${v.id}`,
                icon: 'gavel',
                color: 'text-orange-500',
                bg: 'bg-orange-50',
                title: `Vi phạm chưa xử lý: ${escapeHtml(v.studentName)}`,
                detail: `${escapeHtml(v.reason)} • ${v.points} điểm`,
                page: 'violations.html',
                priority: 2
            });
        } else if (v.status === 'Đang xử lý') {
            notifications.push({
                id: `violation-pending-${v.id}`,
                icon: 'pending',
                color: 'text-blue-500',
                bg: 'bg-blue-50',
                title: `Đang xử lý vi phạm: ${escapeHtml(v.studentName)}`,
                detail: `${escapeHtml(v.reason)}`,
                page: 'violations.html',
                priority: 3
            });
        }
    });

    // Rooms under maintenance
    (state.rooms || []).filter((r) => r.status === 'Đang bảo trì').forEach((r) => {
        notifications.push({
            id: `room-maint-${r.id}`,
            icon: 'build',
            color: 'text-slate-500',
            bg: 'bg-slate-100',
            title: `Phòng ${r.id} đang bảo trì`,
            detail: `${escapeHtml(String(r.building))} • Tầng ${r.floor}`,
            page: 'rooms.html',
            priority: 4
        });
    });

    // Sort by priority (lower = more urgent)
    return notifications.sort((a, b) => a.priority - b.priority);
};

const renderNotificationList = (notifications, readIds) => {
    return notifications.map((n) => {
        const isRead = readIds.includes(n.id);
        return `<a href="${n.page}" class="notif-item flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${isRead ? 'opacity-60' : ''}">
            <div class="w-8 h-8 rounded-full ${n.bg} flex items-center justify-center shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-[1rem] ${n.color}">${n.icon}</span>
            </div>
            <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-slate-700 ${isRead ? '' : 'font-semibold'}">${n.title}</div>
                <div class="text-xs text-slate-400 mt-0.5">${n.detail}</div>
            </div>
            ${isRead ? '' : '<span class="w-2 h-2 rounded-full bg-primary shrink-0 mt-2"></span>'}
        </a>`;
    }).join('');
};

function initNotifications() {
    const btn = document.getElementById('notification-btn');
    const panel = document.getElementById('notification-panel');
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');
    const empty = document.getElementById('notification-empty');
    const markReadBtn = document.getElementById('notification-mark-read');
    if (!btn || !panel) return;

    const refreshNotifications = () => {
        const notifications = deriveNotifications();
        const readIds = getReadNotifIds();
        const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length;

        // Update badge
        if (badge) {
            badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
            badge.classList.toggle('hidden', unreadCount === 0);
        }

        // Render list
        if (list && empty) {
            if (notifications.length === 0) {
                list.innerHTML = '';
                empty.classList.remove('hidden');
            } else {
                empty.classList.add('hidden');
                list.innerHTML = renderNotificationList(notifications, readIds);
            }
        }
    };

    // Initial render
    refreshNotifications();

    // Toggle panel
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
        refreshNotifications();
    });

    // Mark all as read
    if (markReadBtn) {
        markReadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const allIds = deriveNotifications().map((n) => n.id);
            localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(allIds));
            refreshNotifications();
            showToast('Đã đánh dấu tất cả đã đọc', 'success');
        });
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('notification-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            panel.classList.add('hidden');
        }
    });
}

// ── Skeleton Loading Helper ──
export const showSkeleton = (containerId, count = 3, type = 'row') => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const skeletonMap = {
        row: '<div class="skeleton skeleton-row"></div>',
        card: '<div class="skeleton skeleton-card"></div>',
    };

    container.innerHTML = Array.from({ length: count }, () => skeletonMap[type] || skeletonMap.row).join('');
};

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', loadComponents);

// Export for inline scripts and other modules
window.appState = { getState, updateState, showToast };
