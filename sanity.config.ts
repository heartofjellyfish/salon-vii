import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './sanity-schemas';

export default defineConfig({
  name: 'salon-vii',
  title: 'Salon VII',
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '7dt4ydmn',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  basePath: '/studio',
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
});
