import { createRafBatcher } from '../utils/fp.js';

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
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:5050';

const getBackendBaseUrl = () =>
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
