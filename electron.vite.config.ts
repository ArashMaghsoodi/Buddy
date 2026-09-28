import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['nanoid'] })],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
      root: resolve('src/renderer'),
      publicDir: resolve('src/renderer/public'),
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          companion: resolve('src/renderer/companion.html'),
          region: resolve('src/renderer/region.html')
        }
      }
    },
    plugins: [react()]
  }
})
