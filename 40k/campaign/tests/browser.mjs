// Run with: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
const base =
  process.env.CHRISTOPIA_TEST_URL ||
  "http://localhost:4173/battle-for-christopia.html";
const output =
  process.env.CHRISTOPIA_SCREENSHOTS || "/tmp/christopia-browser-artifacts";
await mkdir(output, { recursive: true });
const state = () =>
  page.evaluate(async () => {
    const { createStore } = await import("./js/store.js");
    return (await createStore()).state;
  });
const close = async () => {
  if (await page.locator("#modal").isVisible())
    await page.locator("#close-modal").click();
};
try {
  await page.goto(base);
  await page.locator("#planet-map").waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-territory]").count(), 12);
  await page.screenshot({ path: output + "/home-desktop.png", fullPage: true });
  for (const route of [
    "battles",
    "chronicle",
    "armies",
    "campaign",
    "gallery",
    "christopia",
  ]) {
    await page.evaluate((route) => (location.hash = route), route);
    await page.waitForTimeout(100);
    assert.equal(await page.locator("main").count(), 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      route + " desktop overflow",
    );
  }
  console.log("PASS six views and desktop layout");
  await page.locator("#new-battle").click();
  await page.locator("#battle-form").waitFor();
  assert.equal(
    await page.locator("#generate-scenario, #scenario-library").count(),
    0,
  );
  assert.equal(
    await page.locator("[name=mission]").getAttribute("readonly"),
    "",
  );
  const initial = await state();
  await page.locator("#battle-attacker").selectOption(initial.players[1].id);
  await page
    .locator("#battle-territory")
    .selectOption(
      initial.territories.find((t) => t.name === "Northern Manufactorum").id,
    );
  assert.equal(
    await page.locator("#territory-scenario-name").innerText(),
    "Destroy the asset",
  );
  await page.locator("#battle-form [name=points]").fill("1250");
  assert.match(await page.locator("#asset-points").innerText(), /2,500 pts/);
  await page.locator("#asset-side").selectOption("attacker");
  assert.match(
    await page.locator("#asset-points").innerText(),
    /Attacker:.*1,250 pts · Baneblade/,
  );
  await page.locator("#battle-form details summary").click();
  assert.match(
    await page.locator("[name=attacker_objective]").inputValue(),
    /Escape with the Baneblade/,
  );
  assert.match(
    await page.locator("[name=defender_objective]").inputValue(),
    /Destroy the Baneblade/,
  );
  await page.screenshot({
    path: output + "/destroy-the-asset.png",
    fullPage: true,
  });
  await page
    .locator("#battle-form [name=name]")
    .fill("Browser test — Ash offensive");
  const territoryId = await page.locator("#battle-territory").inputValue();
  const attackerId = await page.locator("#battle-attacker").inputValue();
  assert.equal(await page.locator("#save-battle").isDisabled(), false);
  await page.locator("#save-battle").click();
  await page.locator("#complete-battle").waitFor();
  await page.locator("#complete-battle").click();
  await page.locator("#result-form [name=attacker_score]").fill("72");
  await page.locator("#result-form [name=defender_score]").fill("46");
  await page
    .getByRole("button", { name: /Review campaign consequences/ })
    .click();
  await page.locator("#confirm-result").waitFor();
  assert.match(await page.locator(".result-summary").innerText(), /wins/);
  await page.locator("#confirm-result").click();
  await page.locator("#upload-photos").waitFor();
  let saved = await state();
  const battle = saved.battles.find(
    (b) => b.name === "Browser test — Ash offensive",
  );
  assert.equal(battle.status, "completed");
  assert.equal(battle.asset_side, "attacker");
  assert.equal(battle.attacker_points, 1250);
  assert.equal(battle.defender_points, 2500);
  assert.match(battle.deployment, /after both armies deploy/);
  assert.equal(
    saved.territories.find((t) => t.id === territoryId).owner_id,
    attackerId,
  );
  assert.equal(
    saved.chronicle.filter((c) => c.battle_id === battle.id).length,
    1,
  );
  await close();
  await page.reload();
  await page.locator("#new-battle").waitFor();
  assert.equal(
    (await state()).battles.find((b) => b.id === battle.id).attacker_score,
    72,
  );
  console.log(
    "PASS scenario, create battle, confirm capture, Chronicle, persistence",
  );
  await page.locator(`[data-battle="${battle.id}"]`).click();
  await page.locator("#upload-photos").click();
  const photo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 80;
    const x = c.getContext("2d");
    x.fillStyle = "#ba9f71";
    x.fillRect(0, 0, 120, 80);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "battle-test.png",
    mimeType: "image/png",
    buffer: Buffer.from(photo, "base64"),
  });
  await page.locator("[name=caption]").fill("The last stand at the causeway");
  await page
    .getByRole("button", { name: "Upload photographs", exact: true })
    .click();
  await page.locator("[data-report-photo]").waitFor();
  assert.equal((await state()).photos.length, 1);
  await close();
  await page.evaluate(() => (location.hash = "gallery"));
  await page.locator("[data-secondary-photo]").waitFor();
  await page.locator("[data-secondary-photo]").click();
  await page.locator(".lightbox-image").waitFor();
  assert.equal(
    await page
      .locator(".lightbox-image")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await page.locator("#remove-photo").click();
  await page.locator("#delete-photo").click();
  await page.locator("#upload-photos").waitFor();
  assert.equal((await state()).photos.length, 0);
  await close();
  console.log("PASS image upload, gallery, lightbox and deletion");
  await page.evaluate(() => (location.hash = "chronicle"));
  await page.locator("[data-edit-chronicle]").first().click();
  await page
    .locator("#secondary-form [name=narrative]")
    .fill("Against all odds, the causeway held.");
  await page.locator("#secondary-form button[type=submit]").click();
  await page.waitForTimeout(100);
  assert.ok(
    (await state()).chronicle.some(
      (c) => c.narrative === "Against all odds, the causeway held.",
    ),
  );
  await page.evaluate(() => (location.hash = "armies"));
  await page.waitForTimeout(100);
  assert.equal(
    await page.locator("[data-new-unit], [data-edit-unit]").count(),
    0,
  );
  assert.doesNotMatch(await page.locator("main").innerText(), /Notable units/i);
  console.log("PASS Chronicle editing and simplified armies");
  await page.locator("#settings").click();
  await page.locator("#rules-form [name=attacks_per_turn]").fill("3");
  await page.getByRole("button", { name: "Save campaign rules" }).click();
  await page.waitForTimeout(150);
  assert.equal((await state()).settings.attacks_per_turn, 3);
  await page.locator("#settings").click();
  await page.locator("[data-settings-tab=territories]").click();
  await page.locator("[data-edit-territory]").first().click();
  await page.locator("#territory-form [name=name]").fill("Hive Ashstomp Prime");
  await page
    .getByRole("button", { name: "Save territory", exact: true })
    .click();
  await page.waitForTimeout(150);
  assert.ok(
    (await state()).territories.some((t) => t.name === "Hive Ashstomp Prime"),
  );
  console.log("PASS campaign rules and territory editing");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  for (const route of [
    "christopia",
    "battles",
    "chronicle",
    "armies",
    "campaign",
    "gallery",
  ]) {
    await page.evaluate((route) => (location.hash = route), route);
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      route + " mobile overflow",
    );
    await page.screenshot({
      path: output + "/" + route + "-mobile.png",
      fullPage: true,
    });
  }
  await page.locator("#new-battle").click();
  await page.locator("#battle-form").waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector("#modal").scrollWidth >
        document.querySelector("#modal").clientWidth,
    ),
    false,
    "battle modal overflow",
  );
  await close();
  assert.deepEqual(errors, []);
  console.log("PASS mobile views, modal and no JavaScript errors");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(250);
  await page.locator("#settings").click();
  await page.locator("[data-settings-tab=territories]").click();
  await page.locator("#edit-map").click();
  const marker = page.locator("[data-territory]").first(),
    oldPosition = (await state()).territories[0];
  const box = await marker.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 20,
    box.y + box.height / 2 + 15,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.notEqual((await state()).territories[0].x, oldPosition.x);
  await page.locator("#finish-map-edit").click();
  console.log("PASS map dragging persists coordinates");
  const archivedCampaignId = (await state()).campaign.id;
  await page.locator("#settings").click();
  await page.locator("[data-settings-tab=data]").click();
  await page.locator("#new-campaign").click();
  await page.locator("#setup-form [name=name]").fill("The Second War");
  await page.locator("#setup-form .btn-primary").click();
  await page.locator("[name=name0]").fill("Commander Alice");
  await page.locator("[name=faction0]").fill("Adepta Sororitas");
  await page.locator("#setup-form .btn-primary").click();
  await page.locator("[name=deployment_mode]").selectOption("headquarters");
  await page.locator("#setup-form .btn-primary").click();
  await page.locator("#planet-map").waitFor();
  await page.waitForTimeout(150);
  const fresh = await state();
  assert.equal(fresh.campaign.name, "The Second War");
  assert.equal(fresh.battles.length, 0);
  assert.equal(fresh.players[0].name, "Commander Alice");
  assert.equal(fresh.factions[0].name, "Adepta Sororitas");
  assert.equal(fresh.territories.filter((t) => !t.owner_id).length, 10);
  assert.notEqual(fresh.campaign.id, archivedCampaignId);
  console.log(
    "PASS setup wizard, custom faction and headquarters-only deployment",
  );
  await page.evaluate(() => (location.hash = "campaign"));
  await page.locator("[data-archive-campaign]").click();
  await page.locator("#secondary-form button[type=submit]").click();
  await page.waitForTimeout(150);
  assert.equal((await state()).campaign.status, "archived");
  await page.locator("[data-view-campaigns]").click();
  await page.locator(`[data-select-campaign="${archivedCampaignId}"]`).click();
  await page.waitForTimeout(150);
  assert.equal((await state()).campaign.id, archivedCampaignId);
  assert.equal(
    (await state()).battles.find((b) => b.id === battle.id).attacker_score,
    72,
  );
  console.log(
    "PASS archive preserves prior campaigns and switching restores records",
  );
  await page.evaluate(() => (location.hash = "battles"));
  await page.locator(`[data-battle="${battle.id}"]`).click();
  await page.locator("#edit-report").click();
  await page.locator("#edit-report-form summary").click();
  await page
    .locator("#edit-report-form [name=result]")
    .selectOption("defender");
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await page.locator("#confirm-correction").click();
  await page.locator("#upload-photos").waitFor();
  assert.equal(
    (await state()).battles.find((b) => b.id === battle.id).result,
    "defender",
  );
  await close();
  console.log("PASS administrator result correction preview and commit");
  await page.locator("#settings").click();
  await page.locator("[name=domination_threshold]").fill("40");
  await page.getByRole("button", { name: "Save campaign rules" }).click();
  await page.evaluate(() => (location.hash = "campaign"));
  await page.locator("[data-final-assault]").first().click();
  await page.locator("#save-battle").click();
  await page.locator("#complete-battle").click();
  await page.locator("#result-form [name=attacker_score]").fill("90");
  await page.locator("#result-form [name=defender_score]").fill("40");
  await page
    .getByRole("button", { name: /Review campaign consequences/ })
    .click();
  assert.match(
    await page.locator(".result-summary").innerText(),
    /CHRISTOPIA HAS FALLEN/,
  );
  await page.locator("#confirm-result").click();
  await page.locator("#upload-photos").waitFor();
  await close();
  await page.evaluate(() => (location.hash = "campaign"));
  await page
    .getByRole("heading", { name: "Christopia has fallen", exact: true })
    .waitFor();
  assert.equal((await state()).campaign.status, "completed");
  console.log(
    "PASS final assault unlock, battle, result and preserved campaign summary",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
