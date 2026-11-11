import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Only the Supabase URL and the publishable (public) key reach the browser.
  // The secret key is never read here.
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? "";
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? "";
  return {
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY":
        JSON.stringify(supabaseKey),
    },
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
  };
});
