/**
 * Sanity Seed Script — imports 10 Van Gogh paintings + exhibition
 *
 * Usage:
 *   SANITY_API_TOKEN=xxx node scripts/seed-sanity.mjs
 *
 * The script creates the Artwork documents first, then the Exhibition
 * referencing them. Images use external Wikimedia URLs (not uploaded to Sanity).
 */

import { createClient } from "@sanity/client";

const PROJECT_ID = "7dt4ydmn";
const DATASET = "production";
const TOKEN = process.env.SANITY_API_TOKEN;

if (!TOKEN) {
  console.error("SANITY_API_TOKEN not set. Get it from: tyctl vault get SANITY_API_TOKEN");
  process.exit(1);
}

const client = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: "2024-01-01",
  token: TOKEN,
  useCdn: false,
});

const WIKIMEDIA_URLS = {
  "1": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Vincent_van_Gogh_-_The_potato_eaters_-_Google_Art_Project.jpg/1280px-Vincent_van_Gogh_-_The_potato_eaters_-_Google_Art_Project.jpg",
  "2": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Vincent_van_Gogh_-_Zonnebloemen_-_Google_Art_Project.jpg/1024px-Vincent_van_Gogh_-_Zonnebloemen_-_Google_Art_Project.jpg",
  "3": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Vincent_van_Gogh_-_Cafe_Terrace_at_Night_%281888%29.jpg/1280px-Vincent_van_Gogh_-_Cafe_Terrace_at_Night_%281888%29.jpg",
  "4": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg/1280px-Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg",
  "5": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Vincent_van_Gogh_-_Self-Portrait_with_Bandaged_Ear.jpg/1024px-Vincent_van_Gogh_-_Self-Portrait_with_Bandaged_Ear.jpg",
  "6": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Irises-Vincent_van_Gogh.jpg/1280px-Irises-Vincent_van_Gogh.jpg",
  "7": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
  "8": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Vincent_van_Gogh_-_Wheatfield_with_crows_-_Google_Art_Project.jpg/1280px-Vincent_van_Gogh_-_Wheatfield_with_crows_-_Google_Art_Project.jpg",
  "9": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Vincent_van_Gogh_-_Almond_blossom_-_Google_Art_Project.jpg/1280px-Vincent_van_Gogh_-_Almond_blossom_-_Google_Art_Project.jpg",
  "10": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Vincent_van_Gogh_-_Dr_Paul_Gachet_-_Google_Art_Project.jpg/1024px-Vincent_van_Gogh_-_Dr_Paul_Gachet_-_Google_Art_Project.jpg",
};

