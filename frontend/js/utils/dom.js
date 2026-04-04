import { escapeHtml } from './fp.js';

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
