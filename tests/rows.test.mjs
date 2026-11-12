// A song row's details (2:22 · 爵士搖擺 · 慢 · C 小調) stay on one line: at 320 what doesn't fit is
// left out whole, the key first (2026-11-12: they wrapped onto a second line under the name).
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

test('a song row’s details: one line at 320, parts left out whole, the dots between those shown', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 600 } });
    const row = parts => `<li class="song"><div class="line"><button class="main"><span class="play"></span><span class="what"><span class="name">午後咖啡</span><span class="info">${parts.map(p => `<span>${p}</span>`).join('')}</span></span></button><button class="act">♡</button><button class="act">⋯</button></div></li>`;
    await page.setContent(`<style>${css}</style><main style="padding:0 16px"><ul id="songs" style="list-style:none;padding:0;margin:0">${row(['2:22', '爵士搖擺', '慢', 'C 小調'])}${row(['2:51', 'Hardstyle', '中', 'C 小調'])}${row(['1:00', 'Lo-fi'])}</ul></main>`);
    const seen = await page.evaluate(() =>
      [...document.querySelectorAll('.song .info')].map(info => {
        const top = info.getBoundingClientRect().top;
        const shown = [...info.children].filter(s => s.getBoundingClientRect().top - top < 4);
        return { h: Math.round(info.getBoundingClientRect().height), text: shown.map(s => getComputedStyle(s, '::before').content.replace(/^"|"$|none/g, '') + s.textContent).join('') };
      })
    );
    for (const s of seen) assert.equal(s.h, 18, `one line: ${JSON.stringify(s)}`);
    assert.match(seen[0].text, /^2:22 · 爵士搖擺/);
    assert.ok(!/C 小調/.test(seen[0].text) || seen[0].text === '2:22 · 爵士搖擺 · 慢 · C 小調', seen[0].text);
    assert.equal(seen[2].text, '1:00 · Lo-fi');
  } finally {
    await browser.close();
  }
});
