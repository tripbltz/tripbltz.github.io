import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { applyCommand } from "../_shared/engine.js";
import { createDemoState, createEmptyState } from "../_shared/seed.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function freshDemo() {
  const state = createDemoState();
  const ids = new Map<string, string>();
  ids.set(state.campaign.id, crypto.randomUUID());
  for (const value of Object.values(state)) {
    if (Array.isArray(value))
      for (const row of value) if (row.id) ids.set(row.id, crypto.randomUUID());
  }
  return JSON.parse(JSON.stringify(state), (_key, value) =>
    typeof value === "string" && ids.has(value) ? ids.get(value) : value,
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: cors });
  if (request.method !== "POST")
    return respond({ error: "Use POST for campaign commands." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !secret)
      return respond({ error: "The campaign server is not configured." }, 503);
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token)
      return respond(
        { error: "Sign in before issuing a campaign command." },
        401,
      );
    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } =
      await authClient.auth.getUser(token);
    if (authError || !authData.user)
      return respond(
        { error: "Your session has expired. Sign in again." },
        401,
      );
    const user = authData.user;
    const raw = await request.text();
    if (raw.length > 2_000_000)
      return respond(
        {
          error: "This command is too large. Upload photographs using Storage.",
        },
        413,
      );
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return respond(
        { error: "The campaign command was not valid JSON." },
        400,
      );
    }
    const server = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: profileError } = await server
      .from("christopia_profiles")
      .upsert(
        {
          id: user.id,
          email: user.email?.toLowerCase() || "",
          display_name: "",
        },
        { onConflict: "id" },
      );
    if (profileError)
      throw new Error(
        "Your commander profile could not be loaded. Verify the database migration.",
      );

    let state;
    const creating = Boolean(body.create);
    if (creating) {
      const setup = body.create;
      const name = String(setup.name || "The War for Christopia").trim();
      if (!name || name.length > 160)
        throw new Error("Campaign names must be between 1 and 160 characters.");
      const players = (
        Array.isArray(setup.players)
          ? setup.players
          : [{ name: "Chris" }, { name: "Player Two" }]
      ).map((player: any, index: number) => ({
        name: String(player.name || `Player ${index + 1}`).trim(),
        color: player.color || (index === 0 ? "#76b3cf" : "#d16655"),
        profile_id: index === 0 ? user.id : null,
      }));
      if (
        players.length < 2 ||
        players.length > 8 ||
        players.some(
          (player: any) =>
            !player.name ||
            player.name.length > 100 ||
            !/^#[0-9a-f]{6}$/i.test(player.color),
        )
      )
        throw new Error("Provide 2–8 commanders with names and valid colours.");
      state = setup.seed_demo
        ? freshDemo()
        : createEmptyState(name, players, {
            settings: setup.settings || {},
            factions:
              setup.factions ||
              setup.players
                ?.map((player: any) => player.faction)
                .filter(Boolean),
            neutral_start: Boolean(setup.neutral_start),
          });
      state.campaign.name = name;
      state.players[0].profile_id = user.id;
      state.players[0].role = "admin";
      for (let index = 1; index < state.players.length; index++) {
        state.players[index].profile_id = null;
        state.players[index].role = "player";
      }
      state = applyCommand(state, {
        type: "save_settings",
        payload: { settings: state.settings },
      });
    } else {
      if (
        typeof body.campaign_id !== "string" ||
        !Number.isInteger(body.expected_revision)
      )
        throw new Error(
          "Choose a campaign and refresh its tactical data before saving.",
        );
      const { data, error } = await server.rpc("christopia_load_campaign", {
        p_campaign: body.campaign_id,
        p_actor: user.id,
      });
      if (error)
        return respond(
          { error: "This account does not have access to that campaign." },
          403,
        );
      state = data;
      if (state.campaign.revision !== body.expected_revision)
        return respond(
          {
            error:
              "Another commander changed the campaign. Refresh before saving your changes.",
          },
          409,
        );
      const player = state.players.find(
        (row: any) => row.profile_id === user.id,
      );
      if (!player)
        return respond({ error: "Campaign membership required." }, 403);
      const actor = { player_id: player.id, role: player.role };
      let command = body.command;
      if (body.invite) {
        if (player.role !== "admin")
          return respond(
            { error: "Only an administrator may assign commander accounts." },
            403,
          );
        const { data: invited, error: inviteError } = await server
          .from("christopia_profiles")
          .select("id")
          .eq(
            "email",
            String(body.invite.email || "")
              .trim()
              .toLowerCase(),
          )
          .maybeSingle();
        if (inviteError || !invited)
          throw new Error(
            "No account matches that email. Your friend must sign up and confirm their email first.",
          );
        const target = state.players.find(
          (row: any) => row.id === body.invite.player_id,
        );
        if (!target)
          throw new Error("Choose a commander to link to this account.");
        if (
          state.players.some(
            (row: any) => row.profile_id === invited.id && row.id !== target.id,
          )
        )
          throw new Error(
            "That account already controls another commander in this campaign.",
          );
        command = {
          type: "save_player",
          payload: { player: { ...target, profile_id: invited.id } },
        };
      }
      if (!command || typeof command.type !== "string")
        throw new Error("No campaign command was supplied.");
      // Account assignment is resolved server-side, never from an arbitrary client UUID.
      if (
        !body.invite &&
        command.type === "save_player" &&
        command.payload?.player?.profile_id !== undefined
      ) {
        const target = state.players.find(
          (row: any) => row.id === command.payload.player.id,
        );
        if (command.payload.player.profile_id !== (target?.profile_id || null))
          throw new Error(
            "Use the email account-link action to change commander membership.",
          );
      }
      if (command.type === "add_photo") {
        const photo = command.payload?.photo;
        const expected = `${state.campaign.id}/${photo?.battle_id}/${photo?.id}.jpg`;
        if (!photo || photo.storage_path !== expected || photo.url)
          throw new Error(
            "Upload the photograph to this battle’s private Storage folder first.",
          );
        const { data: files, error: fileError } = await server.storage
          .from("christopia-battle-photos")
          .list(`${state.campaign.id}/${photo.battle_id}`, {
            search: `${photo.id}.jpg`,
            limit: 10,
          });
        if (
          fileError ||
          !files?.some((file) => file.name === `${photo.id}.jpg`)
        )
          throw new Error(
            "The uploaded photograph could not be found. Retry the upload.",
          );
      }
      const previousRevision = state.campaign.revision;
      state = applyCommand(state, command, actor);
      if (state.campaign.revision === previousRevision)
        return respond({ state });
    }
    // Signed image URLs are ephemeral and never written to the database.
    state.photos.forEach((photo: any) => {
      delete photo.url;
      delete photo.load_error;
    });
    const { error: saveError } = await server.rpc("christopia_persist_state", {
      p_state: state,
      p_actor: user.id,
      p_expected_revision: creating ? 0 : body.expected_revision,
      p_create: creating,
    });
    if (saveError)
      return respond(
        {
          error:
            saveError.code === "40001"
              ? "Another commander changed the campaign. Refresh before saving your changes."
              : "The campaign could not be saved. Your previous data is preserved. " +
                saveError.message,
        },
        saveError.code === "40001" ? 409 : 400,
      );
    return respond({ state });
  } catch (error) {
    return respond(
      {
        error:
          error instanceof Error
            ? error.message
            : "The campaign command could not be completed.",
      },
      400,
    );
  }
});
