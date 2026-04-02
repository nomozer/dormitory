import { createRafBatcher, deepClone } from '../utils/fp.js';

export const APP_STATE_KEY = 'dorm_manager_state';

const APP_STATE_VERSION = 7;

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

const fetchCSV = (name) =>
    fetch(`data/${name}.csv`).then((r) => r.text()).then(parseCSV);

async function initializeFromCSV() {
    try {
        const datasets = await Promise.all(csvFiles.map(fetchCSV));
        const dataMap = Object.fromEntries(csvFiles.map((name, i) => [name, datasets[i]]));

        saveState({ ...defaultState, ...dataMap });
    } catch (e) {
        console.error('Failed to load CSV datasets:', e);
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
