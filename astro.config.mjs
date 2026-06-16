import { defineConfig } from "astro/config";
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://jamesbrayy.github.io',
  base: '/portfolio',
  integrations: [tailwind()],
  devToolbar: {
    enabled: false
  }
});