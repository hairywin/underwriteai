import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Change this to "/YOUR_REPO_NAME/" after you create the repo.
  base: "/underwriteai/",
});
