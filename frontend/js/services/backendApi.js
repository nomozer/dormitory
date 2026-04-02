const BACKEND_URL_KEY = 'dorm_backend_url';
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:5050';

export const getBackendBaseUrl = () =>
    (localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL).replace(/\/+$/, '');

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

export async function fetchAdvancedOverview({ timeoutMs = 2800, preferCpp = true } = {}) {
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
