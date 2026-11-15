import react from '@vitejs/plugin-react';
import path from 'path/posix';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';
import { watchAndRun } from 'vite-plugin-watch-and-run';

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    // relative, so the bundle works under whatever server.prefix the Go server is given
    base: './',
    envDir: path.resolve(__dirname, '..'),
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      svgr(),
      watchAndRun([
        {
          name: 'watch-openapi',
          watch: ['../openapi.yaml'],
          run: 'npm run schema',
        },
      ]),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    css: {
      modules: {
        localsConvention: 'camelCaseOnly' as const,
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as import('vite').ServerOptions['allowedHosts'],
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: false,
        },
      },
    },
  };
});
