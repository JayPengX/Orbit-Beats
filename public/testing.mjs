// Orbit Beats' own switches in the kit's 測試工具 (hidden until unlocked:
// Orbit Pass › seven taps on 除錯紀錄). Read where they act as
// globalThis.ORBIT_TEST?.flags?.<name>; the kit's clock and network switches
// work here as everywhere (its network leaves the app's own files alone, the
// instruments among them: hence instruments below). Nothing here is saved to
// the Pass or sent anywhere.
//   makeFail: every song made fails (聽's 音樂做不出來…, 做歌's error)    lib/maker.mjs ask
//   instruments: slow | fail: the recorded instruments and drum kits load 2 s a file, or never   lib/sampleload.mjs
//   storageFull: 資料庫 and 套組 can't be written (a full phone)           lib/kits.mjs
//   gameAuto: 節奏遊戲 plays itself (FEVER, 全連擊, 全部完美, S+), no record kept   lib/gameview.mjs
//   radioPath: files | flac | aac | opus: 聽's way on this phone           lib/radioview.mjs
// Actions: another sound takes over / the audio session is interrupted (the
// 'orbit-beats-test' event, app.js and lib/radioview.mjs), and the way 聽 plays here.
const T = (zh, en) => (/^zh/i.test(document.documentElement.lang || 'zh') ? zh : en);
const closeTester = () => document.querySelector('dialog.q-tester[open]')?.close();
const app = 'beats';
const kick = (what, said) => () => {
  closeTester();
  // (A moment after the sheet closes, as it would come.)
  setTimeout(() => dispatchEvent(new CustomEvent('orbit-beats-test', { detail: what })), 600);
  return said;
};
(globalThis.ORBIT_TEST_TOOLS ||= []).push(
  {
    app,
    title: T('別的聲音接手', 'Another sound takes over'),
    sub: T('像 Orbit Law 的影片或別的 App 開始播：正在播的歌停在原處，不會自己再開始（先播一首）', 'Like a video in Orbit Law or another app starting: the song stops where it was and never starts itself again (play one first)'),
    label: T('模擬', 'Simulate'),
    run: kick('yield', T('已模擬：別的聲音接手', 'Simulated: another sound took over'))
  },
  {
    app,
    title: T('聲音被打斷', 'Audio interrupted'),
    sub: T('像來電或 Siri：歌、電台、樂器、即興都停下（先播或彈一下）', 'Like a call or Siri: songs, radio, 樂器 and 即興 all stop (play something first)'),
    label: T('模擬', 'Simulate'),
    run: kick('interrupt', T('已模擬：聲音被打斷', 'Simulated: audio interrupted'))
  },
  {
    app,
    title: T('電台走哪條路', 'How the radio plays'),
    sub: T('這支手機上「聽」用一條串流（哪種編碼）或一首一首的檔案，以及為什麼', 'Whether 聽 plays as one stream (which codec) or file by file on this phone, and why'),
    label: T('看', 'Show'),
    run: () => {
      try {
        return localStorage.getItem('orbit-beats-radio-path') || T('還沒決定：先打開「聽」', 'Not decided yet: open 聽 first');
      } catch {
        return T('讀不到', "Can't read it");
      }
    }
  },
  {
    app,
    title: T('電台指定播法', 'Radio: force a way'),
    sub: T('一首一首的檔案，或只試一種編碼的串流', 'File by file, or a stream in one codec only'),
    flag: 'radioPath',
    options: [
      { id: 'files', label: T('檔案', 'Files') },
      { id: 'flac', label: 'FLAC' },
      { id: 'aac', label: 'AAC' },
      { id: 'opus', label: 'Opus' }
    ]
  },
  { app, title: T('歌都做不出來', 'Songs fail to make'), sub: T('電台三次失敗後的「音樂做不出來」、做歌的錯誤（已存的歌照常播）', 'The radio’s 音樂做不出來 after three tries, 做歌’s error (kept songs still play)'), flag: 'makeFail' },
  {
    app,
    title: T('樂器聲音載入', 'Instruments loading'),
    sub: T('錄音樂器和鼓組：很慢（每個檔案 2 秒），或載不到（改用合成的聲音）', 'The recorded instruments and drum kits: slow (2 s a file), or failing (the made voices instead)'),
    flag: 'instruments',
    options: [
      { id: 'slow', label: T('很慢', 'Slow') },
      { id: 'fail', label: T('載不到', 'Failing') }
    ]
  },
  { app, title: T('手機空間滿了', 'Phone storage full'), sub: T('收藏到資料庫、存套組都存不下（什麼都不會被刪）', 'Keeping to 資料庫 and saving a kit fail (nothing is deleted)'), flag: 'storageFull' },
  { app, title: T('節奏遊戲自動玩', 'Rhythm game plays itself'), sub: T('看火力全開、全連擊、全部完美和結算畫面；不留紀錄', 'See FEVER, FULL COMBO, ALL PERFECT and the results; no record kept'), flag: 'gameAuto' }
);
