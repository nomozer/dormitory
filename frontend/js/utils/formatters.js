import { escapeHtml } from './fp.js';

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
