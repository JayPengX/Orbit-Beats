// A toast while a song plays sits above the mini player, not over it
// (2026-11-12: both sat at the tab bar's top, 「已存 5 首到資料庫 · 復原」 over the song).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {}
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const kitCss = new URL('../../Orbit-Core/kit/orbit.css', import.meta.url);

test('a toast clears the mini player', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  if (!existsSync(kitCss)) return t.skip('no Orbit-Core beside this repo');
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const page = await browser.newPage({ viewport });
      await page.setContent(`<style>${readFileSync(kitCss, 'utf8')}</style><style>${css}</style><body class="playing"><div class="player" id="player"><button class="mp-main"><span class="mp-cover"></span><span class="mp-text"><span class="mp-title">野火倒影</span></span></button></div><div class="q-toast" style="animation:none">已存 5 首到資料庫</div></body>`);
      const [p, q] = await page.evaluate(() => ['#player', '.q-toast'].map(s => document.querySelector(s).getBoundingClientRect()).map(r => ({ top: r.top, bottom: r.bottom })));
      assert.ok(q.bottom <= p.top, `${viewport.width}: toast ${JSON.stringify(q)} over the player ${JSON.stringify(p)}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
