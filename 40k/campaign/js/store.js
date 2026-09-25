import {
  updateCampaignContent,
  simplifyCampaignContent,
} from "./content-update.js";
import { applyCommand } from "./engine.js";
import { createDemoState, createEmptyState } from "./seed.js";
import { compressImage, blobToDataURL } from "./images.js";

const DB_NAME = "christopia-campaign-v1";
const BUCKET = "christopia-battle-photos";
const CLOUD_SELECTION = "christopia-selected-campaign";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(
        new Error(
          "Local campaign storage is unavailable. Enable browser storage or configure Supabase.",
        ),
      );
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("campaigns", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Your browser could not open campaign storage. Check its privacy/storage settings.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Close other Christopia tabs so local storage can be upgraded.",
        ),
      );
  });
}

function localTransaction(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["campaigns", "meta"], mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        tx.failure ||
          new Error(
            tx.error?.name === "QuotaExceededError"
              ? "Browser storage is full. Remove some photographs or use Supabase before saving again."
              : "The campaign could not be saved. Your previous data has been preserved.",
          ),
      );
    tx.onerror = () => {};
    const setResult = (value) => {
      result = value;
    };
    const fail = (error) => {
      tx.failure = error;
      tx.abort();
    };
    try {
      work(tx, setResult, fail);
    } catch (error) {
      fail(error);
    }
  });
}

function freshDemo() {
  const state = createDemoState();
  const ids = new Map([[state.campaign.id, crypto.randomUUID()]]);
  for (const value of Object.values(state)) {
    if (Array.isArray(value))
      for (const record of value)
        if (record.id) ids.set(record.id, crypto.randomUUID());
  }
  return JSON.parse(JSON.stringify(state), (_key, value) =>
    typeof value === "string" && ids.has(value) ? ids.get(value) : value,
  );
}

function publicKeyOnly(key) {
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "A secret Supabase key was configured in the browser. Remove it and use the publishable/anon key.",
    );
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role && payload.role !== "anon")
        throw new Error(
          "Do not put a service-role key in the browser. Configure the Supabase anon key.",
        );
    } catch (error) {
      if (error.message.includes("service-role")) throw error;
    }
  }
}

function friendlyError(error) {
  const message = error?.message || String(error);
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message))
    return new Error(
      "The command post is offline. Check your connection, then refresh to see whether the last order was saved before retrying.",
    );
  return new Error(message);
}

