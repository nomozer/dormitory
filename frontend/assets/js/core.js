// ── Functional Programming Utilities ──
// Pure functions, immutability helpers, and composition tools

const requestFrame = (callback) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(callback);
    }
    return setTimeout(callback, 16);
};

// ── Composition ──
export const pipe = (...fns) => (input) => fns.reduce((acc, fn) => fn(acc), input);
export const compose = (...fns) => (input) => fns.reduceRight((acc, fn) => fn(acc), input);
export const identity = (x) => x;

// ── Memoization ──
export const memoizeOne = (fn, areEqual = Object.is) => {
    let hasCache = false;
    let lastArg;
    let lastValue;

    return (arg) => {
        if (hasCache && areEqual(arg, lastArg)) {
            return lastValue;
        }
        lastArg = arg;
        lastValue = fn(arg);
        hasCache = true;
        return lastValue;
    };
};

// Multi-argument memoize with shallow comparison
export const memoize = (fn) => {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const result = fn(...args);
        cache.set(key, result);
        if (cache.size > 100) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        return result;
    };
};

// ── Immutability Helpers ──
export const deepClone = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, deepClone(v)])
    );
};

// Immutable update: updateIn(obj, 'a.b.c', value)
export const updateWhere = (arr, predicate, updater) =>
    arr.map((item) => predicate(item) ? { ...item, ...updater(item) } : item);

// ── Throttle & Batch ──
export const createRafBatcher = () => {
    let scheduled = false;
    let latestTask = null;

    return (task) => {
        latestTask = task;
        if (scheduled) return;

        scheduled = true;
        requestFrame(() => {
            scheduled = false;
            const taskToRun = latestTask;
            latestTask = null;
            if (typeof taskToRun === 'function') {
                taskToRun();
            }
        });
    };
};

export const rafThrottle = (fn) => {
    let queued = false;
    let lastArgs = null;

    return (...args) => {
        lastArgs = args;
        if (queued) return;

        queued = true;
        requestFrame(() => {
            queued = false;
            fn(...lastArgs);
        });
    };
};

export const debounce = (fn, ms) => {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
};

// ── Selector (derived state with memoization) ──
export const createSelector = (inputFn, transformFn) => {
    let lastInput;
    let lastResult;
    let initialized = false;

    return (state) => {
        const input = inputFn(state);
        if (initialized && input === lastInput) return lastResult;
        lastInput = input;
        lastResult = transformFn(input);
        initialized = true;
        return lastResult;
    };
};

// ── HTML Escape (XSS Protection) ──
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (str) =>
    String(str ?? '').replace(/[&<>"']/g, (ch) => escapeMap[ch]);

// ── Predicate helpers ──
export const not = (fn) => (...args) => !fn(...args);
export const matchById = (id) => (item) => String(item.id) === String(id);

// ── Currency Formatter (cached Intl instance) ──
const currencyFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export const formatCurrency = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0 ₫';
    return currencyFormatter.format(num);
};

// ── Date Formatter (cached Intl instance) ──
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
});

export const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
        return dateFormatter.format(new Date(dateString));
    } catch {
        return dateString;
    }
};

// ── Number Formatter ──
const numberFormatter = new Intl.NumberFormat('vi-VN');
export const formatNumber = (num) => numberFormatter.format(num || 0);

// ── Compact Revenue (e.g. 2.5Tr) ──
export const formatCompactRevenue = (amount) => {
    if (amount >= 1000000) {
        return `${(amount / 1000000).toFixed(1).replace('.0', '')}Tr`;
    }
    return `${formatNumber(amount)}₫`;
};

// ── Today's date in YYYY-MM-DD ──
export const todayISO = () => new Date().toISOString().split('T')[0];

// ── Current month in MM/YYYY ──
export const currentMonthYear = () => {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
};

