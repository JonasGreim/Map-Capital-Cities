import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "PORT");
  return {
    plugins: [react()],
    server: {
      host: true,
      proxy: { "/capital": { target: `http://127.0.0.1:${process.env.PORT ?? env.PORT ?? "3001"}` } },
    },
    envDir: "..",
  };
});
