// Tự động tải Tailwind CSS từ CDN trước khi render body
document.write('<script src="https://cdn.tailwindcss.com"><\/script>');

// Cấu hình Tailwind Theme
document.write(`
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          main: 'var(--color-main)',
          muted: 'var(--color-muted)',
          background: 'var(--color-bg)',
          primary: 'var(--color-primary)',
          'primary-hover': 'var(--color-primary-hover)',
          success: '#34d399',
          danger: '#fb7185',
          warning: '#fbbf24',
          info: '#818cf8',
          surface: 'var(--color-surface)',
          'surface-hover': 'var(--color-surface-hover)',
          border: 'var(--color-border)',
        },
        fontFamily: {
          sans: ['Inter', 'sans-serif'],
          lexend: ['Lexend', 'sans-serif']
        },
        boxShadow: {
          'soft': '0 4px 40px -4px rgba(0, 0, 0, 0.04)',
          'primary': '0 4px 14px 0 rgba(141, 170, 145, 0.35)',
          'danger': '0 4px 14px 0 rgba(251, 113, 133, 0.3)',
        },
        keyframes: {
          shimmer: {
            '0%': { backgroundPosition: '-200% 0' },
            '100%': { backgroundPosition: '200% 0' },
          }
        },
        animation: {
          shimmer: 'shimmer 1.5s infinite linear',
        }
      }
    }
  }
<\/script>
`);
