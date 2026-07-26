import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    host: true, // Expone el servidor a tu red local (192.168.1.x)
    port: 5173
    // 🔥 ELIMINADO: https: true. El plugin basicSsl lo configura automáticamente.
  }
})