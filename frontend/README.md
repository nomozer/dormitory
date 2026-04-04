# Frontend

Static UI for dormitory management.

## Main files

- `index.html` and page HTML files
- `style.css`
- `tailwind.css` (local build, generated from Tailwind CLI)
- `tailwind.input.css`
- `tailwind.config.cjs`
- `js/`
- `components/`
- `data/` (CSV seed datasets)

## Run only frontend

From project root:

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/frontend/index.html`.

## Rebuild Tailwind CSS (local, no CDN)

From project root:

```powershell
npx tailwindcss@3.4.17 -c frontend/tailwind.config.cjs -i frontend/tailwind.input.css -o frontend/tailwind.css --minify
```
