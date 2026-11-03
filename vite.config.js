import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000';
  const proxy = Object.fromEntries(
    ['/auth', '/potholes', '/dashboard', '/detect', '/complaints', '/inspections', '/work-orders', '/analytics', '/map', '/progress', '/official', '/videos', '/health']
      .map((path) => [path, { target: apiTarget, changeOrigin: true }]),
  );

  return {
    plugins: [react()],
    server: { proxy },
  };
});
