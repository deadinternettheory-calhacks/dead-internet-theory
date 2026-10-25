import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'] },
  build: {
    rollupOptions: {
      input: { sidepanel: 'sidepanel.html', report: 'report.html', 'service-worker': 'src/service-worker.ts' },
      output: { entryFileNames: chunk => chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js' },
    },
  },
});
