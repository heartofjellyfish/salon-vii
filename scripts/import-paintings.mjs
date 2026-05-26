/**
 * Import script — fills metadata + positions for the 10 uploaded Van Gogh
 * paintings and creates the exhibition that references them.
 *
 * Matches uploaded docs by image originalFilename, publishes them (the user
 * uploaded drafts), and removes the leftover drafts.
 *
 * Run:  node --env-file=.env.local scripts/import-paintings.mjs
 */
import { createClient } from "@sanity/client";

const client = createClient({
  projectId: "7dt4ydmn",
  dataset: "production",
  apiVersion: "2024-01-01",
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

const PAINTINGS = [
  {
    fn: "The sower1888.jpg",
    title: "The Sower",
    titleCN: "播种者",
    year: 1888,
    frameStyle: "raw_wood",
    position: { x: -3.5, y: 2.0, z: -6, rotation: 0, wall: "north", order: 0 },
    narrative: `他画了三十多个播种者，这是他向米勒的致敬，也是向"无限"的致敬。一轮巨大的黄色太阳像光环悬在地平线上，紫色的田与黄色的天直接撞在一起。梵高说，他想画的不是一个农民，而是播种这个动作里的永恒——把种子交给土地，不问收成。

He painted the sower more than thirty times — homage to Millet, and to the infinite. A vast yellow sun hangs like a halo over the horizon; a violet field collides head-on with a yellow sky. Van Gogh said he wasn't painting a peasant but the eternity inside the act: giving seed to the earth and asking nothing back.`,
    guidedCommentary: {
      zoomTarget: "The sun on the horizon",
      commentary: `放大那轮太阳。它不是写实的光源，是个光环——梵高把宗教画里圣人头顶的金环，搬到了一个普通农民身后。在他眼里，播种就是神圣的劳动。

Zoom into the sun. It isn't a realistic light source — it's a halo. Van Gogh took the golden ring that hovers behind saints in religious paintings and placed it behind an ordinary laborer. To him, sowing was sacred work.`,
    },
  },
  {
    fn: "A Wheatfield, with Cypresses.jpg",
    title: "A Wheatfield, with Cypresses",
    titleCN: "麦田与丝柏",
    year: 1889,
    frameStyle: "baroque_gold",
    position: { x: 0, y: 2.0, z: -6, rotation: 0, wall: "north", order: 1 },
    narrative: `1889年9月，圣雷米的疗养院外。翻滚的麦浪、卷曲的云，还有那株像黑色火焰的丝柏。梵高痴迷丝柏，说它"美得像埃及的方尖碑"。这片天空的漩涡，和几个月前那幅《星月夜》是同一只手——白天版的星空。

September 1889, outside the asylum at Saint-Rémy. Rolling wheat, curling clouds, and a cypress like a dark flame. Van Gogh was obsessed with cypresses — "beautiful as an Egyptian obelisk," he wrote. The swirling sky is the same hand that painted The Starry Night months before — a daytime version of that same sky.`,
    guidedCommentary: {
      zoomTarget: "The cypress tree",
      commentary: `盯着那株丝柏。别的画家把它当背景，梵高把它立成主角——一道向上窜的黑色火焰，几乎要顶破画框。它是墓地常见的树，是死亡的树；但在他笔下，它活着，烧着。

Fix on the cypress. Other painters used it as background; Van Gogh made it the protagonist — a black flame shooting upward, almost breaking the frame. It's a graveyard tree, a tree of death. Under his brush it is alive, and burning.`,
    },
  },
  {
    fn: "Green Wheat Fields.jpg",
    title: "Green Wheat Fields, Auvers",
    titleCN: "绿色麦田（奥维尔）",
    year: 1890,
    frameStyle: "copper_slim",
    position: { x: 3.5, y: 2.0, z: -6, rotation: 0, wall: "north", order: 2 },
    narrative: `奥维尔，他生命最后的几个月。没有地平线，没有焦点——整张画就是风里的青麦，从下往上铺满。梵高把画架支在田中央，让麦子包围自己。这不是看风景，是站进风景里。

Auvers, the last months of his life. No horizon, no focal point — the whole canvas is green wheat in the wind, filling the frame from bottom to top. Van Gogh set his easel in the middle of the field and let the wheat surround him. This isn't looking at a landscape. It's standing inside one.`,
    guidedCommentary: {
      zoomTarget: "The brushstrokes of the wheat",
      commentary: `凑近看麦子的笔触。每一笔都朝不同方向——风没有固定的方向，他就让颜料也乱起来。你几乎能听见那片沙沙声。

Get close to the strokes of wheat. Each one leans a different way — the wind has no single direction, so neither does the paint. You can almost hear it rustling.`,
    },
  },
  {
    fn: "Evening Landscape with Rising Moon.jpg",
    title: "Evening Landscape with Rising Moon",
    titleCN: "月升时分的傍晚",
    year: 1889,
    frameStyle: "raw_wood",
    position: { x: 6, y: 2.0, z: -4, rotation: -1.57, wall: "east", order: 0 },
    narrative: `圣雷米，1889年夏。麦子已收割堆好，一轮橙红的月亮正从两块岩石间升起。一百多年后，天文学家靠这轮月亮的位置，精确算出了他画下这一刻的日子——7月的某个黄昏。在疯病的间隙里，他记录了一个准确到分钟的夜晚。

Saint-Rémy, summer 1889. The wheat is cut and stacked; an orange moon rises between two boulders. More than a century later, astronomers used the moon's position to date this exact moment — a dusk in July. In the gaps between his illness, he recorded a night accurate to the minute.`,
    guidedCommentary: {
      zoomTarget: "The rising moon",
      commentary: `看那轮月亮。它不是清冷的白，是熟透的橙红——和田里的麦垛一个颜色。梵高让天上和地上用同一种暖色呼应，整个黄昏像被点燃。

Look at the moon. Not cool and white but ripe orange-red — the same color as the wheat stacks below. Van Gogh rhymed sky and earth in one warm hue, and the whole dusk seems to catch fire.`,
    },
  },
  {
    fn: "Houses at Auvers 1890.jpg",
    title: "Houses at Auvers",
    titleCN: "奥维尔的房屋",
    year: 1890,
    frameStyle: "copper_slim",
    position: { x: 6, y: 2.0, z: -1.5, rotation: -1.57, wall: "east", order: 1 },
    narrative: `奥维尔的屋顶。茅草、红瓦、歪斜的墙——梵高用厚重的笔触，把一个普通村庄堆成了有体积、有重量的东西。这是他最后的栖身地，他在这里画了七十多幅画，几乎一天一幅，然后离开。

The rooftops of Auvers. Thatch, red tile, leaning walls — Van Gogh built an ordinary village into something with volume and weight using thick, loaded strokes. This was his last refuge. He painted more than seventy canvases here, roughly one a day, and then he was gone.`,
    guidedCommentary: {
      zoomTarget: "The thatched roofs",
      commentary: `看那些屋顶的厚度。颜料堆得几乎是立体的——梵高不是在"描绘"房子，他在用油彩"砌"房子。凑近看，平面的画其实是一片浮雕。

Notice how thick the roofs are. The paint is built up almost in relief — Van Gogh isn't depicting houses, he's masoning them out of oil paint. Up close, the flat picture is a sculpture.`,
    },
  },
  {
    fn: "Starry Night 1888.jpg",
    title: "Starry Night Over the Rhône",
    titleCN: "罗纳河上的星夜",
    year: 1888,
    frameStyle: "baroque_gold",
    position: { x: 6, y: 2.0, z: 1, rotation: -1.57, wall: "east", order: 2 },
    narrative: `在那幅著名的《星月夜》之前九个月，他先画了这一幅。阿尔勒，罗纳河边，他真的在夜里支起画架，借煤气灯作画。天上是北斗七星，水里是城镇灯火的倒影，前景一对情侣并肩走过。这是用眼睛看到的星空，不是凭记忆。

Nine months before the famous Starry Night, he painted this one. Arles, the bank of the Rhône, where he really did set up his easel at night and work by gaslight. Overhead, the Big Dipper; in the water, the reflected lamps of the town; in the foreground, a couple walking arm in arm. This is a night sky seen, not remembered.`,
    guidedCommentary: {
      zoomTarget: "The Big Dipper and the reflections",
      commentary: `找到北斗七星——梵高画的是真实的星座，位置准确。再看水面：煤气灯的倒影被拉成一道道竖直的金线，像从天上漏下来的光。星空和街灯，在河面上汇成一片。

Find the Big Dipper — Van Gogh painted the real constellation, in its true position. Then look at the water: the gaslights stretch into vertical gold ribbons, like light leaking down from the sky. Stars and street-lamps meet on the surface of the river.`,
    },
  },
  {
    fn: "Green Wheat Field.jpg",
    title: "Green Wheat Field",
    titleCN: "绿麦田",
    year: 1889,
    frameStyle: "raw_wood",
    position: { x: 0, y: 2.0, z: 2, rotation: 3.14, wall: "south", order: 0 },
    narrative: `又一片麦田——梵高一生反复回到这个主题。这是还没成熟的青麦，初夏的颜色，生命正鼓着劲往上长。对他来说，麦田是一整套语言：播种、生长、收割、再播种，一个人的一生被压进一块田里。

Another wheat field — a subject Van Gogh returned to all his life. This is green, unripened wheat, the color of early summer, life pushing upward. For him a wheat field was an entire language: sowing, growing, harvest, sowing again — a human lifetime compressed into a single plot of land.`,
    guidedCommentary: {
      zoomTarget: "Where the field meets the sky",
      commentary: `看田与天交界的那条线。梵高很少画清晰的地平线——这里也一样，青麦几乎要溶进天里。没有边界，只有不断生长的绿。

Look at the line where field meets sky. Van Gogh rarely painted a clean horizon — here too, the green wheat nearly dissolves into the air. No boundary, just green, growing.`,
    },
  },
  {
    fn: "Wheat Field Under Threatening Skies.jpg",
    title: "Wheatfield under Thunderclouds",
    titleCN: "乌云下的麦田",
    year: 1890,
    frameStyle: "copper_slim",
    position: { x: -5.99, y: 2.0, z: -4, rotation: 1.57, wall: "west", order: 0 },
    narrative: `奥维尔，1890年7月，他生命最后的几周。一块双倍宽的画布，低低的地平线压着翻腾的乌云，下面是无边的麦田。梵高在信里写，他想表达"悲伤，和极度的孤独"——但又说，这些麦田让他觉得健康、有力气。绝望和生命力，在同一张画里。

Auvers, July 1890, the final weeks of his life. A double-wide canvas: a low horizon pressed under churning clouds, endless wheat below. In a letter he wrote that he wanted to express "sadness, extreme loneliness" — and yet, he said, these fields made him feel healthy and strong. Despair and life force, in a single painting.`,
    guidedCommentary: {
      zoomTarget: "The low horizon line",
      commentary: `看那条压得很低的地平线。天占了大半，沉甸甸的乌云几乎要压到麦子上。但麦田没有低头——它一直铺到画框外，你看不到尽头。

Look at how low the horizon sits. Sky takes most of the canvas, the heavy clouds nearly pressing onto the wheat. But the field doesn't bow — it runs straight off the edge of the canvas, with no end in sight.`,
    },
  },
  {
    fn: "Blossoming Almond Tree.jpg",
    title: "Almond Blossom",
    titleCN: "杏花",
    year: 1890,
    frameStyle: "baroque_gold",
    position: { x: -5.99, y: 2.0, z: -1.5, rotation: 1.57, wall: "west", order: 1 },
    narrative: `弟弟提奥的儿子出生了，取名文森特。梵高在疗养院里画了这幅画，送给这个新生儿——杏树枝对着青绿色的天空，是最早开花的树，在春天还没拿定主意时就先开了。一个认定自己处处失败的人，画下新生，然后递了出去。

His brother Theo had a son, and named him Vincent. From the asylum, Van Gogh painted this for the newborn — almond branches against a turquoise sky, the earliest tree to bloom, flowering before spring has even decided to stay. A man convinced he had failed at everything painted new life, and handed it over.`,
    guidedCommentary: {
      zoomTarget: "The branches against the sky",
      commentary: `看树枝和天空的关系。没有地面，没有透视——只有枝条横在青色里。这是日本浮世绘的构图，梵高把它学了过来：把一根开花的枝，直接拍在平涂的天上。

Look at how the branches sit against the sky. No ground, no perspective — just boughs laid across the turquoise. This is the composition of Japanese woodblock prints, which Van Gogh studied: a single flowering branch pressed flat against a field of color.`,
    },
  },
  {
    fn: "Interior of a Restaurant.jpg",
    title: "Interior of a Restaurant",
    titleCN: "餐厅内景",
    year: 1887,
    frameStyle: "copper_slim",
    position: { x: -5.99, y: 2.0, z: 1, rotation: 1.57, wall: "west", order: 2 },
    narrative: `巴黎，1887年。这不像我们印象里的梵高——明亮、轻盈、满是小圆点。他刚到巴黎，撞见了修拉和点彩派，于是试着用无数细小的笔触拼出光。空无一人的餐厅，桌子摆好了，等着客人。这是他从荷兰的灰暗里走出来的那一刻。

Paris, 1887. This doesn't look like the Van Gogh we picture — bright, light, covered in tiny dots. Newly arrived in Paris, he had run into Seurat and the Pointillists and tried building light out of countless small touches. An empty restaurant, tables set, waiting for guests. This is the moment he stepped out of his dark Dutch years.`,
    guidedCommentary: {
      zoomTarget: "The dotted brushwork",
      commentary: `凑近看墙面和桌布。不是平涂，是成千上万的小点和短笔——红挨着绿，黄挨着蓝，远看才融成光。这是梵高在学点彩；但他太急，小点很快就变回了他自己那种短促的笔触。

Get close to the walls and tablecloths. Not flat color but thousands of small dots and dashes — red beside green, yellow beside blue, fusing into light only at a distance. This is Van Gogh learning Pointillism; but he was too impatient, and the dots soon became his own restless strokes.`,
    },
  },
];

const EXHIBITION = {
  _id: "van-gogh-mvp",
  title: "The Last Fields",
  subtitle: "Vincent van Gogh, 1887–1890 — wheat, moonlight, and the country of light",
  curatorNote: `这十张画，几乎都来自梵高生命的最后三年。巴黎一间空荡的餐厅，阿尔勒河上的星光，圣雷米疗养院窗外的麦田与丝柏，奥维尔屋顶下他一直画到生命尽头的村庄。他一生几乎没卖出过画，却在最后的日子里以近乎一天一幅的速度，把麦田、月亮、星空一遍遍画下来。

这里没有他最有名的那几张。这里是他真正活着的地方——田中央，风里，光下。慢慢走。

Almost all ten of these paintings come from the last three years of Van Gogh's life. An empty restaurant in Paris, starlight on a river in Arles, the wheat and cypresses outside his asylum window at Saint-Rémy, the rooftops of Auvers where he painted to the very end. He sold almost nothing in his lifetime, yet in his final days he worked at nearly a canvas a day, returning again and again to wheat, to the moon, to the night sky.

The famous pictures aren't here. What's here is where he actually lived — in the middle of the field, in the wind, in the light. Walk slowly.`,
  wallColor: "#5C1822",
  mode: "guided",
};

async function run() {
  console.log("Fetching uploaded artworks...");
  const docs = await client.fetch(
    `*[_type=="artwork"]{_id, "fn": image.asset->originalFilename, "ref": image.asset._ref}`
  );
  const byFn = {};
  for (const d of docs) if (d.fn) byFn[d.fn] = d;

  const refs = [];
  for (const p of PAINTINGS) {
    const doc = byFn[p.fn];
    if (!doc || !doc.ref) {
      console.warn(`  ! No uploaded image found for "${p.fn}" — skipping`);
      continue;
    }
    const publishedId = doc._id.replace(/^drafts\./, "");
    await client.createOrReplace({
      _id: publishedId,
      _type: "artwork",
      title: p.title,
      titleCN: p.titleCN,
      artist: "Vincent van Gogh",
      year: p.year,
      image: { _type: "image", asset: { _type: "reference", _ref: doc.ref } },
      narrative: p.narrative,
      guidedCommentary: p.guidedCommentary,
      frameStyle: p.frameStyle,
      position: p.position,
    });
    if (doc._id.startsWith("drafts.")) await client.delete(doc._id);
    refs.push({ _key: publishedId, _type: "reference", _ref: publishedId });
    console.log(`  ✓ ${p.title}  (${p.position.wall} #${p.position.order})`);
  }

  await client.createOrReplace({
    _id: EXHIBITION._id,
    _type: "exhibition",
    title: EXHIBITION.title,
    subtitle: EXHIBITION.subtitle,
    curatorNote: EXHIBITION.curatorNote,
    wallColor: EXHIBITION.wallColor,
    mode: EXHIBITION.mode,
    artworks: refs,
  });
  console.log(`\n✓ Exhibition "${EXHIBITION.title}" created with ${refs.length} works.`);
  if (refs.length < PAINTINGS.length) {
    console.warn(`  (Expected ${PAINTINGS.length}; check the skipped filenames above.)`);
  }
}

run().catch((e) => {
  console.error("Import failed:", e.message);
  process.exit(1);
});
