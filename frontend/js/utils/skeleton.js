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
