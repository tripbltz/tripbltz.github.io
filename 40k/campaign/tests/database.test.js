import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createDemoState, createEmptyState } from "../js/seed.js";
import { applyCommand } from "../js/engine.js";

const adminId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const outsiderId = "10000000-0000-4000-8000-000000000003";
const schema = await readFile(
  new URL("../supabase/001_schema.sql", import.meta.url),
  "utf8",
);
const storage = await readFile(
  new URL("../supabase/002_storage.sql", import.meta.url),
  "utf8",
);

async function identity(db, role, id = "") {
  await db.exec(`reset role; set role ${role}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [id, role],
  );
}
async function persist(db, state, revision, create = false) {
  return db.query(
    "select public.christopia_persist_state($1::jsonb,$2::uuid,$3::integer,$4::boolean)",
    [JSON.stringify(state), adminId, revision, create],
  );
}

test("PostgreSQL migrations, membership RLS, atomic saves, concurrency and private Storage policies", async (t) => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema auth,storage to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
  `);
  await db.exec(schema);
  await db.exec(storage);
  await db.exec(
    await readFile(
      new URL("../supabase/003_destroy_the_asset.sql", import.meta.url),
      "utf8",
    ),
  );
  const simplify = await readFile(
    new URL("../supabase/004_simplify_campaign.sql", import.meta.url),
    "utf8",
  );
  await db.exec(simplify);
  await db.query(
    "insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6)",
    [
      adminId,
      "admin@example.test",
      otherId,
      "player@example.test",
      outsiderId,
      "outsider@example.test",
    ],
  );
  const state = createDemoState();
  state.players[0].profile_id = adminId;
  state.players[1].profile_id = otherId;
  await identity(db, "service_role");
  await persist(db, state, 0, true);

  await t.test(
    "normalized seed and consistent authorized snapshot",
    async () => {
      await identity(db, "authenticated", adminId);
      const result = await db.query(
        "select public.christopia_load_campaign($1::uuid) as state",
        [state.campaign.id],
      );
      assert.equal(result.rows[0].state.territories.length, 12);
      assert.equal(result.rows[0].state.battles.length, 6);
      assert.equal(result.rows[0].state.players[0].profile_id, adminId);
      assert.equal(result.rows[0].state.campaign.created_by, undefined);
      for (const key of [
        "players",
        "territories",
        "battles",
        "history",
        "chronicle",
        "transactions",
      ])
        assert.deepEqual(
          result.rows[0].state[key].map((row) => row.id),
          state[key].map((row) => row.id),
          key + " order preserved",
        );
    },
  );
  await t.test(
    "outsiders cannot read campaign data or impersonate a member through RPC",
    async () => {
      await identity(db, "authenticated", outsiderId);
      assert.equal(
        (await db.query("select * from public.christopia_campaigns")).rows
          .length,
        0,
      );
      assert.equal(
        (await db.query("select * from public.christopia_battles")).rows.length,
        0,
      );
      await assert.rejects(
        db.query("select public.christopia_load_campaign($1::uuid,$2::uuid)", [
          state.campaign.id,
          adminId,
        ]),
        /do not have access/,
      );
    },
  );
  await t.test(
    "authenticated members cannot mutate tables or call privileged save RPC",
    async () => {
      await identity(db, "authenticated", adminId);
      await assert.rejects(
        db.query("update public.christopia_campaign_players set role=$1", [
          "admin",
        ]),
        /permission denied/,
      );
      await assert.rejects(persist(db, state, 0), /permission denied/);
      await assert.rejects(
        db.query("delete from public.christopia_battles"),
        /permission denied/,
      );
    },
  );
  await t.test("anonymous access is denied", async () => {
    await identity(db, "anon");
    await assert.rejects(
      db.query("select * from public.christopia_campaigns"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.christopia_load_campaign($1::uuid)", [
        state.campaign.id,
      ]),
      /permission denied/,
    );
  });
  await t.test(
    "atomic revision lock rejects stale saves and preserves original state",
    async () => {
      await identity(db, "service_role");
      const next = structuredClone(state);
      next.campaign.revision = 1;
      next.campaign.name = "Revision one";
      await persist(db, next, 0);
      await assert.rejects(persist(db, next, 0), /Another commander/);
      const loaded = await db.query(
        "select public.christopia_load_campaign($1,$2) as state",
        [state.campaign.id, adminId],
      );
      assert.equal(loaded.rows[0].state.campaign.revision, 1);
      assert.equal(loaded.rows[0].state.campaign.name, "Revision one");
      assert.equal(loaded.rows[0].state.battles.length, 6);
    },
  );
  await t.test(
    "invalid foreign-key update rolls back every table",
    async () => {
      const invalid = structuredClone(state);
      invalid.campaign.revision = 2;
      invalid.battles[0].territory_id = crypto.randomUUID();
      await assert.rejects(persist(db, invalid, 1), /foreign key/);
      const loaded = await db.query(
        "select public.christopia_load_campaign($1,$2) as state",
        [state.campaign.id, adminId],
      );
      assert.equal(loaded.rows[0].state.campaign.revision, 1);
      assert.equal(loaded.rows[0].state.territories.length, 12);
    },
  );
  await t.test("cross-campaign references are rejected", async () => {
    const second = createEmptyState("Second campaign");
    second.players[0].profile_id = adminId;
    second.territories[0].owner_id = state.players[0].id;
    await assert.rejects(persist(db, second, 0, true), /foreign key/);
    assert.equal(
      (await db.query("select id from public.christopia_campaigns")).rows
        .length,
      1,
    );
  });
  const photoName = `${state.campaign.id}/${state.battles[0].id}/${crypto.randomUUID()}.jpg`;
  await t.test(
    "Storage allows a participant upload and member access",
    async () => {
      await identity(db, "authenticated", otherId);
      await db.query(
        "insert into storage.objects(bucket_id,name) values($1,$2)",
        ["christopia-battle-photos", photoName],
      );
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        1,
      );
      await identity(db, "authenticated", adminId);
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        1,
      );
    },
  );
  await t.test(
    "Storage denies outsiders and fabricated battle paths",
    async () => {
      await identity(db, "authenticated", outsiderId);
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        0,
      );
      await assert.rejects(
        db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
          "christopia-battle-photos",
          photoName,
        ]),
        /row-level security/,
      );
      await identity(db, "authenticated", adminId);
      await assert.rejects(
        db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
          "christopia-battle-photos",
          `${state.campaign.id}/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`,
        ]),
        /row-level security/,
      );
    },
  );
  await t.test("Storage participant removal works", async () => {
    await identity(db, "authenticated", otherId);
    await db.query("delete from storage.objects where name=$1", [photoName]);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
  });
  await t.test(
    "shared domain battle completion persists ownership, resources and Chronicle atomically",
    async () => {
      await identity(db, "service_role");
      const before = (
        await db.query(
          "select public.christopia_load_campaign($1,$2) as state",
          [state.campaign.id, adminId],
        )
      ).rows[0].state;
      const battle = before.battles.find((row) => row.status === "active");
      const command = {
        type: "complete_battle",
        payload: {
          id: battle.id,
          result: "attacker",
          attacker_score: 80,
          defender_score: 60,
          rounds: 5,
        },
      };
      const actor = {
        player_id: before.players.find((row) => row.profile_id === adminId).id,
        role: "admin",
      };
      const next = applyCommand(before, command, actor);
      await persist(db, next, before.campaign.revision);
      const after = (
        await db.query(
          "select public.christopia_load_campaign($1,$2) as state",
          [state.campaign.id, adminId],
        )
      ).rows[0].state;
      assert.equal(
        after.territories.find((row) => row.id === battle.territory_id)
          .owner_id,
        battle.attacker_id,
      );
      assert.equal(
        after.territories.find((row) => row.id === battle.territory_id)
          .contested,
        false,
      );
      assert.equal(
        after.players.find((row) => row.id === battle.attacker_id).resources,
        before.players.find((row) => row.id === battle.attacker_id).resources +
          2,
      );
      assert.equal(after.chronicle.length, before.chronicle.length + 1);
      assert.equal(after.transactions.length, before.transactions.length + 1);
      const repeated = applyCommand(after, command, actor);
      assert.equal(repeated.campaign.revision, after.campaign.revision);
      assert.equal(repeated.transactions.length, after.transactions.length);
    },
  );
  await t.test(
    "resource action credits retain their relational metadata and scenario choices",
    async () => {
      const before = (
        await db.query(
          "select public.christopia_load_campaign($1,$2) as state",
          [state.campaign.id, adminId],
        )
      ).rows[0].state;
      const player = before.players.find((row) => row.profile_id === adminId);
      const action = before.actions.find((row) => row.key === "recon");
      action.description = "Legacy configured recon";
      const next = applyCommand(
        before,
        {
          type: "spend_resource",
          payload: { player_id: player.id, action_id: action.id },
        },
        { player_id: player.id, role: "admin" },
      );
      await persist(db, next, before.campaign.revision);
      const after = (
        await db.query(
          "select public.christopia_load_campaign($1,$2) as state",
          [state.campaign.id, adminId],
        )
      ).rows[0].state;
      const credit = after.transactions.find(
        (row) => row.action_key === "recon",
      );
      assert.equal(credit.turn, after.campaign.turn);
      assert.equal(credit.scenario_options.length, 2);
      assert.equal(credit.player_id, player.id);
      assert.equal(credit.consumed, false);
    },
  );
  await t.test(
    "existing installations migrate content and persist asymmetric armies",
    async () => {
      const legacy = createEmptyState("Existing campaign");
      legacy.players[0].profile_id = adminId;
      legacy.territories[0].name = "Hive Ward";
      legacy.territories[1].name = "Fort Penelope";
      legacy.territories[7].name = "The Hazel Expanse";
      legacy.scenarios = legacy.scenarios.filter(
        (sc) => sc.title !== "Destroy the asset",
      );
      legacy.territories.forEach((t) => (t.scenario_id = null));
      await identity(db, "service_role");
      await persist(db, legacy, 0, true);
      await db.exec(
        "reset role; delete from public.christopia_content_migrations; alter table public.christopia_battles drop column asset_side, drop column attacker_points, drop column defender_points;",
      );
      const upgrade = await readFile(
        new URL("../supabase/003_destroy_the_asset.sql", import.meta.url),
        "utf8",
      );
      await db.exec(upgrade);
      await db.exec(simplify);
      await identity(db, "service_role");
      const load = async () =>
        (
          await db.query(
            "select public.christopia_load_campaign($1,$2) as state",
            [legacy.campaign.id, adminId],
          )
        ).rows[0].state;
      const loaded = await load();
      assert.equal(loaded.territories[0].name, "Hive Ashstomp");
      assert.equal(loaded.territories[1].name, "Fort Rouse");
      assert.equal(loaded.territories[7].name, "Sam's Smelly Hole");
      assert.deepEqual(
        loaded.territories.map((t) => t.owner_id),
        legacy.territories.map((t) => t.owner_id),
      );
      assert.equal(
        loaded.scenarios.filter((sc) => sc.title === "Destroy the asset")
          .length,
        1,
      );
      const next = applyCommand(loaded, {
        type: "create_battle",
        payload: {
          name: "Destroy the asset",
          mission: "Destroy the asset",
          territory_id: loaded.territories[3].id,
          attacker_id: loaded.players[1].id,
          defender_id: loaded.players[0].id,
          points: 1250,
          asset_side: "attacker",
        },
      });
      await persist(db, next, loaded.campaign.revision);
      const roundtrip = await load();
      assert.equal(roundtrip.battles.at(-1).asset_side, "attacker");
      assert.equal(roundtrip.battles.at(-1).attacker_points, 1250);
      assert.equal(roundtrip.battles.at(-1).defender_points, 2500);
      await db.exec("reset role");
      await db.exec(upgrade);
      await db.exec(simplify);
      await identity(db, "service_role");
      const again = await load();
      assert.equal(again.campaign.revision, roundtrip.campaign.revision);
      assert.equal(
        again.scenarios.filter((sc) => sc.title === "Destroy the asset").length,
        1,
      );
    },
  );
  await db.close();
});
