import { test } from "node:test";
import assert from "node:assert/strict";
import { indexedDB, IDBObjectStore } from "fake-indexeddb";
import { createStore } from "../js/store.js";
import { compressImage } from "../js/images.js";

globalThis.indexedDB = indexedDB;

test("local campaign persistence, cross-tab conflict protection, archives and photograph errors", async (t) => {
  const first = await createStore();
  const second = await createStore();
  const originalId = first.state.campaign.id;
  await t.test(
    "first run creates and reloads an immediately usable demo",
    async () => {
      assert.equal(first.mode, "demo");
      assert.equal(first.ready, true);
      assert.equal(first.actor.role, "admin");
      assert.equal(first.state.battles.length, 6);
      assert.equal(second.state.campaign.id, originalId);
    },
  );
  await t.test("only one same-revision browser tab can commit", async () => {
    const results = await Promise.allSettled([
      first.commit({
        type: "save_settings",
        payload: { settings: { attacks_per_turn: 3 } },
      }),
      second.commit({
        type: "save_settings",
        payload: { settings: { attacks_per_turn: 4 } },
      }),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.match(
      results.find((result) => result.status === "rejected").reason.message,
      /Another tab/,
    );
    await first.refresh();
    await second.refresh();
    assert.equal(first.state.campaign.revision, second.state.campaign.revision);
  });
  await t.test(
    "a saved battle result and territory capture survive a new store",
    async () => {
      const battle = first.state.battles.find((row) => row.status === "active");
      await first.commit({
        type: "complete_battle",
        payload: {
          id: battle.id,
          result: "attacker",
          attacker_score: 70,
          defender_score: 50,
          rounds: 5,
        },
      });
      const loaded = await createStore();
      assert.equal(
        loaded.state.battles.find((row) => row.id === battle.id).status,
        "completed",
      );
      assert.equal(
        loaded.state.territories.find((row) => row.id === battle.territory_id)
          .owner_id,
        battle.attacker_id,
      );
      assert.equal(loaded.state.chronicle.length, 6);
    },
  );
  await t.test(
    "an IndexedDB write failure does not publish unsaved state",
    async () => {
      const revision = first.state.campaign.revision;
      const previous = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException("Simulated full storage", "QuotaExceededError");
      };
      try {
        await assert.rejects(
          first.commit({
            type: "save_settings",
            payload: { settings: { attacks_per_turn: 5 } },
          }),
          /storage|full/i,
        );
        assert.equal(first.state.campaign.revision, revision);
      } finally {
        IDBObjectStore.prototype.put = previous;
      }
      await first.refresh();
      assert.equal(first.state.campaign.revision, revision);
    },
  );
  await t.test(
    "failed image validation leaves battle and photo state unchanged",
    async () => {
      const revision = first.state.campaign.revision;
      await assert.rejects(
        first.uploadPhoto(
          { type: "application/pdf", size: 100 },
          first.state.battles[0].id,
        ),
        /JPEG, PNG or WebP/,
      );
      await assert.rejects(
        first.uploadPhoto({ type: "image/jpeg", size: 1 }, crypto.randomUUID()),
        /saved battle/,
      );
      assert.equal(first.state.campaign.revision, revision);
      assert.equal(first.state.photos.length, 0);
    },
  );
  await t.test(
    "archiving then creating another campaign preserves history and selected state",
    async () => {
      await first.commit({ type: "archive_campaign", payload: {} });
      await first.createCampaign({
        name: "Campaign II",
        players: [
          { name: "Alice", color: "#abcdef", faction: "Custom Regiment" },
          { name: "Bob", color: "#fedcba", faction: "Custom Waaagh" },
        ],
        settings: { attacks_per_turn: 1 },
      });
      assert.notEqual(first.state.campaign.id, originalId);
      assert.equal(first.state.battles.length, 0);
      assert.equal(first.state.factions[0].name, "Custom Regiment");
      assert.equal(first.state.factions[1].name, "Custom Waaagh");
      assert.equal((await createStore()).state.campaign.name, "Campaign II");
      await first.selectCampaign(originalId);
      assert.equal(first.state.campaign.status, "archived");
      assert.equal(first.state.battles.length, 6);
    },
  );
  await t.test(
    "new sample campaigns have distinct ids instead of replacing the archive",
    async () => {
      await first.createCampaign({ seed_demo: true });
      const anotherId = first.state.campaign.id;
      await first.createCampaign({ seed_demo: true });
      assert.notEqual(first.state.campaign.id, anotherId);
      assert.equal((await first.listCampaigns()).length, 4);
    },
  );
});

test("image compression rejects unsupported, oversize and corrupt images with useful errors", async () => {
  await assert.rejects(
    compressImage({ type: "image/heic", size: 1 }),
    /Export HEIC/,
  );
  await assert.rejects(
    compressImage({ type: "image/jpeg", size: 31 * 1024 * 1024 }),
    /30 MB/,
  );
  globalThis.Image = class {
    async decode() {
      throw new Error("decode failed");
    }
  };
  try {
    await assert.rejects(
      compressImage(new Blob(["corrupt"], { type: "image/jpeg" })),
      /could not be decoded/,
    );
  } finally {
    delete globalThis.Image;
  }
});

test("incomplete cloud configuration and secret keys are rejected before connecting", async () => {
  globalThis.CHRISTOPIA_CONFIG = { supabaseUrl: "https://example.supabase.co" };
  await assert.rejects(createStore(), /setup is incomplete/);
  globalThis.CHRISTOPIA_CONFIG = {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "sb_secret_this_is_not_a_real_key",
  };
  await assert.rejects(createStore(), /secret Supabase key/);
  delete globalThis.CHRISTOPIA_CONFIG;
});
