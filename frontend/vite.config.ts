import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-api-base',
      transformIndexHtml(html) {
        const base = process.env.VITE_API_BASE_URL || '/api';
        return html.replace('%%VITE_API_BASE_URL%%', base);
      },
    },
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000', '/health': 'http://localhost:4000' },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-axios': ['axios'],
        },
      },
    },
  },
});
