import { defineConfig } from "tsdown";

export default defineConfig([
  {
    clean: true,
    dts: false,
    entry: { main: "app/main.ts" },
    fixedExtension: false,
    format: "esm",
    outDir: "dist",
    platform: "node",
    target: "node22.19",
  },
  {
    clean: true,
    dts: true,
    entry: { sdk: "app/modules/sdk/index.ts" },
    fixedExtension: false,
    format: "esm",
    outDir: "dist",
    platform: "node",
    target: "node22.19",
    tsconfig: "tsconfig.sdk.json",
  },
]);
