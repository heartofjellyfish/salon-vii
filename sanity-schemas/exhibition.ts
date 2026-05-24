export default {
  name: 'exhibition',
  title: 'Exhibition',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string', validation: (Rule: any) => Rule.required() },
    { name: 'subtitle', title: 'Subtitle', type: 'string' },
    { name: 'curatorNote', title: "Curator's Note (bilingual)", type: 'text', rows: 6 },
    { name: 'wallColor', title: 'Wall Color (hex)', type: 'string', initialValue: '#5C1822' },
    { name: 'backgroundMusic', title: 'Background Music', type: 'file' },
    {
      name: 'mode',
      title: 'Default Mode',
      type: 'string',
      options: { list: ['guided', 'unguided'] },
      initialValue: 'guided',
    },
    {
      name: 'artworks',
      title: 'Artworks',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'artwork' }] }],
    },
  ],
};
