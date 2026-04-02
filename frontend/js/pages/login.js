import { showToast } from '../utils/dom.js';

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="animation: spin 1s linear infinite;">progress_activity</span> Đang xử lý...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    setTimeout(() => {
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;
        
        if (user.toLowerCase() === 'admin' && pass === '123456') {
            showToast('Đăng nhập thành công! Đang chuyển hướng...', 'success');
            setTimeout(() => window.location.href = 'index.html', 800);
        } else {
            showToast('Sai tài khoản hoặc mật khẩu! (Dùng: admin/123456)', 'error');
            btn.innerHTML = originalContent;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }, 1000);
});