export async function createStore() {
  const config = globalThis.CHRISTOPIA_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  if (Boolean(config.supabaseUrl) !== Boolean(config.supabaseAnonKey))
    throw new Error(
      "Cloud setup is incomplete. Set both Supabase URL and publishable/anon key.",
    );
  let db,
    client,
    pending = false;
  const store = {
    mode: configured ? "cloud" : "demo",
    user: null,
    actor: null,
    state: null,
    ready: !configured,
    async commit(command) {
      return exclusively(async () => {
        if (!store.state) throw new Error("Select a campaign first.");
        if (configured) {
          const result = await invoke({
            command,
            campaign_id: store.state.campaign.id,
            expected_revision: store.state.campaign.revision,
          });
          store.state = await attachPhotoUrls(result.state);
          updateActor();
        } else {
          const next = await localTransaction(
            db,
            "readwrite",
            (tx, done, fail) => {
              const request = tx
                .objectStore("campaigns")
                .get(store.state.campaign.id);
              request.onsuccess = () => {
                try {
                  const saved = request.result?.state;
                  if (!saved)
                    throw new Error(
                      "This campaign no longer exists. Refresh the page.",
                    );
                  if (saved.campaign.revision !== store.state.campaign.revision)
                    throw new Error(
                      "Another tab changed the campaign. Refresh before saving your changes.",
                    );
                  const state = applyCommand(saved, command, store.actor);
                  tx.objectStore("campaigns").put({
                    id: state.campaign.id,
                    state,
                  });
                  done(state);
                } catch (error) {
                  fail(error);
                }
              };
            },
          );
          store.state = next;
          updateActor();
        }
        return store.state;
      });
    },
    async refresh() {
      if (configured) {
        const { data, error } = await client.auth.getSession();
        if (error) throw friendlyError(error);
        store.user = data.session?.user || null;
        store.ready = Boolean(store.user);
        if (!store.user) {
          store.state = null;
          store.actor = null;
          return;
        }
        const campaigns = await store.listCampaigns();
        let selected;
        try {
          selected = localStorage.getItem(CLOUD_SELECTION);
        } catch {}
        const id = store.state?.campaign.id || selected;
        const campaign =
          campaigns.find((item) => item.id === id) ||
          campaigns.find((item) => item.status === "active") ||
          campaigns[0];
        if (campaign) await store.selectCampaign(campaign.id);
        else {
          store.state = null;
          store.actor = null;
        }
      } else {
        const saved = await localTransaction(db, "readonly", (tx, done) => {
          const request = tx.objectStore("meta").get("selected");
          request.onsuccess = () => {
            const campaigns = tx.objectStore("campaigns").getAll();
            campaigns.onsuccess = () =>
              done(
                campaigns.result.find(
                  (item) => item.id === request.result?.value,
                ) || campaigns.result[0],
              );
          };
        });
        store.state = saved?.state || null;
        updateActor();
      }
      return store.state;
    },
    async signIn(email, password) {
      if (!configured)
        throw new Error(
          "Configure Supabase to sign in. This is the local demonstration.",
        );
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw friendlyError(error);
      return store.refresh();
    },
    async signUp(email, password) {
      if (!configured)
        throw new Error("Configure Supabase before creating an account.");
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw friendlyError(error);
      await store.refresh();
      return {
        confirmationRequired: !data.session,
        message: data.session
          ? "Your account is ready."
          : "Check your email to confirm your account, then sign in.",
      };
    },
    async signOut() {
      if (configured) {
        const { error } = await client.auth.signOut();
        if (error) throw friendlyError(error);
      }
      store.user = null;
      store.actor = null;
      store.state = null;
      store.ready = !configured;
      if (!configured) await store.refresh();
    },
    async createCampaign({
      name,
      players,
      settings = {},
      factions,
      neutral_start = false,
      seed_demo = false,
    }) {
      factions ||= players?.map((player) => player.faction).filter(Boolean);
      return exclusively(async () => {
        if (configured) {
          const result = await invoke({
            create: {
              name,
              players,
              settings,
              factions,
              neutral_start,
              seed_demo,
            },
          });
          store.state = await attachPhotoUrls(result.state);
          try {
            localStorage.setItem(CLOUD_SELECTION, store.state.campaign.id);
          } catch {}
        } else {
          const state = seed_demo
            ? freshDemo()
            : createEmptyState(name, players, {
                settings,
                factions,
                neutral_start,
              });
          if (seed_demo && name) state.campaign.name = name;
          await localTransaction(db, "readwrite", (tx, done) => {
            tx.objectStore("campaigns").put({ id: state.campaign.id, state });
            tx.objectStore("meta").put({
              id: "selected",
              value: state.campaign.id,
            });
            done(state);
          });
          store.state = state;
        }
        updateActor();
        return store.state;
      });
    },
    async listCampaigns() {
      if (configured) {
        const { data, error } = await client
          .from("christopia_campaigns")
          .select("id,name,status,turn,started_at,winner_id")
          .order("started_at", { ascending: false });
        if (error) throw friendlyError(error);
        return data || [];
      }
      return localTransaction(db, "readonly", (tx, done) => {
        const request = tx.objectStore("campaigns").getAll();
        request.onsuccess = () =>
          done(
            request.result
              .map((item) => item.state.campaign)
              .sort((a, b) => b.started_at.localeCompare(a.started_at)),
          );
      });
    },
    async selectCampaign(id) {
      if (configured) {
        const { data, error } = await client.rpc("christopia_load_campaign", {
          p_campaign: id,
        });
        if (error) throw friendlyError(error);
        store.state = await attachPhotoUrls(data);
        try {
          localStorage.setItem(CLOUD_SELECTION, id);
        } catch {}
      } else {
        store.state = await localTransaction(
          db,
          "readwrite",
          (tx, done, fail) => {
            const request = tx.objectStore("campaigns").get(id);
            request.onsuccess = () => {
              if (!request.result) {
                fail(new Error("Campaign not found."));
                return;
              }
              tx.objectStore("meta").put({ id: "selected", value: id });
              done(request.result.state);
            };
          },
        );
      }
      updateActor();
      return store.state;
    },
    async invitePlayer(email, playerId) {
      if (!configured)
        throw new Error(
          "Account membership is available when Supabase is configured.",
        );
      return exclusively(async () => {
        const result = await invoke({
          campaign_id: store.state.campaign.id,
          expected_revision: store.state.campaign.revision,
          invite: { email: email.trim(), player_id: playerId },
        });
        store.state = await attachPhotoUrls(result.state);
        updateActor();
        return store.state;
      });
    },
    async uploadPhoto(file, battleId, caption = "") {
      if (!store.state?.battles.some((battle) => battle.id === battleId))
        throw new Error("Choose a saved battle before uploading photographs.");
      const blob = await compressImage(file);
      const photo = {
        id: crypto.randomUUID(),
        battle_id: battleId,
        caption: caption.trim().slice(0, 1000),
        created_at: new Date().toISOString(),
      };
      if (configured) {
        photo.storage_path = `${store.state.campaign.id}/${battleId}/${photo.id}.jpg`;
        const { error } = await client.storage
          .from(BUCKET)
          .upload(photo.storage_path, blob, {
            contentType: "image/jpeg",
            upsert: false,
            cacheControl: "3600",
          });
        if (error)
          throw new Error(`Photograph was not uploaded: ${error.message}`);
        try {
          await store.commit({ type: "add_photo", payload: { photo } });
        } catch (error) {
          const cleanup = await client.storage
            .from(BUCKET)
            .remove([photo.storage_path]);
          if (cleanup.error)
            throw new Error(
              `${error.message} An unlinked file also needs cleanup in Supabase Storage: ${photo.storage_path}`,
            );
          throw error;
        }
      } else {
        photo.storage_path = "";
        photo.url = await blobToDataURL(blob);
        await store.commit({ type: "add_photo", payload: { photo } });
      }
      return store.state.photos.find((item) => item.id === photo.id);
    },
    async deletePhoto(id) {
      const photo = store.state?.photos.find((item) => item.id === id);
      if (!photo) throw new Error("This photograph has already been removed.");
      await store.commit({ type: "remove_photo", payload: { id } });
      if (configured && photo.storage_path) {
        const { error } = await client.storage
          .from(BUCKET)
          .remove([photo.storage_path]);
        if (error)
          throw new Error(
            "Photograph removed from the report, but its storage file could not be deleted. Retry cleanup in Supabase Storage.",
          );
      }
    },
  };

  function updateActor() {
    const player = configured
      ? store.state?.players.find((item) => item.profile_id === store.user?.id)
      : store.state?.players.find((item) => item.role === "admin");
    store.actor = player ? { player_id: player.id, role: player.role } : null;
  }
  async function exclusively(fn) {
    if (pending)
      throw new Error(
        "Another command is being saved. Please wait for confirmation.",
      );
    pending = true;
    try {
      return await fn();
    } catch (error) {
      throw friendlyError(error);
    } finally {
      pending = false;
    }
  }
  async function invoke(body) {
    const { data, error } = await client.functions.invoke("campaign-command", {
      body,
    });
    if (error) {
      let detail;
      try {
        detail = await error.context?.json();
      } catch {}
      throw new Error(
        detail?.error ||
          error.message ||
          "The campaign command could not be confirmed. Refresh before trying again.",
      );
    }
    if (data?.error) throw new Error(data.error);
    if (!data?.state)
      throw new Error(
        "The campaign server returned an incomplete response. Refresh to check whether your command was saved.",
      );
    return data;
  }
  async function attachPhotoUrls(state) {
    if (!state) throw new Error("No campaign data was returned.");
    const withFiles = state.photos.filter((photo) => photo.storage_path);
    if (withFiles.length) {
      const { data, error } = await client.storage
        .from(BUCKET)
        .createSignedUrls(
          withFiles.map((photo) => photo.storage_path),
          3600,
        );
      if (error) {
        state.photos.forEach((photo) => {
          photo.url = "";
          photo.load_error = "Photographs unavailable. Refresh to retry.";
        });
      } else {
        const signed = new Map(
          (data || []).map((item) => [item.path, item.signedUrl]),
        );
        state.photos.forEach((photo) => {
          photo.url = signed.get(photo.storage_path) || "";
        });
      }
    }
    return state;
  }

  if (configured) {
    publicKeyOnly(config.supabaseAnonKey);
    let createClient;
    try {
      ({ createClient } =
        await import("https://esm.sh/@supabase/supabase-js@2.57.4"));
    } catch {
      throw new Error(
        "Supabase could not be loaded. Check your internet connection and reload.",
      );
    }
    client = createClient(config.supabaseUrl, config.supabaseAnonKey);
    await store.refresh();
  } else {
    db = await openDatabase();
    await localTransaction(db, "readwrite", (tx, done) => {
      const meta = tx.objectStore("meta");
      const marker = meta.get("content-update-destroy-the-asset-v1");
      marker.onsuccess = () => {
        if (marker.result) {
          done();
          return;
        }
        const campaigns = tx.objectStore("campaigns");
        const request = campaigns.getAll();
        request.onsuccess = () => {
          for (const record of request.result) {
            const updated = updateCampaignContent(record.state);
            if (updated.changed)
              campaigns.put({ ...record, state: updated.state });
          }
          meta.put({ id: "content-update-destroy-the-asset-v1", value: true });
          done();
        };
      };
    });
    await localTransaction(db, "readwrite", (tx, done) => {
      const meta = tx.objectStore("meta"),
        marker = meta.get("simplified-campaign-v1");
      marker.onsuccess = () => {
        if (marker.result) {
          done();
          return;
        }
        const campaigns = tx.objectStore("campaigns"),
          request = campaigns.getAll();
        request.onsuccess = () => {
          for (const record of request.result)
            campaigns.put({
              ...record,
              state: simplifyCampaignContent(record.state),
            });
          meta.put({ id: "simplified-campaign-v1", value: true });
          done();
        };
      };
    });
    await store.refresh();
    if (!store.state) await store.createCampaign({ seed_demo: true });
  }
  return store;
}
