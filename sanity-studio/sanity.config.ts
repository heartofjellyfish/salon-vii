import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from '../sanity-schemas'

export default defineConfig({
  name: 'salon-vii',
  title: 'Salon VII',
  projectId: '7dt4ydmn',
  dataset: 'production',
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
})
