// A 3D room prop (tree / plant / furniture / lamp / decor) uploaded as a GLB.
// One `prop` document is the reusable asset; an exhibition references it inside
// its `roomProps` array together with a per-exhibition transform, so the same
// tree can stand in different spots across exhibitions.
export default {
  name: 'prop',
  title: 'Room Prop',
  type: 'document',
  fields: [
    { name: 'name', title: 'Name', type: 'string', validation: (Rule: any) => Rule.required() },
    {
      name: 'propType',
      title: 'Type',
      type: 'string',
      options: { list: ['plant', 'furniture', 'lamp', 'decor'] },
      initialValue: 'decor',
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: 'model',
      title: 'Model (GLB / GLTF)',
      type: 'file',
      options: { accept: '.glb,.gltf' },
      validation: (Rule: any) => Rule.required(),
    },
    { name: 'thumbnail', title: 'Thumbnail', type: 'image', options: { hotspot: true } },
    {
      name: 'normalize',
      title: 'Auto-fit on load',
      description:
        'If the uploaded model is not pre-normalised (metres, XZ-centred, base at y=0), turn this on to auto-centre, seat on floor and scale to Target Size.',
      type: 'boolean',
      initialValue: false,
    },
    {
      name: 'targetSize',
      title: 'Target Size (m)',
      description: 'Used only when Auto-fit is on: the largest dimension is scaled to this many metres.',
      type: 'number',
      initialValue: 1.7,
    },
    {
      name: 'defaultScale',
      title: 'Default Scale',
      type: 'number',
      initialValue: 1,
    },
    {
      name: 'fillLight',
      title: 'Warm Fill Light (plants)',
      description: 'Optional short-throw point light so the prop reads in a dim corner. Intensity 0 = off.',
      type: 'object',
      fields: [
        { name: 'intensity', title: 'Intensity', type: 'number', initialValue: 0 },
        { name: 'distance', title: 'Distance', type: 'number', initialValue: 3.5 },
        { name: 'height', title: 'Height', type: 'number', initialValue: 1.3 },
        { name: 'front', title: 'Front offset', type: 'number', initialValue: 0.5 },
        { name: 'color', title: 'Color (hex)', type: 'string', initialValue: '#ffd9a0' },
      ],
    },
  ],
  preview: {
    select: { title: 'name', subtitle: 'propType', media: 'thumbnail' },
  },
};
