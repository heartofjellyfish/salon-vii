import { defineType } from 'sanity';

export default defineType({
  name: 'artwork',
  title: 'Artwork',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title (English)', type: 'string', validation: (Rule: any) => Rule.required() },
    { name: 'titleCN', title: 'Title (Chinese)', type: 'string' },
    { name: 'artist', title: 'Artist', type: 'string', validation: (Rule: any) => Rule.required() },
    { name: 'year', title: 'Year', type: 'number' },
    { name: 'image', title: 'Image', type: 'image', options: { hotspot: true }, validation: (Rule: any) => Rule.required() },
    { name: 'narrative', title: 'Narrative (bilingual)', type: 'text', rows: 4 },
    {
      name: 'guidedCommentary',
      title: 'Guided Commentary',
      type: 'object',
      fields: [
        { name: 'zoomTarget', title: 'Zoom Target Description', type: 'string' },
        { name: 'commentary', title: 'Commentary (bilingual)', type: 'text', rows: 4 },
      ],
    },
    {
      name: 'frameStyle',
      title: 'Frame Style',
      type: 'string',
      options: { list: ['baroque_gold', 'raw_wood', 'copper_slim'] },
      initialValue: 'baroque_gold',
    },
    {
      name: 'position',
      title: 'Position',
      type: 'object',
      fields: [
        { name: 'x', title: 'X', type: 'number' },
        { name: 'y', title: 'Y', type: 'number' },
        { name: 'z', title: 'Z', type: 'number' },
        { name: 'rotation', title: 'Rotation', type: 'number' },
        { name: 'wall', title: 'Wall', type: 'string', options: { list: ['north', 'south', 'east', 'west'] }, initialValue: 'north' },
        { name: 'order', title: 'Display Order', type: 'number', initialValue: 0 },
      ],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'artist', media: 'image' },
  },
});
