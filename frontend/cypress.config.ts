import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    env: {
      API_URL: 'http://localhost:3010',
    },
    supportFile: false,
  },
});