// ── Export to Excel (.xls) ──
export function exportToExcel(filename, rows) {
    const tableRows = rows
        .map((row) =>
            `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? '')}</td>`).join('')}</tr>`
        )
        .join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"></head>
    <body><table border="1">${tableRows}</table></body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
// ── Skeleton Loading Templates ──
// Show placeholder content while data loads

const skeletonRow = (cols = 5) => `
    <tr>
        ${Array.from({ length: cols }, (_, i) => `
            <td class="p-4 px-6 border-b border-slate-100">
                <div class="skeleton ${i === 0 ? 'skeleton-text' : 'skeleton-text'}" style="width: ${50 + Math.random() * 40}%"></div>
            </td>
        `).join('')}
    </tr>`;

export const showTableSkeleton = (tbodyId, rows = 5, cols = 5) => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = Array.from({ length: rows }, () => skeletonRow(cols)).join('');
};

export const showCardsSkeleton = (containerId, count = 6) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = Array.from({ length: count }, () => `
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 animate-fade-in">
            <div class="flex justify-between items-center mb-5">
                <div class="skeleton" style="width: 80px; height: 24px; border-radius: 9999px;"></div>
            </div>
            <div class="flex items-center gap-5 mb-5">
                <div class="skeleton skeleton-avatar" style="width: 60px; height: 60px; border-radius: 16px;"></div>
                <div class="flex-1">
                    <div class="skeleton skeleton-title" style="width: 70%;"></div>
                    <div class="skeleton skeleton-text" style="width: 40%;"></div>
                </div>
            </div>
            <div class="skeleton" style="width: 100%; height: 60px; border-radius: 16px;"></div>
        </div>
    `).join('');
};

export const showStatsSkeleton = (ids) => {
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '<div class="skeleton" style="height: 2.5rem; width: 80px; display: inline-block;"></div>';
        }
    });
};

// ── DOM Rendering ──
export function render(containerId, content) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (typeof content === 'string') {
        container.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        container.innerHTML = '';
        container.appendChild(content);
    }
}

export function createElement(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstElementChild;
}

// ── Toast Notification ──
const toastConfig = {
    success: { bg: 'bg-emerald-600', icon: 'check_circle' },
    error:   { bg: 'bg-rose-600',    icon: 'error' },
    warn:    { bg: 'bg-amber-600',   icon: 'warning' },
    info:    { bg: 'bg-primary',     icon: 'info' }
};

export function showToast(message, type = 'success') {
    const { bg, icon } = toastConfig[type] || toastConfig.info;
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 ${bg} text-white px-6 py-3 rounded-xl shadow-xl z-50 transform transition-all translate-y-0 opacity-100 flex items-center gap-3`;
    toast.innerHTML = `<span class="material-symbols-outlined">${icon}</span> <span class="font-semibold">${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(1rem)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ── Modal Helpers ──
const animateIn = (overlay, modal) => {
    requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        modal.classList.remove('scale-95');
    });
};

const animateOut = (overlay, modal, onDone) => {
    overlay.classList.add('opacity-0');
    modal.classList.add('scale-95');
    setTimeout(() => {
        overlay.remove();
        onDone();
    }, 200);
};

const createOverlay = () => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in opacity-0 transition-opacity duration-200';
    return overlay;
};

// ── Field Renderers ──
const renderSelectField = (f) => {
    const optionsHtml = (f.options || [])
        .map((opt) => `<option value="${escapeHtml(opt)}" ${f.value === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
        .join('');
    const placeholder = f.placeholder
        ? `<option value="" disabled ${!f.value ? 'selected' : ''}>${escapeHtml(f.placeholder)}</option>`
        : '';

    return `
    <div class="mb-4">
        <label class="block text-sm font-bold text-slate-700 mb-1.5">${escapeHtml(f.label)}</label>
        <div class="relative">
            <select name="${escapeHtml(f.name)}" class="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer" ${f.required !== false ? 'required' : ''}>
                ${placeholder}${optionsHtml}
            </select>
            <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">expand_more</span>
        </div>
    </div>`;
};

