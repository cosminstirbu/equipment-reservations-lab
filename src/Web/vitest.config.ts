import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*-test-fixture.ts',
        'src/test-setup.ts',
      ],
      reportsDirectory: '../../.cache/application-reporting/raw/frontend',
      reporter: ['cobertura'],
      reportOnFailure: true,
    },
  },
});
