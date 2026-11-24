import { defineConfig } from "vitest/config";

const postgresFiles = [
  "app/modules/storage/tests/server/*.contract.test.ts",
  "app/modules/storage/tests/server/postgres.test.ts",
  "app/modules/storage/tests/server/postgres-query-plans.test.ts",
  "app/modules/cli/tests/server/serve-postgres.test.ts",
];

const s3Files = [
  "app/modules/storage/tests/server/asset-store.contract.test.ts",
  "app/modules/cli/tests/server/serve-s3.test.ts",
];

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "app/**/tests/**",
        "packages/handler-example/app/**/tests/**",
        "packages/handler-example/app/main.ts",
        "app/modules/sdk/lib/generated/**",
        "app/main.ts",
        "app/dev.ts",
        "app/web.tsx",
        "app/modules/live/lib/event-source.ts",
        "app/modules/format/lib/browser-clock.ts",
        "app/modules/page-focus/lib/document.ts",
        "app/modules/unread/lib/browser-reading.ts",
      ],
      include: ["app/**/*.{ts,tsx}", "packages/handler-example/app/**/*.ts"],
      provider: "v8",
      thresholds: {
        autoUpdate: false,
        branches: 96.42,
        functions: 99.54,
        lines: 99.93,
        statements: 99.76,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          exclude: ["app/**/*.browser.test.ts", ...postgresFiles, ...s3Files],
          include: [
            "app/**/*.test.ts",
            "packages/handler-example/app/**/*.test.ts",
            "lint/**/*.test.js",
            "scripts/**/*.test.ts",
          ],
          isolate: false,
          name: "server",
        },
      },
      {
        extends: true,
        test: {
          exclude: s3Files,
          globalSetup: ["./scripts/postgres-test-container.ts"],
          include: postgresFiles,
          isolate: false,
          name: "postgres",
        },
      },
      {
        extends: true,
        test: {
          globalSetup: ["./scripts/s3-test-container.ts"],
          include: s3Files,
          isolate: false,
          name: "s3",
        },
      },
      {
        extends: true,
        test: {
          environment: "./scripts/web-test-environment.ts",
          exclude: ["app/**/*.clock.test.tsx"],
          include: ["app/**/*.test.tsx"],
          name: "web",
        },
      },
      {
        extends: true,
        test: {
          environment: "./scripts/jsdom-server-environment.ts",
          include: ["app/**/*.clock.test.tsx"],
          name: "web-clock",
        },
      },
    ],
  },
});