const renderInputField = (f) => `
    <div class="mb-4">
        <label class="block text-sm font-bold text-slate-700 mb-1.5">${escapeHtml(f.label)}</label>
        <input type="${f.type || 'text'}" name="${escapeHtml(f.name)}" value="${escapeHtml(f.value || '')}" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" ${f.required !== false ? 'required' : ''} placeholder="${escapeHtml(f.placeholder || '')}" autocomplete="off">
    </div>`;

const renderField = (f) => f.type === 'select' ? renderSelectField(f) : renderInputField(f);

// ── Prompt Modal ──
export function showPrompt(title, fields) {
    return new Promise((resolve) => {
        const overlay = createOverlay();
        const inputsHtml = fields.map(renderField).join('');

        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform scale-95 transition-transform duration-200" id="prompt-modal">
                <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 class="font-lexend font-bold text-main text-lg">${escapeHtml(title)}</h3>
                    <button type="button" class="cancel-btn text-slate-400 hover:text-slate-700 transition-colors"><span class="material-symbols-outlined">close</span></button>
                </div>
                <form id="prompt-form" class="p-6">
                    ${inputsHtml}
                    <div class="flex items-center justify-end gap-3 mt-8">
                        <button type="button" class="cancel-btn px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Hủy</button>
                        <button type="submit" class="px-5 py-2 text-sm font-bold text-white bg-primary hover:bg-[#7a967e] shadow-primary rounded-xl transition-colors">Xác nhận</button>
                    </div>
                </form>
            </div>`;

        document.body.appendChild(overlay);

        const form = overlay.querySelector('#prompt-form');
        const modal = overlay.querySelector('#prompt-modal');
        const firstInput = form.querySelector('input, select');

        const close = (result) => animateOut(overlay, modal, () => resolve(result));

        animateIn(overlay, modal);
        if (firstInput) setTimeout(() => firstInput.focus(), 50);

        overlay.querySelectorAll('.cancel-btn').forEach((btn) =>
            btn.addEventListener('click', () => close(null))
        );

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(null);
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const result = Object.fromEntries(new FormData(form).entries());
            close(result);
        });
    });
}

// ── Confirm Modal ──
export function showConfirm(title, message, isDanger = false) {
    return new Promise((resolve) => {
        const overlay = createOverlay();

        const iconClass = isDanger ? 'text-danger bg-rose-50' : 'text-warning bg-amber-50';
        const iconName = isDanger ? 'warning' : 'info';
        const btnClass = isDanger
            ? 'bg-danger hover:bg-rose-600 shadow-danger'
            : 'bg-primary hover:bg-[#7a967e] shadow-primary';

        overlay.innerHTML = `
            <div class="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden transform scale-95 transition-transform duration-200 text-center p-6" id="confirm-modal">
                <div class="w-16 h-16 rounded-full ${iconClass} mx-auto flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-3xl">${iconName}</span>
                </div>
                <h3 class="font-lexend font-bold text-main text-xl mb-2">${escapeHtml(title)}</h3>
                <p class="text-sm font-medium text-muted mb-8 px-2">${escapeHtml(message)}</p>
                <div class="flex items-center gap-3">
                    <button type="button" class="cancel-btn flex-1 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Hủy bỏ</button>
                    <button type="button" class="confirm-btn flex-1 py-3 text-sm font-bold text-white ${btnClass} rounded-xl transition-colors">Đồng ý</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        const modal = overlay.querySelector('#confirm-modal');

        const close = (result) => animateOut(overlay, modal, () => resolve(result));

        animateIn(overlay, modal);

        overlay.querySelector('.cancel-btn').addEventListener('click', () => close(false));
        overlay.querySelector('.confirm-btn').addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });
    });
}

export const APP_STATE_KEY = 'dorm_manager_state';

const APP_STATE_VERSION = 12;

