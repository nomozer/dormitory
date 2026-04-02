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
