# Christopia module contract
ES modules, plain JS, snake_case fields. All identifiers are UUID strings. Use crypto.randomUUID().
State = { campaign, settings, players:[], factions:[], territories:[], connections:[], battles:[], photos:[], chronicle:[], history:[], units:[], events:[], scenarios:[], actions:[], transactions:[] }.
campaign: id,name,turn,status ('active','completed','archived'),started_at,winner_id,ended_at,revision
settings: attacks_per_turn,resources_enabled,random_events_enabled,unit_tracking_enabled,gameplay_modifiers_enabled,domination_threshold (70),final_assault_enabled,final_assault_penalty (3)
players: id,name,color,role ('admin','player'),profile_id (nullable auth UUID),resources
factions: id,name,player_id,color,description,image_url
territories: id,name,description,x,y (0..100 map coordinates),type,strategic_value,owner_id (player id|null),previous_owner_id,contested,bonus_key ('none','resource','spaceport','defence','domination'),capture_count,fortified,headquarters_for (player id|null),image_url
connections: territory_a,territory_b
battles: id,name,territory_id,attacker_id,defender_id,attacker_faction_id,defender_faction_id,points,mission,deployment,date,modifier,notes,attacker_objective,defender_objective,custom_objective,campaign_objective,status ('planned','active','completed'),turn,is_final_assault,winner_id,result ('attacker','defender','draw'),attacker_score,defender_score,rounds,mvp,moment,casualties,units_destroyed,resources_earned,completed_at
photos: id,battle_id,storage_path,url,caption,created_at
chronicle: id,battle_id,title,narrative,date
history: id,territory_id,battle_id,from_owner_id,to_owner_id,title,description,date
units: id,name,nickname,faction_id,battles,victories,kills,times_destroyed,honours,notes
 events: id,title,description,effect,duration,remaining_turns,active
scenarios: id,title,mission,deployment,condition,narrative,attacker_objective,defender_objective
 actions: id,key ('recon','fortify','redeploy','counter'),name,description,cost
transactions: id,player_id,amount,reason,date

js/seed.js exports createDemoState() with 12 locations, 5 completed + 1 active battle; createEmptyState(name,playerInputs,options) if helpful.
js/engine.js exports:
- getStats(state) => {players:[{...player,territories,wins,losses,domination,domination_points,streak,units_destroyed}],total_battles,contested,neutral,largest_victory,closest_battle,most_contested,most_successful_faction,most_successful_unit}
- canAttack(state,playerId,territoryId,{finalAssault=false}={}) => {allowed,reason}
- getLegalTargets(state,playerId) => array territory ids
- generateScenario(state) => scenario object
- resultConsequences(state,battleId,result) => {text,territory_from,territory_to,resources,final_assault_unlocked,campaign_ends} (text readable)
- applyCommand(state,{type,payload},actor?) => NEW cloned state or throws useful Error. actor optional {player_id,role}; no actor = local admin.
commands: create_battle(payload battle); start_battle({id}); complete_battle({id,result,attacker_score,defender_score,rounds,mvp,moment,notes,casualties,units_destroyed,resources_earned,penalty_territory_ids?}); advance_turn({}); save_territory({territory,neighbours:ids[]}); save_settings({settings}); save_player({player}); save_faction({faction}); save_unit({unit}); save_scenario({scenario}); save_event({event}); activate_event({id}); spend_resource({player_id,action_id,territory_id?}); save_chronicle({id,narrative}); add_photo({photo}); remove_photo({id}); archive_campaign({}); edit_battle({battle}) admin only, must reconcile completed result changes safely or reject changes to outcome while allow report editing.

js/store.js exports createStore() async => {mode:'demo'|'cloud',user,actor,state,ready,error?, commit(command) async updates state and persists atomically; refresh(); signIn(email,password); signUp(email,password); signOut(); createCampaign({name,players,settings,seed_demo?}); listCampaigns(); selectCampaign(id); uploadPhoto(file,battleId,caption); deletePhoto(id)}. Auth may return ready false & state null if configured logged out. Demo local persistence including photos via IndexedDB preferred; storage failure must report. Config read from window.CHRISTOPIA_CONFIG={supabaseUrl:'',supabaseAnonKey:''}. cloud read via Supabase CDN dynamic import only configured. Cloud authorization enforced server-side. No service keys. No auto connecting unrelated existing env.

Root owns HTML/CSS and js/app.js js/map.js js/ui.js. js/ui.js exports escapeHtml(value), icon(name), formatDate(value), factionName(state,id), playerName(state,id), field(label,inputHTML), modal(title,html,{wide=false}={}), closeModal(), toast(message,type='success'). Root provides all CSS classes.
Agent secondary views owns js/views.js exports renderSecondaryView(view,state,ctx) -> HTML for chronicle,armies,campaign,gallery; bindSecondaryView(view,state,ctx) attaches listeners. ctx = {store,render,openBattle(id),openTerritory(id),openNewBattle(id?),openSettings(),openPhoto(id),run(command) async commit+render+toast}. Secondary features may use imported ui helpers. Never edit root app/CSS files; send needed style notes.
