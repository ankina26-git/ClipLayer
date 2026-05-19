import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: "src/extension/ui/sidepanel.html",
        popup: "src/extension/ui/popup.html",
        options: "src/extension/ui/options.html",
        background: "src/extension/background/index.ts",
        content: "src/extension/content/index.ts"
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]"
      }
    }
  }
});
