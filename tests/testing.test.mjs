// The 測試工具's switches (public/testing.mjs) where they act: off, nothing changes; on, the state they name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maker } from '../public/lib/maker.mjs';
import { saveSong, saveNamed } from '../public/lib/kits.mjs';

const flags = f => (globalThis.ORBIT_TEST = { flags: f });

test('makeFail: every song made fails, the kit still handed over', async () => {
  flags({ makeFail: true });
  try {
    const m = maker('lib/maker.worker.mjs');
    await assert.rejects(m.song({ seed: 1 }), /test: making fails/);
    await assert.rejects(m.radio({ seed: 1, mood: 'all' }), /test: making fails/);
  } finally {
    delete globalThis.ORBIT_TEST;
  }
});

test('storageFull: 資料庫 and 套組 refuse as a full phone does, before touching the store', async () => {
  flags({ storageFull: true });
  try {
    await assert.rejects(saveSong({ id: 'x' }), e => e.name === 'QuotaExceededError');
    await assert.rejects(saveNamed({ id: 'n' }), e => e.name === 'QuotaExceededError');
  } finally {
    delete globalThis.ORBIT_TEST;
  }
});
