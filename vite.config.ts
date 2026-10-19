import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: '/themes/Endfield/dist/',
    server: {
      port: 5173,
      proxy: env.KOMARI_API_TARGET ? {
        '/api': { target: env.KOMARI_API_TARGET, changeOrigin: true, ws: true },
      } : undefined,
    },
    build: { assetsDir: 'assets', sourcemap: false },
  };
});
