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
    {
      name: 'roomProps',
      title: 'Room Props (trees / furniture / decor)',
      description: 'Props placed in this exhibition. Position/rotation/scale are usually set in the /editor page.',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'placedProp',
          title: 'Placed Prop',
          fields: [
            { name: 'prop', title: 'Prop', type: 'reference', to: [{ type: 'prop' }] },
            { name: 'x', title: 'X', type: 'number', initialValue: 0 },
            { name: 'y', title: 'Y', type: 'number', initialValue: 0 },
            { name: 'z', title: 'Z', type: 'number', initialValue: 0 },
            { name: 'rotationY', title: 'Rotation Y (rad)', type: 'number', initialValue: 0 },
            { name: 'scale', title: 'Scale', type: 'number', initialValue: 1 },
          ],
          preview: {
            select: { title: 'prop.name', subtitle: 'prop.propType', media: 'prop.thumbnail' },
          },
        },
      ],
    },
    {
      name: 'lights',
      title: 'Lights',
      description: 'Placed light fixtures. Usually set in the /editor page.',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'placedLight',
          title: 'Light',
          fields: [
            { name: 'lightType', title: 'Type', type: 'string', options: { list: ['point', 'spot'] }, initialValue: 'point' },
            { name: 'color', title: 'Color (hex)', type: 'string', initialValue: '#ffd9a0' },
            { name: 'intensity', title: 'Intensity', type: 'number', initialValue: 12 },
            { name: 'distance', title: 'Distance', type: 'number', initialValue: 6 },
            { name: 'angle', title: 'Cone angle (spot)', type: 'number', initialValue: 0.5 },
            { name: 'penumbra', title: 'Softness (spot)', type: 'number', initialValue: 0.4 },
            { name: 'x', title: 'X', type: 'number', initialValue: 0 },
            { name: 'y', title: 'Y', type: 'number', initialValue: 3 },
            { name: 'z', title: 'Z', type: 'number', initialValue: 0 },
          ],
          preview: { select: { title: 'lightType', subtitle: 'color' } },
        },
      ],
    },
    {
      name: 'environment',
      title: 'Global Lighting / Ambience',
      type: 'object',
      fields: [
        { name: 'ambient', title: 'Ambient intensity', type: 'number', initialValue: 0.6 },
        { name: 'dirIntensity', title: 'Key light intensity', type: 'number', initialValue: 1.1 },
        { name: 'warmth', title: 'Warmth (-1 cool .. +1 warm)', type: 'number', initialValue: 0 },
      ],
    },
  ],
};