const ARTWORKS = [
  {
    _id: "vg-1",
    title: "The Potato Eaters",
    titleCN: "吃土豆的人",
    artist: "Vincent van Gogh",
    year: 1885,
    imageUrl: WIKIMEDIA_URLS["1"],
    narrative: "他的朋友们都不喜欢。太暗了，他们说。这个卖不掉的。关于卖不掉，他们说对了。关于其他一切，全错。暗是故意的——那些手刚把盘子里的土豆从土里刨出来。梵高不是从高处画农民。他走进屋里画的。\n\nHis friends hated it. \"Too dark,\" they said. \"You can't sell this.\" They were right about the selling. Wrong about everything else. The darkness was the point — these hands dug the potatoes they're eating. Van Gogh didn't paint peasants from above. He painted them from inside the room.",
    guidedCommentary: {
      zoomTarget: "The hands around the table",
      commentary: "放大看那些手。倒咖啡的手和拿着土豆的手——一只还在劳动，一只终于停下。吊灯的光只落在几样东西上：食物、脸、五杯苦咖啡。\n\nZoom into the hands. Compare the hand pouring coffee with the hand holding the potato. One is still working. One has stopped. The light from the hanging lamp falls only on what matters: the food, the faces, the five cups of bitter coffee."
    },
    frameStyle: "raw_wood",
    position: { x: -3.5, y: 2.0, z: -6, rotation: 0, wall: "north", order: 0 },
  },
  {
    _id: "vg-2",
    title: "Sunflowers",
    titleCN: "向日葵",
    artist: "Vincent van Gogh",
    year: 1888,
    imageUrl: WIKIMEDIA_URLS["2"],
    narrative: "现在它是全世界复制最多的画——马克杯、冰箱贴、机场帆布袋。1888年，它只是一份送给朋友的礼物。那个朋友同居两个月后离开，梵高割了自己半只耳朵。花在枯萎。凑近看。有些已经在落籽。\n\nNow the most reproduced painting on earth — mugs, magnets, airport tote bags. In 1888, it was just a gift for a friend who would leave after two months of living together, after which Van Gogh cut off part of his own ear. The flowers are dying.",
    guidedCommentary: {
      zoomTarget: "The vase bottom",
      commentary: "看花瓶底部。那一条青绿色——梵高把签名写在那里，就一个「Vincent」。好像他自己也是一朵花，已经在枯萎。\n\nLook at the bottom of the vase. See that single line of turquoise? Van Gogh signed it there — just \"Vincent\" — on the vase itself. As if he were one of the flowers, already fading."
    },
    frameStyle: "baroque_gold",
    position: { x: 0, y: 2.0, z: -6, rotation: 0, wall: "north", order: 1 },
  },
  {
    _id: "vg-3",
    title: "Café Terrace at Night",
    titleCN: "夜间咖啡馆",
    artist: "Vincent van Gogh",
    year: 1888,
    imageUrl: WIKIMEDIA_URLS["3"],
    narrative: "他没用到黑色。一笔都没有。夜空是蓝和紫，还有一种暗到像虚无的绿。咖啡馆发着黄光——溅在鹅卵石上的光，满座不知道自己正被画进永恒的人。梵高支起画架，画黑暗却不用黑色。\n\nHe didn't use black. Not a single stroke. The night sky is blue and violet and a green so dark it reads as absence. The café glows yellow — spilled light on cobblestones, a terrace full of people who don't know they're being painted into something that will outlive every building on this street.",
    guidedCommentary: {
      zoomTarget: "The cobblestones beneath the terrace",
      commentary: "看露台下方的鹅卵石。黄色灯光不只是落下——它碎裂、四溅、渗进石缝。梵高把光画成了液体。放大看最远处的拱门——那是街道延续进黑暗。咖啡馆是一座孤岛。\n\nLook at the cobblestones beneath the terrace. The yellow light doesn't just fall — it breaks, scatters, bleeds into the cracks. The café is an island."
    },
    frameStyle: "copper_slim",
    position: { x: 3.5, y: 2.0, z: -6, rotation: 0, wall: "north", order: 2 },
  },
  {
    _id: "vg-4",
    title: "The Bedroom",
    titleCN: "在阿尔勒的卧室",
    artist: "Vincent van Gogh",
    year: 1888,
    imageUrl: WIKIMEDIA_URLS["4"],
    narrative: "墙是斜的。地板向前冲。床看起来能从侧面跌进去。当时的评论家会说这叫画技拙劣。梵高管这叫休息。这间房他画了三遍——三次同样不可能的透视——因为他想给弟弟提奥一幅宁静的画面。\n\nThe walls tilt. The floor rushes forward. The bed looks like you could fall into it sideways. Critics in his lifetime would have called this bad draftsmanship. Van Gogh called it rest. He painted this room three times — three versions of the same impossible angles.",
    guidedCommentary: {
      zoomTarget: "The two pillows, two chairs",
      commentary: "看那两只枕头。两把椅子。墙上两幅小画。一切都是成双的。他在等高更来。房间准备好了。放大看床上方那两幅画。\n\nLook at the two pillows. Two chairs. Two portraits on the wall. Everything comes in pairs. He was waiting for Gauguin to arrive. The room was ready."
    },
    frameStyle: "copper_slim",
    position: { x: 6, y: 2.0, z: -4, rotation: -1.57, wall: "east", order: 0 },
  },
  {
    _id: "vg-5",
    title: "Self-Portrait with Bandaged Ear",
    titleCN: "包扎着耳朵的自画像",
    artist: "Vincent van Gogh",
    year: 1889,
    imageUrl: WIKIMEDIA_URLS["5"],
    narrative: "他对着镜子画的，所以绷带包错了边。外套很厚。身后的房间很冷——四面白墙、一幅日本版画、一个他舍不得丢掉的画架。眼睛和你对视，但留不住。它们已经从更糟的东西上移开了。\n\nHe painted this in a mirror, so the bandage is on the wrong side. The coat is heavy. The room behind him is cold — a bare wall, a Japanese print, an easel he can't afford to abandon. The eyes meet yours but don't hold.",
    guidedCommentary: {
      zoomTarget: "The Japanese print on the wall",
      commentary: "放大看他身后墙上的日本版画。风景里的艺伎。他在安特卫普成批买这种版画。他说日本是光的国度。当自己的耳朵还在愈合时，他在墙上挂了一个提醒。\n\nZoom into the Japanese print on the wall behind him. He bought prints like this by the dozen in Antwerp. He said Japan was the country of light."
    },
    frameStyle: "copper_slim",
    position: { x: 6, y: 2.0, z: -1.5, rotation: -1.57, wall: "east", order: 1 },
  },
  {
    _id: "vg-6",
    title: "Irises",
    titleCN: "鸢尾花",
    artist: "Vincent van Gogh",
    year: 1889,
    imageUrl: WIKIMEDIA_URLS["6"],
    narrative: "他在精神病院的花园里画了这幅画，入院第一周。他管它叫「我疾病的避雷针」。一片蓝色鸢尾里一朵白花——唯一站得笔直的，其余都扭曲着。他不是在画花。他在画一种感觉：你是房间里唯一不会弯折的人。\n\nHe painted this in the asylum garden, his first week inside, and called it \"the lightning conductor for my illness.\" One white iris among a field of blue.",
    guidedCommentary: {
      zoomTarget: "The single white iris",
      commentary: "找到左上角那朵唯一的白色鸢尾。然后扫过整片。每一朵蓝色的都以不同方式弯折。那朵白的独自站着。放大看它的花瓣。只有它在完整的光里。\n\nFind the single white iris at the top left. Now scan the rest. Every blue iris bends differently. The white one stands apart."
    },
    frameStyle: "baroque_gold",
    position: { x: 6, y: 2.0, z: 1, rotation: -1.57, wall: "east", order: 2 },
  },
  {
    _id: "vg-7",
    title: "The Starry Night",
    titleCN: "星月夜",
    artist: "Vincent van Gogh",
    year: 1889,
    imageUrl: WIKIMEDIA_URLS["7"],
    narrative: "梵高认为这幅画是失败之作。在给弟弟的信里，他把它归类为「习作」——星星太大，线条太夸张。他透过一扇带栏杆的窗、凭记忆画下它，画的是他无法走进去看的天空。前景的柏树现实中并不存在。他加上去的。\n\nVan Gogh called this a failure. In a letter to his brother, he dismissed it as a \"study\" — the stars too big, the lines too exaggerated. He painted it from a window with bars on it, from memory, looking at a sky he couldn't step outside to see.",
    guidedCommentary: {
      zoomTarget: "The eleven stars and the cypress",
      commentary: "看那十一颗星星。每颗都是一次小型爆炸——黄色和白色的同心环。然后看下方的村庄。直线。黑窗。天空在燃烧，村庄在沉睡。放大看那棵柏树。\n\nLook at the eleven stars. Each one is a small explosion — concentric rings of yellow and white. Now look at the village below. The sky is burning and the village is asleep."
    },
    frameStyle: "baroque_gold",
    position: { x: 0, y: 2.0, z: 2, rotation: 3.14, wall: "south", order: 0 },
  },
  {
    _id: "vg-8",
    title: "Wheatfield with Crows",
    titleCN: "麦田群鸦",
    artist: "Vincent van Gogh",
    year: 1890,
    imageUrl: WIKIMEDIA_URLS["8"],
    narrative: "这不是他最后一幅画。这是个传说。但这个传说存在是有原因的——三条路切开麦田，没有一条能看清去向，头顶是像瘀伤正在形成的天空。群鸦从田里惊起，仿佛有人刚喊了一声。或者开了一枪。\n\nIt was not his last painting. That's a myth. But the myth exists for a reason — three paths cut through wheat, none leading anywhere visible, under a sky that looks like a bruise forming.",
    guidedCommentary: {
      zoomTarget: "The three diverging paths",
      commentary: "看那三条路。中间那条消失在麦田里。左右两条直接冲出画框。你没法跟着任何一条走到底。放大看天空的笔触——蓝色是重重拍上去的，像一道正在被包扎的伤口。\n\nLook at the three paths. The center one disappears into the wheat. The left and right veer off the canvas entirely."
    },
    frameStyle: "raw_wood",
    position: { x: -5.99, y: 2.0, z: -4, rotation: 1.57, wall: "west", order: 0 },
  },
  {
    _id: "vg-9",
    title: "Almond Blossom",
    titleCN: "盛开的杏花",
    artist: "Vincent van Gogh",
    year: 1890,
    imageUrl: WIKIMEDIA_URLS["9"],
    narrative: "弟弟提奥生了个儿子。取名文森特。梵高在精神病院里画了这幅画——杏树枝对着青色天空，最早开花的东西，在春天还没决定留下来之前就来的那种。他把它送给新生儿。一个相信自己什么事都失败了的人，画了新生命，递了过去。\n\nHis brother Theo had a son. Named him Vincent. Van Gogh painted this from the asylum — branches of an almond tree against a turquoise sky, the earliest thing that blooms. He gave it to the baby.",
    guidedCommentary: {
      zoomTarget: "The branch joints and blossoms",
      commentary: "看那片青色背景。那是阿尔勒二月天空的颜色——冷淡但不敌意。放大看树枝关节处，每簇花都是用厚重的、近乎雕塑般的白色笔触堆出来的。就算在精神病院里，他也在创造三维的东西。\n\nLook at the turquoise background. It's the exact color of the sky in Arles in February."
    },
    frameStyle: "baroque_gold",
    position: { x: -5.99, y: 2.0, z: -1.5, rotation: 1.57, wall: "west", order: 1 },
  },
  {
    _id: "vg-10",
    title: "Portrait of Dr. Gachet",
    titleCN: "加歇医生像",
    artist: "Vincent van Gogh",
    year: 1890,
    imageUrl: WIKIMEDIA_URLS["10"],
    narrative: "加歇医生本应帮他。梵高说这医生「比我病得还重」。他画他，桌上放着一株毛地黄——洋地黄的来源，心脏病药。医生的眼睛不对焦任何东西。两个月后梵高死了。加歇多活了十九年，这幅肖像一直挂在家里。救不了艺术家的人成了他的保管者。\n\nDr. Gachet was supposed to help. Van Gogh said the doctor was \"sicker than I am.\" Van Gogh died two months later. Gachet outlived him by nineteen years, always keeping this portrait in his house.",
    guidedCommentary: {
      zoomTarget: "Dr. Gachet's eyes and hands",
      commentary: "放大看加歇医生的眼睛。它们和桌子、外套、背景是同样的蓝色——一个正融进自己悲伤里的男人。再看他的手。右手托着头，手指又细又紧张。左手搁在桌上，更重、静止。同一个人的两个版本。\n\nZoom into Dr. Gachet's eyes. They're the same blue as the table, the coat, the background."
    },
    frameStyle: "raw_wood",
    position: { x: -5.99, y: 2.0, z: 1, rotation: 1.57, wall: "west", order: 2 },
  },
];