const defaultState = {
    version: APP_STATE_VERSION,
    isSidebarCollapsed: false,
    currentPath: window.location.hash || '/',
    students: [],
    rooms: [],
    contracts: [],
    fees: [],
    violations: []
};

// ── FP-style CSV Parser ──
const splitCSVLine = (line) => line.split(',').map((v) => v.trim());

const inferType = (val) => {
    if (val === '' || val === undefined) return val;
    if (!isNaN(val)) return Number(val);
    return val;
};

const buildRow = (headers) => (values) =>
    Object.fromEntries(headers.map((h, i) => [h, inferType(values[i])]));

const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n').filter(Boolean);
    if (lines.length < 2) return [];

    const headers = splitCSVLine(lines[0]);
    const toRow = buildRow(headers);

    return lines
        .slice(1)
        .map(splitCSVLine)
        .map(toRow)
        .filter((row) => row[headers[0]] !== undefined && row[headers[0]] !== '');
};

// ── CSV Loader ──
const csvFiles = ['students', 'rooms', 'contracts', 'fees', 'violations'];
const BACKEND_URL_KEY = 'dorm_backend_url';
const DEFAULT_BACKEND_URL = (typeof window !== 'undefined' && window.DORM_CONFIG?.API_BASE_URL) 
    ? window.DORM_CONFIG.API_BASE_URL 
    : 'http://127.0.0.1:5050';

export const getBackendBaseUrl = () =>
    (localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL).replace(/\/+$/, '');

const normalizeRows = (rows) =>
    (rows || []).map((row) =>
        Object.fromEntries(
            Object.entries(row || {}).map(([key, value]) => [key, inferType(value)])
        )
    );

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryFetchError = (error) => {
    const message = String(error?.message || error || '');
    return /Failed to fetch|ERR_NETWORK_ACCESS_DENIED|NetworkError/i.test(message);
};

const fetchWithRetry = async (url, options = {}, retries = 2) => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await fetch(url, options);
        } catch (error) {
            lastError = error;
            if (attempt >= retries || !shouldRetryFetchError(error)) throw error;
            await sleep(200 * (attempt + 1));
        }
    }
    throw lastError;
};

const fetchCSV = async (name) => {
    const response = await fetchWithRetry(`data/${name}.csv`);
    if (!response.ok) {
        throw new Error(`Cannot load CSV: ${name} (${response.status})`);
    }
    const csvText = await response.text();
    return parseCSV(csvText);
};

const fetchBackendDataset = async (name) => {
    const response = await fetchWithRetry(`${getBackendBaseUrl()}/api/datasets/${name}?limit=50000`, {
        headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
        throw new Error(`Backend dataset failed: ${name} (${response.status})`);
    }
    const payload = await response.json();
    if (!payload || payload.ok !== true || !Array.isArray(payload.rows)) {
        throw new Error(`Invalid backend payload: ${name}`);
    }
    return normalizeRows(payload.rows);
};

async function initializeFromCSV() {
    try {
        let datasets;
        try {
            datasets = await Promise.all(csvFiles.map(fetchCSV));
        } catch (csvError) {
            console.warn('CSV load failed, fallback to backend datasets.', csvError);
            datasets = await Promise.all(csvFiles.map(fetchBackendDataset));
        }
        const dataMap = Object.fromEntries(csvFiles.map((name, i) => [name, datasets[i]]));

        // Auto-sync room occupancy purely based on student data
        if (dataMap.students && dataMap.rooms) {
            const occupancies = {};
            dataMap.students.forEach((sv) => {
                if (sv.room && sv.room !== 'Chưa xếp' && sv.status !== 'Đã rời đi') {
                    occupancies[sv.room] = (occupancies[sv.room] || 0) + 1;
                }
            });
            dataMap.rooms = dataMap.rooms.map((room) => {
                const newOcc = occupancies[String(room.id)] || 0;
                const newStat = room.status === 'Đang bảo trì' ? 'Đang bảo trì' :
                                (newOcc >= room.capacity ? 'Đã đầy' : 'Còn trống');
                return { ...room, occupied: newOcc, status: newStat };
            });
        }

        saveState({ ...defaultState, ...dataMap });
    } catch (e) {
        console.warn('Failed to load datasets, keep default state.', e);
        saveState({ ...defaultState });
    }
}

// ── State Access ──
let cachedState = null;
let cachedRaw = null;

export function getState() {
    const raw = localStorage.getItem(APP_STATE_KEY);

    // Return cached if localStorage hasn't changed
    if (raw === cachedRaw && cachedState) return cachedState;

    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed.version === APP_STATE_VERSION) {
                cachedRaw = raw;
                cachedState = { ...defaultState, ...parsed };
                return cachedState;
            }
        } catch (e) { /* fall through */ }
    }
    return defaultState;
}

