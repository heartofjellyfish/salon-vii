import { defineType } from 'sanity';

export default defineType({
  name: 'curationQueue',
  title: 'Curation Queue',
  type: 'document',
  fields: [
    { name: 'theme', title: 'Theme', type: 'string', validation: (Rule: any) => Rule.required() },
    { name: 'artistStyle', title: 'Artist / Style', type: 'string' },
    { name: 'highlight', title: 'Highlight (one line)', type: 'text', rows: 2 },
  ],
});
