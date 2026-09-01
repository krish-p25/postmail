import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '../..'),
  server: {
    port: 3006,
    host: true,
    allowedHosts: ['localhost', '127.0.0.1', '0.0.0.0', 'postmail.krishrp.xyz'],
  },
});