// ── State Dispatch (RAF-batched) ──
const dispatchStateChanged = (() => {
    const schedule = createRafBatcher();
    let latestState = null;

    return (state) => {
        latestState = state;
        schedule(() => {
            window.dispatchEvent(new CustomEvent('stateChanged', { detail: latestState }));
        });
    };
})();

export function saveState(state) {
    const json = JSON.stringify(state);
    cachedRaw = json;
    cachedState = state;
    localStorage.setItem(APP_STATE_KEY, json);
    dispatchStateChanged(state);
}

// ── Immutable State Update ──
// Accepts object or updater function: updateState(s => ({ key: newVal }))
export function updateState(partialState) {
    const currentState = getState();
    const resolved = typeof partialState === 'function'
        ? partialState(currentState)
        : partialState;
    const newState = { ...currentState, ...(resolved || {}) };
    saveState(newState);
    return newState;
}

// ── Immutable Collection Helpers ──
// updateItem('students', id, { name: 'New' })  — find by id, merge fields
export const updateItem = (collection, id, updates) =>
    updateState((state) => ({
        [collection]: state[collection].map((item) =>
            String(item.id) === String(id) ? { ...item, ...updates } : item
        )
    }));

// removeItem('students', id) — filter out by id
export const removeItem = (collection, id) =>
    updateState((state) => ({
        [collection]: state[collection].filter((item) => String(item.id) !== String(id))
    }));

// addItem('students', newStudent) — prepend to collection
export const addItem = (collection, item) =>
    updateState((state) => ({
        [collection]: [item, ...state[collection]]
    }));

// ── Initialization ──
const initialRaw = localStorage.getItem(APP_STATE_KEY);
if (!initialRaw) {
    initializeFromCSV();
} else {
    try {
        const parsed = JSON.parse(initialRaw);
        if (parsed.version !== APP_STATE_VERSION) {
            initializeFromCSV();
        }
    } catch (e) {
        initializeFromCSV();
    }
}
export const setBackendBaseUrl = (url) => {
    const normalized = String(url || '').trim().replace(/\/+$/, '');
    if (!normalized) return;
    localStorage.setItem(BACKEND_URL_KEY, normalized);
};

const withTimeout = async (promise, ms) => {
    let timer;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Backend timeout')), ms);
        });
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timer);
    }
};

export async function fetchAdvancedOverview({ timeoutMs = 2800, preferCpp = false } = {}) {
    const baseUrl = getBackendBaseUrl();
    const endpoint = `${baseUrl}/api/analytics/overview?prefer_cpp=${preferCpp ? '1' : '0'}`;

    const response = await withTimeout(fetch(endpoint, {
        headers: { Accept: 'application/json' }
    }), timeoutMs);

    if (!response.ok) {
        throw new Error(`Backend responded ${response.status}`);
    }

    const payload = await response.json();
    if (!payload || payload.ok !== true || !payload.metrics) {
        throw new Error('Backend payload is invalid');
    }
    return payload;
}
