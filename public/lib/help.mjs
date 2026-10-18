// The music words in everyday words: one table for the whole app (the ⓘ
// beside a control, the hint under it, and the 名詞小辭典 in the help sheet).
// The app's full guide is the kit's (Shared-Proxy kit/help.mjs, the Quadra
// Pass sheet's 說明, opened from the help sheet): this is only the words.
//
// TERMS[id][lang] = { name, hint (one short line, under a control), text (1–2 sentences) }.
// EXAMPLES[id] = { off, on: [zh, en], play(on) → { clips, bpm } }: the same
// few bars without the thing and with it, played on the app's instruments.
import { h } from '#kit/ui.mjs';
import { emptyDrums, emptyNotes, melody } from './synth.mjs';
import { lang, W } from './lang.mjs';

export const TERMS = {
  bpm: {
    zh: { name: '速度（BPM）', hint: '每分鐘幾拍，越大越快', text: '速度用 BPM 表示：每分鐘有幾拍。80 左右是慢慢晃的嘻哈，120 是一般流行歌，140 以上就很快了。' },
    en: { name: 'Tempo (BPM)', hint: 'Beats a minute: higher is faster', text: 'Tempo is counted in BPM, beats per minute. Around 80 is a slow hip-hop nod, 120 a pop song, 140 and up is fast.' }
  },
  bar: {
    zh: { name: '小節', hint: '四拍算一小節', text: '一小節是四拍，就是跟著音樂數「1、2、3、4」一次。一首約 25 小節，大概一分鐘。' },
    en: { name: 'Bar', hint: 'Four beats', text: 'A bar is four beats: one count of “1, 2, 3, 4”. About 25 bars make a one-minute song.' }
  },
  swing: {
    zh: { name: '搖擺', hint: '讓節奏晃一點，不那麼死板', text: '把每拍裡的第二個小音符往後拖一點，節奏就從平平的「噠噠噠噠」變成會晃的「噠—噠噠—噠」，比較放鬆、有人味。' },
    en: { name: 'Swing', hint: 'A lazy bounce instead of a strict tick', text: 'Every second small note is pushed a little late, so the beat bounces instead of ticking evenly: looser, more human.' }
  },
  riff: {
    zh: { name: 'Riff', hint: '一直重複的一小段旋律', text: 'Riff 是一小段會一直重複的旋律或聲音，大家記得一首歌，常常就是記得它。' },
    en: { name: 'Riff', hint: 'A short tune that repeats', text: 'A riff is a short tune or sound that keeps coming back; it’s often what you remember a song by.' }
  },
  hat: {
    zh: { name: '閉鈸（Hi-hat）', hint: '「嚓嚓嚓」的細碎聲，撐住節奏', text: 'Hi-hat 是鼓組裡「嚓嚓」的金屬聲，通常打得很密，讓節奏一直往前走。' },
    en: { name: 'Hi-hat', hint: 'The fast “tss tss” that keeps time', text: 'The hi-hat is the small cymbal’s “tss”, usually played fast and steady to keep the beat moving.' }
  },
  sub: {
    zh: { name: '808', hint: '很低、會嗡嗡響的低音鼓', text: '808 是很低沉、尾巴很長的大鼓聲，嘻哈和 Trap 都靠它撐低音。手機喇叭不太放得出來，戴耳機比較清楚。' },
    en: { name: '808', hint: 'A deep, booming bass drum', text: 'The 808 is a deep kick that rings like a bass note; hip-hop and trap lean on it. Phone speakers barely play it, so try headphones.' }
  },
  chord: {
    zh: { name: '和弦', hint: '幾個音一起彈，聲音比較飽', text: '和弦是同時彈幾個合得來的音。打開「和弦」，點一個音就放進三個音。' },
    en: { name: 'Chords', hint: 'Several notes at once, a fuller sound', text: 'A chord is a few notes that sound good together, played at once. With Chords on, one tap puts in three notes.' }
  },
  key: {
    zh: { name: '調', hint: '歌用哪一組音：小調偏暗，大調偏亮', text: '調決定歌用哪幾個音，所以格子上怎麼點都不會走音。小調聽起來比較憂鬱、酷，大調比較開心、明亮。' },
    en: { name: 'Key', hint: 'The notes used: minor dark, major bright', text: 'The key picks which notes a song uses, so nothing you tap sounds wrong. Minor sounds darker and cooler, major brighter and happier.' }
  },
  section: {
    zh: { name: '段落', hint: '歌的各部分：前奏、主歌、副歌…', text: '一首歌分成幾個部分：前奏開場、主歌鋪陳、副歌最熱鬧、尾奏收尾。點一段就從那裡播，按住就一直重複它。' },
    en: { name: 'Sections', hint: 'A song’s parts: intro, verse, hook…', text: 'A song has parts: the intro opens, verses build, the hook is the big part, the outro ends it. Tap one to play from it; hold it to repeat it.' }
  },
  pattern: {
    zh: { name: '段落 A–D', hint: '同一段的幾個版本', text: '「樂器」裡最多可以做四個版本（A、B、C、D），例如 A 是平常的鼓，B 多一點過門。' },
    en: { name: 'Patterns', hint: 'A few versions of one clip', text: 'In Studio you can make up to four versions of a clip (A, B, C, D): say A the plain beat and B with a fill.' }
  },
  chain: {
    zh: { name: '串接', hint: '把 A、B 段排成順序播', text: '串接把段落排成順序，例如 A A B A；播放、加進片段和 MIDI 都照這個順序。' },
    en: { name: 'Chain', hint: 'Patterns played in an order', text: 'A chain plays patterns in an order, like A A B A; it plays, goes into your pieces and exports that way.' }
  },
  velocity: {
    zh: { name: '力度', hint: '每一下打輕或打重', text: '每一下可以打輕、中或重：長按格子就能選。有輕有重，聽起來就像真的人在打。' },
    en: { name: 'Velocity', hint: 'How hard each hit is', text: 'Each hit can be soft, normal or hard: hold a square to choose. A mix of soft and hard sounds like a real player.' }
  },
  choke: {
    zh: { name: '切音', hint: '新的一下切掉還在響的', text: '同一組的聲音會互相切掉：例如開鈸還在響時打閉鈸，就把它停住，像鼓手用腳踩住一樣。' },
    en: { name: 'Choke', hint: 'A new hit cuts the last one off', text: 'Sounds in one group cut each other off: a closed hat stops an open one still ringing, as a drummer’s foot would.' }
  },
  snap: {
    zh: { name: '對齊', hint: '把你點的自動對到拍子上', text: '點打擊墊很難剛好在拍子上；對齊會把每一下挪到最近的格子（1/16 最細，「拍」最粗），「自由」就照你點的時間。' },
    en: { name: 'Snap', hint: 'Moves your taps onto the beat', text: 'Taps are rarely right on the beat; snap moves each to the nearest step (1/16 finest, Beat coarsest). Free keeps them as tapped.' }
  },
  loop: {
    zh: { name: '循環', hint: '播完又從頭開始', text: '標 ↻ 的打擊墊會一直重複，從下一小節開始，再點一下停；其他的點一下響一下。' },
    en: { name: 'Loop', hint: 'Plays over and over', text: 'A pad marked ↻ repeats from the next bar until you tap it again; the others play once per tap.' }
  },
  roles: {
    zh: { name: '角色', hint: '每段聲音在歌裡做什麼', text: '每段片段會被聽成一種角色（大鼓、小鼓、Hi-hat、808、貝斯、Riff…），做歌時照角色擺位置。聽錯了可以自己改。' },
    en: { name: 'Roles', hint: 'What each piece does in a song', text: 'Each piece is heard as a role (kick, snare, hats, 808, bass, riff…) and placed in songs by it. Change one if it’s heard wrong.' }
  },
  groove: {
    zh: { name: '鼓的風格', hint: '鼓怎麼打：Trap、House、Lo-fi…', text: '鼓的風格就是鼓的打法：Trap 又密又碎、House 每拍一下大鼓、Lo-fi 慢慢的。選越多種，每首越不一樣。' },
    en: { name: 'Drum styles', hint: 'How the drums play: trap, house, lo-fi…', text: 'A drum style is the way the drums are played: trap busy and choppy, house a kick on every beat, lo-fi slow. More styles, more different songs.' }
  },
  mix: {
    zh: { name: '混音', hint: '把每種聲音調到好聽的大小和空間', text: '混音會調每種聲音的大小，加一點空間和回音，讓整首歌聽起來完整。關掉的話，每段跟你錄的一模一樣。' },
    en: { name: 'Mix', hint: 'Levels and space so it all fits', text: 'The mix sets each sound’s level and adds some room and echo so the song sounds finished. Off, every piece plays exactly as recorded.' }
  },
  humanize: {
    zh: { name: '人味', hint: '時間和力道有一點點不完美', text: '真人打鼓不會每下都一樣準。人味越高，時間和力道就飄得越多，聽起來越不像機器。' },
    en: { name: 'Humanize', hint: 'Tiny slips, like a real player', text: 'Real drummers are never perfectly exact. Higher humanize lets timing and force drift more, so it sounds less like a machine.' }
  },
  seed: {
    zh: { name: '種子', hint: '同一個號碼，做出同一批歌', text: '每批歌都從一個號碼開始隨機。把同一個號碼填回來，就做出一模一樣的歌；空著每次都不同。' },
    en: { name: 'Seed', hint: 'Same number, same songs', text: 'Each batch starts its randomness from a number. Put the same number back and you get the same songs; empty, they’re new each time.' }
  },
  stems: {
    zh: { name: '分軌', hint: '每種樂器各一個檔', text: '分軌把一首歌拆成幾個檔：鼓、Hi-hat、貝斯、旋律、空間各一個，給想在別的軟體再混音的人。' },
    en: { name: 'Stems', hint: 'One file per instrument', text: 'Stems split a song into files, one each for drums, hats, bass, melody and the room, for mixing it again in another app.' }
  },
  midi: {
    zh: { name: 'MIDI', hint: '只記「哪個音、什麼時候」的檔', text: 'MIDI 不是聲音，是記下每個音什麼時候彈的檔案；用 GarageBand 之類的軟體打開，就能換成別的樂器。' },
    en: { name: 'MIDI', hint: 'The notes and their timing, not the sound', text: 'MIDI isn’t sound: it’s which note plays when. Open it in an app like GarageBand to play it on other instruments.' }
  }
};