async function uploadImageFromUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    const asset = await client.assets.upload("image", Buffer.from(buffer), {
      filename: imageUrl.split("/").pop(),
    });
    return { _type: "image", asset: { _type: "reference", _ref: asset._id } };
  } catch (e) {
    console.warn(`Failed to upload image from ${imageUrl}: ${e.message}`);
    return null;
  }
}

async function seed() {
  console.log("Seeding Sanity with 10 Van Gogh paintings...\n");

  // 1. Delete existing documents (idempotent)
  console.log("Cleaning existing data...");
  const existing = await client.fetch(`*[_type in ["artwork", "exhibition"]]._id`);
  for (const id of existing) {
    await client.delete(id);
    console.log(`  Deleted ${id}`);
  }

  // 2. Create Artwork documents
  const artworkRefs = [];
  for (const artwork of ARTWORKS) {
    console.log(`\nUploading: ${artwork.title}...`);
    const imageField = await uploadImageFromUrl(artwork.imageUrl);
    if (!imageField) {
      console.warn(`  Skipping ${artwork.title} — image upload failed`);
      continue;
    }

    const doc = {
      _id: artwork._id,
      _type: "artwork",
      title: artwork.title,
      titleCN: artwork.titleCN,
      artist: artwork.artist,
      year: artwork.year,
      image: imageField,
      narrative: artwork.narrative,
      guidedCommentary: artwork.guidedCommentary,
      frameStyle: artwork.frameStyle,
      position: artwork.position,
    };

    await client.createOrReplace(doc);
    artworkRefs.push({ _key: artwork._id, _type: "reference", _ref: artwork._id });
    console.log(`  ✓ Created: ${artwork.title}`);
  }

  // 3. Create Exhibition
  console.log(`\nCreating exhibition...`);
  await client.createOrReplace({
    _id: "van-gogh-mvp",
    _type: "exhibition",
    title: "The Wrong Man at the Right Time",
    subtitle: "Ten paintings. Zero buyers. One hundred and thirty years of the last laugh.",
    curatorNote: `Vincent van Gogh sold one painting in his lifetime. One. He died at thirty-seven, broke, institutionalized, convinced he was a failure. His own mother threw out crates of his work after he was gone.

Today, a single Van Gogh canvas sells for more than most countries' annual arts budgets. His sunflowers are on tote bags in every airport gift shop on earth.

This room is not about the tote bags. It is about the moment before — when every brushstroke was a bet no one else would take. When the colors were "too loud," the brushwork "too crude," the man himself "too unstable." Ten paintings, ten reasons they were wrong.

The critics are dead. The paintings are not. Walk through slowly. Try to see them the way they first arrived: unwanted, un-understood, entirely too alive for the room they were in.`,
    wallColor: "#5C1822",
    mode: "guided",
    artworks: artworkRefs,
  });
  console.log("  ✓ Exhibition created: The Wrong Man at the Right Time");

  console.log(`\n✅ Seed complete! ${artworkRefs.length} artworks created.`);
  console.log("Visit https://salon-vii.sanity.studio to verify.");
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
