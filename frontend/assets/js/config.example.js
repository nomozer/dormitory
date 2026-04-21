/**
 * Frontend Configuration Example
 * Copy this file to config.js and update with your settings.
 */
const DORM_CONFIG = {
    // URL of your FastAPI backend
    API_BASE_URL: "http://127.0.0.1:5050",
    
    // Request timeout
    DEFAULT_TIMEOUT: 5000,
    
    // Environment
    ENV: "production"
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DORM_CONFIG;
} else {
    window.DORM_CONFIG = DORM_CONFIG;
}