// The order of the 名詞小辭典: from what a beginner meets first.
export const TERM_ORDER = ['bpm', 'bar', 'section', 'riff', 'hat', 'sub', 'groove', 'swing', 'key', 'chord', 'velocity', 'loop', 'snap', 'choke', 'roles', 'mix', 'humanize', 'pattern', 'chain', 'seed', 'stems', 'midi'];

export const term = (id, to = lang) => TERMS[id]?.[to === 'en' ? 'en' : 'zh'] || null;
// A word's one-line hint, in the reader's language.
export const hintOf = id => term(id)?.hint || '';
// The ⓘ beside a control: a tap opens the word's sheet (app.js listens for .info-btn).
export const info = id => h('button', { class: 'info-btn', type: 'button', 'data-term': id, 'aria-label': W(`說明：${term(id, 'zh').name}`, `What is ${term(id, 'en').name}?`), text: 'ⓘ' });

// ---- Hear it: the same bar without the thing and with it ----

const AM = { tonic: 9, minor: true };
// One bar of drums: kick, snare, and hats on the 8ths (or every 16th).
function beat({ hats = 8, sub = false, swing = 0, accents = false } = {}) {
  const c = emptyDrums(1);
  c.swing = swing;
  for (const s of [0, 10]) c.steps.kick[s] = 1;
  for (const s of [4, 12]) c.steps.snare[s] = 1;
  if (hats) for (let s = 0; s < 16; s += 16 / hats) c.steps.hat[s] = accents ? (s % 4 === 0 ? 2 : 3) : 1;
  if (sub) for (const s of [0, 7, 10]) c.steps.sub[s] = 1;
  return c;
}
function chords(on) {
  const c = emptyNotes('keys', 1, AM);
  c.notes = [57, 53, 55, 52].map((midi, k) => ({ step: k * 4, midi, len: 4, ...(on ? { chord: true } : {}) }));
  return c;
}
export const EXAMPLES = {
  bpm: { off: ['慢：80', 'Slow: 80'], on: ['快：140', 'Fast: 140'], play: on => ({ clips: [beat()], bpm: on ? 140 : 80 }) },
  swing: { off: ['不搖擺', 'Straight'], on: ['搖擺', 'Swung'], play: on => ({ clips: [beat({ hats: 16, swing: on ? 0.45 : 0 })], bpm: 90 }) },
  riff: { off: ['只有鼓', 'Drums only'], on: ['加上 Riff', 'With a riff'], play: on => ({ clips: [beat(), ...(on ? [melody(AM, 'pluck', 4, 1)] : [])], bpm: 96 }) },
  hat: { off: ['沒有 Hi-hat', 'No hats'], on: ['有 Hi-hat', 'With hats'], play: on => ({ clips: [beat({ hats: on ? 16 : 0 })], bpm: 96 }) },
  sub: { off: ['沒有 808', 'No 808'], on: ['有 808', 'With an 808'], play: on => ({ clips: [beat({ sub: on })], bpm: 80 }) },
  chord: { off: ['單音', 'One note'], on: ['和弦', 'Chords'], play: on => ({ clips: [chords(on)], bpm: 90 }) },
  key: { off: ['小調', 'Minor'], on: ['大調', 'Major'], play: on => ({ clips: [melody({ tonic: 9, minor: !on }, 'keys', 7, 1)], bpm: 100 }) },
  velocity: { off: ['一樣重', 'All the same'], on: ['有輕有重', 'Soft and hard'], play: on => ({ clips: [beat({ hats: 16, accents: on })], bpm: 96 }) }
};
