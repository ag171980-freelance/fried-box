import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    // Relativa sirve para colgar el build de una carpeta en XAMPP, pero
    // con BrowserRouter rompe las rutas anidadas: al recargar
    // /pedido/ord_… el navegador pide /pedido/assets/… En Netlify va '/'.
    base: env.VITE_BASE || './',
    server: {
      port: 5173,
      proxy: {
        // A dónde va /api. Por defecto al servidor embebido de PHP, que
        // no necesita Apache levantado:
        //   cd backend/public && php -S 127.0.0.1:8080 index.php
        //
        // Con Apache andando, en .env.local:
        //   VITE_API_PROXY=http://localhost/foodix/backend/public
        '/api': {
          target: env.VITE_API_PROXY || 'http://127.0.0.1:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        // Las fotos que sube el local viven en el backend, no acá. Sin
        // este proxy, en desarrollo se verían rotas: el front pide
        // /uploads/... a Vite, que no las tiene.
        '/uploads': {
          target: env.VITE_API_PROXY || 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
