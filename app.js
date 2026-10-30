const COLS = 20, ROWS = 11;
const LOS_A = 6, LOS_B = 13;
const teamColorHex = { A: '#c0392b', B: '#2a6fb0' };

let players = [];
let nextId = 1;
let ball = { carrierId: null, row: null, col: null };
let ballBounceActive = false;
let pendingCatch = null;
let pendingBallDrop = null;
let pendingTurnoverAfterResolve = false;
let pendingDriveStart = null;
let selected = null;   // token selected during LIVE phase (for movement)
let declaredAction = null; // null | 'move' | 'blitz' | 'block' | 'secureball' | 'handoff' — se fija al elegir en la Ruleta
let remoteSelected = null; // espejo de solo lectura de la selección del OTRO navegador, solo para pintar sus casillas de movimiento
let remoteDeclaredAction = null;
let pendingTraitCheck = null; // { playerId, actionLabel, trait }
let pendingFerocityAttack = null; // { attackerId }
let pendingHandoffChoice = null; // { fromId }
let pendingAnimosity = null;      // { playerId, receiverId, kind:'pass'|'handoff', ctx, roll, success } — tirada de Animosidad en curso
let pendingHailMaryChoice = null; // { passerId, r, c, zone } — elegir Pase normal o Pase a lo loco
let pendingManualStatus = null; // 'standing' | 'tumbado' | 'aturdido' | 'despistado' | 'ko' | 'injured' | 'injuredGrave' | 'dead'
let placing = null;    // player id currently being placed/repositioned (SETUP phase)
let phase = 'setup';   // 'setup' | 'live'
let pendingTD = null;
let pendingDodge = null; // { playerId, toR, toC }
let pendingGfi = null;   // { playerId, toR, toC }
let dodgeRerollUsed = false;
let gfiRerollUsed = false;
let catchRerollUsed = false;
let secureBallRerollUsed = false;
let armorForPlayer = null; // player id currently being armor-rolled
let state = { half: 1, active: 'A', turns: { A: 0, B: 0 } };
let teamRace = { A: '', B: '' };
let openingKickoffDone = false;
let firstHalfKickingTeam = null;
let pitchBackgroundUrl = null;
let pitchBackgroundExact = false;
let teamStaff = { A: null, B: null };
let teamRerollsLeft = { A: 0, B: 0 };
let teamFormation = { A: [], B: [] };
let preMatch = defaultPreMatch(); // secuencia previa al partido (hinchas, clima, sustitutos, sorteo)

// ---- Iconos de recursos en el marcador (amarillo = disponible, gris = gastado; solo aparecen si el equipo los tiene) ----
const RES_ICONS = [
  { key:'apothecary',   icon:'apotecario.png',          name:'Apotecario',           once:true  },
  { key:'wizard',       icon:'mago.png',                name:'Mago deportivo',       once:true  },
  { key:'morgue',       icon:'ayudante_morgue.png',     name:'Ayudante de la morgue', once:true  },
  { key:'cheerleaders', icon:'animadora.png',           name:'Animadoras',           once:false },
  { key:'assistants',   icon:'ayudante_entrenador.png', name:'Ayudantes de entrenador', once:false },
  { key:'keg',          icon:'barril.png',              name:'Barril de cerveza Estrella Blitzer', once:false },
  { key:'bribes',       icon:'soborno.png',             name:'Soborno (incentivo)',  once:true  },
  { key:'plague',       icon:'medico_peste.png',        name:'Médico de la peste',   once:true  },
  { key:'chef',         icon:'chef_halfling.png',       name:'Chef maestro halfling', once:false }
];
function resTotal(team, key){
  return ['morgue','wizard','keg','plague','chef'].includes(key) ? incCount(team, key) : getStaffCount(team, key);
}
function renderResourceIcons(){
  ['A','B'].forEach(t=>{
    const box = document.getElementById('sbIcons'+t);
    if(!box) return;
    let html = '';
    RES_ICONS.forEach(r=>{
      const total = resTotal(t, r.key);
      if(!(total>0)) return;
      const used = r.once ? Math.min(total, (teamUsedRes[t] || {})[r.key] || 0) : 0;
      const left = total - used;
      const gone = r.once && left<=0;
      const num = r.once ? (total>1 ? left : '') : (total>1 ? total : '');
      const title = r.once
        ? (gone ? r.name + ' usado' : r.name + ' disponible' + (total>1 ? ' (' + left + '/' + total + ')' : '') + ' — clic para marcarlo como usado')
        : r.name + ': ' + total;
      html += '<span class="sb-ico' + (gone ? ' used' : '') + (r.once && !gone ? ' clickable' : '') + '" title="' + title + '"' +
        (r.once && !gone ? ' onclick="useResource(\'' + t + '\',\'' + r.key + '\')"' : '') + '>' +
        '<span class="gold-icon" style="--icon:url(\'icons/' + r.icon + '\')"></span>' +
        (num!=='' ? '<b class="mono">' + num + '</b>' : '') + '</span>';
    });
    [2,4,5,6,7].forEach(n=>{
      const total = despCount(t, n); if(!(total>0)) return;
      const left = despList(t).filter(d=>d.n===n && !d.used).length;
      const gone = left<=0, di = DESP_ICONS[n];
      const armed = (n===2 && despisteArmed[t]) || (n===4 && ajusteArmed[t]);
      const click = !gone && n!==5;
      const tip = di.name + (gone ? ' (usada)' : armed ? ' (activada)' : left>0 ? ' — disponible' + (n===5 ? ' (se ofrece al declarar un Pase)' : ' — clic para usarla') : '');
      html += '<span class="sb-ico' + (gone ? ' used' : '') + (click ? ' clickable' : '') + (armed ? ' armed' : '') + '" title="' + tip + '"' +
        (click ? ' onclick="useDesperate(\'' + t + '\',' + n + ')"' : '') + '>' +
        '<span class="gold-icon" style="--icon:url(\'icons/' + di.icon + '\')"></span>' + (total>1 ? '<b class="mono">' + left + '</b>' : '') + '</span>';
    });
    if(prayerFlag(t==='A'?'B':'A','escrutinio')){
      html += '<span class="sb-ico alert" title="Escrutinio arbitral: si rompe la armadura en una Falta, este equipo es Expulsado automáticamente"><span class="gold-icon" style="--icon:url(\'icons/silbato.png\')"></span></span>';
    }
    if(prayerFlag(t==='A'?'B':'A','topos')){
      html += '<span class="sb-ico alert" title="Topos bajo el campo: este equipo aplica −1 a sus intentos de forzar la marcha (a por ellos)"><span class="gold-icon" style="--icon:url(\'icons/topos.png\')"></span></span>';
    }
    box.innerHTML = html;
  });
  // Reroll: el icono sustituye a la etiqueta "RR" (amarillo con rerolls, gris sin ninguna)
  ['A','B'].forEach(t=>{
    const el = document.getElementById('sbRerollLabel'+t);
    if(el){ const empty = !(teamRerollsLeft[t] > 0); el.classList.toggle('empty', empty); el.title = empty ? 'Sin Segundas oportunidades' : 'Segundas oportunidades'; }
  });
}
function useResource(team, key){
  if(key==='wizard'){ wizardIconClick(team); return; }
  const r = RES_ICONS.find(x=>x.key===key);
  if(!r || !r.once) return;
  const total = resTotal(team, key), used = (teamUsedRes[team] || {})[key] || 0;
  if(used>=total) return;
  if(!confirm('¿Marcar como USADO: ' + r.name + ' de ' + teamName(team) + '?')) return;
  teamUsedRes[team] = Object.assign({}, teamUsedRes[team] || {}); teamUsedRes[team][key] = used + 1;
  log('🧰 ' + teamName(team) + ' usa: ' + r.name + '.');
  renderResourceIcons();
  broadcastState();
}
// Segundas oportunidades por parte: las del roster (staff.rerolls) + Entrenamientos adicionales (incentivo, teamInc.rerolls)
function rerollMax(team){
  const staff = teamStaff[team];
  if(!(staff && staff.rerolls && typeof staff.rerolls.count === 'number')) return null;
  return staff.rerolls.count + incCount(team, 'rerolls');
}
function renderStaffPanels(){
  ['A','B'].forEach(team=>{
    const panel = document.getElementById('sbReroll'+team);
    if(!panel) return;
    panel.style.display = 'flex';
    const rerollCountEl = document.getElementById('sbRerollCount'+team);
    if(rerollCountEl){
      const staff = teamStaff[team];
      const max = rerollMax(team);
      rerollCountEl.textContent = max!==null ? (teamRerollsLeft[team] + '/' + max) : String(teamRerollsLeft[team] || 0);
    }
  });
  renderResourceIcons();
  if(typeof renderPreMatchBadges==='function') renderPreMatchBadges();
}

function adjustReroll(team, delta){
  if(delta<0 && (teamRerollsLeft[team]||0)>0 && captainSavesReroll(team)){
    log('🔄 Reroll usado sin coste (Capitán) — ' + teamName(team) + ' mantiene ' + teamRerollsLeft[team] + '.');
    renderStaffPanels(); broadcastState(); return;
  }
  teamRerollsLeft[team] = Math.max(0, (teamRerollsLeft[team] || 0) + delta);
  const staff = teamStaff[team];
  const max = rerollMax(team);
  const suffix = max!==null ? ('/' + max) : '';
  log((delta<0 ? '🔄 Reroll usado' : '↩️ Reroll añadido') + ' — ' + teamName(team) + ': ' + teamRerollsLeft[team] + suffix + '.');
  renderStaffPanels();
  broadcastState();
}

function resetRerollsForNewHalf(){
  teamFreeRR = { A:-1, B:-1 };
  ['A','B'].forEach(team=>{
    const staff = teamStaff[team];
    const rm = rerollMax(team);
    if(rm!==null){ const bl = Math.min(teamBonusRR[team] || 0, teamRerollsLeft[team] || 0); teamBonusRR[team] = bl; teamRerollsLeft[team] = rm + bl; }
  });
  renderStaffPanels();
}

function selectPitchBackground(path){
  document.getElementById('pitchBgInput').value = '';
  setPitchBackground(path || null, true);
  broadcastState();
}

function applyPitchBackground(){
  const url = document.getElementById('pitchBgInput').value.trim();
  if(!url) return;
  document.getElementById('pitchBgSelect').value = '';
  setPitchBackground(url, false);
  broadcastState();
}

function clearPitchBackground(){
  document.getElementById('pitchBgInput').value = '';
  document.getElementById('pitchBgSelect').value = '';
  setPitchBackground(null, false);
  broadcastState();
}

function setPitchBackground(url, exactFit){
  pitchBackgroundUrl = url || null;
  pitchBackgroundExact = !!exactFit;
  const wrap = document.getElementById('pitchWrap');
  const pitchEl = document.getElementById('pitch');
  wrap.style.backgroundImage = 'none';
  if(pitchBackgroundUrl && exactFit){
    // official, pre-sized field image: painted directly on the grid for a pixel-perfect match
    pitchEl.style.backgroundImage = `url("${pitchBackgroundUrl}")`;
    pitchEl.style.backgroundSize = '100% 100%';
    pitchEl.style.backgroundPosition = 'center';
    pitchEl.classList.add('custom-bg');
  } else if(pitchBackgroundUrl){
    // ad-hoc URL: painted on the outer wrap, cropped to fit
    pitchEl.style.backgroundImage = 'none';
    wrap.style.backgroundImage = `url("${pitchBackgroundUrl}")`;
    wrap.style.backgroundSize = 'cover';
    wrap.style.backgroundPosition = 'center';
    pitchEl.classList.add('custom-bg');
  } else {
    pitchEl.style.backgroundImage = 'none';
    pitchEl.classList.remove('custom-bg');
  }
}
let teamCustomColor = { A: null, B: null };
let teamNameLocked = { A: false, B: false };
let teamTextColor = { A: 'auto', B: 'auto' };
let customColorsEnabled = true;
// Color secundario del equipo (viene del JSON: color_secundary / textColor_secundary). Se sincroniza como dato del equipo.
let teamColor2 = { A: null, B: null };
let teamText2 = { A: 'auto', B: 'auto' };
// Qué juego de colores ve CADA jugador para cada equipo: preferencia LOCAL (no se sincroniza), guardada en el navegador.
let colorChoice = { A: 'main', B: 'main' };
try{ const cc = JSON.parse(localStorage.getItem('bb7_colorChoice') || 'null'); if(cc && (cc.A==='sec'||cc.A==='main') && (cc.B==='sec'||cc.B==='main')) colorChoice = cc; }catch(e){}
function setSwitch(id, on){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.toggle('on', !!on);
  const t = el.querySelector('.sw-txt');
  if(t) t.textContent = on ? el.dataset.on : el.dataset.off;
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function useSecondary(team){ return colorChoice[team]==='sec' && !!teamColor2[team]; }
function effColor(team){ return useSecondary(team) ? teamColor2[team] : teamCustomColor[team]; }
function effTextSetting(team){ return useSecondary(team) ? (teamText2[team] || 'auto') : teamTextColor[team]; }
function setColorChoice(team, which){
  colorChoice[team] = which;
  try{ localStorage.setItem('bb7_colorChoice', JSON.stringify(colorChoice)); }catch(e){}
  updateColorChoiceButtons();
  renderRosters(); renderPitch(); applyTeamColorAccents();
}
function updateColorChoiceButtons(){
  ['A','B'].forEach(t=>{
    const sw = document.getElementById('cc'+t+'Sw');
    if(!sw) return;
    setSwitch('cc'+t+'Sw', useSecondary(t));
    sw.title = teamColor2[t] ? 'Cambiar entre color principal y secundario (solo en tu pantalla)' : 'Este equipo no tiene color secundario en su archivo';
    sw.style.opacity = teamColor2[t] ? '1' : '0.45';
    const lab = document.getElementById('cc'+t+'Label');
    if(lab){
      lab.textContent = '';
      const b1 = document.createElement('div'); b1.textContent = (t==='A' ? 'LOCAL' : 'VISITANTE');
      const b2 = document.createElement('div'); b2.className = 'sw-sub'; b2.textContent = teamName(t);
      lab.appendChild(b1); lab.appendChild(b2);
    }
  });
}// Zonas de defensa (ayuda visual local: cada jugador la activa o no en su navegador; NO se sincroniza). Desactivada por defecto.
let showTackleZones = false;
try{ showTackleZones = localStorage.getItem('bb7_showTackleZones') === '1'; }catch(e){}
function setShowTackleZones(v){
  showTackleZones = !!v;
  try{ localStorage.setItem('bb7_showTackleZones', showTackleZones ? '1' : '0'); }catch(e){}
  updateTackleZonesButtons();
  renderPitch();
}
function updateTackleZonesButtons(){ setSwitch('tzSw', showTackleZones); }
// ---- Vista del tablero (local por jugador): 3D opcional + orientación ----
let view3d = false, viewOrient = 'h';
try{ view3d = localStorage.getItem('bb7_view3d') === '1'; const o = localStorage.getItem('bb7_viewOrient'); if(['h','a','b'].includes(o)) viewOrient = o; }catch(e){}
function applyBoardView(){
  const w = document.getElementById('pitchWrap'); if(!w) return;
  w.classList.toggle('view3d', view3d);
  ['a','b'].forEach(k=>w.classList.toggle('ori-' + k, viewOrient===k));
  setSwitch('view3dSw', view3d);
  const sel = document.getElementById('viewOrientSel'); if(sel) sel.value = viewOrient;
}
function setView3d(v){ view3d = !!v; try{ localStorage.setItem('bb7_view3d', view3d ? '1' : '0'); }catch(e){} applyBoardView(); }
function setViewOrient(v){ viewOrient = v; try{ localStorage.setItem('bb7_viewOrient', v); }catch(e){} applyBoardView(); }
// ---- Campo según el clima (carpeta field/) ----
const WEATHER_FIELDS = { calor:'calor_asfixiante_campo.png', soleado:'soleado_campo.png', ventisca:'ventisca_campo.png', lluvia:'lluvioso_campo.png', perfecto:'clima_perfecto_campo.png' };
let weatherFieldAuto = true;
try{ weatherFieldAuto = localStorage.getItem('bb7_weatherField') !== '0'; }catch(e){}
function setWeatherField(v){
  weatherFieldAuto = !!v;
  try{ localStorage.setItem('bb7_weatherField', weatherFieldAuto ? '1' : '0'); }catch(e){}
  setSwitch('wfSw', weatherFieldAuto);
  if(weatherFieldAuto) applyWeatherField(weatherKind());
}
function applyWeatherField(kind){
  if(!weatherFieldAuto || !WEATHER_FIELDS[kind]) return;
  const url = 'field/' + WEATHER_FIELDS[kind];
  // Se comprueba que la imagen carga antes de aplicarla (si no, el campo quedaría oscuro/vacío).
  const img = new Image();
  img.onload = ()=>{
    const sel = document.getElementById('pitchBgSelect'); if(sel) sel.value = [...sel.options].some(o=>o.value===url) ? url : '';
    setPitchBackground(url, true);
    broadcastState();
  };
  img.onerror = ()=>{ log('🖼️ No se encontró la imagen de campo "' + url + '" (revisa el nombre del archivo en la carpeta field). Se mantiene el campo actual.'); };
  img.src = url;
}
// Nº de rivales en pie (sin Canijo, igual que en las esquivas) que marcan cada casilla respecto al jugador seleccionado.
function tackleZoneCountMap(sel){
  // Devuelve { 'r_c': { flat:n marcadores normales, tail:n marcadores con Cola prensil } }.
  const map = {};
  players.forEach(o=>{
    if(!o.onPitch || o.team===sel.team || o.condition!=='standing') return;
    const tail = hasColaPrensil(o);
    if(!tail && playerHasSkill(o,'canijo','puny')) return;
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
      if(!dr && !dc) continue;
      const r=o.row+dr, c=o.col+dc;
      if(r<0||r>=ROWS||c<0||c>=COLS) continue;
      const e = map[r+'_'+c] || (map[r+'_'+c] = { flat:0, tail:0 });
      if(tail) e.tail++; else e.flat++;
    }
  });
  return map;
}
// COLA PRENSIL: rival en pie que marca la casilla de origen de una esquiva → −1 adicional (solo uno aplica).
function hasColaPrensil(p){ return playerHasSkill(p, 'cola prensil', 'prehensile tail'); }
function prehensileTailersAt(p){
  return opponentTackleZonePlayers(p.row, p.col, p.team).filter(hasColaPrensil);
}
function tokenColorFor(p){
  return (customColorsEnabled && effColor(p.team)) ? effColor(p.team) : teamColorHex[p.team];
}
function contrastTextColor(hex){
  if(!hex) return '#fff';
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  if(isNaN(r) || isNaN(g) || isNaN(b)) return '#fff';
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.6 ? '#161311' : '#fff';
}
function textColorFor(p){
  if(!customColorsEnabled) return '#fff';
  const override = effTextSetting(p.team);
  if(override==='white') return '#fff';
  if(override==='black') return '#161311';
  if(override && override.startsWith('#')) return override;
  return contrastTextColor(tokenColorFor(p));
}
function setCustomColors(v){
  customColorsEnabled = v;
  setSwitch('colorsSw', v);
  renderRosters(); renderPitch(); applyTeamColorAccents();
  broadcastState();
}
function setTeamColor(team, hex){
  teamCustomColor[team] = hex;
  renderRosters(); renderPitch();
  broadcastState();
}
function setTeamTextColor(team, mode){
  teamTextColor[team] = mode;
  renderRosters(); renderPitch();
  broadcastState();
}
let blitzUsedByTeam = { A: false, B: false };
let handoffUsedByTeam = { A: false, B: false };
let foulUsedByTeam = { A: false, B: false };
let passUsedByTeam = { A: false, B: false };
let passThrowWheelActive = false;
let pendingPassTargetSelection = null; // { passerId }
let pendingPassRoll = null; // { passerId, targetR, targetC, zone, totalPenalty }
let ballInFlight = false; // true entre "el balón deja las manos del lanzador" y "aterriza de verdad" — evita pintarlo en una posición vieja
let pendingInterceptionChoice = null; // { landR, landC, outcome, candidateIds }
let pendingInterceptionRoll = null; // { interceptorId, target, outcome }
let pendingHeroicReception = null; // { landR, landC, candidateIds, resumeKind: 'pass'|'kickoff'|'throwin', resumeData }
let pendingFoulContext = null; // { foulerId, targetId, offAssists, defAssists, modifier, doubleDetected }
let secureBallUsedByTeam = { A: false, B: false };
let pendingSecureBall = null;
let secureBallActivePlayer = null;
let blitzActivePlayer = null;
let blockTargeting = null;   // attacker id currently choosing an adjacent target
let pendingBlitzStabChoice = null; // { attackerId, targetId } — elegir Placaje o Apuñalar al llegar al rival en un Blitz
let activeBlock = null;      // { attackerId, defenderId, isBlitz }
let blockDiceRolled = false;
let pendingArmorQueue = [];
let pendingPush = null;      // { attackerId, defenderId, kind, isBlitz }
let pendingFollowUp = null;  // { attackerId, defenderId, vacatedR, vacatedC, fallKind, isBlitz, directInjuryPlayerId }
let crowdPushMode = false;

// ---------- Remote play (Firebase Realtime Database) ----------
// Sustituye a PeerJS: en vez de conexión P2P directa (que falla con NAT/firewall entre redes
// distintas), cada navegador lee/escribe en una "sala" compartida en la nube de Google.
const firebaseConfig = {
  apiKey: "AIzaSyApviYQNdvC1jBUafZnVRuhtUfySvXLuto",
  authDomain: "bb-sevens.firebaseapp.com",
  databaseURL: "https://bb-sevens-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bb-sevens",
  storageBucket: "bb-sevens.firebasestorage.app",
  messagingSenderId: "407624262418",
  appId: "1:407624262418:web:a87d394e9da7f9219149cb",
  measurementId: "G-8NYFH7D5BH"
};
firebase.initializeApp(firebaseConfig);
const fbDb = firebase.database();

let applyingRemote = false;
let roomCode = null;
let stateRef = null;
let peersRef = null;
const myPeerId = Math.random().toString(36).slice(2) + Date.now().toString(36);

function generateCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s=''; for(let i=0;i<4;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function updateConnStatus(msg, connected){
  document.getElementById('connStatus').textContent = msg;
  document.getElementById('connDot').classList.toggle('on', !!connected);
}

function toggleGameMenu(){
  document.getElementById('gameMenuDropdown').classList.toggle('show');
}
document.addEventListener('click', (e)=>{
  const wrap = document.querySelector('.game-menu-wrap');
  if(wrap && !wrap.contains(e.target)){
    document.getElementById('gameMenuDropdown').classList.remove('show');
  }
});

function setupRoomRefs(code){
  const roomRef = fbDb.ref('rooms/' + code);
  stateRef = roomRef.child('state');
  peersRef = roomRef.child('peers');
}

function joinPresence(){
  const myRef = peersRef.child(myPeerId);
  myRef.set(true).catch(err=>{
    console.error('Firebase presence write error:', err);
    updateConnStatus('⚠️ Error al conectar con la sala (revisa las Reglas de la base de datos en Firebase). Detalle en la consola (F12).', false);
  });
  myRef.onDisconnect().remove();
}

function listenForPeers(){
  peersRef.on('value', snap=>{
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    if(count>=2){
      updateConnStatus('✅ Conectado — sala ' + roomCode, true);
    } else {
      updateConnStatus('Sala ' + roomCode + '. Esperando al rival...', false);
    }
  }, err=>{
    console.error('Firebase peers read error:', err);
    updateConnStatus('⚠️ Error leyendo la sala (revisa las Reglas de la base de datos). Detalle en la consola (F12).', false);
  });
}

function listenForState(){
  console.log('[BB7] listenForState() ENGANCHADO — a partir de aquí debería llegar el estado actual de la sala inmediatamente.');
  stateRef.on('value', snap=>{
    const envelope = snap.val();
    if(!envelope){
      console.log('[BB7] RECIBIDO: la sala está vacía (nadie ha enviado nada todavía).');
      return;
    }
    if(envelope.senderId===myPeerId){
      console.log('[BB7] RECIBIDO seq='+envelope.seq+' — es mi propio eco, ignorado.');
      return;
    }
    let payload;
    try{ payload = JSON.parse(envelope.blob); }
    catch(e){ console.error('[BB7] ❌ No se pudo decodificar el blob recibido (seq='+envelope.seq+'):', e); return; }
    console.log('[BB7] RECIBIDO seq='+envelope.seq+' de otro jugador. phase='+payload.phase+' jugadores='+(Array.isArray(payload.players)?payload.players.length:'?')+' balón='+JSON.stringify(payload.ball)+' teamAName='+payload.teamAName+' teamBName='+payload.teamBName);
    applyingRemote = true;
    try{
      applyRemoteState(payload);
      console.log('[BB7] ✅ Estado aplicado correctamente (seq='+envelope.seq+')');
    }catch(err){
      console.error('[BB7] ❌ ERROR al aplicar el estado recibido (seq='+envelope.seq+'):', err);
    }
    applyingRemote = false;
  }, err=>{
    console.error('[BB7] ❌ ERROR de lectura de Firebase state:', err);
    updateConnStatus('⚠️ Error leyendo la partida (revisa las Reglas de la base de datos). Detalle en la consola (F12).', false);
  });
}

function hostRoom(){
  const code = generateCode();
  roomCode = code;
  setupRoomRefs(code);
  document.getElementById('connControls').style.display='none';
  document.getElementById('roomCodeBox').style.display='block';
  document.getElementById('roomCodeText').textContent = code;
  updateConnStatus('Sala creada. Esperando al rival...', false);
  joinPresence();
  listenForPeers();
  listenForState();
  broadcastState(); // publica el estado actual (por si ya había equipos cargados antes de crear la sala)
}

function joinRoom(){
  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  if(!code){ alert('Escribe el código de la sala.'); return; }
  roomCode = code;
  setupRoomRefs(code);
  document.getElementById('connControls').style.display='none';
  updateConnStatus('Conectando...', false);
  joinPresence();
  listenForPeers();
  listenForState(); // recibe el estado actual de la sala automáticamente; NO se envía el propio (evita sobrescribir al creador)
}

function snapshotState(){
  if(!Array.isArray(players)){ console.error('[BB7] players estaba corrompido (' + players + ') — reparado a lista vacía.'); players = []; }
  if(!ball || typeof ball!=='object'){ console.error('[BB7] ball estaba corrompido (' + ball + ') — reparado a valores por defecto.'); ball = { carrierId:null, row:null, col:null }; }
  return {
    players, ball, ballInFlight, phase, state, pendingTD, pendingDodge, pendingGfi, armorForPlayer, nextId,
    mySelected: selected, myDeclaredAction: declaredAction,
    koQueue, pendingKo, teamRace, customColorsEnabled, teamCustomColor, teamTextColor, teamColor2, teamText2, openingKickoffDone, firstHalfKickingTeam, pitchBackgroundUrl, pitchBackgroundExact, teamStaff, teamRerollsLeft, preMatch, teamVerify, kickoffPendingOOBAfterEvent,
    ballBounceActive, pendingCatch, pendingBallDrop, pendingDriveStart, pendingPassRoll,
    pendingKickPlacement, kickoffBounceStep, kickoffKickingTeam, kickoffReceivingTeam, freeCatchTeam, placingBallFree, kickoffTargetRow, kickoffTargetCol,
    blitzUsedByTeam, blitzActivePlayer, blockTargeting, activeBlock, pendingArmorQueue, pendingPush, pendingFollowUp, chainPushStack, secureBallUsedByTeam, pendingSecureBall, secureBallActivePlayer, handoffUsedByTeam, pendingHandoffChoice, pendingAnimosity, pendingHailMaryChoice, pendingProvocarChoice, luchadorUsed, luchadorPickMode, foulUsedByTeam, pendingFoulContext, passUsedByTeam,
    secureBallModalOpen: document.getElementById('secureBallModal').classList.contains('show'),
    matchEndModalOpen: document.getElementById('matchEndModal').classList.contains('show'),
    forcejearModalOpen: document.getElementById('forcejearModal').classList.contains('show'),
    infoModalOpen: document.getElementById('infoModal').classList.contains('show'),
    infoModalTitle: document.getElementById('infoModalTitle').textContent,
    infoModalText: document.getElementById('infoModalText').textContent,
    forcejearText: document.getElementById('forcejearText').textContent,
    pendingForcejearChoice,
    matchEndText: document.getElementById('matchEndText').textContent,
    pendingActionMenuPlayer,
    dejadaWheelActive,
    pendingManualStatus,
    turnoverOverlayOpen: document.getElementById('turnoverOverlay').classList.contains('show'),
    halfTimeOverlayOpen: document.getElementById('halfTimeOverlay').classList.contains('show'),
    declaredAction, pendingTraitCheck, pendingFerocityAttack,
    traitCheckModalOpen: document.getElementById('traitCheckModal').classList.contains('show'),
    traitCheckTitleText: document.getElementById('traitCheckTitle').textContent,
    traitCheckText: document.getElementById('traitCheckText').textContent,
    traitCheckDieText: document.getElementById('traitCheckDie').textContent,
    traitCheckMathText: document.getElementById('traitCheckMathText').textContent,
    traitCheckResultText: document.getElementById('traitCheckResultText').textContent,
    traitCheckResultClass: document.getElementById('traitCheckResultText').className,
    traitCheckRollBtnVisible: document.getElementById('traitCheckRollBtn').style.display,
    traitCheckContinueBtnVisible: document.getElementById('traitCheckContinueBtn').style.display,
    secureBallText: document.getElementById('secureBallText').textContent,
    secureBallDieText: document.getElementById('secureBallDie').textContent,
    teamAName: document.getElementById('teamAName').value,
    teamNameLocked,
    teamBName: document.getElementById('teamBName').value,
    kickSelectValue: document.getElementById('kickSelect').value,
    showHalfBtn: !!document.getElementById('newHalfBtn'),
    statusMsg: document.getElementById('statusLine').textContent,
    histHtml: document.getElementById('hist').innerHTML,
    blockResultHtml: document.getElementById('blockResult').innerHTML,
    genericResultHtml: document.getElementById('genericResult').innerHTML,
    dodgeModalOpen: document.getElementById('dodgeModal').classList.contains('show'),
    dodgeText: document.getElementById('dodgeText').textContent,
    dodgeDieText: document.getElementById('dodgeDie').textContent,
    dodgeRerollUsed,
    gfiModalOpen: document.getElementById('gfiModal').classList.contains('show'),
    gfiText: document.getElementById('gfiText').textContent,
    gfiDieText: document.getElementById('gfiDie').textContent,
    gfiRerollUsed,
    catchRerollUsed,
    secureBallRerollUsed,
    armorModalOpen: document.getElementById('armorModal').classList.contains('show'),
    blitzStabModalOpen: document.getElementById('blitzStabModal').classList.contains('show'),
    armorText: document.getElementById('armorText').textContent,
    armorDie1: document.getElementById('armorDie1').textContent,
    armorDie2: document.getElementById('armorDie2').textContent,
    armorSum: document.getElementById('armorSum').textContent,
    armorPassRowVisible: document.getElementById('armorPassRow').style.display==='block',
    armorNoBtnText: document.getElementById('armorNoBtn') ? document.getElementById('armorNoBtn').textContent : 'NO — sigue tumbado',
    armorRollBtnVisible: document.getElementById('armorRollBtn').style.display!=='none',
    crowdPushMode,
    injuryBlockVisible: document.getElementById('injuryBlock').style.display==='block',
    regenRowVisible: document.getElementById('regenRow').style.display==='block',
    regenDieText: document.getElementById('regenDie').textContent,
    regenResultText: document.getElementById('regenResultText').textContent,
    regenResultClass: document.getElementById('regenResultText').className,
    regenRollBtnVisible: document.getElementById('regenRollBtn').style.display!=='none',
    garrasWarningVisible: document.getElementById('garrasWarning').style.display==='block',
    cabezaDuraWarningVisible: document.getElementById('cabezaDuraWarning').style.display==='block',
    escurridizoWarningVisible: document.getElementById('escurridizoWarning').style.display==='block',
    injuryDie1: document.getElementById('injuryDie1').textContent,
    injuryDie2: document.getElementById('injuryDie2').textContent,
    injurySum: document.getElementById('injurySum').textContent,
    koModalOpen: document.getElementById('koModal').classList.contains('show'),
    koText: document.getElementById('koText').textContent,
    koDieText: document.getElementById('koDie').textContent,
    blockModalOpen: document.getElementById('blockModal').classList.contains('show'),
    blockText: document.getElementById('blockText').textContent,
    blockDiceAreaHtml: document.getElementById('blockDiceArea').innerHTML,
    currentBlockDiceIndices, blockProfesionalUsed, profesionalPickMode, blockProNote, pendingHeroicTackle,
    blockProfesionalBtnVisible: document.getElementById('blockProfesionalBtn').style.display==='block',
    blockOutcomeRowVisible: document.getElementById('blockOutcomeRow').classList.contains('active'),
    blockFreePushBtnText: document.getElementById('blockFreePushBtn').textContent,
    blockFreePushBtnActive: document.getElementById('blockFreePushBtn').classList.contains('active-toggle'),
    blockStrengthInfoText: document.getElementById('blockStrengthInfo').innerHTML,
    blockDiceRecommended: activeBlock && activeBlock.diceInfo ? activeBlock.diceInfo.diceCount : null,
    blockChooserBannerText: document.getElementById('blockChooserBanner').textContent,
    blockChooserBannerBg: document.getElementById('blockChooserBanner').style.background,
    blockChooserBannerColor: document.getElementById('blockChooserBanner').style.color,
    blockChooserBannerBorder: document.getElementById('blockChooserBanner').style.borderColor,
    blockDiceRolled,
    followUpModalOpen: document.getElementById('followUpModal').classList.contains('show'),
    followUpText: document.getElementById('followUpText').textContent,
    catchModalOpen: document.getElementById('catchModal').classList.contains('show'),
    passModalOpen: document.getElementById('passModal').classList.contains('show'),
    interceptModalOpen: document.getElementById('interceptModal').classList.contains('show'),
    interceptText: document.getElementById('interceptText').textContent,
    interceptDie: document.getElementById('interceptDie').textContent,
    interceptResultText: document.getElementById('interceptResultText').textContent,
    interceptResultClass: document.getElementById('interceptResultText').className,
    interceptChoicePanelVisible: document.getElementById('interceptChoicePanel').style.display==='block',
    pendingInterceptionChoice, pendingInterceptionRoll,
    heroicReceptionPanelVisible: document.getElementById('heroicReceptionPanel').style.display==='block',
    pendingHeroicReception,
    passText: document.getElementById('passText').textContent,
    passDie: document.getElementById('passDie').textContent,
    passResultText: document.getElementById('passResultText').textContent,
    passResultClass: document.getElementById('passResultText').className,
    passRollBtnVisible: document.getElementById('passRollBtn').style.display==='block',
    catchText: document.getElementById('catchText').textContent,
    catchDieText: document.getElementById('catchDie').textContent,
    pendingJumpUpCheck,
    jumpUpModalOpen: document.getElementById('jumpUpModal').classList.contains('show'),
    jumpUpText: document.getElementById('jumpUpText').textContent,
    jumpUpDieText: document.getElementById('jumpUpDie').textContent,
    kickPlacementText: document.getElementById('kickPlacementText').textContent,
    kickoffStepText: document.getElementById('kickoffStepText').textContent,
    kickoffDistRowVisible: document.getElementById('kickoffDistRow').style.display!=='none',
    kickoffDistance,
    kickoffEvt, teamBribe, cheerBonus, teamFreeRR, teamInc, teamUsedRes, trapChecked, regenHelperOpen,
    despisteArmed, ajusteArmed, ajusteFouler, escenaCatch, teamBonusRR, ownTurnChanged, wizardSt, armorBonusMap,
    kickoffDirDieText: document.getElementById('kickoffDirDie').textContent,
    kickoffDistDieText: document.getElementById('kickoffDistDie').textContent,
    bounceDirDieText: document.getElementById('bounceDirDie').textContent,
    freeCatchText: document.getElementById('freeCatchText').textContent
  };
}

const SAVE_KEY = 'bbsevens_autosave_v1';

let localSeq = 0;
let lastAppliedSeq = 0;

function broadcastState(){
  if(applyingRemote) return;
  try{ scheduleTrapTick(); }catch(e){}
  const snap = snapshotState();
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(snap)); }catch(e){}
  if(stateRef){
    localSeq += 1;
    snap.senderId = myPeerId;
    snap.seq = localSeq;
    let blob;
    try{ blob = JSON.stringify(snap); } // Firebase borra claves null y objetos/arrays vacíos anidados en cualquier
    // parte del árbol (p.ej. ball={carrierId:null,row:null,col:null} al inicio, o players=[] recién creada) —
    // mandar TODO como un único texto evita ese problema de raíz para siempre, sin tener que vigilar campo a campo.
    catch(e){ console.error('[BB7] No se pudo serializar el estado:', e); return; }
    console.log('[BB7] ENVIANDO seq='+localSeq+' phase='+snap.phase+' jugadores='+(Array.isArray(snap.players)?snap.players.length:'?')+' balón='+JSON.stringify(snap.ball)+' teamAName='+snap.teamAName+' teamBName='+snap.teamBName);
    stateRef.set({ blob, senderId: myPeerId, seq: localSeq })
      .then(()=> console.log('[BB7] ✅ Envío seq='+localSeq+' confirmado por Firebase'))
      .catch(err=> console.error('[BB7] ❌ ERROR al escribir en Firebase (seq='+localSeq+'):', err));
  } else {
    console.log('[BB7] (sin sala conectada, no se envía nada — stateRef es null)');
  }
}

function applyRemoteState(payload){
  if(!Array.isArray(payload.players) || !payload.ball || typeof payload.ball!=='object'){
    console.error('[BB7] ⚠️ Estado recibido corrupto (players/ball inválidos) — IGNORADO para no propagar el fallo. Payload:', payload);
    return;
  }
  applyingRemote = true;
  players = payload.players;
  remoteSelected = payload.mySelected!==undefined ? payload.mySelected : null;
  remoteDeclaredAction = payload.myDeclaredAction || null;
  ball = payload.ball;
  ballInFlight = !!payload.ballInFlight;
  phase = payload.phase;
  state = payload.state;
  pendingTD = payload.pendingTD;
  pendingDodge = payload.pendingDodge;
  pendingGfi = payload.pendingGfi;
  armorForPlayer = payload.armorForPlayer;
  koQueue = payload.koQueue || [];
  pendingKo = payload.pendingKo;
  teamRace = payload.teamRace || { A:'', B:'' };
  customColorsEnabled = !!payload.customColorsEnabled;
  teamCustomColor = payload.teamCustomColor || { A:null, B:null };
  teamTextColor = payload.teamTextColor || { A:'auto', B:'auto' };
  teamColor2 = payload.teamColor2 || { A:null, B:null };
  teamText2 = payload.teamText2 || { A:'auto', B:'auto' };
  updateColorChoiceButtons();
  openingKickoffDone = !!payload.openingKickoffDone;
  firstHalfKickingTeam = payload.firstHalfKickingTeam || null;
  document.getElementById('kickSelect').disabled = openingKickoffDone;
  setPitchBackground(payload.pitchBackgroundUrl || null, !!payload.pitchBackgroundExact);
  teamStaff = payload.teamStaff || { A:null, B:null };
  teamRerollsLeft = payload.teamRerollsLeft || { A:0, B:0 };
  preMatch = mergePreMatch(payload.preMatch);
  teamVerify = Object.assign({ A:'none', B:'none' }, payload.teamVerify || {});
  kickoffPendingOOBAfterEvent = !!payload.kickoffPendingOOBAfterEvent;
  if(payload.pitchBackgroundUrl && payload.pitchBackgroundExact){
    document.getElementById('pitchBgSelect').value = payload.pitchBackgroundUrl;
    document.getElementById('pitchBgInput').value = '';
  } else if(payload.pitchBackgroundUrl){
    document.getElementById('pitchBgInput').value = payload.pitchBackgroundUrl;
    document.getElementById('pitchBgSelect').value = '';
  } else {
    document.getElementById('pitchBgInput').value = '';
    document.getElementById('pitchBgSelect').value = '';
  }
  setSwitch('colorsSw', customColorsEnabled);
  ballBounceActive = !!payload.ballBounceActive;
  pendingCatch = payload.pendingCatch;
  updateCatchTitle();
  pendingPassRoll = payload.pendingPassRoll;
  pendingBallDrop = payload.pendingBallDrop;
  pendingDriveStart = payload.pendingDriveStart;
  pendingKickPlacement = payload.pendingKickPlacement;
  kickoffBounceStep = payload.kickoffBounceStep || 0;
  kickoffKickingTeam = payload.kickoffKickingTeam;
  kickoffTargetRow = payload.kickoffTargetRow ?? null;
  kickoffTargetCol = payload.kickoffTargetCol ?? null;
  kickoffReceivingTeam = payload.kickoffReceivingTeam;
  freeCatchTeam = payload.freeCatchTeam;
  placingBallFree = !!payload.placingBallFree;
  blitzUsedByTeam = payload.blitzUsedByTeam || { A:false, B:false };
  blitzActivePlayer = payload.blitzActivePlayer;
  blockTargeting = payload.blockTargeting;
  activeBlock = payload.activeBlock;
  pendingArmorQueue = payload.pendingArmorQueue || [];
  pendingPush = payload.pendingPush;
  pendingFollowUp = payload.pendingFollowUp;
  chainPushStack = payload.chainPushStack || [];
  secureBallUsedByTeam = payload.secureBallUsedByTeam || { A:false, B:false };
  handoffUsedByTeam = payload.handoffUsedByTeam || { A:false, B:false };
  foulUsedByTeam = payload.foulUsedByTeam || { A:false, B:false };
  passUsedByTeam = payload.passUsedByTeam || { A:false, B:false };
  pendingFoulContext = payload.pendingFoulContext || null;
  pendingHandoffChoice = payload.pendingHandoffChoice || null;
  pendingAnimosity = payload.pendingAnimosity || null;
  pendingHailMaryChoice = payload.pendingHailMaryChoice || null;
  pendingProvocarChoice = payload.pendingProvocarChoice || null;
  luchadorUsed = !!payload.luchadorUsed;
  luchadorPickMode = !!payload.luchadorPickMode;
  renderAnimosityModal(); renderHailMaryModal();
  secureBallActivePlayer = payload.secureBallActivePlayer;
  pendingSecureBall = payload.pendingSecureBall;
  document.getElementById('secureBallText').textContent = payload.secureBallText || '';
  document.getElementById('secureBallDie').textContent = payload.secureBallDieText || '–';
  document.getElementById('secureBallModal').classList.toggle('show', !!payload.secureBallModalOpen);
  secureBallRerollUsed = !!payload.secureBallRerollUsed;
  if(pendingSecureBall && pendingSecureBall.lastSuccess !== undefined){
    const sbp = players.find(x=>x.id===pendingSecureBall.playerId);
    checkActionButtons('secureBall', pendingSecureBall.lastSuccess, sbp);
  } else {
    document.getElementById('secureBallResultText').textContent = '';
    document.getElementById('secureBallResultText').className = 'check-result';
    document.getElementById('secureBallRollBtn').style.display = 'block';
    document.getElementById('secureBallActionRow').style.display = 'none';
    document.getElementById('secureBallActionRow').innerHTML = '';
  }
  document.getElementById('matchEndText').textContent = payload.matchEndText || '';
  document.getElementById('forcejearText').textContent = payload.forcejearText || '';
  document.getElementById('forcejearModal').classList.toggle('show', !!payload.forcejearModalOpen);
  document.getElementById('infoModal').classList.toggle('show', !!payload.infoModalOpen);
  document.getElementById('infoModalTitle').textContent = payload.infoModalTitle || '';
  document.getElementById('infoModalText').textContent = payload.infoModalText || '';
  pendingForcejearChoice = payload.pendingForcejearChoice || null;
  document.getElementById('matchEndModal').classList.toggle('show', !!payload.matchEndModalOpen);
  // pendingActionMenuPlayer y declaredAction son estado de interacción LOCAL de cada navegador
  // (qué jugador tienes tú cogido y qué acción elegiste en tu Ruleta) — nunca se sobrescriben con lo remoto,
  // o cada click del otro jugador te resetearía tu propia selección a mitad de jugada.
  pendingManualStatus = payload.pendingManualStatus || null;
  refreshManualStatusButtons();
  document.getElementById('turnoverOverlay').classList.toggle('show', !!payload.turnoverOverlayOpen);
  document.getElementById('halfTimeOverlay').classList.toggle('show', !!payload.halfTimeOverlayOpen);
  pendingTraitCheck = payload.pendingTraitCheck || null;
  pendingFerocityAttack = payload.pendingFerocityAttack || null;
  document.getElementById('traitCheckTitle').textContent = payload.traitCheckTitleText || 'CHEQUEO DE RASGO';
  document.getElementById('traitCheckText').textContent = payload.traitCheckText || '';
  document.getElementById('traitCheckDie').textContent = payload.traitCheckDieText || '–';
  document.getElementById('traitCheckMathText').textContent = payload.traitCheckMathText || '';
  document.getElementById('traitCheckResultText').textContent = payload.traitCheckResultText || '';
  document.getElementById('traitCheckResultText').className = payload.traitCheckResultClass || 'check-result';
  document.getElementById('traitCheckRollBtn').style.display = payload.traitCheckRollBtnVisible || 'block';
  document.getElementById('traitCheckContinueBtn').style.display = payload.traitCheckContinueBtnVisible || 'none';
  document.getElementById('traitCheckModal').classList.toggle('show', !!payload.traitCheckModalOpen);
  nextId = payload.nextId;
  document.getElementById('teamAName').value = payload.teamAName;
  document.getElementById('teamBName').value = payload.teamBName;
  teamNameLocked = payload.teamNameLocked || { A:false, B:false };
  document.getElementById('teamAName').readOnly = !!teamNameLocked.A;
  document.getElementById('teamBName').readOnly = !!teamNameLocked.B;
  document.getElementById('kickSelect').value = payload.kickSelectValue;

  if(phase==='setup'){ showSetupPanel(); } else { document.getElementById('setupPanel').style.display='none'; }
  renderPreMatch();
  const existingBtn = document.getElementById('newHalfBtn');
  if(payload.showHalfBtn && !existingBtn){ addNewHalfButton(); }
  if(!payload.showHalfBtn && existingBtn){ existingBtn.remove(); }

  if(pendingTD){
    document.getElementById('tdText').textContent = `${teamName(pendingTD.team)} anota con ${pendingTD.name}!`;
    document.getElementById('tdModal').classList.add('show');
  } else {
    document.getElementById('tdModal').classList.remove('show');
  }

  document.getElementById('dodgeText').textContent = payload.dodgeText || '';
  document.getElementById('dodgeDie').textContent = payload.dodgeDieText || '–';
  document.getElementById('dodgeModal').classList.toggle('show', !!payload.dodgeModalOpen);
  dodgeRerollUsed = !!payload.dodgeRerollUsed;
  if(pendingDodge && pendingDodge.lastSuccess !== undefined){
    const dp = players.find(x=>x.id===pendingDodge.playerId);
    checkActionButtons('dodge', pendingDodge.lastSuccess, dp);
  } else {
    document.getElementById('dodgeResultText').textContent = '';
    document.getElementById('dodgeResultText').className = 'check-result';
    document.getElementById('dodgeRollBtn').style.display = 'block';
    document.getElementById('dodgeActionRow').style.display = 'none';
    document.getElementById('dodgeActionRow').innerHTML = '';
  }
  refreshDodgeBreakTackle();

  document.getElementById('gfiText').textContent = payload.gfiText || '';
  document.getElementById('gfiDie').textContent = payload.gfiDieText || '–';
  document.getElementById('gfiModal').classList.toggle('show', !!payload.gfiModalOpen);
  gfiRerollUsed = !!payload.gfiRerollUsed;
  if(pendingGfi && pendingGfi.lastSuccess !== undefined){
    const gp = players.find(x=>x.id===pendingGfi.playerId);
    checkActionButtons('gfi', pendingGfi.lastSuccess, gp);
  } else {
    document.getElementById('gfiResultText').textContent = '';
    document.getElementById('gfiResultText').className = 'check-result';
    document.getElementById('gfiRollBtn').style.display = 'block';
    document.getElementById('gfiActionRow').style.display = 'none';
    document.getElementById('gfiActionRow').innerHTML = '';
  }

  document.getElementById('armorText').textContent = payload.armorText || '';
  document.getElementById('armorDie1').textContent = payload.armorDie1 || '–';
  document.getElementById('armorDie2').textContent = payload.armorDie2 || '–';
  document.getElementById('armorSum').textContent = payload.armorSum || 'Suma: –';
  document.getElementById('armorPassRow').style.display = payload.armorPassRowVisible ? 'block' : 'none';
  { const armorNoBtnSync = document.getElementById('armorNoBtn'); if(armorNoBtnSync) armorNoBtnSync.textContent = payload.armorNoBtnText || 'NO — sigue tumbado'; }
  document.getElementById('armorRollBtn').style.display = (payload.armorRollBtnVisible===false) ? 'none' : 'block';
  crowdPushMode = !!payload.crowdPushMode;
  document.getElementById('injuryBlock').style.display = payload.injuryBlockVisible ? 'block' : 'none';
  document.getElementById('regenRow').style.display = payload.regenRowVisible ? 'block' : 'none';
  document.getElementById('regenDie').textContent = payload.regenDieText || '–';
  document.getElementById('regenResultText').textContent = payload.regenResultText || '';
  document.getElementById('regenResultText').className = payload.regenResultClass || 'check-result';
  document.getElementById('regenRollBtn').style.display = (payload.regenRollBtnVisible===false) ? 'none' : 'block';
  document.getElementById('garrasWarning').style.display = payload.garrasWarningVisible ? 'block' : 'none';
  document.getElementById('cabezaDuraWarning').style.display = payload.cabezaDuraWarningVisible ? 'block' : 'none';
  document.getElementById('escurridizoWarning').style.display = payload.escurridizoWarningVisible ? 'block' : 'none';
  document.getElementById('injuryDie1').textContent = payload.injuryDie1 || '–';
  document.getElementById('injuryDie2').textContent = payload.injuryDie2 || '–';
  document.getElementById('injurySum').textContent = payload.injurySum || 'Suma: –';
  document.getElementById('armorModal').classList.toggle('show', !!payload.armorModalOpen);
  document.getElementById('blitzStabModal').classList.toggle('show', !!payload.blitzStabModalOpen);

  document.getElementById('koText').textContent = payload.koText || '';
  document.getElementById('koDie').textContent = payload.koDieText || '–';
  document.getElementById('koModal').classList.toggle('show', !!payload.koModalOpen);
  document.getElementById('pushControlPanel').style.display = payload.pendingPush ? 'block' : 'none';
  if(payload.pendingPush){
    const pd = players.find(x=>x.id===payload.pendingPush.defenderId);
    document.getElementById('pushControlText').textContent = 'Elegid casilla de destino para ' + (pd?pd.name:'el jugador') + ', o si sale de banda:';
  }

  document.getElementById('blockText').textContent = payload.blockText || '';
  currentBlockDiceIndices = payload.currentBlockDiceIndices || [];
  blockProfesionalUsed = !!payload.blockProfesionalUsed;
  profesionalPickMode = !!payload.profesionalPickMode;
  blockProNote = payload.blockProNote || '';
  pendingHeroicTackle = payload.pendingHeroicTackle || null;
  renderBlockDice(currentBlockDiceIndices);
  document.getElementById('blockProfesionalBtn').style.display = payload.blockProfesionalBtnVisible ? 'block' : 'none';
  document.getElementById('blockOutcomeRow').classList.toggle('active', !!payload.blockOutcomeRowVisible);
  document.getElementById('blockFreePushBtn').textContent = payload.blockFreePushBtnText || '🔓 Activar todos los empujes (para este placaje)';
  document.getElementById('blockFreePushBtn').classList.toggle('active-toggle', !!payload.blockFreePushBtnActive);
  document.getElementById('blockStrengthInfo').innerHTML = payload.blockStrengthInfoText || '';
  const chooserBannerEl = document.getElementById('blockChooserBanner');
  chooserBannerEl.textContent = payload.blockChooserBannerText || 'ELIGE: —';
  chooserBannerEl.style.background = payload.blockChooserBannerBg || '';
  chooserBannerEl.style.color = payload.blockChooserBannerColor || '';
  chooserBannerEl.style.borderColor = payload.blockChooserBannerBorder || '';
  [1,2,3].forEach(n=>{
    document.getElementById('blockDiceBtn'+n).classList.toggle('active-toggle', n===payload.blockDiceRecommended);
  });
  blockDiceRolled = !!payload.blockDiceRolled;
  refreshBlockSkillUi();
  renderProvocarModal(); renderHeroicTackleModal();
  document.getElementById('blockDiceHint').style.display = blockDiceRolled ? 'block' : 'none';
  document.getElementById('blockModal').classList.toggle('show', !!payload.blockModalOpen);

  document.getElementById('followUpText').textContent = payload.followUpText || '';
  document.getElementById('followUpModal').classList.toggle('show', !!payload.followUpModalOpen);

  document.getElementById('catchText').textContent = payload.catchText || '';
  document.getElementById('passModal').classList.toggle('show', !!payload.passModalOpen);
  document.getElementById('interceptModal').classList.toggle('show', !!payload.interceptModalOpen);
  document.getElementById('interceptText').textContent = payload.interceptText || '';
  document.getElementById('interceptDie').textContent = payload.interceptDie || '–';
  document.getElementById('interceptResultText').textContent = payload.interceptResultText || '';
  document.getElementById('interceptResultText').className = payload.interceptResultClass || 'check-result';
  document.getElementById('interceptChoicePanel').style.display = payload.interceptChoicePanelVisible ? 'block' : 'none';
  pendingInterceptionChoice = payload.pendingInterceptionChoice || null;
  pendingInterceptionRoll = payload.pendingInterceptionRoll || null;
  document.getElementById('heroicReceptionPanel').style.display = payload.heroicReceptionPanelVisible ? 'block' : 'none';
  pendingHeroicReception = payload.pendingHeroicReception || null;
  document.getElementById('passText').textContent = payload.passText || '';
  document.getElementById('passDie').textContent = payload.passDie || '–';
  document.getElementById('passResultText').textContent = payload.passResultText || '';
  document.getElementById('passResultText').className = payload.passResultClass || 'check-result';
  document.getElementById('passRollBtn').style.display = payload.passRollBtnVisible ? 'block' : 'none';
  document.getElementById('passActionRow').style.display = 'none';
  document.getElementById('passActionRow').innerHTML = '';
  document.getElementById('catchDie').textContent = payload.catchDieText || '–';
  catchRerollUsed = !!payload.catchRerollUsed;
  if(pendingCatch && pendingCatch.lastSuccess !== undefined){
    const cp = players.find(x=>x.id===pendingCatch.playerId);
    checkActionButtons('catch', pendingCatch.lastSuccess, cp);
  } else {
    document.getElementById('catchResultText').textContent = '';
    document.getElementById('catchResultText').className = 'check-result';
    document.getElementById('catchRollBtn').style.display = 'block';
    document.getElementById('catchActionRow').style.display = 'none';
    document.getElementById('catchActionRow').innerHTML = '';
  }
  pendingJumpUpCheck = payload.pendingJumpUpCheck;
  document.getElementById('jumpUpText').textContent = payload.jumpUpText || '';
  document.getElementById('jumpUpDie').textContent = payload.jumpUpDieText || '–';
  document.getElementById('jumpUpModal').classList.toggle('show', !!payload.jumpUpModalOpen);
  document.getElementById('catchModal').classList.toggle('show', !!payload.catchModalOpen);

  document.getElementById('ballBouncePanel').style.display = payload.ballBounceActive ? 'block' : 'none';
  document.getElementById('bounceDirDie').textContent = payload.bounceDirDieText || '–';

  document.getElementById('kickPlacementPanel').style.display = payload.pendingKickPlacement ? 'block' : 'none';
  document.getElementById('kickPlacementText').textContent = payload.kickPlacementText || '';

  document.getElementById('kickoffPanel').style.display = payload.kickoffBounceStep ? 'block' : 'none';
  document.getElementById('kickoffStepText').textContent = payload.kickoffStepText || '';
  kickoffEvt = payload.kickoffEvt || null;
  if(kickoffEvt){ kickoffEvt.moved = kickoffEvt.moved || []; kickoffEvt.activated = kickoffEvt.activated || []; if(kickoffEvt.sel===undefined) kickoffEvt.sel = -1; }
  teamBribe = Object.assign({A:'none',B:'none'}, payload.teamBribe || {});
  cheerBonus = Object.assign({A:'none',B:'none'}, payload.cheerBonus || {});
  teamFreeRR = Object.assign({A:-1,B:-1}, payload.teamFreeRR || {});
  teamInc = Object.assign({A:{},B:{}}, payload.teamInc || {});
  trapChecked = payload.trapChecked || {};
  despisteArmed = Object.assign({A:false,B:false}, payload.despisteArmed || {});
  ajusteArmed = Object.assign({A:false,B:false}, payload.ajusteArmed || {});
  ajusteFouler = (payload.ajusteFouler===undefined ? null : payload.ajusteFouler);
  escenaCatch = Object.assign({A:false,B:false}, payload.escenaCatch || {});
  teamBonusRR = Object.assign({A:0,B:0}, payload.teamBonusRR || {});
  ownTurnChanged = Object.assign({A:false,B:false}, payload.ownTurnChanged || {});
  wizardSt = payload.wizardSt || null;
  armorBonusMap = payload.armorBonusMap || {};
  try{ renderWizard(); }catch(e){}
  regenHelperOpen = !!payload.regenHelperOpen;
  try{ renderRegenHelper(); }catch(e){}
  teamUsedRes = Object.assign({A:{},B:{}}, payload.teamUsedRes || {});
  renderKickoffEvent();
  document.getElementById('kickoffDistRow').style.display = payload.kickoffDistRowVisible ? 'flex' : 'none';
  kickoffDistance = payload.kickoffDistance || 1;
  document.getElementById('kickoffDirDie').textContent = payload.kickoffDirDieText || '–';
  document.getElementById('kickoffDistDie').textContent = payload.kickoffDistDieText || '–';

  document.getElementById('freeCatchPanel').style.display = payload.freeCatchTeam ? 'block' : 'none';
  document.getElementById('freeCatchText').textContent = payload.freeCatchText || '';

  renderRosters(); renderPitch(); renderScoreboard(); renderSelInfo(); updateKickSelectLabels();
  renderActionMenu();
  if(payload.statusMsg) updateStatus(payload.statusMsg);
  if(payload.histHtml!==undefined) document.getElementById('hist').innerHTML = payload.histHtml;
  if(payload.blockResultHtml!==undefined) document.getElementById('blockResult').innerHTML = payload.blockResultHtml;
  if(payload.genericResultHtml!==undefined) document.getElementById('genericResult').innerHTML = payload.genericResultHtml;
  applyingRemote = false;
}

// ---------- Basic helpers ----------
function teamName(t){ return t==='A' ? document.getElementById('teamAName').value : document.getElementById('teamBName').value; }
function playerTooltipText(p, extra){
  const skillsText = (p.skills && p.skills.length) ? p.skills.join(', ') : 'Sin habilidades';
  let txt = `${p.name} #${p.num} — ${p.position || 'Sin posición'}\nMA ${p.ma} · ST ${p.st ?? '-'} · AG ${p.ag ?? '-'} · PA ${p.pa ?? '-'} · AV ${p.av ?? '-'}\n${skillsText}`;
  if(extra) txt += '\n' + extra;
  return txt;
}
function dieImgHtml(n, h){
  return '<img class="hd" src="icons/dado' + n + '.png" alt="' + n + '"' + (h ? ' style="height:' + h + 'px"' : '') + '>';
}
function logDiceHtml(msg){
  const esc = String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc
    .replace(/\(2D6\): ([1-6]) \+ ([1-6]) =/g, (m,a,b)=>'(2D6): ' + dieImgHtml(a) + ' + ' + dieImgHtml(b) + ' =')
    .replace(/D6\s*=\s*([1-6])(?![0-9])/g, (m,a)=>'D6 ' + dieImgHtml(a))
    .replace(/D6\(([1-6])\)/g, (m,a)=>'D6 ' + dieImgHtml(a));
}
function log(msg){
  const h = document.getElementById('hist');
  const d = document.createElement('div');
  d.innerHTML = logDiceHtml(msg);
  h.prepend(d);
}
function updateStatus(msg){ document.getElementById('statusLine').textContent = msg; }
function anyModalOpen(){
  return document.getElementById('preMatchModal').classList.contains('show') ||
         document.getElementById('leagueMismatchModal').classList.contains('show') ||
         document.getElementById('insigModal').classList.contains('show') ||
         document.getElementById('kickoffEventModal').classList.contains('show') ||
         document.getElementById('tdModal').classList.contains('show') ||
         document.getElementById('dodgeModal').classList.contains('show') ||
         document.getElementById('gfiModal').classList.contains('show') ||
         document.getElementById('armorModal').classList.contains('show') ||
         document.getElementById('koModal').classList.contains('show') ||
         document.getElementById('blockModal').classList.contains('show') ||
         document.getElementById('followUpModal').classList.contains('show') ||
         document.getElementById('catchModal').classList.contains('show') ||
         document.getElementById('resumeModal').classList.contains('show') ||
         document.getElementById('losWarningModal').classList.contains('show') ||
         document.getElementById('jumpUpModal').classList.contains('show') ||
         document.getElementById('secureBallModal').classList.contains('show') ||
         document.getElementById('matchEndModal').classList.contains('show') ||
         document.getElementById('forcejearModal').classList.contains('show') ||
         document.getElementById('veteranoBlockModal').classList.contains('show') ||
         document.getElementById('infoModal').classList.contains('show') ||
         document.getElementById('wizardModal').classList.contains('show') ||
         document.getElementById('passModal').classList.contains('show') ||
         document.getElementById('interceptModal').classList.contains('show') ||
         document.getElementById('heroicReceptionPanel').style.display==='block' ||
         pendingActionMenuPlayer !== null ||
         pendingAnimosity !== null || pendingHailMaryChoice !== null || pendingProvocarChoice !== null || pendingHeroicTackle !== null ||
         document.getElementById('traitCheckModal').classList.contains('show') ||
         document.getElementById('turnoverOverlay').classList.contains('show');
}

// ---------- Roster management ----------
function openAddPlayer(team){
  const num = prompt('Número de dorsal:');
  if(num === null) return;
  const name = prompt('Nombre (opcional):') || ('Jugador ' + num);
  const ma = parseFloat(prompt('Movimiento (MA):', '6')) || 6;
  players.push({ id: nextId++, team, num, name, ma, remainingMove: ma, gfiUsed:0, condition:'standing', blockedThisActivation:false, freePushOverride:false, dodgeSkillUsedThisTurn:false, catchSkillUsedThisTurn:false, justStoodThisActivation:false, row:null, col:null, activated:false, onPitch:false });
  renderRosters();
  broadcastState();
}

function quickFill(team){
  for(let i=1;i<=7;i++){
    players.push({ id: nextId++, team, num:i, name:'Jugador '+i, ma:6, st:3, ag:'3+', pa:'4+', av:'9+', remainingMove:6, gfiUsed:0, condition:'standing', blockedThisActivation:false, freePushOverride:false, dodgeSkillUsedThisTurn:false, catchSkillUsedThisTurn:false, justStoodThisActivation:false, row:null, col:null, activated:false, onPitch:false });
  }
  renderRosters();
  broadcastState();
}

function importTeamFile(team, inputEl){
  const file = inputEl.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    let data;
    try{ data = JSON.parse(e.target.result); }
    catch(err){ alert('El archivo no es un JSON válido.'); return; }
    const sel = document.getElementById('rosterSel' + team); if(sel) sel.value = '';
    importTeamData(team, data);
  };
  reader.readAsText(file);
  inputEl.value = '';
}
function importTeamData(team, data){
  if(!data || !data.players || !Array.isArray(data.players)){ alert('El JSON debe tener un array "players".'); return; }
  // Equipos sin sección de liga (amistosos, rosters.html): se cargan sin comprobar nada.
  if(!data.league || typeof data.league!=='object'){ applyImportedTeamGuarded(team, data, 'none'); return; }
  updateStatus('Verificando el roster con la liga…');
  verifyTeamAgainstLeague(data).then(res=>{
    if(res.status==='ok') applyImportedTeamGuarded(team, data, 'ok', res);
    else if(res.status==='error') applyImportedTeamGuarded(team, data, 'unverified', res);
    else showLeagueMismatchModal(team, data, res);
  });
}
// ---- Equipos definidos (rosters/index.json) ----
function loadRosterIndex(){
  fetch('rosters/index.json').then(res=>{ if(!res.ok) throw new Error('HTTP ' + res.status); return res.json(); }).then(raw=>{
    let list = Array.isArray(raw) ? raw : (raw && (raw.rosters || raw.teams || raw.files)) || [];
    if(!Array.isArray(list)) list = [];
    const items = [];
    list.forEach(e=>{
      let value = typeof e==='string' ? e : (e && (e.value || e.path || e.file || e.url));
      if(!value) return;
      if(!/^(https?:|\/|rosters\/)/.test(value)) value = 'rosters/' + value;
      const base = value.split('/').pop().replace(/\.json$/i,'').replace(/[_-]+/g,' ');
      const label = (e && typeof e==='object' && (e.label || e.name || e.team)) || base;
      items.push({ value, label });
    });
    ['A','B'].forEach(t=>{
      const sel = document.getElementById('rosterSel' + t); if(!sel) return;
      items.forEach(it=>{ const o = document.createElement('option'); o.value = it.value; o.textContent = it.label; sel.appendChild(o); });
    });
  }).catch(err=>{ console.warn('[BB7] rosters/index.json no disponible:', err.message); });
}
function selectRoster(team, path){
  if(!path) return;
  fetch(path).then(res=>{ if(!res.ok) throw new Error('HTTP ' + res.status); return res.json(); }).then(data=>importTeamData(team, data)).catch(err=>{
    alert('No se pudo cargar el equipo "' + path + '": ' + err.message);
    const sel = document.getElementById('rosterSel' + team); if(sel) sel.value = '';
  });
}

// INSIGNIFICANTE: en la hoja de equipo no puede haber más jugadores con el rasgo que sin él.
function hasInsignificante(skills){
  return (skills || []).some(sk=>{ const t = normalizeSkillText(String(sk)); return t.includes('insignific') || t.includes('insifnific'); });
}
function insignificanteViolation(data){
  const list = Array.isArray(data.players) ? data.players : [];
  const withT = list.filter(pd=>hasInsignificante(pd.skills)).length;
  const without = list.length - withT;
  return withT > without ? { withT, without } : null;
}
let pendingInsignificante = null; // { team, data, verifyState, res, v }
function applyImportedTeamGuarded(team, data, verifyState, res){
  const v = insignificanteViolation(data);
  if(!v){ applyImportedTeam(team, data, verifyState, res); return; }
  pendingInsignificante = { team, data, verifyState, res, v };
  document.getElementById('insigText').textContent = 'El equipo "' + (data.teamName || 'sin nombre') + '" tiene ' + v.withT + ' jugador(es) con INSIGNIFICANTE y solo ' + v.without + ' sin él. En la hoja de equipo no puede haber más jugadores con este rasgo que sin él.';
  document.getElementById('insigModal').classList.add('show');
  updateStatus('Roster con demasiados Insignificantes: decidid si lo cargáis igualmente.');
}
function insignificanteCancel(){
  const c = pendingInsignificante; pendingInsignificante = null;
  document.getElementById('insigModal').classList.remove('show');
  if(c) log('❌ Carga cancelada: "' + (c.data.teamName || 'equipo') + '" tiene más jugadores Insignificantes que sin el rasgo.');
  updateStatus('Carga de equipo cancelada.');
  broadcastState();
}
function insignificanteProceed(){
  const c = pendingInsignificante; pendingInsignificante = null;
  document.getElementById('insigModal').classList.remove('show');
  if(!c) return;
  applyImportedTeam(c.team, c.data, c.verifyState, c.res);
  log('⚠️ ' + teamName(c.team) + ' se ha cargado con más jugadores Insignificantes (' + c.v.withT + ') que sin el rasgo (' + c.v.without + '), aceptado por ambos jugadores.');
  broadcastState();
}

function applyImportedTeam(team, data, verifyState, res){
  if(data.teamName){
    const nameInput = document.getElementById(team==='A' ? 'teamAName':'teamBName');
    nameInput.value = data.teamName;
    nameInput.readOnly = true;
    nameInput.title = 'Nombre bloqueado — viene del JSON del equipo. Usad "Borrar Equipo" para poder cambiarlo.';
    teamNameLocked[team] = true;
  }
  teamRace[team] = data.race || '';
  if(data.color){
    teamCustomColor[team] = data.color;
    if(!customColorsEnabled){ setCustomColors(true); }
  }
  if(data.textColor){
    teamTextColor[team] = data.textColor;
  }
  teamColor2[team] = data.color_secundary || null;
  teamText2[team] = data.textColor_secundary || 'auto';
  updateColorChoiceButtons();
  if(data.staff){
    teamStaff[team] = data.staff;
    teamRerollsLeft[team] = (data.staff.rerolls && typeof data.staff.rerolls.count === 'number') ? data.staff.rerolls.count : 0;
  }
  // Staff de liga (JSON gestionado desde el gestor): hinchas dedicados, animadoras, etc. Vive en league.staff, no en staff.
  if(data.league && data.league.staff && typeof data.league.staff==='object'){
    teamStaff[team] = Object.assign({}, teamStaff[team] || {}, { leagueStaff: data.league.staff });
  }
  if(data.league && typeof data.league==='object'){
    const ec = econFromTeamJson(data);
    if(Object.keys(ec).length){ teamStaff[team] = Object.assign({}, teamStaff[team] || {}, { leagueEcon: ec }); }
  }
  teamFormation[team] = Array.isArray(data.formation) ? data.formation : [];
  data.players.forEach(pd=>{
    const ma = pd.ma || 6;
    players.push({
      id: nextId++, team,
      num: pd.num ?? '?',
      name: pd.name || ('Jugador ' + (pd.num ?? '')),
      ma, remainingMove: ma, gfiUsed:0, condition:'standing', blockedThisActivation:false, freePushOverride:false, dodgeSkillUsedThisTurn:false, catchSkillUsedThisTurn:false, justStoodThisActivation:false,
      st: pd.st, ag: pd.ag, pa: pd.pa, av: pd.av,
      position: pd.position || null,
      skills: pd.skills || [],
      row:null, col:null, activated:false, onPitch:false
    });
  });
  renderRosters(); renderScoreboard(); renderPitch(); updateKickSelectLabels();
  log('📁 Equipo cargado para ' + teamName(team) + ': ' + data.players.length + ' jugadores.');
  updateStatus('Equipo importado.');
  teamVerify[team] = verifyState || 'none';
  if(verifyState==='ok'){
    log('✅ Equipo ' + teamName(team) + ' verificado con LIGA T' + ((data.league && data.league.season) || '6') + '.');
  } else if(verifyState==='diff'){
    const list = (res && res.diffs) ? res.diffs.slice(0,12).join(' | ') : (res && res.status==='notfound' ? 'equipo no encontrado en la liga' : '');
    log('🚨 ATENCIÓN: ' + teamName(team) + ' se ha cargado con un roster que NO coincide con la liga (acordado entre los jugadores). ' + list);
  } else if(verifyState==='unverified'){
    log('⚠️ No se ha podido verificar el roster de ' + teamName(team) + ' contra la liga (' + ((res && res.reason) || 'sin acceso al repositorio') + '). Se carga SIN VERIFICAR.');
    showInfoModal('⚠️ Roster sin verificar', 'No se ha podido comprobar el roster de ' + teamName(team) + ' contra la liga (' + ((res && res.reason) || 'sin acceso al repositorio') + '). Se ha cargado igualmente: ambos equipos quedáis avisados de que este roster NO está verificado.');
  }
  renderScoreboard();
  broadcastState();
}

// ---------- Verificación del roster contra el repositorio de la liga ----------
let teamVerify = { A:'none', B:'none' };  // none | ok | diff | unverified (sincronizado a ambos equipos)
let pendingLeagueMismatch = null;          // local de quien carga: { team, data, res }
const VERIFY_IGNORE_TOP_KEYS = ['color','textColor','formation']; // cosméticos/tácticos: no cuentan como trampa

function leagueRepoInfo(){
  let owner = 'sermazman', repo = 'bb-sevens';
  try{
    const h = location.hostname;
    if(h.endsWith('.github.io')){
      owner = h.split('.')[0];
      const seg = location.pathname.split('/').filter(Boolean)[0];
      repo = (seg && !/\.html?$/i.test(seg)) ? seg : h;
    }
  }catch(e){}
  return { owner, repo, branch:'main' };
}
async function fetchLeagueRepoJson(path){
  const { owner, repo, branch } = leagueRepoInfo();
  try{ // 1) API de contenidos de GitHub: sin la caché de GitHub Pages, siempre la versión más reciente
    const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + branch,
      { headers:{ 'Accept':'application/vnd.github.raw+json' }, cache:'no-store' });
    if(r.status===200) return { found:true, json: JSON.parse(await r.text()) };
    if(r.status===404) return { found:false };
  }catch(e){}
  try{ // 2) respaldo: el propio sitio (GitHub Pages)
    const r2 = await fetch(path + '?t=' + Date.now(), { cache:'no-store' });
    if(r2.status===200) return { found:true, json: await r2.json() };
    if(r2.status===404) return { found:false };
  }catch(e){}
  throw new Error('sin acceso al repositorio');
}
async function searchLeagueTeamPath(teamId){
  const { owner, repo, branch } = leagueRepoInfo();
  const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/' + branch + '?recursive=1', { cache:'no-store' });
  if(!r.ok) throw new Error('no se pudo listar el repositorio (' + r.status + ')');
  const j = await r.json();
  const esc = String(teamId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^liga/.+/equipos/' + esc + '\\.json$', 'i');
  const hit = (j.tree || []).find(t=>t.type==='blob' && re.test(t.path));
  return hit ? hit.path : null;
}
async function verifyTeamAgainstLeague(data){
  const teamId = data.league && data.league.teamId;
  if(!teamId) return { status:'error', reason:'el JSON no trae league.teamId' };
  try{
    let path = 'liga/t' + data.league.season + '/equipos/' + teamId + '.json';
    let r = await fetchLeagueRepoJson(path);
    if(!r.found){
      const found = await searchLeagueTeamPath(teamId);
      if(!found) return { status:'notfound', teamId };
      path = found;
      r = await fetchLeagueRepoJson(found);
      if(!r.found) return { status:'notfound', teamId };
    }
    const diffs = diffLeagueTeam(r.json, data);
    return diffs.length ? { status:'diff', diffs, path } : { status:'ok', path };
  }catch(e){
    return { status:'error', reason: String((e && e.message) || e) };
  }
}
// Compara oficial (repo) → subido. Devuelve líneas legibles; vacío = idéntico.
function diffLeagueTeam(official, uploaded){
  const out = [];
  const isObj = v=> v && typeof v==='object' && !Array.isArray(v);
  const nz = v=> v===undefined ? null : v;
  const lab = v=> v===null ? '(vacío)' : (typeof v==='object' ? JSON.stringify(v).slice(0,70) : String(v));
  const walk = (a, b, path, top)=>{
    if(out.length>=40) return;
    a = nz(a); b = nz(b);
    if(a===null && b===null) return;
    if(isObj(a) && isObj(b)){
      const keys = new Set(Object.keys(a).concat(Object.keys(b)));
      keys.forEach(k=>{ if(top && VERIFY_IGNORE_TOP_KEYS.includes(k)) return; walk(a[k], b[k], path ? path + '.' + k : k, false); });
      return;
    }
    if(Array.isArray(a) && Array.isArray(b)){
      const keyed = arr=> arr.length>0 && arr.every(x=>isObj(x) && x.num!==undefined);
      if(keyed(a) && keyed(b)){
        const ma = {}, mb = {};
        a.forEach(x=>{ ma[String(x.num)] = x; }); b.forEach(x=>{ mb[String(x.num)] = x; });
        new Set(Object.keys(ma).concat(Object.keys(mb))).forEach(k=>{
          const nm = (mb[k] && mb[k].name) || (ma[k] && ma[k].name) || '';
          walk(ma[k], mb[k], path + '[#' + k + (nm ? ' ' + nm : '') + ']', false);
        });
        return;
      }
      const prim = arr=> arr.every(x=> x===null || typeof x!=='object');
      if(prim(a) && prim(b)){
        const sa = a.map(String).sort().join(', '), sb = b.map(String).sort().join(', ');
        if(sa!==sb) out.push(path + ': [' + sa + '] → [' + sb + ']');
        return;
      }
      for(let i=0;i<Math.max(a.length,b.length);i++) walk(a[i], b[i], path + '[' + i + ']', false);
      return;
    }
    if(a===null || b===null || typeof a!==typeof b || String(a)!==String(b)){
      out.push(path + ': ' + lab(a) + ' → ' + lab(b));
    }
  };
  walk(official, uploaded, '', true);
  return out;
}
function showLeagueMismatchModal(team, data, res){
  pendingLeagueMismatch = { team, data, res };
  const notfound = res.status==='notfound';
  document.getElementById('leagueMismatchTitle').textContent = notfound ? '🚨 EQUIPO NO ENCONTRADO EN LA LIGA' : '🚨 EL ROSTER NO COINCIDE CON LA LIGA';
  document.getElementById('leagueMismatchText').textContent = notfound
    ? 'El equipo "' + (data.teamName || res.teamId) + '" (' + res.teamId + ') dice pertenecer a una liga pero no existe en el repositorio.'
    : 'El archivo cargado para "' + (data.teamName || 'el equipo') + '" es distinto de la versión oficial de la liga. Cada línea: campo — valor OFICIAL → valor del archivo cargado.';
  const list = document.getElementById('leagueMismatchList');
  list.innerHTML = '';
  (res.diffs || []).slice(0, 40).forEach(d=>{ const li = document.createElement('li'); li.textContent = d; list.appendChild(li); });
  list.style.display = (res.diffs && res.diffs.length) ? 'block' : 'none';
  document.getElementById('leagueMismatchModal').classList.add('show');
  updateStatus('Roster no coincide con la liga: decidid si seguís adelante.');
}
function leagueMismatchCancel(){
  const c = pendingLeagueMismatch;
  pendingLeagueMismatch = null;
  document.getElementById('leagueMismatchModal').classList.remove('show');
  if(c){ log('❌ Carga cancelada: el roster de "' + (c.data.teamName || 'equipo') + '" no coincide con la liga.'); }
  updateStatus('Carga de equipo cancelada.');
  broadcastState();
}
function leagueMismatchProceed(){
  const c = pendingLeagueMismatch;
  pendingLeagueMismatch = null;
  document.getElementById('leagueMismatchModal').classList.remove('show');
  if(c) applyImportedTeamGuarded(c.team, c.data, 'diff', c.res);
}

function clearTeam(team){
  { const rs = document.getElementById('rosterSel' + team); if(rs) rs.value = ''; }
  const count = players.filter(p=>p.team===team).length;
  if(count===0 && !teamCustomColor[team] && !teamStaff[team] && teamRace[team]==='' ){ alert('Ese equipo ya está vacío.'); return; }
  const oldName = teamName(team);
  if(!confirm(`¿Borrar los ${count} jugadores de ${oldName} y restablecer nombre/colores/raza a los valores por defecto? Esta acción no se puede deshacer.`)) return;
  players = players.filter(p=>p.team!==team);
  if(selected!==null && !players.some(p=>p.id===selected)) selected = null;
  if(ball.carrierId!==null && !players.some(p=>p.id===ball.carrierId)) ball.carrierId = null;

  const defaultName = team==='A' ? 'Equipo Rojo' : 'Equipo Azul';
  const nameInput = document.getElementById('team'+team+'Name');
  nameInput.value = defaultName;
  nameInput.readOnly = false;
  nameInput.title = '';
  teamNameLocked[team] = false;
  teamRace[team] = '';
  teamCustomColor[team] = null;
  teamTextColor[team] = 'auto';
  teamColor2[team] = null; teamText2[team] = 'auto';
  updateColorChoiceButtons();
  teamStaff[team] = null;
  teamRerollsLeft[team] = 0;
  teamVerify[team] = 'none';
  teamBribe[team] = 'none'; cheerBonus[team] = 'none';
  despisteArmed[team] = false; ajusteArmed[team] = false; escenaCatch[team] = false; teamBonusRR[team] = 0; ownTurnChanged[team] = false;
  teamInc[team] = {}; teamUsedRes[team] = {};

  log('🗑️ ' + oldName + ' borrado por completo (jugadores, nombre, colores, raza y staff restablecidos).');
  renderRosters(); renderPitch(); renderSelInfo(); renderScoreboard(); updateKickSelectLabels();
  broadcastState();
}

function showInfoModal(title, text){
  document.getElementById('infoModalTitle').textContent = title;
  document.getElementById('infoModalText').textContent = text;
  document.getElementById('infoModal').classList.add('show');
  broadcastState();
}
function closeInfoModal(){
  document.getElementById('infoModal').classList.remove('show');
  broadcastState();
}

function presetPositions(team){
  const formation = teamFormation[team];
  if(!formation || !formation.length){
    showInfoModal('Sin colocación predefinida', 'Este equipo no tiene una colocación predefinida guardada. Guárdala primero en el editor de plantillas (rosters.html) y vuelve a cargar el JSON del equipo.');
    return;
  }
  const teamPlayers = players.filter(p=>p.team===team);
  if(!teamPlayers.length){ showInfoModal('Sin jugadores', 'No hay jugadores en ' + teamName(team) + '.'); return; }
  const retiredConditions = ['ko','injured','injuredGrave','dead','expelled'];
  const placeablePlayers = teamPlayers.filter(p=>!retiredConditions.includes(p.condition) && !p.heatRest);

  // Quitar del campo a los jugadores de este equipo que ya estuvieran colocados (los de baja no se tocan)
  placeablePlayers.forEach(p=>{
    if(p.onPitch){
      p.onPitch = false; p.row = null; p.col = null; p.condition = 'standing';
      if(ball.carrierId === p.id) ball.carrierId = null;
    }
  });

  // La colocación se guarda en rosters.html en relativo a la mitad propia:
  //   col (0-10) = ancho del campo, coincide 1:1 con las ROWS (11) del tablero
  //   row (0-5)  = profundidad desde la línea de scrimmage (0) hacia la propia end zone (5)
  // Se traduce a columnas absolutas del tablero según equipo:
  //   A: LOS_A hacia atrás (columnas 1-6)   B: LOS_B hacia atrás (columnas 13-18), en espejo
  let placedCount = 0;
  const skipped = [];
  formation.forEach(entry=>{
    if(entry.row==null || entry.col==null || entry.row<0 || entry.row>5 || entry.col<0 || entry.col>10) return;
    const p = placeablePlayers.find(pl=>String(pl.num)===String(entry.num));
    if(!p){ skipped.push(entry.num); return; }
    const boardRow = entry.col;
    const boardCol = team==='A' ? (LOS_A - entry.row) : (LOS_B + entry.row);
    if(occupiedBy(boardRow, boardCol)){ skipped.push(entry.num); return; }
    p.onPitch = true; p.row = boardRow; p.col = boardCol; p.condition = 'standing';
    placedCount++;
  });

  selected = null;
  renderRosters(); renderPitch(); renderScoreboard(); renderSelInfo();
  log('📋 Colocación predefinida aplicada a ' + teamName(team) + ': ' + placedCount + ' jugador' + (placedCount===1?'':'es') + ' colocado' + (placedCount===1?'':'s') + '.' + (skipped.length ? ' (' + skipped.length + ' no se pudieron colocar: ' + skipped.join(', ') + ')' : ''));
  updateStatus('Colocación predefinida aplicada a ' + teamName(team) + '.');
  broadcastState();
}

function exportTeam(team){
  const list = players.filter(p=>p.team===team).map(p=>({
    num:p.num, name:p.name, ma:p.ma,
    st:p.st, ag:p.ag, pa:p.pa, av:p.av,
    position:p.position, skills:p.skills
  }));
  const data = { teamName: teamName(team), race: teamRace[team] || '', color: teamCustomColor[team] || null, textColor: teamTextColor[team] || 'auto', color_secundary: teamColor2[team] || null, textColor_secundary: teamText2[team] || 'auto', players: list };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (teamName(team) || 'equipo').replace(/\s+/g,'_') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  log('💾 Equipo exportado: ' + teamName(team));
}

function renderRosters(){
  if(!Array.isArray(players)){ console.error('[BB7] renderRosters: players inválido, reparado.'); players=[]; }
  ['A','B'].forEach(team=>{
    const el = document.getElementById('roster'+team);
    el.innerHTML='';
    const retired = ['ko','injured','injuredGrave','dead','expelled'];
    players.filter(p=>p.team===team && !retired.includes(p.condition)).forEach(p=>{
      const div = document.createElement('div');
      div.className = 'roster-item' + (p.onPitch ? ' on-pitch' : '') + (placing===p.id ? ' picking':'');
      const posText = p.position || 'Sin posición';
      const condTag = p.condition==='tumbado' ? `<span class="downed-tag">TUMBADO</span>`
                     : p.condition==='aturdido' ? `<span class="downed-tag">ATURDIDO</span>`
                     : p.condition==='despistado' ? `<span class="downed-tag">DESPISTADO</span>` : '';
      const heatTag = p.indigestOut ? `<span class="ri-weather" title="Indigestión: encerrado en la letrina el resto de la entrada">🤢 LETRINA</span>` : p.resaca ? `<span class="ri-weather" title="Resaca: no puede jugar la primera entrada"><span class="gold-icon" style="--icon:url('icons/calor_asfixiante.png')"></span>RESACA</span>` : p.heatRest ? `<span class="ri-weather" title="Descansa por Calor Asfixiante: no se puede colocar esta entrada"><span class="gold-icon" style="--icon:url('icons/calor_asfixiante.png')"></span>DESCANSA</span>` : '';
      const frogTag = p.frog ? '<span class="ri-weather" title="Rana hasta el final de la entrada"><span class="gold-icon" style="--icon:url(\'icons/rana.png\'); background:' + tokenColorFor(p) + '"></span>RANA</span>' : '';
      const prayLeft = (p.prayerSkills || []).slice();
      const skillsText = (p.skills && p.skills.length) ? p.skills.map(sk=>{ const k = prayLeft.indexOf(sk); if(k>=0){ prayLeft.splice(k,1); return '<u title="Ganada por Plegaria a Nuffle">' + sk + '</u>'; } return sk; }).join(', ') : 'Sin habilidades';
      const pkS = p.prayerSkills || [];
      const prayTag = (pkS.some(x=>/apu[ñn]alar|stab/i.test(String(x))) ? '<span class="ri-dagger" title="Puñal: Apuñalar hasta el final del partido"><span class="gold-icon" style="--icon:url(\'icons/daga.png\')"></span></span>' : '') +
                      (pkS.some(x=>/golpe mort|mighty|nudiller/i.test(String(x))) ? '<span class="ri-knuckles" title="Nudilleras: Golpe mortífero hasta el final del partido"></span>' : '');
      const vetTag = playerHasSkill(p, 'veterano', 'veteran') ? `<span class="ri-vet${p.veteranoUsedThisMatch ? ' used' : ''}" title="Veterano${p.veteranoUsedThisMatch ? ' (ya usado)' : ''}"><img src="icons/veterano.png" alt="Veterano" onerror="this.outerHTML='<span>⭐</span>'"></span>` : '';
      const posBorder = positionBorderColor(p);
      const numBorderStyle = posBorder ? ('border-color:'+posBorder+';') : '';
      div.innerHTML = `
        <div class="ri-row1">
          <span class="num" style="background:${tokenColorFor(p)}; color:${textColorFor(p)}; ${numBorderStyle}">${p.num}</span>
          <span class="pname">${p.name}</span>${isCaptain(p) ? '<span class="cap-mini" title="Capitán">C</span>' : ''}
          <span class="pos">${posText}</span>
          ${vetTag}${prayTag}${frogTag}${condTag}${heatTag}
          <button class="rm-btn" title="Eliminar" onclick="removePlayer(${p.id}, event)">✕</button>
        </div>
        <div class="ri-row2 mono">MA ${p.ma ?? '-'} · ST ${p.st ?? '-'} · AG ${p.ag ?? '-'} · PA ${p.pa ?? '-'} · AV ${p.avBoost ? '<span class="av-boost" title="+1 AR por Músculos de hierro">' + p.av + '</span>' : (p.av ?? '-')}</div>
        <div class="ri-row3">${skillsText}</div>`;
      div.onclick = (e)=>{
        if(e.target.classList.contains('rm-btn')) return;
        if(!p.onPitch){ placeOnPitch(p.id); }
        else if(phase==='live'){ selectPlayerLive(p.id); }
      };
      el.appendChild(div);
    });
  });
  renderReserveZone();
  renderStaffPanels();
  try{ renderAdminInc(); }catch(e){ console.error(e); }
}

function renderReserveZone(){
  ['A','B'].forEach(team=>{
    const listEl = document.getElementById('casualtyList'+team);
    const header = document.getElementById('bajasHeader'+team);
    if(header) header.style.color = tokenColorFor({ team });
    if(!listEl) return;

    const chip = (p, badgeClass, badgeChar, extraLabel) => {
      const title = playerTooltipText(p, extraLabel).replace(/"/g,'&quot;');
      const posBorder = positionBorderColor(p);
      const borderStyle = posBorder ? ('border-color:'+posBorder+';') : '';
      return `<div class="chip-wrap" title="${title}">
        <div class="token-chip" style="background:${tokenColorFor(p)}; color:${textColorFor(p)}; ${borderStyle}">${p.num}</div>
        <div class="casualty-badge ${badgeClass}">${badgeChar}</div>
      </div>`;
    };

    const groups = [
      { cond:'ko', badgeClass:'ko', badgeChar:'★', extraLabel:'INCONSCIENTE' },
      { cond:'injured', badgeClass:'light', badgeChar:'✚', extraLabel:'HERIDO (LEVE)' },
      { cond:'injuredGrave', badgeClass:'grave', badgeChar:'✚', extraLabel:'HERIDA GRAVE' },
      { cond:'dead', badgeClass:'dead', badgeChar:'✚', extraLabel:'MUERTO' },
      { cond:'expelled', badgeClass:'expelled', badgeChar:'■', extraLabel:'EXPULSADO' }
    ];

    let chipsHtml = '';
    let any = false;
    groups.forEach(g=>{
      const list = players.filter(p=>p.team===team && p.condition===g.cond);
      if(!list.length) return;
      any = true;
      chipsHtml += list.map(p=>chip(p, g.badgeClass, g.badgeChar, g.extraLabel)).join('');
    });
    const html = `<div class="bajas-group-row">${chipsHtml}</div>`;
    listEl.innerHTML = any ? html : '<span class="small-note">Ninguna</span>';
  });
}

function removePlayer(id, e){
  e.stopPropagation();
  players = players.filter(p=>p.id!==id);
  if(ball.carrierId===id){ ball.carrierId=null; }
  if(placing===id) placing=null;
  if(selected===id) selected=null;
  renderRosters(); renderPitch();
  broadcastState();
}

function sendToBench(){
  if(!selected) return;
  const p = players.find(x=>x.id===selected);
  if(!p) return;
  p.onPitch=false; p.row=null; p.col=null; p.condition='standing';
  if(ball.carrierId===p.id){ ball.carrierId=null; }
  selected=null;
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
}

function standUp(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p || p.condition!=='tumbado') return;
  const hasJumpUp = playerHasSkill(p, 'salto', 'jump up');
  p.condition = 'standing';
  p.justStoodThisActivation = true;
  if(hasJumpUp){
    log('🤸 ' + p.name + ' se levanta gratis (En pie de un salto).');
  } else {
    const before = p.remainingMove ?? p.ma;
    p.remainingMove = Math.max(0, before - 3);
    log('🧍 ' + p.name + ' se levanta (gasta 3 MA — le quedan ' + p.remainingMove + ').');
  }
  renderPitch(); renderRosters(); renderSelInfo();
  broadcastState();
}

let pendingJumpUpCheck = null;

function jumpUpBlitzCheck(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p || p.condition!=='tumbado' || !playerHasSkill(p, 'salto', 'jump up')) return;
  const hasTarget = players.some(p2 => p2.onPitch && p2.team!==p.team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-p.row), Math.abs(p2.col-p.col))===1);
  if(!hasTarget){ alert('No hay rivales en pie adyacentes.'); return; }
  const target = parseAgTarget(p.ag) + 1;
  pendingJumpUpCheck = p.id;
  document.getElementById('jumpUpText').textContent = `${p.name} intenta levantarse de un salto y placar — necesita ${target}+ (AG${p.ag ?? '?'} +1). Tirad D6.`;
  document.getElementById('jumpUpDie').textContent = '–';
  document.getElementById('jumpUpModal').classList.add('show');
  broadcastState();
}

function rollJumpUpDie(){
  const r = Math.floor(Math.random()*6)+1;
  document.getElementById('jumpUpDie').textContent = r;
  log('🎲 En pie de un salto: tirada ' + r);
  broadcastState();
}

function resolveJumpUp(success){
  const p = players.find(x=>x.id===pendingJumpUpCheck);
  document.getElementById('jumpUpModal').classList.remove('show');
  pendingJumpUpCheck = null;
  if(!p){ broadcastState(); return; }
  if(success){
    p.condition = 'standing';
    log('🤸 ' + p.name + ' se levanta de un salto y encara el placaje.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    selected = p.id;
    startBlockTargeting();
  } else {
    p.activated = true;
    selected = null;
    log('💥 ' + p.name + ' falla el chequeo — se queda Tumbado y termina su activación.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
  }
}

const MANUAL_STATUS_LABELS = {
  standing: 'EN PIE (sin activar)',
  tumbado: 'TUMBADO',
  aturdido: 'ATURDIDO',
  despistado: 'DISTRAÍDO',
  ko: 'INCONSCIENTE',
  injured: 'HERIDO LEVE',
  injuredGrave: 'HERIDA GRAVE',
  dead: 'MUERTO'
};
const MANUAL_STATUS_BTN_IDS = {
  standing: 'manualStandBtn', tumbado: 'manualDownBtn', aturdido: 'manualStunBtn', despistado: 'manualConfuseBtn',
  ko: 'manualKoBtn', injured: 'manualHlBtn', injuredGrave: 'manualHgBtn', dead: 'manualDeadBtn'
};

function refreshManualStatusButtons(){
  Object.keys(MANUAL_STATUS_BTN_IDS).forEach(k=>{
    const btn = document.getElementById(MANUAL_STATUS_BTN_IDS[k]);
    if(btn) btn.classList.toggle('active-toggle', pendingManualStatus===k);
  });
}

function startManualStatus(status){
  if(pendingManualStatus===status){
    pendingManualStatus = null;
    updateStatus('Cancelado.');
  } else {
    pendingManualStatus = status;
    updateStatus('Click en el jugador del campo para marcarlo como ' + MANUAL_STATUS_LABELS[status] + '.');
  }
  refreshManualStatusButtons();
  broadcastState();
}

function applyManualStatus(playerId){
  const status = pendingManualStatus;
  pendingManualStatus = null;
  refreshManualStatusButtons();
  const p = players.find(x=>x.id===playerId);
  if(!p){ broadcastState(); return; }

  p.rooted = false;
  if(status==='standing'){
    p.condition = 'standing';
    p.activated = false;
    log('🧍 ' + p.name + ' marcado manualmente como EN PIE (sin activar).');
  } else if(status==='tumbado'){
    p.condition = 'tumbado';
    log('🔻 ' + p.name + ' marcado manualmente como TUMBADO.');
  } else if(status==='aturdido'){
    p.condition = 'aturdido';
    log('🤕 ' + p.name + ' marcado manualmente como ATURDIDO.');
  } else if(status==='despistado'){
    p.condition = 'despistado';
    log('😵‍💫 ' + p.name + ' marcado manualmente como DISTRAÍDO.');
  } else if(status==='ko'){
    p.condition = 'ko'; p.onPitch = false; p.row = null; p.col = null;
    if(ball.carrierId===p.id) ball.carrierId = null;
    log('😵 ' + p.name + ' marcado manualmente como INCONSCIENTE — al banquillo de bajas.');
  } else if(status==='injured'){
    p.condition = 'injured'; p.onPitch = false; p.row = null; p.col = null;
    if(ball.carrierId===p.id) ball.carrierId = null;
    log('🚑 ' + p.name + ' marcado manualmente como HERIDO LEVE — al banquillo de bajas.');
  } else if(status==='injuredGrave'){
    p.condition = 'injuredGrave'; p.onPitch = false; p.row = null; p.col = null;
    if(ball.carrierId===p.id) ball.carrierId = null;
    log('🚑 ' + p.name + ' marcado manualmente como HERIDA GRAVE — al banquillo de bajas.');
  } else if(status==='dead'){
    p.condition = 'dead'; p.onPitch = false; p.row = null; p.col = null;
    if(ball.carrierId===p.id) ball.carrierId = null;
    log('☠️ ' + p.name + ' marcado manualmente como MUERTO — al banquillo de bajas.');
  }
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
}

function knockDown(){
  if(selected===null){ alert('Selecciona primero un jugador en el campo.'); return; }
  const p = players.find(x=>x.id===selected);
  if(!p || !p.onPitch){ alert('El jugador debe estar en el campo.'); return; }
  if(p.condition!=='standing'){ alert('Ese jugador ya está en el suelo.'); return; }
  p.condition = 'tumbado'; p.rooted = false;
  p.activated = true;
  selected = null;
  renderRosters(); renderPitch(); renderSelInfo();
  log('👊 ' + p.name + ' es derribado manualmente.');
  queueBallDropIfCarrier(p.id, p.row, p.col);
  broadcastState();
  openArmorModal(p);
}

function toggleDespistado(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p || !p.onPitch) return;
  if(p.condition==='despistado'){
    p.condition = 'standing';
    log('✅ ' + p.name + ' deja de estar Despistado.');
  } else if(p.condition==='standing'){
    p.condition = 'despistado';
    log('😵‍💫 ' + p.name + ' marcado como DESPISTADO (manual).');
  } else {
    return;
  }
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
}

function toggleFreePush(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p) return;
  p.freePushOverride = !p.freePushOverride;
  log(p.freePushOverride
    ? '🔓 ' + p.name + ': empuje libre activado (8 casillas, por habilidad no automatizada).'
    : '🔒 ' + p.name + ': empuje libre desactivado, vuelve a las 3 casillas por dirección.');
  renderSelInfo();
  broadcastState();
}

// ---------- Secuencia previa al partido (hinchas, clima, sustitutos, incentivos, sorteo de patada) ----------
// Nota Firebase: este objeto no usa null ni objetos/arrays vacíos (se perderían al sincronizar).
const WEATHER_TABLE = {
  calor:    { name:'CALOR ASFIXIANTE', icon:'calor_asfixiante.png', desc:'Al final de cada entrada se lanza 1D3 por equipo: ese número de jugadores que hayan acabado dentro del campo pasan a Reservas y no pueden colocarse en la siguiente entrada.' },
  soleado:  { name:'MUY SOLEADO', icon:'muy_soleado.png', desc:'-1 a todos los chequeos de Pase.' },
  perfecto: { name:'CLIMA PERFECTO', icon:'clima_perfecto.png', desc:'Sin efectos. Todo sigue igual.' },
  lluvia:   { name:'LLUVIOSO', icon:'lluvioso.png', desc:'-1 a recoger el balón del suelo, atrapar e interceptar.' },
  ventisca: { name:'VENTISCA', icon:'ventisca.png', desc:'-1 a "a por ellos". Solo se pueden hacer Pases Rápidos o Cortos (la Entrega de Balón sigue permitida).' }
};
function weatherKindFromSum(sum){
  if(sum<=2) return 'calor';
  if(sum===3) return 'soleado';
  if(sum>=12) return 'ventisca';
  if(sum===11) return 'lluvia';
  return 'perfecto';
}
function defaultPreMatch(){
  return { step:'idle', open:false,
    fanDie:{A:0,B:0}, fanFactor:{A:0,B:0}, fanTotal:{A:0,B:0}, fanFound:{A:false,B:false}, fanRolled:false,
    wDie:{a:0,b:0}, weather:'',
    subs:{A:0,B:0},
    coinDie:{A:0,B:0}, coinWinner:'', inc:{} };
}
function mergePreMatch(src){
  const d = defaultPreMatch();
  if(!src || typeof src!=='object') return d;
  Object.keys(d).forEach(k=>{
    if(src[k]===undefined) return;
    if(d[k] && typeof d[k]==='object') d[k] = Object.assign({}, d[k], src[k]);
    else d[k] = src[k];
  });
  return d;
}
function weatherKind(){ return (preMatch && preMatch.weather) || ''; }
function rollDieN(n){ return Math.floor(Math.random()*n)+1; }

function getFanFactor(team){
  // Lee el Factor de hinchas del staff del equipo (JSON): "dedicatedFans" (prioritario) o cualquier clave con "fan"/"hincha".
  // Acepta número, texto numérico ("1") u objeto con count/value/factor/total/amount. Si no hay dato, 0.
  const st = teamStaff[team];
  if(!st || typeof st!=='object') return { value:0, found:false, keys:[] };
  const toNum = (v)=>{
    if(typeof v==='number' && isFinite(v)) return v;
    if(typeof v==='string' && v.trim()!=='' && isFinite(Number(v.trim()))) return Number(v.trim());
    if(v && typeof v==='object'){
      for(const k of ['count','value','factor','total','amount','dedicatedFans']){ const n = toNum(v[k]); if(n!==null) return n; }
    }
    return null;
  };
  if(st.leagueStaff && typeof st.leagueStaff==='object'){
    const n = toNum(st.leagueStaff.dedicatedFans);
    if(n!==null) return { value:n, found:true, keys:['league.staff.dedicatedFans'] };
  }
  const entries = Object.entries(st);
  const ordered = entries.filter(([k])=>/dedicated/i.test(k)).concat(entries.filter(([k])=>!/dedicated/i.test(k)));
  for(const [k,v] of ordered){
    if(/fan|hincha/i.test(k)){
      // Formato del gestor sin sección league: staff.fans = { count: comprados, free: gratis } → total = comprados + gratis.
      if(v && typeof v==='object' && toNum(v.free)!==null){
        return { value: (toNum(v.count) || 0) + toNum(v.free), found:true, keys:[k + '.count + ' + k + '.free'] };
      }
      const n = toNum(v); if(n!==null) return { value:n, found:true, keys:[k] };
    }
  }
  // Búsqueda en profundidad (por si el dato viene anidado dentro del staff)
  const deep = (o, depth)=>{
    if(!o || typeof o!=='object' || depth>3) return null;
    for(const [k,v] of Object.entries(o)){
      if(/dedicated|fan|hincha/i.test(k)){ const n = toNum(v); if(n!==null) return { value:n, found:true, keys:[k] }; }
      const r = deep(v, depth+1); if(r) return r;
    }
    return null;
  };
  const d = deep(st, 0);
  if(d) return d;
  return { value:0, found:false, keys:entries.map(([k])=>k) };
}

function preMatchBegin(){
  if(openingKickoffDone) return;
  if(preMatch.step==='idle'){
    ['A','B'].forEach(t=>{
      const d = rollDieN(3);
      const ff = getFanFactor(t);
      preMatch.fanDie[t] = d;
      preMatch.fanFactor[t] = ff.value;
      preMatch.fanFound[t] = ff.found;
      preMatch.fanTotal[t] = d + ff.value;
      log('📣 Hinchas de ' + teamName(t) + ': D3=' + d + ' + Factor ' + ff.value + ' = ' + (d+ff.value) + (ff.found ? '' : ' (sin dato de hinchas en el staff del equipo cargado — claves vistas: ' + (ff.keys.join(', ') || 'ninguna') + ' — se usa 0)') + '.');
    });
    preMatch.fanRolled = true;
    preMatch.step = 'fans';
  }
  preMatch.open = true;
  renderPreMatch();
  broadcastState();
}

function preMatchSkip(){
  if(openingKickoffDone || preMatch.step!=='idle') return;
  if(!confirm('¿Saltar la secuencia previa? No habrá hinchas, clima, sustitutos ni sorteo (elegiréis quién patea a mano).')) return;
  preMatch = defaultPreMatch();
  preMatch.step = 'done';
  log('⏭️ Secuencia previa al partido omitida.');
  renderPreMatch();
  broadcastState();
}

function preMatchNext(){
  if(preMatch.step==='fans'){
    const a = rollDieN(6), b = rollDieN(6);
    preMatch.wDie.a = a; preMatch.wDie.b = b;
    preMatch.weather = weatherKindFromSum(a+b); applyWeatherField(preMatch.weather);
    preMatch.step = 'weather';
    log('🌦️ Clima: ' + a + ' + ' + b + ' = ' + (a+b) + ' → ' + WEATHER_TABLE[preMatch.weather].name + '. ' + WEATHER_TABLE[preMatch.weather].desc);
  } else if(preMatch.step==='weather'){
    addSubstitutesIfNeeded();
    preMatch.step = 'inducements';
    incInit();
  } else if(preMatch.step==='inducements'){
    let a, b;
    do { a = rollDieN(6); b = rollDieN(6); } while(a===b);
    preMatch.coinDie.A = a; preMatch.coinDie.B = b;
    preMatch.coinWinner = a>b ? 'A' : 'B';
    preMatch.step = 'coin';
    log('🎲 Sorteo de patada: ' + teamName('A') + ' ' + a + ' — ' + teamName('B') + ' ' + b + '. Gana ' + teamName(preMatch.coinWinner) + ' y elige quién patea en la 1ª mitad.');
  }
  renderPreMatch();
  broadcastState();
}

function preMatchChooseKicker(team){
  if(preMatch.step!=='coin') return;
  const sel = document.getElementById('kickSelect');
  sel.value = team;
  preMatch.step = 'done';
  preMatch.open = false;
  log('🏈 ' + teamName(preMatch.coinWinner) + ' decide que patee ' + teamName(team) + ' en la 1ª mitad (la 2ª patea el otro equipo).');
  onKickChangeQuiet();
  renderPreMatch();
  renderRosters();
  broadcastState();
}

function addSubstitutesIfNeeded(){
  const retired = ['ko','injured','injuredGrave','dead','expelled'];
  ['A','B'].forEach(team=>{
    preMatch.subs[team] = 0;
    const roster = players.filter(p=>p.team===team && !retired.includes(p.condition));
    if(roster.length===0){ log('ℹ️ ' + teamName(team) + ' no tiene plantilla cargada: no se añaden sustitutos.'); return; }
    const missing = 7 - roster.length;
    if(missing<=0) return;
    const tpl = roster.find(p=>playerHasSkill(p, 'linea', 'lineman'));
    for(let i=0;i<missing;i++){
      const base = tpl ? {
        ma: tpl.ma || 6, st: tpl.st, ag: tpl.ag, pa: tpl.pa, av: tpl.av,
        skills: (tpl.skills || []).slice()
      } : { ma:6, st:3, ag:'3+', pa:'4+', av:'9+', skills:['Línea'] };
      base.skills.push('Solitario (4+)');
      players.push({
        id: nextId++, team, num: 'S' + (i+1), name: 'Sustituto ' + (i+1),
        ma: base.ma, remainingMove: base.ma, gfiUsed:0, condition:'standing', blockedThisActivation:false, freePushOverride:false,
        dodgeSkillUsedThisTurn:false, catchSkillUsedThisTurn:false, justStoodThisActivation:false,
        st: base.st, ag: base.ag, pa: base.pa, av: base.av,
        position: 'Sustituto', skills: base.skills, isSubstitute: true,
        row:null, col:null, activated:false, onPitch:false
      });
    }
    preMatch.subs[team] = missing;
    log('🧍 ' + teamName(team) + ' solo tiene ' + roster.length + ' jugadores: se añaden ' + missing + ' Sustituto' + (missing===1?'':'s') + ' (Línea' + (tpl ? '' : ' genérico — no se encontró un Línea en su plantilla') + ' + Solitario 4+).');
  });
  renderRosters();
}

// ================== INCENTIVOS (paso de la secuencia previa) ==================
const INC_ITEMS = [
  { key:'cheerleaders', name:'Animadoras temporales',            max:2, cost:15000,  icon:'animadora.png' },
  { key:'assistants',   name:'Ayudantes a tiempo parcial',       max:2, cost:15000,  icon:'ayudante_entrenador.png' },
  { key:'keg',          name:'Barriles de cerveza Estrella Blitzer', max:2, cost:50000, icon:'barril.png' },
  { key:'prayers',      name:'Plegarias a Nuffle',               max:2, cost:5000, icon:'nuffle.png' },
  { key:'rerolls',      name:'Entrenamientos adicionales',       max:6, cost:125000, icon:'reroll.png' },
  { key:'bribes',       name:'Sobornos',                         max:2, cost:100000, discount:{ rule:'corrupt', cost:50000 }, icon:'soborno.png' },
  { key:'apothecary',   name:'Apotecario errante',               max:1, cost:100000, need:'apoth',   needTxt:'solo equipos que puedan contratar Apotecario', icon:'apotecario.png' },
  { key:'morgue',       name:'Ayudante de la morgue',            max:1, cost:100000, need:'undead',  needTxt:'solo Señores de los No Muertos', icon:'ayudante_morgue.png' },
  { key:'plague',       name:'Médico de la peste',               max:1, cost:100000, need:'nurgle',  needTxt:'solo Elegidos de Nurgle', icon:'medico_peste.png' },
  { key:'chef',         name:'Chef maestro halfling',            max:1, cost:300000, discount:{ rule:'halfling', cost:100000 }, icon:'chef_halfling.png' },
  { key:'desperate',    name:'Medidas desesperadas',             max:5, cost:50000 }
];
const INC_RULES = [
  { k:'corrupt',  label:'Sobornos y corrupción' },
  { k:'undead',   label:'Señores de los No Muertos' },
  { k:'nurgle',   label:'Elegidos de Nurgle' },
  { k:'halfling', label:'Halfling' },
  { k:'apoth',    label:'Puede contratar Apotecario' }
];
const TRAP_CELLS = [ { r:1, c:5 }, { r:9, c:14 } ];   // 2ª fila/6ª columna y 10ª fila/15ª columna (contando desde arriba-izquierda)
function trapdoorActive(){ return prayerFlag('A','trapdoor') || prayerFlag('B','trapdoor'); }
function isTrapCell(r,c){ return TRAP_CELLS.some(t=>t.r===r && t.c===c); }
let trapChecked = {};   // playerId -> 'r_c' ya comprobado (para no repetir la tirada mientras siga en la casilla)
let trapTickTimer = null, trapTries = 0;
function scheduleTrapTick(){
  if(!trapdoorActive() || phase!=='live') return;
  if(trapTickTimer) return;
  trapTickTimer = setTimeout(()=>{ trapTickTimer = null; trapdoorTick(); }, 450);
}
function trapdoorBusy(){
  return anyModalOpen() || pendingPush || pendingFollowUp || (pendingArmorQueue && pendingArmorQueue.length) || pendingCatch || pendingBallDrop || ballBounceActive || pendingTurnoverAfterResolve || pendingTD || kickoffBounceStep || (kickoffEvt && kickoffEvt.phase);
}
function trapdoorTick(){
  if(!trapdoorActive() || phase!=='live') return;
  // limpiar a quien ya no está en una casilla de trampilla
  players.forEach(p=>{ if(trapChecked[p.id] && !(p.onPitch && isTrapCell(p.row,p.col))) delete trapChecked[p.id]; });
  const entrant = players.find(p=>p.onPitch && p.row!==null && isTrapCell(p.row,p.col) && trapChecked[p.id]!==(p.row+'_'+p.col));
  if(!entrant){ trapTries = 0; return; }
  if(trapdoorBusy()){ if(++trapTries<40){ trapTickTimer = setTimeout(()=>{ trapTickTimer = null; trapdoorTick(); }, 600); } return; }
  trapTries = 0;
  trapChecked[entrant.id] = entrant.row + '_' + entrant.col;
  const d = rollDieN(6);
  log('🕳️ TRAMPILLA TRAICIONERA: ' + entrant.name + ' (' + teamName(entrant.team) + ') entra en una casilla con trampilla — D6=' + d + (d===1 ? ': ¡la trampilla se abre y cae por ella!' : ': la trampilla aguanta.'));
  if(d===1){
    const r = entrant.row, c = entrant.col;
    queueBallDropIfCarrier(entrant.id, r, c);
    entrant.onPitch = false; entrant.row = null; entrant.col = null; entrant.rooted = false;
    renderRosters(); renderPitch(); broadcastState();
    openInjuryDirect(entrant);
  } else {
    broadcastState();
    scheduleTrapTick();
  }
}
const PRAYERS = {
  1:{ name:'TRAMPILLA TRAICIONERA', desc:'Cada vez que un jugador, sea del equipo que sea, entre en una casilla con trampilla, tira 1D6: con un 1 la trampilla se abre y cae por ella (Lesiones como empujado fuera del campo; si llevaba el balón, rebota desde la trampilla).', mode:'flag' },
  2:{ name:'PUÑAL', desc:'Un jugador al azar de tu equipo obtiene el rasgo Apuñalar hasta el final del partido.', mode:'random', skill:'Apuñalar' },
  3:{ name:'MÚSCULOS DE HIERRO', desc:'Elige un jugador de tu equipo: +1 a su AR (máximo 11+) hasta el final del partido.', mode:'pick' },
  4:{ name:'NUDILLERAS', desc:'Elige un jugador de tu equipo: obtiene la habilidad Golpe mortífero hasta el final del partido.', mode:'pick', skill:'Golpe mortífero' },
  5:{ name:'BENDICIÓN DE NUFFLE', desc:'Un jugador al azar de tu equipo obtiene la habilidad Profesional hasta el final del partido.', mode:'random', skill:'Profesional' },
  6:{ name:'TOPOS BAJO EL CAMPO', desc:'Los jugadores rivales aplican un −1 a sus intentos de forzar la marcha (a por ellos).', mode:'flag' },
  7:{ name:'ESCRUTINIO ARBITRAL', desc:'Cualquier jugador rival que realice una acción de Falta será Expulsado automáticamente si rompe la armadura, aunque no saque doble natural.', mode:'flag' },
  8:{ name:'ENTRENAMIENTO INTENSIVO', desc:'Un jugador al azar de tu equipo obtiene una habilidad Primaria a tu elección hasta el final del partido.', mode:'randomPick' }
};
const DESPERATE = {
  1:'¡IDOPAJE! — antes de la patada inicial: +1 FU o AG a un jugador (al final de cada entrada que juegue, D6: 1-2 queda Inconsciente).',
  2:'JUGAR AL DESPISTE — al activar un jugador puede declarar dos acciones (distintas y sin dos Movimientos).',
  3:'RESACA — antes del despliegue: un jugador rival no puede jugar la primera entrada.',
  4:'AJUSTE DE CUENTAS — un jugador puede declarar Falta aunque ya se haya declarado una, y no puede ser Expulsado.',
  5:'ESCENA ENSAYADA — en un Pase: pase preciso y recepción automática con 2+.',
  6:'ESPIONAJE DEPORTIVO — tras un cambio de turno propio, el equipo obtiene 2 Segundas oportunidades.',
  7:'PIEL DE PLÁTANO — un rival que entre en zona de defensa de uno tuyo queda Tumbado y su activación termina.',
  8:'PERGAMINO MÁGICO — el equipo obtiene un Mago deportivo gratis (ya añadido).'
};
function incSt(){
  if(!preMatch.inc || typeof preMatch.inc!=='object') preMatch.inc = {};
  const i = preMatch.inc;   // se normaliza EN SITIO (mismo objeto siempre), porque RTDB elimina vacíos y 0
  if(i.sub===undefined) i.sub = 'setup';
  if(i.high===undefined) i.high = '';
  if(i.cash===undefined) i.cash = 0;
  ['vae','tre','spent','fromTre'].forEach(k=>{ if(!i[k] || typeof i[k]!=='object') i[k] = {}; if(i[k].A===undefined) i[k].A = 0; if(i[k].B===undefined) i[k].B = 0; });
  ['cart','rules','flags'].forEach(k=>{ if(!i[k] || typeof i[k]!=='object') i[k] = {}; if(!i[k].A || typeof i[k].A!=='object') i[k].A = {}; if(!i[k].B || typeof i[k].B!=='object') i[k].B = {}; });
  ['prayers','desp'].forEach(k=>{
    if(!i[k] || typeof i[k]!=='object') i[k] = {};
    ['A','B'].forEach(t=>{ const v = i[k][t]; if(!Array.isArray(v)) i[k][t] = (v && typeof v==='object') ? Object.values(v) : []; });
  });
  return i;
}
function incCommit(){ renderPreMatch(); broadcastState(); }
function fmtMO(n){ return (Number(n)||0).toLocaleString('es-ES') + ' M.O.'; }
function raceRules(team){
  const r = String(teamRace[team] || '').toLowerCase();
  const undead = /undead|no.?muert|necro|khemri|tomb|vampir/.test(r);
  const nurgle = /nurgle/.test(r);
  return { corrupt:false, undead, nurgle, halfling:/halfling/.test(r), apoth: !(undead || nurgle) };
}
function econFromTeamJson(data){
  // VAE y Tesorería a partir del JSON del gestor (data.league.economy / players[].price / staff). Son una ESTIMACIÓN editable.
  const lg = data && data.league;
  if(!lg || typeof lg!=='object') return {};
  const pr = (lg.economy && lg.economy.prices) || {};
  const price = (k, d)=> (typeof pr[k]==='number' ? pr[k] : d);
  const st = lg.staff || {};
  const n = v=> (typeof v==='number' && isFinite(v)) ? v : 0;
  const rerollTotal = (data.staff && data.staff.rerolls && typeof data.staff.rerolls.total==='number') ? data.staff.rerolls.total : 0;
  const staffVal = rerollTotal + n(st.cheerleaders)*price('cheerleader',20000) + n(st.assistantCoaches)*price('assistantCoach',20000) +
                   n(st.apothecary)*price('apothecary',80000) + Math.max(0, n(st.dedicatedFans)-1)*price('dedicatedFan',20000); // el 1.er Fan dedicado es gratuito
  const plist = Array.isArray(lg.players) ? lg.players : [];
  const activeVal = plist.filter(p=>!p.status || p.status==='active').reduce((a,p)=>a + n(p.price), 0);
  const allVal = plist.reduce((a,p)=>a + n(p.price), 0);
  const out = { vae: activeVal + staffVal };
  const noMatches = !Array.isArray(lg.matches) || lg.matches.length===0;
  if(noMatches && typeof (lg.economy && lg.economy.startingTreasury)==='number'){
    out.treasury = Math.max(0, lg.economy.startingTreasury - allVal - staffVal - n(st.bribes)*price('bribe',100000));
    out.treasuryEstimated = true;
  }
  return out;
}
function incInit(){
  preMatch.inc = {};
  const i = incSt();
  ['A','B'].forEach(t=>{
    const ec = (teamStaff[t] && teamStaff[t].leagueEcon) || {};
    if(typeof ec.vae==='number') i.vae[t] = ec.vae;
    if(typeof ec.treasury==='number') i.tre[t] = ec.treasury;
    i.rules[t] = raceRules(t);
  });
  i.inited = true; i.sub = 'setup';
}
function incSetNum(kind, team, val){ const i = incSt(); i[kind][team] = Math.max(0, parseInt(val,10) || 0); incCommit(); }
function incSetRule(team, k, on){ const i = incSt(); i.rules[team][k] = !!on; incCommit(); }
function incCost(team, it){
  const i = incSt();
  if(it.discount && i.rules[team][it.discount.rule]) return it.discount.cost;
  return it.cost;
}
function incAvail(team, it){
  const i = incSt();
  if(it.need && !i.rules[team][it.need]) return { ok:false, why:it.needTxt };
  return { ok:true };
}
function incCartTotal(team){
  const i = incSt(); let tot = 0;
  INC_ITEMS.forEach(it=>{ const n = i.cart[team][it.key] || 0; if(n>0 && incAvail(team,it).ok) tot += n * incCost(team,it); });
  return tot;
}
function incSetQty(team, key, delta){
  const i = incSt();
  if(!((i.sub==='buyHigh' && i.high===team) || (i.sub==='buyLow' && i.high && i.high!==team))) return;
  const it = INC_ITEMS.find(x=>x.key===key); if(!it) return;
  const cur = i.cart[team][key] || 0;
  let n = Math.max(0, Math.min(it.max, cur + delta));
  if(n>cur && incCartTotal(team) + (n-cur)*incCost(team,it) > incBudget(team).total) return;
  if(n===cur) return;
  i.cart[team][key] = n;
  incCommit();
}
function incBudget(team){
  const i = incSt();
  if(i.sub==='buyHigh') return { cash:0, treAllow:i.tre[team], total:i.tre[team] };
  const treAllow = Math.min(50000, i.tre[team]);
  return { cash:i.cash, treAllow, total:i.cash + treAllow };
}
function incStartBuying(){
  const i = incSt();
  if(i.vae.A===i.vae.B){
    log('💰 INCENTIVOS: ambos equipos tienen el mismo VAE (' + fmtMO(i.vae.A) + ') — están igualados: ninguno puede gastar Tesorería en Incentivos.');
    i.sub = 'done'; incFinish(); return;
  }
  i.high = i.vae.A > i.vae.B ? 'A' : 'B';
  const low = i.high==='A' ? 'B' : 'A';
  i.cash = Math.abs(i.vae.A - i.vae.B);
  log('💰 INCENTIVOS: VAE ' + teamName('A') + ' ' + fmtMO(i.vae.A) + ' — ' + teamName('B') + ' ' + fmtMO(i.vae.B) + '. ' + teamName(i.high) + ' (mayor VAE) compra primero con su Tesorería (' + fmtMO(i.tre[i.high]) + '). ' + teamName(low) + ' recibirá ' + fmtMO(i.cash) + ' de diferencia más lo que gaste el otro equipo, y hasta 50.000 M.O. de su Tesorería.');
  i.sub = 'buyHigh';
  incCommit();
}
function incApplyCart(team){
  const i = incSt();
  teamInc[team] = Object.assign({}, teamInc[team] || {});
  const parts = [];
  INC_ITEMS.forEach(it=>{
    const n = i.cart[team][it.key] || 0;
    if(!(n>0) || !incAvail(team,it).ok) return;
    parts.push(n + '× ' + it.name);
    if(it.key==='prayers'){ for(let k=0;k<n;k++) i.prayers[team].push({ done:false, n:0 }); return; }
    if(it.key==='desperate'){
      for(let k=0;k<n;k++){
        const d = rollDieN(8);
        i.desp[team].push({ n:d });
        log('📜 Medida desesperada de ' + teamName(team) + ': D8=' + d + ' → ' + DESPERATE[d]);
        if(d===8){ teamInc[team].wizard = (teamInc[team].wizard || 0) + 1; }
      }
      return;
    }
    teamInc[team][it.key] = (teamInc[team][it.key] || 0) + n;
    if(it.key==='rerolls'){ teamRerollsLeft[team] = (teamRerollsLeft[team] || 0) + n; }
  });
  log('🛒 ' + teamName(team) + ' compra Incentivos: ' + (parts.length ? parts.join(', ') : 'nada') + '.');
  renderStaffPanels();
}
function incConfirm(team){
  const i = incSt();
  const tot = incCartTotal(team), b = incBudget(team);
  if(tot > b.total) return;
  if(i.sub==='buyHigh' && i.high===team){
    i.spent[team] = tot; i.fromTre[team] = tot;
    log('💰 ' + teamName(team) + ' gasta ' + fmtMO(tot) + ' de su Tesorería en Incentivos (queda ' + fmtMO(i.tre[team] - tot) + ').');
    incApplyCart(team);
    const low = team==='A' ? 'B' : 'A';
    i.cash = Math.abs(i.vae.A - i.vae.B) + tot;
    i.sub = 'buyLow';
    log('💰 ' + teamName(low) + ' dispone de ' + fmtMO(i.cash) + ' en efectivo (lo que no gaste se pierde) y hasta ' + fmtMO(Math.min(50000, i.tre[low])) + ' de su Tesorería.');
    incCommit();
  } else if(i.sub==='buyLow' && i.high!==team){
    const fromTre = Math.max(0, tot - i.cash);
    i.spent[team] = tot; i.fromTre[team] = fromTre;
    log('💰 ' + teamName(team) + ' gasta ' + fmtMO(tot) + ' (efectivo ' + fmtMO(Math.min(tot, i.cash)) + (fromTre ? ' + ' + fmtMO(fromTre) + ' de su Tesorería, queda ' + fmtMO(i.tre[team] - fromTre) : '') + (tot < i.cash ? '; se pierden ' + fmtMO(i.cash - tot) + ' de efectivo sin gastar' : '') + ').');
    incApplyCart(team);
    incFinish();
  }
}
function incPlayingPlayers(team){
  const retired = ['ko','injured','injuredGrave','dead','expelled'];
  return players.filter(p=>p.team===team && !retired.includes(p.condition));
}
function incFinish(){
  const i = incSt();
  const any = ['A','B'].some(t=> i.prayers[t].length>0);
  if(!any){ i.sub = 'summary'; incCommit(); return; }
  i.sub = 'prayers';
  ['A','B'].forEach(t=>{
    i.prayers[t].forEach((pr, idx)=>{
      if(pr.n) return;
      pr.n = rollDieN(8);
      const def = PRAYERS[pr.n];
      log('🙏 Plegaria a Nuffle de ' + teamName(t) + ': D8=' + pr.n + ' → ' + def.name + '. ' + def.desc);
      if(def.mode==='flag'){
        i.flags[t][pr.n===1 ? 'trapdoor' : pr.n===6 ? 'topos' : 'escrutinio'] = true;
        pr.done = true;
        if(pr.n===1) log('🙏 Trampilla traicionera: efecto registrado (las casillas de trampilla se definirán aparte).');
      } else if(def.mode==='random'){
        const pool = incPlayingPlayers(t);
        const p = pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
        if(p){ p.skills = [def.skill].concat(p.skills || []); p.prayerSkills = (p.prayerSkills || []).concat([def.skill]); pr.target = p.id; log('🙏 ' + p.name + ' (' + teamName(t) + ') obtiene ' + def.skill + ' hasta el final del partido.'); }
        pr.done = true;
      } else if(def.mode==='randomPick'){
        const pool = incPlayingPlayers(t);
        const p = pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
        if(p){ pr.target = p.id; log('🙏 Entrenamiento intensivo: ' + p.name + ' (' + teamName(t) + ') ha sido elegido al azar; su entrenador elige una habilidad Primaria.'); }
        else pr.done = true;
      }
    });
  });
  renderRosters();
  incCommit();
}
function incPrayerPick(team, idx){
  const i = incSt(); const pr = i.prayers[team][idx]; if(!pr || pr.done) return;
  const def = PRAYERS[pr.n];
  let p = null;
  if(def.mode==='pick'){
    const sel = document.getElementById('incSel_' + team + '_' + idx);
    p = players.find(x=>x.id===parseInt(sel && sel.value,10));
    if(!p) return;
    if(pr.n===3){
      const m = String(p.av).match(/\d+/); const n = m ? parseInt(m[0],10) : NaN;
      if(isNaN(n)){ return; }
      const nn = Math.min(11, n+1);
      log('🙏 MÚSCULOS DE HIERRO: ' + p.name + ' (' + teamName(team) + ') AR ' + p.av + ' → ' + nn + '+ hasta el final del partido.');
      p.avBoost = (p.avBoost || 0) + 1; p.av = nn + '+';
    } else {
      p.skills = [def.skill].concat(p.skills || []); p.prayerSkills = (p.prayerSkills || []).concat([def.skill]);
      log('🙏 NUDILLERAS: ' + p.name + ' (' + teamName(team) + ') obtiene ' + def.skill + ' hasta el final del partido.');
    }
    pr.target = p.id;
  } else if(def.mode==='randomPick'){
    p = players.find(x=>x.id===pr.target);
    const inp = document.getElementById('incTxt_' + team + '_' + idx);
    const txt = inp ? inp.value.trim() : '';
    if(!p || !txt) return;
    p.skills = [txt].concat(p.skills || []); p.prayerSkills = (p.prayerSkills || []).concat([txt]);
    log('🙏 ENTRENAMIENTO INTENSIVO: ' + p.name + ' (' + teamName(team) + ') obtiene la habilidad ' + txt + ' hasta el final del partido.');
  }
  pr.done = true;
  renderRosters();
  incCommit();
}
// ===== Mago deportivo: Bola de fuego y ¡ZAP! =====
function wizardLeft(team){ return resTotal(team, 'wizard') - ((teamUsedRes[team] || {}).wizard || 0); }
function wizardSpend(team){
  teamUsedRes[team] = Object.assign({}, teamUsedRes[team] || {});
  teamUsedRes[team].wizard = (teamUsedRes[team].wizard || 0) + 1;
  renderResourceIcons();
}
function wizardIconClick(team){
  if(wizardLeft(team)<=0) return;
  if(wizardSt && (wizardSt.mode==='gap' || wizardSt.mode==='choose')){
    wizardSt.mode = 'choose'; wizardSt.team = team;
    renderWizard(); broadcastState();
  } else {
    updateStatus('El Mago deportivo se usa al final de un turno, antes de que empiece el siguiente.');
  }
}
function wizardGapNeeded(){ return wizardLeft('A')>0 || wizardLeft('B')>0; }
function wizardContinue(){
  const next = wizardSt && wizardSt.next;
  wizardSt = null; renderWizard(); broadcastState();
  if(next) beginTurn(next);
}
function wizardChoose(spell){
  if(!wizardSt) return;
  if(spell==='fire'){ wizardSt.mode = 'pickCell'; updateStatus('BOLA DE FUEGO: click en la casilla objetivo.'); }
  else { wizardSt.mode = 'pickPlayer'; updateStatus('¡ZAP!: click en el jugador objetivo.'); }
  renderWizard(); broadcastState();
}
function wizardBack(){
  if(!wizardSt) return;
  wizardSt.mode = 'gap'; renderWizard(); broadcastState();
}
function renderWizard(){
  const m = document.getElementById('wizardModal'); if(!m) return;
  const title = document.getElementById('wizTitle'), body = document.getElementById('wizBody'), act = document.getElementById('wizActions');
  const mode = wizardSt && wizardSt.mode;
  const visible = mode==='gap' || mode==='choose' || mode==='pickCell' || mode==='pickPlayer';
  m.classList.toggle('show', !!visible);
  m.classList.toggle('pick', mode==='pickCell' || mode==='pickPlayer');
  if(!visible){ body.innerHTML = ''; act.innerHTML = ''; return; }
  act.innerHTML = '';
  const btn = (label, fn, cls)=>{ const b = document.createElement('button'); if(cls) b.className = cls; b.innerHTML = label; b.onclick = fn; act.appendChild(b); return b; };
  const wizIcon = '<span class="gold-icon" style="--icon:url(\'icons/mago.png\')"></span> ';
  if(mode==='gap'){
    title.innerHTML = wizIcon + 'FIN DE TURNO';
    body.innerHTML = '<div class="pm-note">Antes de que empiece el turno de <b>' + teamName(wizardSt.next) + '</b>, un equipo con Mago deportivo disponible puede lanzar un hechizo (una vez por partido).</div>';
    ['A','B'].forEach(t=>{ if(wizardLeft(t)>0) btn(wizIcon + teamName(t) + ': lanzar hechizo', ()=>{ wizardSt.mode='choose'; wizardSt.team=t; renderWizard(); broadcastState(); }); });
    btn('Continuar → turno de ' + teamName(wizardSt.next), wizardContinue, 'primary');
  } else if(mode==='choose'){
    title.innerHTML = wizIcon + 'MAGO DE ' + teamName(wizardSt.team).toUpperCase();
    body.innerHTML = '<div class="inc-pray"><div><b>🔥 BOLA DE FUEGO</b></div><div class="inc-desc">Elige una casilla; tira 1D6 por cada jugador en ella o en una adyacente (cualquier equipo). Con 4+ es alcanzado: si está en pie, es Derribado y se le aplica +1 a la Armadura; si está Tumbado o Aturdido, tirada de Armadura con +1.</div></div>' +
      '<div class="inc-pray"><div><b>⚡ ¡ZAP!</b></div><div class="inc-desc">Elige un jugador del campo y tira 1D6: con un 6 natural, o igual o superior a su FU (salvo 1 natural), se convierte en Rana hasta el final de la entrada.</div></div>';
    btn('🔥 Bola de fuego', ()=>wizardChoose('fire'), 'primary');
    btn('⚡ ¡ZAP!', ()=>wizardChoose('zap'), 'primary');
    btn('Atrás', wizardBack);
  } else {
    title.innerHTML = wizIcon + (mode==='pickCell' ? 'BOLA DE FUEGO' : '¡ZAP!');
    body.innerHTML = '<div class="pm-note">' + (mode==='pickCell' ? 'Click en la casilla objetivo del campo.' : 'Click en el jugador objetivo del campo.') + '</div>';
    btn('Cancelar', wizardBack);
  }
}
function wizardPickAt(r, c){
  if(!wizardSt) return false;
  if(wizardSt.mode==='pickCell'){ wizardFireball(r, c); return true; }
  if(wizardSt.mode==='pickPlayer'){
    const p = players.find(x=>x.onPitch && x.row===r && x.col===c);
    if(!p){ updateStatus('¡ZAP!: elige un jugador (una casilla ocupada).'); return true; }
    wizardZap(p); return true;
  }
  return false;
}
function wizardFireball(r, c){
  const team = wizardSt.team;
  wizardSpend(team);
  wizardSt.mode = 'wait';
  log('🔥 BOLA DE FUEGO de ' + teamName(team) + ' sobre la casilla (fila ' + (r+1) + ', col ' + (c+1) + ').');
  const targets = players.filter(p=>p.onPitch && p.row!==null && Math.max(Math.abs(p.row-r), Math.abs(p.col-c))<=1);
  const hits = [];
  targets.forEach(p=>{
    const d = rollDieN(6);
    if(d>=4){
      const wasDown = p.condition==='tumbado' || p.condition==='aturdido';
      log('🔥 ' + p.name + ' (' + teamName(p.team) + ') D6=' + d + ': ¡alcanzado!' + (wasDown ? ' Tirada de Armadura con +1.' : ' Es Derribado y su Armadura se tira con +1.'));
      if(!wasDown){ queueBallDropIfCarrier(p.id, p.row, p.col); p.condition = 'tumbado'; p.rooted = false; }
      armorBonusMap[p.id] = { mod:1, keep:wasDown };
      hits.push(p.id);
    } else {
      log('🔥 ' + p.name + ' (' + teamName(p.team) + ') D6=' + d + ': esquiva la bola de fuego.');
    }
  });
  if(!targets.length) log('🔥 No hay ningún jugador en esa casilla ni en las adyacentes.');
  renderRosters(); renderPitch(); renderSelInfo(); renderWizard();
  if(hits.length){
    pendingArmorQueue = hits.slice(1);
    const first = players.find(x=>x.id===hits[0]);
    broadcastState();
    openArmorModal(first);
  } else {
    broadcastState();
    if(pendingBallDrop){ closeArmorModal(); }
  }
}
function wizardZap(p){
  const team = wizardSt.team;
  wizardSpend(team);
  wizardSt.mode = 'wait';
  const d = rollDieN(6), fu = parseInt(p.st,10);
  const frog = d===6 || (d!==1 && !isNaN(fu) && d>=fu);
  log('⚡ ¡ZAP! de ' + teamName(team) + ' sobre ' + p.name + ' (' + teamName(p.team) + ', FU ' + (isNaN(fu) ? '?' : fu) + '): D6=' + d + (frog ? ' — ¡se convierte en RANA!' : ' — no ocurre nada.'));
  if(frog){
    const wasCarrier = ball.carrierId===p.id;
    p.frogOrig = { ma:p.ma, st:p.st, ag:p.ag, pa:p.pa, av:p.av, skills:(p.skills || []).slice(), position:p.position, remainingMove:p.remainingMove };
    p.frog = true; p.ma = 5; p.st = 1; p.ag = '2+'; p.pa = '6+'; p.av = '5+';
    p.skills = ['Canijo','Escurridizo','Esquivar','Piernas muy largas','Saltar','Sin balón']; p.position = 'Rana';
    p.remainingMove = Math.min(p.remainingMove ?? 5, 5);
    renderRosters(); renderPitch(); renderSelInfo();
    if(wasCarrier){ queueBallDropIfCarrier(p.id, p.row, p.col); }
    renderWizard(); broadcastState();
    if(wasCarrier) closeArmorModal();
    return;
  }
  renderWizard(); broadcastState();
}
function frogRestoreAll(){
  players.filter(p=>p.frog).forEach(p=>{
    const o = p.frogOrig || {};
    p.ma = o.ma ?? p.ma; p.st = o.st ?? p.st; p.ag = o.ag ?? p.ag; p.pa = o.pa ?? p.pa; p.av = o.av ?? p.av;
    p.skills = o.skills || p.skills; p.position = o.position; p.frog = false; p.frogOrig = null;
    log('🐸 ' + p.name + ' recobra su forma normal y va a Reservas.');
  });
}
function wizardTick(){
  if(!wizardSt || wizardSt.mode!=='wait') return;
  if(trapdoorBusy()) return;
  wizardSt.mode = 'gap'; renderWizard(); broadcastState();
}
setInterval(()=>{ try{ wizardTick(); }catch(e){ console.error(e); } }, 700);

// ===== Medidas desesperadas: datos y efectos =====
const DESP_ICONS = {
  2:{ icon:'jugar_despiste.png', name:'Jugar al despiste' },
  4:{ icon:'ajuste_cuentas.png', name:'Ajuste de cuentas' },
  5:{ icon:'escena_ensayada.png', name:'Escena ensayada' },
  6:{ icon:'espionaje.png', name:'Espionaje deportivo' },
  7:{ icon:'pl%C3%A1tano.png', name:'Piel de plátano' }
};
function despList(team){ return incSt().desp[team]; }
function despAvail(team, n){ return despList(team).find(d=>d.n===n && !d.used); }
function despCount(team, n){ return despList(team).filter(d=>d.n===n).length; }
function despSpend(team, n){ const d = despAvail(team, n); if(d) d.used = true; return d; }
function despPrePending(){
  return ['A','B'].some(t=> despList(t).some(d=> (d.n===1 || d.n===3) && !d.done));
}
// --- 1 Idopaje / 3 Resaca (antes de la patada inicial)
function despPreApply(team, idx){
  const i = incSt(); const d = i.desp[team][idx]; if(!d || d.done) return;
  const sel = document.getElementById('despSel_' + team + '_' + idx);
  const p = players.find(x=>x.id===parseInt(sel && sel.value,10));
  if(!p) return;
  if(d.n===1){
    const stSel = document.getElementById('despStat_' + team + '_' + idx);
    despApplyIdopaje(p, stSel && stSel.value==='ag' ? 'ag' : 'st', d);
  } else if(d.n===3){
    despApplyResaca(p, d);
  }
  d.done = true;
  renderRosters();
  incCommit();
}
function despApplyIdopaje(p, stat, d){
  if(!p.idopajeOrig) p.idopajeOrig = { st:p.st, ag:p.ag };
  p.idopaje = true;
  if(stat==='ag'){
    const m = String(p.ag).match(/\d+/); const v = m ? parseInt(m[0],10) : NaN;
    if(!isNaN(v)) p.ag = Math.max(1, v-1) + '+';
  } else {
    const v = parseInt(p.st,10); if(!isNaN(v)) p.st = Math.min(10, v+1);
  }
  if(d){ d.target = p.id; d.stat = stat; }
  log('💉 ¡IDOPAJE!: ' + p.name + ' (' + teamName(p.team) + ') gana +1 ' + (stat==='ag' ? 'AG (' + p.idopajeOrig.ag + ' → ' + p.ag + ')' : 'FU (' + p.idopajeOrig.st + ' → ' + p.st + ')') + '. Al final de cada entrada que juegue, D6: 1-2 queda Inconsciente.');
}
function despApplyResaca(p, d){
  p.heatRest = true; p.resaca = true;
  if(d) d.target = p.id;
  log('🍺 RESACA: ' + p.name + ' (' + teamName(p.team) + ') no puede jugar la primera entrada.');
}
function despIdopajeAtDriveEnd(){
  const retired = ['ko','injured','injuredGrave','dead','expelled'];
  players.filter(p=>p.idopaje && p.onPitch && !retired.includes(p.condition)).forEach(p=>{
    const d = rollDieN(6);
    if(d<=2){
      p.condition = 'ko';
      log('💉 ¡IDOPAJE!: ' + p.name + ' (' + teamName(p.team) + ') tira D6=' + d + ' al final de la entrada — queda Inconsciente.');
    } else {
      log('💉 ¡IDOPAJE!: ' + p.name + ' (' + teamName(p.team) + ') tira D6=' + d + ' al final de la entrada — aguanta.');
    }
  });
}
// --- uso de las medidas con icono
function useDesperate(team, n){
  const d = despAvail(team, n); if(!d) return;
  if(phase!=='live'){ updateStatus('Las medidas desesperadas se usan durante la entrada.'); return; }
  const di = DESP_ICONS[n];
  if(n===2){
    if(state.active!==team){ updateStatus('Jugar al despiste se activa en el turno de tu equipo, antes de elegir al jugador.'); return; }
    if(despisteArmed[team]) return;
    if(!confirm('¿Usar JUGAR AL DESPISTE? El siguiente jugador de ' + teamName(team) + ' que actives podrá declarar dos acciones distintas (sin dos Movimientos).')) return;
    d.used = true; despisteArmed[team] = true;
    log('🎭 JUGAR AL DESPISTE: ' + teamName(team) + ' lo activa — el siguiente jugador que active podrá declarar dos acciones distintas.');
  } else if(n===4){
    if(state.active!==team || !foulUsedByTeam[team]){ updateStatus('Ajuste de cuentas solo puede usarse tras haber declarado una Falta en este turno.'); return; }
    if(!confirm('¿Usar AJUSTE DE CUENTAS? Podréis declarar otra Falta este turno y ese jugador no podrá ser Expulsado en ella.')) return;
    d.used = true; foulUsedByTeam[team] = false; ajusteArmed[team] = true;
    log('🥊 AJUSTE DE CUENTAS: ' + teamName(team) + ' puede declarar otra Falta este turno; el jugador no podrá ser Expulsado en ella.');
  } else if(n===6){
    if(!ownTurnChanged[team]){ updateStatus('Espionaje deportivo se usa tras un cambio de turno propio.'); return; }
    if(!confirm('¿Usar ESPIONAJE DEPORTIVO? ' + teamName(team) + ' obtiene 2 Segundas oportunidades que se suman a las normales hasta el final del partido.')) return;
    d.used = true; teamBonusRR[team] = (teamBonusRR[team] || 0) + 2;
    teamRerollsLeft[team] = (teamRerollsLeft[team] || 0) + 2;
    log('🕵️ ESPIONAJE DEPORTIVO: ' + teamName(team) + ' obtiene 2 Segundas oportunidades (se pierden al final del partido). Segundas oportunidades: ' + teamRerollsLeft[team] + '.');
  } else if(n===7){
    if(!useBanana(team, d)) return;
  }
  renderResourceIcons(); renderStaffPanels(); renderScoreboard();
  broadcastState();
}
function useBanana(team, d){
  const other = team==='A' ? 'B' : 'A';
  if(state.active!==other){ updateStatus('La Piel de plátano se usa durante el turno del rival.'); return false; }
  if(anyModalOpen()){ updateStatus('Termina primero la tirada en curso.'); return false; }
  const p = players.find(x=>x.id===selected);
  if(!p || p.team!==other || !p.onPitch || p.condition!=='standing' || countOpponentTackleZones(p.row, p.col, p.team)<1){
    updateStatus('Piel de plátano: el jugador rival activo (seleccionado) debe estar en la zona de defensa de uno de los tuyos.');
    return false;
  }
  if(!confirm('¿Usar PIEL DE PLÁTANO sobre ' + p.name + ' (' + teamName(other) + ')? Queda Tumbado y su activación termina.')) return false;
  d.used = true;
  const wasCarrier = ball.carrierId===p.id;
  p.condition = 'tumbado'; p.rooted = false;
  if(declaredAction==='blitz' || blitzActivePlayer===p.id) blitzUsedByTeam[other] = true;
  p.activated = true;
  blockTargeting = null; blitzActivePlayer = null; selected = null; declaredAction = null;
  log('🍌 PIEL DE PLÁTANO: ' + p.name + ' (' + teamName(other) + ') entra en la zona de defensa de un jugador de ' + teamName(team) + ' y queda Tumbado. Su activación termina' + (wasCarrier ? ' y suelta el balón: cambio de turno.' : ' (sin cambio de turno).'));
  renderRosters(); renderPitch(); renderSelInfo();
  if(wasCarrier){
    queueBallDropIfCarrier(p.id, p.row, p.col);
    pendingTurnoverAfterResolve = true;
    broadcastState();
    closeArmorModal();
  }
  return true;
}
function expelEscrutinio(fouler){
  fouler.condition = 'expelled'; fouler.onPitch = false; fouler.row = null; fouler.col = null;
  if(ball.carrierId===fouler.id) ball.carrierId = null;
  log('🟥 ESCRUTINIO ARBITRAL: ' + fouler.name + ' (' + teamName(fouler.team) + ') rompe la armadura en su Falta y es Expulsado automáticamente.');
  renderRosters(); renderPitch(); renderScoreboard(); renderSelInfo(); broadcastState();
  autoTurnoverThenEndTurn();
}
// --- Jugar al despiste: segunda acción
function despisteTick(){
  if(!despisteSt) return;
  const st = despisteSt;
  const p = players.find(x=>x.id===st.id);
  if(!p || phase!=='live' || state.active!==st.team || !p.onPitch || ['ko','injured','injuredGrave','dead','expelled'].includes(p.condition)){ despisteSt = null; return; }
  if(st.stage===2){ if(p.activated) despisteSt = null; return; }
  if(!p.activated || trapdoorBusy() || selected!==null || pendingActionMenuPlayer!==null) return;
  const t = st.team, sn = st.snap;
  st.first = blitzUsedByTeam[t]!==sn.blitz ? 'blitz' : passUsedByTeam[t]!==sn.pass ? 'pass' : handoffUsedByTeam[t]!==sn.handoff ? 'handoff'
           : secureBallUsedByTeam[t]!==sn.secure ? 'secure' : foulUsedByTeam[t]!==sn.foul ? 'foul' : 'move';
  st.stage = 2;
  p.activated = false; p.remainingMove = p.ma; p.gfiUsed = 0; p.blockedThisActivation = false;
  log('🎭 JUGAR AL DESPISTE: ' + p.name + ' puede declarar una segunda acción distinta (sin Placar ni repetir Movimiento).');
  renderPitch(); renderRosters();
  openActionMenu(p.id);
}
setInterval(()=>{ try{ despisteTick(); }catch(e){ console.error(e); } }, 600);

// ===== Panel admin incentivos (pruebas): añadir/quitar Plegarias y Medidas desesperadas a mano =====
const PRAYER_FLAG_KEY = { 1:'trapdoor', 6:'topos', 7:'escrutinio' };
function admCount(kind, team, n){ const i = incSt(); return i[kind==='p' ? 'prayers' : 'desp'][team].filter(x=>x.n===n).length; }
function admAdd(kind, team, n){
  const i = incSt();
  if(kind==='d'){
    const dEnt = { n:n, adm:true }; i.desp[team].push(dEnt);
    if(n===1 || n===3){
      const pool = incPlayingPlayers(n===1 ? team : (team==='A' ? 'B' : 'A'));
      const tp = pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
      if(tp){ if(n===1) despApplyIdopaje(tp, 'st', dEnt); else despApplyResaca(tp, dEnt); }
      dEnt.done = true;
    }
    if(n===8){ teamInc[team] = Object.assign({}, teamInc[team] || {}); teamInc[team].wizard = (teamInc[team].wizard || 0) + 1; renderStaffPanels(); }
    log('🧪 ADMIN: ' + teamName(team) + ' obtiene Medida desesperada ' + n + ' — ' + DESPERATE[n]);
  } else {
    const def = PRAYERS[n]; const pr = { n:n, done:true, adm:true };
    if(def.mode==='flag'){ i.flags[team][PRAYER_FLAG_KEY[n]] = true; }
    else {
      const pool = incPlayingPlayers(team);
      const p = pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
      if(!p){ log('🧪 ADMIN: ' + teamName(team) + ' no tiene jugadores disponibles para la Plegaria ' + n + '.'); return; }
      pr.target = p.id;
      if(n===3){
        const m = String(p.av).match(/\d+/); const v = m ? parseInt(m[0],10) : NaN;
        if(isNaN(v)){ log('🧪 ADMIN: ' + p.name + ' no tiene AR numérica.'); return; }
        pr.avFrom = p.av; p.avBoost = (p.avBoost || 0) + 1; p.av = Math.min(11, v+1) + '+';
      } else {
        let sk = def.skill;
        if(n===8){ sk = (window.prompt('Habilidad Primaria para ' + p.name + ':', '') || '').trim(); if(!sk) return; }
        pr.skill = sk; p.skills = [sk].concat(p.skills || []); p.prayerSkills = (p.prayerSkills || []).concat([sk]);
      }
      const tp = players.find(x=>x.id===pr.target);
      log('🧪 ADMIN: Plegaria ' + n + ' (' + def.name + ') de ' + teamName(team) + ' → ' + tp.name + (pr.skill ? ' obtiene ' + pr.skill : n===3 ? ' AR ' + pr.avFrom + ' → ' + tp.av : '') + '.');
    }
    if(def.mode==='flag') log('🧪 ADMIN: Plegaria ' + n + ' (' + def.name + ') activada para ' + teamName(team) + '.');
    i.prayers[team].push(pr);
  }
  renderRosters(); broadcastState();
}
function admRemove(kind, team, n){
  const i = incSt(); const arr = i[kind==='p' ? 'prayers' : 'desp'][team];
  let k = -1; for(let j=arr.length-1;j>=0;j--){ if(arr[j].n===n){ k = j; break; } }
  if(k<0) return;
  const pr = arr.splice(k,1)[0];
  if(kind==='d'){
    const tp = players.find(x=>x.id===pr.target);
    if(n===1 && tp && tp.idopajeOrig){ tp.st = tp.idopajeOrig.st; tp.ag = tp.idopajeOrig.ag; tp.idopajeOrig = null; tp.idopaje = false; }
    if(n===3 && tp){ tp.heatRest = false; tp.resaca = false; }
    if(n===8 && teamInc[team] && teamInc[team].wizard>0){ teamInc[team] = Object.assign({}, teamInc[team]); teamInc[team].wizard--; renderStaffPanels(); }
  } else {
    const def = PRAYERS[n];
    if(def.mode==='flag'){ if(!arr.some(x=>x.n===n)) i.flags[team][PRAYER_FLAG_KEY[n]] = false; }
    else {
      const p = players.find(x=>x.id===pr.target);
      if(p){
        if(n===3 && pr.avFrom!==undefined){ p.av = pr.avFrom; p.avBoost = Math.max(0, (p.avBoost || 0) - 1); }
        if(pr.skill){
          let a = (p.skills || []).indexOf(pr.skill); if(a>=0) p.skills.splice(a,1);
          a = (p.prayerSkills || []).indexOf(pr.skill); if(a>=0) p.prayerSkills.splice(a,1);
        }
      }
    }
  }
  log('🧪 ADMIN: quitada ' + (kind==='p' ? 'Plegaria ' : 'Medida desesperada ') + n + ' de ' + teamName(team) + '.');
  renderRosters(); broadcastState();
}
function renderAdminInc(){
  const el = document.getElementById('adminIncBody'); if(!el) return;
  let h = '<div class="inc-cols">';
  ['A','B'].forEach(t=>{
    const row = (kind, n, name)=>{
      const c = admCount(kind, t, n);
      return '<div class="inc-row"><span class="inc-name">' + n + '. ' + name + '</span><span class="inc-qty"><button onclick="admRemove(\'' + kind + '\',\'' + t + '\',' + n + ')" ' + (c>0 ? '' : 'disabled') + '>−</button><b class="mono">' + c + '</b><button onclick="admAdd(\'' + kind + '\',\'' + t + '\',' + n + ')">+</button></span></div>';
    };
    h += '<div class="inc-team" style="border-color:' + tokenColorFor({team:t}) + '"><h3>' + teamName(t) + '</h3><label>Plegarias a Nuffle</label><div class="inc-list">';
    for(let n=1;n<=8;n++) h += row('p', n, PRAYERS[n].name);
    h += '</div><label>Medidas desesperadas</label><div class="inc-list">';
    for(let n=1;n<=8;n++) h += row('d', n, DESPERATE[n].split(' — ')[0]);
    h += '</div></div>';
  });
  el.innerHTML = h + '</div>';
}
function prayerFlag(team, key){ return !!(preMatch && preMatch.inc && preMatch.inc.flags && preMatch.inc.flags[team] && preMatch.inc.flags[team][key]); }
function gfiTargetFor(p){
  const other = p.team==='A' ? 'B' : 'A';
  return (weatherKind()==='ventisca' ? 3 : 2) + (prayerFlag(other, 'topos') ? 1 : 0);
}
function incAfterPrayers(){
  const i = incSt();
  if(despPrePending()){ i.sub = 'despPre'; incCommit(); return; }
  preMatchNext();
}
function incNext(){
  const i = incSt();
  if(i.sub==='setup') return incStartBuying();
  preMatchNext();
}
function renderIncentives(body, actions){
  const i = incSt();
  const okBtn = (label, fn, disabled)=>{ const b = document.createElement('button'); b.className='primary'; b.textContent=label; b.disabled = !!disabled; b.onclick=fn; actions.appendChild(b); return b; };
  const subTxt = ['A','B'].filter(t=>preMatch.subs[t]>0).map(t=> teamName(t) + ': +' + preMatch.subs[t] + ' Sustituto' + (preMatch.subs[t]===1?'':'s')).join(' · ');
  let h = subTxt ? '<div class="pm-note">🧍 Sustitutos añadidos: ' + subTxt + '</div>' : '';
  const num = (kind,t)=>'<input type="number" min="0" step="5000" value="' + i[kind][t] + '" onchange="incSetNum(\'' + kind + '\',\'' + t + '\',this.value)">';
  if(i.sub==='setup'){
    const estNote = ['A','B'].filter(t=>teamStaff[t] && teamStaff[t].leagueEcon).map(t=> teamName(t) + ': ' + (teamStaff[t].leagueEcon.treasuryEstimated ? 'VAE y Tesorería calculados desde el JSON de liga (estimación)' : 'VAE calculado desde el JSON de liga; la Tesorería actual no viene en el JSON, escribidla')).join(' · ');
    if(estNote) h += '<div class="pm-note">ℹ️ ' + estNote + '. Revisad los números.</div>';
    h += '<div class="pm-note">Indicad el VAE (valor actual de equipo) y la Tesorería de cada equipo. El equipo con mayor VAE compra primero con su Tesorería; el de menor VAE recibe la diferencia más lo gastado por el otro, y hasta 50.000 M.O. de su Tesorería. Con el mismo VAE nadie puede gastar Tesorería.</div><div class="inc-cols">';
    ['A','B'].forEach(t=>{
      h += '<div class="inc-team" style="border-color:' + tokenColorFor({team:t}) + '"><h3>' + teamName(t) + '</h3>' +
        '<label>VAE (M.O.)</label>' + num('vae',t) + '<label>Tesorería (M.O.)</label>' + num('tre',t) +
        '<label>Reglas especiales</label>' + INC_RULES.map(r=>'<label class="inc-chk"><input type="checkbox" ' + (i.rules[t][r.k] ? 'checked' : '') + ' onchange="incSetRule(\'' + t + '\',\'' + r.k + '\',this.checked)"> ' + r.label + '</label>').join('') + '</div>';
    });
    h += '</div>';
    body.innerHTML = h;
    okBtn('Continuar → compra de Incentivos', incNext);
    const sk = document.createElement('button'); sk.textContent = 'Sin Incentivos'; sk.onclick = ()=>{ log('💰 INCENTIVOS: sin compras en este partido.'); i.sub='summary'; incCommit(); }; actions.appendChild(sk);
    return;
  }
  if(i.sub==='buyHigh' || i.sub==='buyLow'){
    const team = i.sub==='buyHigh' ? i.high : (i.high==='A' ? 'B' : 'A');
    const tot = incCartTotal(team), b = incBudget(team);
    const over = tot > b.total;
    h += '<div class="inc-buyer" style="background:' + tokenColorFor({team}) + '; color:' + textColorFor({team}) + ';">🛒 COMPRA: ' + teamName(team).toUpperCase() + (i.sub==='buyHigh' ? ' (mayor VAE — gasta de su Tesorería)' : ' (menor VAE — efectivo + máx. 50.000 de Tesorería)') + '</div>';
    h += '<div class="pm-note">' + (i.sub==='buyHigh'
      ? 'Tesorería: <b>' + fmtMO(i.tre[team]) + '</b>'
      : 'Efectivo: <b>' + fmtMO(i.cash) + '</b> + Tesorería permitida: <b>' + fmtMO(b.treAllow) + '</b> = presupuesto <b>' + fmtMO(b.total) + '</b>') +
      ' · Gasto: <b class="' + (over ? 'inc-bad' : '') + '">' + fmtMO(tot) + '</b></div>';
    h += '<div class="inc-list">';
    INC_ITEMS.forEach(it=>{
      const av = incAvail(team, it), n = i.cart[team][it.key] || 0, c = incCost(team, it);
      const noFunds = tot + c > b.total;
      const canAdd = av.ok && n<it.max && !noFunds;
      const greyed = !av.ok || (n===0 && noFunds);
      h += '<div class="inc-row' + (greyed ? ' off' : '') + '"><span class="inc-name">' + (it.icon ? '<span class="gold-icon" style="--icon:url(\'icons/' + it.icon + '\')"></span>' : '') + it.name + ' <small>(0-' + it.max + ' · ' + fmtMO(c) + ')</small>' + (av.ok ? '' : '<small class="inc-bad"> — ' + av.why + '</small>') + '</span>' +
        '<span class="inc-qty"><button onclick="incSetQty(\'' + team + '\',\'' + it.key + '\',-1)" ' + (av.ok && n>0 ? '' : 'disabled') + '>−</button><b class="mono">' + n + '</b><button onclick="incSetQty(\'' + team + '\',\'' + it.key + '\',1)" ' + (canAdd ? '' : 'disabled') + '>+</button></span></div>';
    });
    h += '</div>';
    body.innerHTML = h;
    okBtn(b.total<=0 ? (i.sub==='buyHigh' ? 'Sin tesorería disponible - Continuar' : 'Sin presupuesto disponible - Continuar') : over ? 'Presupuesto superado' : (tot===0 ? 'No comprar nada' : 'Confirmar compra (' + fmtMO(tot) + ')'), ()=>incConfirm(team), over);
    return;
  }
  if(i.sub==='despPre'){
    h += '<div class="pm-note">📜 Medidas desesperadas previas a la patada inicial</div><div class="inc-list">';
    let pend = 0;
    ['A','B'].forEach(t=>{
      const other = t==='A' ? 'B' : 'A';
      i.desp[t].forEach((d, idx)=>{
        if(d.n!==1 && d.n!==3) return;
        const tgt = players.find(x=>x.id===d.target);
        let ctl;
        if(d.done){ ctl = '<small>→ #' + (tgt ? tgt.num + ' ' + tgt.name : '—') + (d.n===1 ? ' (' + (d.stat==='ag' ? 'AG' : 'FU') + ' +1)' : '') + '</small>'; }
        else {
          pend++;
          const pool = d.n===1 ? incPlayingPlayers(t) : incPlayingPlayers(other);
          ctl = '<select id="despSel_' + t + '_' + idx + '">' + pool.map(p=>'<option value="' + p.id + '">#' + p.num + ' ' + p.name + '</option>').join('') + '</select> ' +
            (d.n===1 ? '<select id="despStat_' + t + '_' + idx + '"><option value="st">+1 FU</option><option value="ag">+1 AG</option></select> ' : '') +
            '<button onclick="despPreApply(\'' + t + '\',' + idx + ')">Aplicar</button>';
        }
        h += '<div class="inc-pray" style="border-left:4px solid ' + tokenColorFor({team:t}) + '"><div><b>' + teamName(t) + ' — ' + d.n + ' ' + DESPERATE[d.n].split(' — ')[0] + '</b></div><div class="inc-desc">' + (d.n===1 ? 'Elige un jugador de tu equipo y la característica (FU o AG).' : 'Elige un jugador RIVAL: no podrá jugar la primera entrada.') + '</div><div>' + ctl + '</div></div>';
      });
    });
    h += '</div>';
    body.innerHTML = h;
    okBtn(pend ? 'Faltan medidas por aplicar' : 'OK → Sorteo de patada', preMatchNext, pend>0);
    return;
  }
  if(i.sub==='prayers'){
    h += '<div class="pm-note">🙏 Plegarias a Nuffle (D8 automático; duran hasta el final del partido)</div><div class="inc-list">';
    let pending = 0;
    ['A','B'].forEach(t=>{
      i.prayers[t].forEach((pr, idx)=>{
        const def = PRAYERS[pr.n]; if(!def) return;
        const tgt = players.find(x=>x.id===pr.target);
        let ctl = '';
        if(!pr.done){
          pending++;
          if(def.mode==='pick'){
            ctl = '<select id="incSel_' + t + '_' + idx + '">' + incPlayingPlayers(t).map(p=>'<option value="' + p.id + '">#' + p.num + ' ' + p.name + '</option>').join('') + '</select> <button onclick="incPrayerPick(\'' + t + '\',' + idx + ')">Aplicar</button>';
          } else if(def.mode==='randomPick'){
            ctl = '<b>' + (tgt ? '#' + tgt.num + ' ' + tgt.name : '—') + '</b> <input type="text" id="incTxt_' + t + '_' + idx + '" placeholder="Habilidad Primaria elegida"> <button onclick="incPrayerPick(\'' + t + '\',' + idx + ')">Aplicar</button>';
          }
        } else {
          ctl = tgt ? '<small>→ #' + tgt.num + ' ' + tgt.name + '</small>' : '<small>registrada</small>';
        }
        h += '<div class="inc-pray" style="border-left:4px solid ' + tokenColorFor({team:t}) + '"><div><b>' + teamName(t) + ' — ' + pr.n + ' ' + def.name + '</b></div><div class="inc-desc">' + def.desc + '</div><div>' + ctl + '</div></div>';
      });
    });
    h += '</div>';
    ['A','B'].forEach(t=>{ i.desp[t].forEach(d=>{ h += '<div class="inc-desc" style="margin-top:6px;">📜 Medida desesperada de ' + teamName(t) + ' (' + d.n + '): ' + DESPERATE[d.n] + '</div>'; }); });
    body.innerHTML = h;
    okBtn(pending ? 'Faltan plegarias por aplicar' : 'OK → Sorteo de patada', incAfterPrayers, pending>0);
    return;
  }
  // summary / done
  const lines = [];
  ['A','B'].forEach(t=>{
    const inc = teamInc[t] || {};
    const bits = INC_ITEMS.filter(it=>inc[it.key]>0 && it.key!=='prayers').map(it=>inc[it.key] + '× ' + it.name);
    lines.push('<div><b>' + teamName(t) + ':</b> ' + (bits.join(', ') || 'sin Incentivos') + '</div>');
  });
  h += '<div class="pm-note" style="text-align:left;">' + lines.join('') + '</div>';
  ['A','B'].forEach(t=>{ i.desp[t].forEach(d=>{ h += '<div class="inc-desc">📜 Medida desesperada de ' + teamName(t) + ' (' + d.n + '): ' + DESPERATE[d.n] + '</div>'; }); });
  body.innerHTML = h;
  okBtn('OK → Sorteo de patada', incAfterPrayers);
}

function renderPreMatch(){
  const modal = document.getElementById('preMatchModal');
  if(!modal) return;
  const step = preMatch.step;
  const inProgress = (step==='fans' || step==='weather' || step==='inducements' || step==='coin');
  modal.classList.toggle('show', inProgress && !!preMatch.open);
  const title = document.getElementById('preMatchTitle');
  const body = document.getElementById('preMatchBody');
  const actions = document.getElementById('preMatchActions');
  const dieFace = (v, six)=>'<div class="die-face"' + (six ? ' data-d6="' + v + '"' : '') + '>' + v + '</div>';
  const nameOf = (t)=> teamName(t);
  actions.innerHTML = '';
  const okBtn = (label, fn)=>{ const b = document.createElement('button'); b.className='primary'; b.textContent=label; b.onclick=fn; actions.appendChild(b); };
  if(step==='fans'){
    title.textContent = '📣 HINCHAS';
    body.innerHTML = '<div class="pm-dice">' + ['A','B'].map(t=>
      '<div class="pm-team"><div class="pm-name">' + nameOf(t) + '</div>' + dieFace(preMatch.fanDie[t]) +
      '<div class="pm-sum">' + preMatch.fanDie[t] + ' + ' + preMatch.fanFactor[t] + ' = <b>' + preMatch.fanTotal[t] + '</b></div></div>').join('') + '</div>' +
      '<div class="pm-note">Dado D3 + Factor de hinchas. El total queda guardado junto a las Rerolls.</div>';
    okBtn('OK → Clima', preMatchNext);
  } else if(step==='weather'){
    const w = WEATHER_TABLE[preMatch.weather] || WEATHER_TABLE.perfecto;
    title.textContent = '🌦️ CLIMA';
    body.innerHTML = '<div class="pm-dice">' + dieFace(preMatch.wDie.a, true) + dieFace(preMatch.wDie.b, true) + '</div>' +
      '<div class="pm-note">Suma: <b style="color:var(--gold)">' + (preMatch.wDie.a + preMatch.wDie.b) + '</b></div>' +
      '<div class="pm-weather"><span class="gold-icon lg" style="--icon:url(\'icons/' + w.icon + '\')"></span>' +
      '<div class="pm-wname">' + w.name + '</div><div class="pm-wdesc">' + w.desc + '</div></div>';
    okBtn('OK', preMatchNext);
  } else if(step==='inducements'){
    title.textContent = '💰 INCENTIVOS';
    renderIncentives(body, actions);
  } else if(step==='coin'){
    title.textContent = '🪙 SORTEO DE PATADA';
    body.innerHTML = '<div class="pm-dice">' + ['A','B'].map(t=>
      '<div class="pm-team"><div class="pm-name">' + nameOf(t) + '</div>' + dieFace(preMatch.coinDie[t], true) + '</div>').join('') + '</div>' +
      '<div class="pm-note">🏆 Gana <b style="color:var(--gold)">' + nameOf(preMatch.coinWinner) + '</b>. ¿Quién patea en la 1ª mitad? (en la 2ª patea el otro equipo)</div>';
    ['A','B'].forEach(t=>{
      const b = document.createElement('button'); b.className = (t===preMatch.coinWinner ? 'primary' : '');
      b.textContent = 'Patea ' + nameOf(t); b.onclick = ()=>preMatchChooseKicker(t); actions.appendChild(b);
    });
  }
  { const m = modal.querySelector('.modal'); if(m) m.classList.toggle('wide', step==='inducements'); }
  renderSetupPanelPreMatch();
  renderPreMatchBadges();
  try{ tintModal(modal); }catch(e){}
}

function renderSetupPanelPreMatch(){
  const startRow = document.getElementById('preMatchStartRow');
  const kickRow = document.getElementById('setupKickRow');
  const sel = document.getElementById('kickSelect');
  if(!startRow || !kickRow || !sel) return;
  const step = preMatch.step;
  if(openingKickoffDone){ startRow.style.display='none'; kickRow.style.display=''; return; }
  if(step==='done'){
    startRow.style.display='none'; kickRow.style.display='';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  startRow.style.display='block'; kickRow.style.display='none';
  const idle = (step==='idle');
  document.getElementById('preMatchStartBtn').textContent = idle ? '🎬 Empezar secuencia anterior a partido' : '▶ Continuar secuencia previa';
  document.getElementById('preMatchStartNote').style.display = idle ? '' : 'none';
  document.getElementById('preMatchSkipBtn').style.display = idle ? '' : 'none';
}

function renderPreMatchBadges(){
  ['A','B'].forEach(t=>{
    const box = document.getElementById('sbFans'+t);
    if(!box) return;
    box.classList.toggle('hidden', !preMatch.fanRolled);
    if(preMatch.fanRolled){
      const tip = 'Fans: D3 ' + preMatch.fanDie[t] + ' + Factor ' + preMatch.fanFactor[t] + ' = ' + preMatch.fanTotal[t];
      document.getElementById('sbFansVal'+t).textContent = preMatch.fanTotal[t];
      box.querySelectorAll('.sb-fans-icon,.sb-fans-val').forEach(el=>{ el.title = tip; });
    }
  });
  const wEl = document.getElementById('sbWeather');
  if(wEl){
    const w = WEATHER_TABLE[weatherKind()];
    if(w){
      wEl.style.display = 'inline-block';
      const ic = document.getElementById('sbWeatherIcon');
      ic.style.setProperty('--icon', "url('icons/" + w.icon + "')");
      wEl.title = w.name + ' — ' + w.desc;
    } else wEl.style.display = 'none';
  }
}

// Calor asfixiante: al final de cada entrada, 1D3 jugadores por equipo (de los que acaban en el campo) pasan a Reservas y no pueden colocarse en la siguiente entrada.
function applyHeatAtDriveEnd(){
  if(weatherKind()!=='calor') return;
  const retired = ['ko','injured','injuredGrave','dead','expelled'];
  ['A','B'].forEach(team=>{
    const d = rollDieN(3);
    const pool = players.filter(p=>p.team===team && p.onPitch && !retired.includes(p.condition));
    for(let i=pool.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [pool[i],pool[j]] = [pool[j],pool[i]]; }
    const picked = pool.slice(0, d);
    picked.forEach(p=>{ p.heatRest = true; });
    log('🥵 Calor asfixiante — ' + teamName(team) + ': D3=' + d + (picked.length ? ' → a Reservas (no se pueden colocar en la siguiente entrada): ' + picked.map(p=>'#'+p.num+' '+p.name).join(', ') : ' (no había jugadores en el campo).'));
  });
}

// Solitario (X+): para gastar una reroll de equipo hay que tirar 1D6; con X+ se repite, si no la reroll se pierde.
function lonerBlocksReroll(p){
  if(!p || !playerHasSkill(p, 'solitario', 'loner')) return false;
  const sk = (p.skills||[]).map(normalizeSkillText).find(s=>s.includes('solitario') || s.includes('loner'));
  const m = sk && sk.match(/(\d)\s*\+/);
  const need = m ? parseInt(m[1],10) : 4;
  const r = rollDieN(6);
  const ok = r>=need;
  log('🎲 Solitario (' + need + '+) de ' + p.name + ': ' + r + (ok ? ' — puede repetir la tirada.' : ' — NO puede repetir. La reroll se gasta igualmente.'));
  return !ok;
}

// ---------- Setup / placement (pre-turn) ----------
function placeOnPitch(id){
  if(phase!=='setup'){
    alert('Solo se puede colocar/mover jugadores desde el banquillo durante la Fase de colocación (antes de la entrada, o justo después de un touchdown).');
    return;
  }
  const hp = players.find(x=>x.id===id);
  if(hp && hp.heatRest){ updateStatus(hp.name + (hp.resaca ? ' tiene Resaca y no puede jugar la primera entrada.' : ' descansa por el Calor Asfixiante y no puede colocarse en esta entrada.')); return; }
  placing = id;
  const p = players.find(x=>x.id===id);
  renderRosters(); renderPitch();
  updateStatus('Click en una casilla dorada de vuestra mitad para colocar a ' + p.name + '.');
}

function isLegalSetupCell(team, r, c){
  if(c===0 || c===COLS-1) return false;
  const inOwnHalf = team==='A' ? (c>=1 && c<=LOS_A) : (c>=LOS_B && c<=COLS-2);
  if(!inOwnHalf) return false;
  if(occupiedBy(r,c)) return false;
  const inTopWide = r<=1, inBottomWide = r>=9;
  if(inTopWide || inBottomWide){
    const zoneCount = players.filter(p=>p.onPitch && p.team===team &&
      (inTopWide ? p.row<=1 : p.row>=9)).length;
    if(zoneCount>=1) return false;
  }
  return true;
}

function onKickChange(){
  onKickChangeQuiet();
  broadcastState();
}
function onKickChangeQuiet(){
  const k = document.getElementById('kickSelect').value;
  const rcv = k==='A' ? 'B':'A';
  document.getElementById('setupHint').textContent = 'Recibe: ' + teamName(rcv);
}

function checkLosMinimums(){
  const problems = [];
  ['A','B'].forEach(team=>{
    const losCol = team==='A' ? LOS_A : LOS_B;
    const count = players.filter(p=>p.onPitch && p.team===team && p.col===losCol && p.row>=2 && p.row<=8).length;
    if(count < 3) problems.push({ team, count });
  });
  return problems;
}

function startDrive(){
  if(!openingKickoffDone && preMatch.step!=='done'){ showInfoModal('Secuencia previa', 'Completad primero la secuencia anterior a partido.'); return; }
  const problems = checkLosMinimums();
  if(problems.length){
    const lines = problems.map(pr => `${teamName(pr.team)}: solo ${pr.count} de 3 jugadores mínimos en su línea de scrimmage (casillas centrales).`);
    document.getElementById('losWarningText').innerHTML = lines.join('<br>');
    document.getElementById('losWarningModal').classList.add('show');
    return;
  }
  {
    const outC = ['ko','injured','injuredGrave','dead','expelled'];
    const missingCap = players.filter(p=>isCaptain(p) && !p.onPitch && !p.heatRest && !outC.includes(p.condition));
    if(missingCap.length){
      showInfoModal('Capitán sin desplegar', 'El Capitán debe estar en el campo siempre que sea posible: ' + missingCap.map(p=>p.name + ' (' + teamName(p.team) + ')').join(', ') + '. Colocadlo antes de iniciar la entrada.');
      return;
    }
  }
  players.forEach(p=>{ p.heatRest = false; p.resaca = false; }); // los descansados por calor ya no pueden colocarse esta entrada: se liberan
  const kicking = document.getElementById('kickSelect').value;
  const receiving = kicking==='A' ? 'B':'A';
  if(!openingKickoffDone){
    firstHalfKickingTeam = kicking;
    openingKickoffDone = true;
    const sel = document.getElementById('kickSelect');
    sel.disabled = true;
    document.getElementById('setupHint').textContent += ' (elección fija para el resto del partido)';
    resetRerollsForNewHalf();
  }
  phase='live';
  placing=null; selected=null;
  document.getElementById('setupPanel').style.display='none';
  beginKickPlacement(kicking, receiving);
}

function updateKickSelectLabels(){
  const sel = document.getElementById('kickSelect');
  if(sel.options[0]) sel.options[0].textContent = teamName('A');
  if(sel.options[1]) sel.options[1].textContent = teamName('B');
}

function showSetupPanel(){
  document.getElementById('setupPanel').style.display='block';
  updateKickSelectLabels();
  onKickChangeQuiet();
  renderSetupPanelPreMatch();
}

// ---------- Pitch rendering ----------
function shadeColor(hex, percent){
  const h = (hex || '').replace('#','');
  let r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  if(isNaN(r)||isNaN(g)||isNaN(b)) return hex;
  r = Math.max(0,Math.min(255, Math.round(r + (percent/100)*255)));
  g = Math.max(0,Math.min(255, Math.round(g + (percent/100)*255)));
  b = Math.max(0,Math.min(255, Math.round(b + (percent/100)*255)));
  return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function cellClass(row,col){
  let cls = ['cell'];
  const isWide = (row<=1 || row>=9);
  const isEndzoneA = (col===0);
  const isEndzoneB = (col===COLS-1);
  if(isEndzoneA) cls.push('endzone-a');
  else if(isEndzoneB) cls.push('endzone-b');
  else if(isWide) cls.push('wide');
  if(!isEndzoneA && !isEndzoneB){ if(row===1) cls.push('band-edge-b'); else if(row===9) cls.push('band-edge-t'); }  // línea que limita las bandas (2 casillas)
  else cls.push(((row+col)%2===0)?'alt':'');
  if(col===LOS_A || col===LOS_B) cls.push('los');
  return cls.filter(Boolean).join(' ');
}

function occupiedBy(r,c){
  return players.find(p=>p.onPitch && p.row===r && p.col===c);
}

function maxGfiFor(p){
  return playerHasSkill(p, 'esprintar', 'sprint') ? 3 : 2;
}

function moveMode(p){
  if(p.condition!=='standing') return null;
  if((p.remainingMove ?? p.ma) >= 1) return 'normal';
  if((p.gfiUsed ?? 0) < maxGfiFor(p)) return 'gfi';
  return null;
}

function inAdjacentReach(p,r,c){
  if(p.row===null || p.condition!=='standing') return false;
  const dist = Math.max(Math.abs(p.row-r), Math.abs(p.col-c));
  if(dist!==1 || p.team!==state.active || p.activated) return false;
  return moveMode(p) !== null;
}

function isInOpponentTackleZone(r,c,team){
  return players.some(p2 => p2.onPitch && p2.team!==team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-r), Math.abs(p2.col-c))===1);
}

function renderPitch(){
  if(!Array.isArray(players)){ console.error('[BB7] renderPitch: players inválido, reparado.'); players=[]; }
  if(!ball || typeof ball!=='object'){ console.error('[BB7] renderPitch: ball inválido, reparado.'); ball={carrierId:null,row:null,col:null}; }
  const pitch = document.getElementById('pitch');
  pitch.innerHTML='';
  const posMap = {};
  players.filter(p=>p.onPitch).forEach(p=> posMap[p.row+'_'+p.col]=p );

  const passOriginPlayer = (phase==='live' && selected!==null && declaredAction==='pass')
    ? players.find(x=>x.id===selected) : null;
  const passZoneNeighbor = (r,c)=>{
    if(r<0||r>=ROWS||c<0||c>=COLS) return -2;
    return passRangeZone(r-passOriginPlayer.row, c-passOriginPlayer.col);
  };

  const tzSel = (showTackleZones && phase==='live' && selected!==null) ? players.find(x=>x.id===selected && x.onPitch) : null;
  const tzMap = tzSel ? tackleZoneCountMap(tzSel) : null;

  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = document.createElement('div');
      cell.className = cellClass(r,c);
      if(trapdoorActive() && isTrapCell(r,c)){
        cell.classList.add('trapdoor-cell');
        const tdi = document.createElement('span'); tdi.className = 'trapdoor-ico'; tdi.title = 'Trampilla traicionera'; cell.appendChild(tdi);
      }
      if(tzMap){
        const e = tzMap[r+'_'+c];
        if(e && !posMap[r+'_'+c]){
          cell.classList.add('tz-cell');
          cell.style.setProperty('--tz-a', e.flat ? (1 - Math.pow(1-0.14, Math.min(e.flat,5))).toFixed(3) : '0');
          if(e.tail){
            cell.classList.add('tz-tail');
            cell.style.setProperty('--tz-t', (1 - Math.pow(1-0.30, Math.min(e.tail,4))).toFixed(3));
          }
        }
      }
      if(passOriginPlayer){
        const z = passRangeZone(r-passOriginPlayer.row, c-passOriginPlayer.col);
        if(z!==-1){
          const color = PASS_ZONE_COLORS[z];
          const isOwnOuterEdge = (nz)=> nz>z || nz===-1 || nz===-2;
          if(isOwnOuterEdge(passZoneNeighbor(r-1,c))) cell.style.borderTop = '3px solid ' + color;
          if(isOwnOuterEdge(passZoneNeighbor(r+1,c))) cell.style.borderBottom = '3px solid ' + color;
          if(isOwnOuterEdge(passZoneNeighbor(r,c-1))) cell.style.borderLeft = '3px solid ' + color;
          if(isOwnOuterEdge(passZoneNeighbor(r,c+1))) cell.style.borderRight = '3px solid ' + color;
        }
      }
      if(customColorsEnabled){
        if(c===0 && effColor('A')){
          const base = effColor('A'), dark = shadeColor(base, -20);
          cell.style.background = `repeating-linear-gradient(135deg, ${base}, ${base} 6px, ${dark} 6px, ${dark} 12px)`;
        } else if(c===COLS-1 && effColor('B')){
          const base = effColor('B'), dark = shadeColor(base, -20);
          cell.style.background = `repeating-linear-gradient(135deg, ${base}, ${base} 6px, ${dark} 6px, ${dark} 12px)`;
        }
      }

      let highlightable = false;
      const kickoffBoardTarget = isKickoffBoardTargetCell(r,c);
      let highlightGfi = false;
      let highlightBounce = false;
      let highlightKickZone = false;
      let highlightPush = false;
      let highlightPushFree = false;
      if(kickoffBoardTarget){
        highlightable = true;
      } else if(pendingKickPlacement){
        if(isValidKickPlacementCell(r,c)){ highlightable = true; highlightKickZone = true; }
      } else if(kickoffBounceStep){
        if(isValidKickoffBounceCell(r,c)){ highlightable = true; highlightBounce = true; }
      } else if(ballBounceActive){
        if(isValidBounceCell(r,c)){ highlightable = true; highlightBounce = true; }
      } else if(pendingPush){
        const defender = players.find(x=>x.id===pendingPush.defenderId);
        const freeActive = isFreePushActive(pendingPush);
        if(defender && isValidPushCell(defender, r, c, pendingPush.offsets, freeActive)){
          highlightable = true;
          highlightPush = true;
          highlightPushFree = freeActive;
        }
      } else if(phase==='live' && selected!==null && (declaredAction==='move' || declaredAction==='blitz' || declaredAction==='secureball' || declaredAction==='handoff' || declaredAction==='foul' || declaredAction==='pass')){
        const p = players.find(x=>x.id===selected);
        if(p && inAdjacentReach(p,r,c) && !occupiedBy(r,c)){
          highlightable = true;
          highlightGfi = moveMode(p) === 'gfi';
        }
      } else if(phase==='setup' && placing!==null){
        const p = players.find(x=>x.id===placing);
        if(p && isLegalSetupCell(p.team,r,c)) highlightable = true;
      }
      if(highlightable) cell.classList.add(highlightKickZone ? 'kick-zone' : (highlightPush ? (highlightPushFree ? 'push-option-free' : 'push-option') : (highlightBounce ? 'bounce-target' : (highlightGfi ? 'reachable-gfi' : 'reachable'))));
      if(pendingInterceptionChoice){
        const occHere = posMap[r+'_'+c];
        if(occHere && pendingInterceptionChoice.candidateIds.includes(occHere.id)){
          cell.classList.add('intercept-cell');
        }
      }
      if(phase==='live' && remoteSelected!==null && remoteSelected!==selected && (remoteDeclaredAction==='move' || remoteDeclaredAction==='blitz' || remoteDeclaredAction==='secureball' || remoteDeclaredAction==='handoff')){
        const rp = players.find(x=>x.id===remoteSelected);
        if(rp && inAdjacentReach(rp,r,c) && !occupiedBy(r,c)){
          cell.classList.add('reachable-remote');
        }
      }
      if(highlightBounce && ball.row!==null){
        const num = bounceDirectionNumber(ball.row, ball.col, r, c);
        if(num) cell.dataset.bnum = num;
      }

      cell.onclick = ()=> cellClicked(r,c);

      const occ = posMap[r+'_'+c];
      if(occ && occ.rooted){ cell.classList.add('rooted-cell'); }
      if(occ){
        const t = document.createElement('div');
        const condClass = occ.condition==='tumbado' ? ' tumbado' : occ.condition==='aturdido' ? ' aturdido' : occ.condition==='despistado' ? ' despistado' : '';
        const targetClass = isValidBlockTarget(occ.id) ? ' block-target' : '';
        const handoffClass = isValidHandoffTarget(occ.id) ? ' handoff-target' : '';
        const foulClass = isValidFoulTarget(occ.id) ? ' foul-target' : '';
        const apunalarClass = isValidApunalarTarget(occ.id) ? ' apunalar-target' : '';
        const ferocityClass = isValidFerocityTarget(occ.id) ? ' ferocity-target' : '';
        const interceptClass = isValidInterceptTarget(occ.id) ? ' intercept-target' : '';
        const heroicReceptionClass = isValidHeroicReceptionTarget(occ.id) ? ' heroic-reception-target' : '';
        const freeCatchClass = ((freeCatchTeam===occ.team && occ.onPitch && occ.condition==='standing') || isKickoffBoardCandidate(occ)) ? ' free-catch-target' : '';
        const showActivated = occ.activated && phase==='live' && occ.team===state.active;
        t.className = 'token' + ((occ.id===selected || (kickoffEvt && kickoffEvt.phase==='board' && kickoffEvt.sel===occ.id))?' selected':'') + (showActivated?' activated':'') + condClass + targetClass + handoffClass + foulClass + apunalarClass + ferocityClass + interceptClass + heroicReceptionClass + freeCatchClass;
        t.dataset.playerId = occ.id;
        t.style.background = tokenColorFor(occ);
        t.style.color = textColorFor(occ);
        if(occ.frog){ t.classList.add('frog'); t.style.setProperty('--frog-color', tokenColorFor(occ)); t.style.background = 'transparent'; t.style.color = '#fff'; }
        const posBorder = positionBorderColor(occ);
        if(posBorder) t.style.borderColor = posBorder;
        t.textContent = occ.num;
        const pitchExtra = 'MA restante ' + (occ.remainingMove ?? occ.ma) + '/' + occ.ma +
          ((occ.gfiUsed ?? 0) > 0 ? ' · A por ellos ' + occ.gfiUsed + '/' + maxGfiFor(occ) : '') +
          (occ.condition==='tumbado' ? ' · TUMBADO' : occ.condition==='aturdido' ? ' · ATURDIDO' : occ.condition==='despistado' ? ' · DESPISTADO' : '');
        t.title = playerTooltipText(occ, pitchExtra);
        if(occ.condition==='tumbado' || occ.condition==='aturdido' || occ.condition==='despistado'){
          const mark = document.createElement('div');
          mark.className = 'token-mark';
          mark.textContent = occ.condition==='tumbado' ? 'T' : occ.condition==='aturdido' ? 'A' : 'D';
          t.appendChild(mark);
        }
        if(ball.carrierId===occ.id){
          const dot = document.createElement('div');
          dot.className='carrier-dot';
          dot.title='Lleva el balón';
          dot.innerHTML = ballImgHtml();
          t.appendChild(dot);
        }
        if(isCaptain(occ)){
          const cb = document.createElement('div');
          cb.className = 'capitan-badge';
          cb.textContent = 'C';
          cb.title = 'Capitán (CAP: Profesional)';
          t.appendChild(cb);
        }
        { const pk = occ.prayerSkills || [];
          if(pk.some(x=>/apu[ñn]alar|stab/i.test(String(x)))){
            const dg = document.createElement('div'); dg.className = 'prayer-dagger'; dg.title = 'Puñal: Apuñalar hasta el final del partido';
            dg.innerHTML = '<span class="gold-icon" style="--icon:url(\'icons/daga.png\')"></span>'; t.appendChild(dg);
          }
          if(pk.some(x=>/golpe mort|mighty|nudiller/i.test(String(x)))){
            const kn = document.createElement('div'); kn.className = 'prayer-knuckles'; kn.title = 'Nudilleras: Golpe mortífero hasta el final del partido'; t.appendChild(kn);
          }
        }
        if(playerHasSkill(occ, 'veterano', 'veteran')){
          const star = document.createElement('div');
          star.className = 'veterano-star';
          star.title = 'Veterano';
          star.innerHTML = '<img src="icons/veterano.png" alt="Veterano" onerror="this.outerHTML=\'<span class=&quot;fallback-star&quot;>⭐</span>\'">';
          t.appendChild(star);
        }
        t.onclick=(e)=>{ e.stopPropagation(); tokenClicked(occ.id); };
        t.oncontextmenu=(e)=>{ e.preventDefault(); e.stopPropagation(); handleTokenRightClick(occ.id); return false; };
        cell.appendChild(t);
      }

      if(!ballInFlight && ball.carrierId===null && ball.row===r && ball.col===c){
        const looseBall = document.createElement('div');
        looseBall.className = 'loose-ball';
        looseBall.innerHTML = ballImgHtml();
        looseBall.title = 'Balón suelto';
        cell.appendChild(looseBall);
      }

      if(kickoffTargetRow===r && kickoffTargetCol===c){
        const crosshair = document.createElement('div');
        crosshair.className = 'kickoff-target-marker';
        crosshair.title = 'Casilla objetivo de la patada';
        cell.appendChild(crosshair);
      }

      pitch.appendChild(cell);
    }
  }

  renderPushGhosts(pitch);
  renderBounceGhosts(pitch);
  renderEndzoneLabels(pitch);
}

function renderEndzoneLabels(pitch){
  ['A','B'].forEach(team=>{
    if(customColorsEnabled && !effColor(team)) return;
    const col = team==='A' ? 0 : COLS-1;
    const label = document.createElement('div');
    label.className = 'endzone-label' + (team==='B' ? ' endzone-label-flip' : '');
    label.style.left = (col*35) + 'px';
    label.style.height = (ROWS*35-1) + 'px';
    label.textContent = teamName(team);
    label.style.color = customColorsEnabled ? textColorFor({ team }) : '#fff';
    pitch.appendChild(label);
  });
}

function renderPushGhosts(pitch){
  if(!pendingPush) return;
  const mover = players.find(x=>x.id===pendingPush.defenderId);
  if(!mover) return;
  const targets = currentPushTargets(mover, pendingPush.offsets, isFreePushActive(pendingPush));
  targets.forEach(t=>{
    if(t.row>=0 && t.row<ROWS && t.col>=0 && t.col<COLS) return; // in-bounds, already handled as a normal cell
    const ghost = document.createElement('div');
    ghost.className = 'ghost-push-target';
    ghost.style.top = (t.row*35) + 'px';
    ghost.style.left = (t.col*35) + 'px';
    ghost.title = 'Empujar fuera del campo';
    ghost.onclick = (e)=>{ e.stopPropagation(); pushOutOfBounds(t.row, t.col); };
    pitch.appendChild(ghost);
  });
}

function renderBounceGhosts(pitch){
  if(!ballBounceActive) return;
  const pos = ballPosition();
  if(!pos) return;
  for(let dr=-1; dr<=1; dr++){
    for(let dc=-1; dc<=1; dc++){
      if(dr===0 && dc===0) continue;
      const r = pos.row+dr, c = pos.col+dc;
      if(r>=0 && r<ROWS && c>=0 && c<COLS) continue; // en el campo, ya es una casilla normal
      const ghost = document.createElement('div');
      ghost.className = 'ghost-push-target';
      ghost.style.top = (r*35) + 'px';
      ghost.style.left = (c*35) + 'px';
      ghost.title = 'El balón sale de banda (devolución automática)';
      ghost.onclick = (e)=>{ e.stopPropagation(); bounceOutOfBounds(r, c); };
      pitch.appendChild(ghost);
    }
  }
}

function bounceOutOfBounds(exitR, exitC){
  if(!ballBounceActive) return;
  const pos = ballPosition();
  ballBounceActive = false;
  document.getElementById('ballBouncePanel').style.display = 'none';
  log('🌀 El balón sale del campo — se resuelve la devolución automáticamente.');
  renderPitch();
  broadcastState();
  resolveThrowIn(exitR, exitC, pos.row, pos.col, 0);
}

function resolveThrowIn(exitR, exitC, fromR, fromC, depth){
  if(depth > 6){
    log('🏈 La devolución se detiene en el campo tras varios intentos.');
    ball.row = fromR; ball.col = fromC;
    renderPitch(); broadcastState();
    checkDriveStartAfterBounce();
    return;
  }
  const isCorner = (exitR<0 || exitR>=ROWS) && (exitC<0 || exitC>=COLS);
  const dieMax = isCorner ? 3 : 6;
  const dirRoll = Math.floor(Math.random()*dieMax)+1;
  const offsets = computePushOffsets(exitR, exitC, fromR, fromC);
  const idx = isCorner ? (dirRoll-1) : Math.floor((dirRoll-1)/2);
  const chosen = offsets[idx];
  const distRoll = Math.floor(Math.random()*6)+1;
  const distance = distRoll + 2; // reglas Sevens: 1D6+2 (en vez de 2D6)
  const landR = fromR + chosen.dr*distance;
  const landC = fromC + chosen.dc*distance;

  log('🎲 Devolución' + (isCorner ? ' de esquina (1D3)' : ' (1D6)') + ': tirada ' + dirRoll + ' → dirección ' + (idx+1) + '/3. Distancia 1D6+2: ' + distRoll + '+2 = ' + distance + ' casillas.');

  if(landR<0 || landR>=ROWS || landC<0 || landC>=COLS){
    log('🌀 La devolución vuelve a salir del campo — se repite el procedimiento.');
    const clampR = Math.max(0, Math.min(ROWS-1, landR));
    const clampC = Math.max(0, Math.min(COLS-1, landC));
    resolveThrowIn(landR, landC, clampR, clampC, depth+1);
    return;
  }

  ball.row = landR; ball.col = landC;
  renderPitch();
  broadcastState();

  const occ = occupiedBy(landR, landC);
  if(occ && occ.condition==='standing'){
    log('🏈 La devolución aterriza sobre ' + occ.name + '.');
    openCatchModal(occ, false, false, 1, 'devolución');
  } else if(occ){
    log('🏈 La devolución aterriza sobre ' + occ.name + ' (' + occ.condition + ') y sigue botando.');
    startBallBounce();
  } else if(offerHeroicReception(landR, landC, 'throwin', {})){
    // el flujo continúa cuando el Entrenador decida (attemptHeroicReception / declineHeroicReception)
  } else {
    log('🏈 La devolución queda suelta en el campo.');
    checkDriveStartAfterBounce();
  }
}

function handlePitchRightClick(e){
  e.preventDefault();
  if(phase==='live' && selected!==null && !anyModalOpen()){
    handleTokenRightClick(selected);
  }
  return false;
}

function handleTokenRightClick(id){
  if(phase!=='live' || anyModalOpen()) return;
  const p = players.find(x=>x.id===id);
  if(!p || p.team!==state.active) return;
  if(selected===id && ball.carrierId===id && declaredAction==='pass'){
    passThrowWheelActive = true;
    pendingActionMenuPlayer = id;
    renderActionMenu();
    renderSelInfo();
    broadcastState();
    return;
  }
  if(selected===id && ball.carrierId===id &&
     (declaredAction==='move' || declaredAction==='blitz' || declaredAction==='handoff') &&
     playerHasSkill(p, 'dejada')){
    dejadaWheelActive = true;
    pendingActionMenuPlayer = id;
    renderActionMenu();
    renderSelInfo();
    broadcastState();
    return;
  }
  if(p.activated && p.condition!=='tumbado' && p.condition!=='aturdido' && p.condition!=='despistado') return;
  selected = id;
  const hasMoved = ((p.remainingMove ?? p.ma) !== p.ma || (p.gfiUsed ?? 0) > 0) && !p.justStoodThisActivation;
  if(!p.activated && (p.condition==='standing' || p.condition==='despistado') && !p.blockedThisActivation && !hasMoved){
    openActionMenu(id);
  } else if(!p.activated && p.condition==='tumbado'){
    openActionMenu(id);
  } else {
    endActivation(id);
  }
}

let pendingActionMenuPlayer = null;
let dejadaWheelActive = false;

// La lista de opciones se calcula al vuelo en getActionMenuOptionsFor() según el estado del jugador/partida.
// Añadir una opción nueva es añadir una línea de push() ahí — el racimo se reparte solo.

function openActionMenu(id){
  { const pp = players.find(x=>x.id===id);
    if(pp && despisteArmed[pp.team] && !despisteSt && !pp.activated && state.active===pp.team){
      despisteArmed[pp.team] = false;
      despisteSt = { id:pp.id, team:pp.team, stage:1, first:'', snap:{ blitz:blitzUsedByTeam[pp.team], pass:passUsedByTeam[pp.team], handoff:handoffUsedByTeam[pp.team], secure:secureBallUsedByTeam[pp.team], foul:foulUsedByTeam[pp.team] } };
      log('🎭 JUGAR AL DESPISTE: ' + pp.name + ' podrá declarar dos acciones.');
    }
  }
  pendingActionMenuPlayer = id;
  declaredAction = null;
  renderActionMenu();
  renderSelInfo();
  broadcastState();
}

function canSecureBall(p){
  if(isBigGuy(p)) return false;
  if(secureBallUsedByTeam[p.team]) return false;
  if(ball.carrierId!==null || ball.row===null) return false;
  const enemyNear = players.some(p2 => p2.onPitch && p2.team!==p.team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-ball.row), Math.abs(p2.col-ball.col)) <= 2);
  return !enemyNear;
}

function playerMoveReach(p){
  const remaining = p.remainingMove ?? p.ma;
  const gfiLeft = maxGfiFor(p) - (p.gfiUsed ?? 0);
  return remaining + Math.max(0, gfiLeft);
}

function canHandoff(p){
  if(handoffUsedByTeam[p.team]) return false;
  if(moveMode(p)===null) return false;
  const reach = playerMoveReach(p);
  if(ball.carrierId!==null){
    const carrier = players.find(x=>x.id===ball.carrierId);
    if(!carrier || carrier.team!==p.team) return false; // el balón lo tiene el equipo rival
    if(playerHasSkill(carrier, 'el balón es mío', 'el balon es mio', 'ball and chain')) return false; // nunca suelta el balón voluntariamente
    if(p.id===carrier.id){
      // El propio portador: necesita poder llegar junto a algún compañero en pie.
      return players.some(p2 => p2.onPitch && p2.id!==p.id && p2.team===p.team && p2.condition==='standing' &&
        Math.max(Math.abs(p2.row-p.row), Math.abs(p2.col-p.col)) <= reach+1);
    }
    // Un compañero (no portador): necesita poder llegar junto al portador.
    return Math.max(Math.abs(carrier.row-p.row), Math.abs(carrier.col-p.col)) <= reach+1;
  }
  // Balón suelto: hace falta poder llegar hasta él y, con el movimiento que quede, llegar además junto a un compañero.
  if(ball.row===null) return false;
  const distToBall = Math.max(Math.abs(ball.row-p.row), Math.abs(ball.col-p.col));
  if(distToBall > reach) return false;
  const remainingAfterBall = reach - distToBall;
  return players.some(p2 => p2.onPitch && p2.id!==p.id && p2.team===p.team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-ball.row), Math.abs(p2.col-ball.col)) <= remainingAfterBall+1);
}

const PASS_RANGE_LIMITS = [3, 6, 10, 13]; // rápido, corto, largo, bomba (casillas) — ya no se usa para calcular, solo de referencia
const PASS_ZONE_COLORS = ['#4caf50', '#ffd54f', '#ff9800', '#e53935'];
// Tabla exacta de la plantilla de pase (un cuarto: dr,dc de 0 a 14; el resto se obtiene por simetría de espejo).
// Cada carácter: V=rápido A=corto N=largo R=bomba F=fuera de alcance. Datos dados por el usuario, fila 0 = casilla del lanzador.
const PASS_RANGE_TABLE = [
  "VVVVAAANNNNRRRF",
  "VVVVAAANNNNRRRF",
  "VVVAAAANNNNRRRF",
  "VVAAAAANNNRRRFF",
  "AAAAAANNNNRRRFF",
  "AAAAANNNNRRRFFF",
  "AAAANNNNNRRRFFF",
  "NNNNNNNNRRRFFFF",
  "NNNNNNNRRRRFFFF",
  "NNNNNRRRRRFFFFF",
  "NNNRRRRRRFFFFFF",
  "RRRRRRRFFFFFFFF",
  "RRRRRFFFFFFFFFF",
  "RRRFFFFFFFFFFFF",
  "FFFFFFFFFFFFFFF"
];
const PASS_LETTER_TO_ZONE = { V:0, A:1, N:2, R:3, F:-1 };
function passRangeZone(dr, dc){
  const a = Math.min(Math.abs(dr), 14);
  const b = Math.min(Math.abs(dc), 14);
  const letter = PASS_RANGE_TABLE[a][b];
  const z = PASS_LETTER_TO_ZONE[letter];
  if(z>=2 && weatherKind()==='ventisca') return -1; // Ventisca: solo Pase Rápido o Corto
  return z;
}

function canPass(p){
  if(passUsedByTeam[p.team]) return false;
  if(moveMode(p)===null) return false;
  const reach = playerMoveReach(p);
  if(ball.carrierId!==null){
    if(ball.carrierId!==p.id) return false;
    return true;
  }
  if(ball.row===null) return false;
  return Math.max(Math.abs(ball.row-p.row), Math.abs(ball.col-p.col)) <= reach;
}

function canApunalar(p){
  if(!playerHasSkill(p, 'apuñalar', 'stab')) return false;
  return players.some(p2 => p2.onPitch && p2.team!==p.team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-p.row), Math.abs(p2.col-p.col))===1);
}

function canFoul(p){
  if(foulUsedByTeam[p.team]) return false;
  if(moveMode(p)===null) return false;
  const reach = playerMoveReach(p);
  return players.some(p2 => p2.onPitch && p2.team!==p.team && (p2.condition==='tumbado' || p2.condition==='aturdido') &&
    Math.max(Math.abs(p2.row-p.row), Math.abs(p2.col-p.col)) <= reach+1);
}

function getActionMenuOptionsFor(p){
  const opts = getActionMenuOptionsBase(p);
  if(despisteSt && despisteSt.stage===2 && despisteSt.id===p.id){
    const ban = ['actionMenuBlock','actionMenuApunalar','actionMenuStandApunalar'];
    if(despisteSt.first==='move') ban.push('actionMenuMove','actionMenuStandMove');
    return opts.filter(o=>!ban.includes(o.fn));
  }
  return opts;
}
function getActionMenuOptionsBase(p){
  if(kickoffEvt && kickoffEvt.phase==='charge'){
    const co = [{ icon:'🏃', label:'Movimiento', fn:'actionMenuMove' }];
    if(!blitzUsedByTeam[p.team]) co.push({ icon:'⚡', label:'Blitz', fn:'actionMenuBlitz' });
    co.push({ icon:'⏹', label:'Fin', fn:'actionMenuEndActivation' });
    return co;
  }
  if(dejadaWheelActive && ball.carrierId===p.id && playerHasSkill(p, 'dejada')){
    return [{ icon:'📍', label:'Dejada', fn:'actionMenuDejada' }];
  }
  if(passThrowWheelActive && ball.carrierId===p.id){
    return [{ icon:'🎯', label:'Lanzar Pase', fn:'actionMenuThrowPass' }];
  }
  if(p.condition==='tumbado'){
    // "Ruleta de Tumbados" — levantarse ya cuenta como activación, así que cada opción pasa por su propio chequeo de rasgo.
    const opts = [];
    opts.push({ icon:'🧍', label:'Levantar/Fin', fn:'actionMenuStandFin' });
    opts.push({ icon:'🏃', label:'Levantar/Mover', fn:'actionMenuStandMove' });
    if(!blitzUsedByTeam[p.team]) opts.push({ icon:'⚡', label:'Levantar/Blitz', fn:'actionMenuStandBlitz' });
    if(canSecureBall(p)) opts.push({ icon:'🔒', label:'Levantar/Asegurar', fn:'actionMenuStandSecureBall' });
    if(!handoffUsedByTeam[p.team]) opts.push({ icon:'🤝', label:'Levantar/Entrega', fn:'actionMenuStandHandoff' });
    if(!passUsedByTeam[p.team]) opts.push({ icon:'🎯', label:'Levantar/Pase', fn:'actionMenuStandPass' });
    opts.push({ icon:'🥊', label:'Levantar/Falta', fn:'actionMenuStandFoul' });
    if(canApunalar(p)){
      opts.push({ icon:'🔪', label:'Levantar/Apuñalar', fn:'actionMenuStandApunalar' });
    }
    if(playerHasSkill(p, 'salto', 'jump up')){
      opts.push({ icon:'🤸', label:'Salto+Placar', fn:'actionMenuJumpUp' });
    }
    return opts;
  }
  // "Ruleta" base (jugador en pie o despistado)
  const opts = [];
  if(!p.rooted){
    opts.push({ icon:'🏃', label:'Movimiento', fn:'actionMenuMove' });
    if(!blitzUsedByTeam[p.team]) opts.push({ icon:'⚡', label:'Blitz', fn:'actionMenuBlitz' });
  }
  opts.push({ icon:'⚔️', label:'Placar', fn:'actionMenuBlock' });
  if(canApunalar(p)){
    opts.push({ icon:'🔪', label:'Apuñalar', fn:'actionMenuApunalar' });
  }
  if(!p.rooted && canSecureBall(p)){
    opts.push({ icon:'🔒', label:'Asegurar', fn:'actionMenuSecureBall' });
  }
  if(!p.rooted && canHandoff(p)){
    opts.push({ icon:'🤝', label:'Entrega', fn:'actionMenuHandoff' });
  }
  if(!p.rooted && canPass(p)){
    opts.push({ icon:'🎯', label:'Pase', fn:'actionMenuPass' });
  }
  if(canFoul(p)){
    opts.push({ icon:'🥊', label:'Falta', fn:'actionMenuFoul' });
  }
  opts.push({ icon:'⏹', label:'Fin', fn:'actionMenuEndActivation', danger:true });
  return opts;
}

function renderActionMenu(){
  const old = document.getElementById('radialMenuContainer');
  if(old) old.remove();
  if(pendingActionMenuPlayer===null) return;
  const tokenEl = document.querySelector('.token[data-player-id="'+pendingActionMenuPlayer+'"]');
  if(!tokenEl) return;
  const p = players.find(x=>x.id===pendingActionMenuPlayer);
  if(!p) return;
  const rect = tokenEl.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  const radius = 66;
  const options = getActionMenuOptionsFor(p);
  const n = options.length;
  const container = document.createElement('div');
  container.id = 'radialMenuContainer';
  options.forEach((opt, i)=>{
    const angle = (2*Math.PI/n)*i - Math.PI/2;
    let x = cx + radius*Math.cos(angle);
    let y = cy + radius*Math.sin(angle);
    x = Math.max(30, Math.min(window.innerWidth-30, x));
    y = Math.max(30, Math.min(window.innerHeight-30, y));
    const btn = document.createElement('div');
    btn.className = 'radial-menu-btn' + (opt.danger ? ' danger' : '');
    btn.style.left = (x-28)+'px';
    btn.style.top = (y-28)+'px';
    btn.innerHTML = `<div class="rm-icon">${opt.icon}</div><div class="rm-label">${opt.label}</div>`;
    btn.onclick = (e)=>{ e.stopPropagation(); window[opt.fn](); };
    container.appendChild(btn);
  });
  document.body.appendChild(container);
}

function closeActionMenu(){
  const el = document.getElementById('radialMenuContainer');
  if(el) el.remove();
  pendingActionMenuPlayer = null;
  dejadaWheelActive = false;
  passThrowWheelActive = false;
  broadcastState();
}

document.addEventListener('click', (e)=>{
  const menu = document.getElementById('radialMenuContainer');
  if(menu && !menu.contains(e.target)){
    closeActionMenu();
  }
});

function actionMenuMove(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  runTraitCheckThen(p, 'move');
}

function actionMenuBlitz(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  blitzUsedByTeam[p.team] = true; // se gasta al declarar, aunque el chequeo de rasgo falle después
  log('⚡ ' + teamName(p.team) + ' declara su Blitz de este turno (' + p.name + ').');
  runTraitCheckThen(p, 'blitz');
}

function actionMenuBlock(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  runTraitCheckThen(p, 'block');
}

function actionMenuSecureBall(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  secureBallUsedByTeam[p.team] = true; // se gasta al declarar, aunque el chequeo de rasgo falle después
  log('🔒 ' + teamName(p.team) + ' declara su Asegurar Balón de este turno (' + p.name + ').');
  runTraitCheckThen(p, 'secureball');
}

function actionMenuPass(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  passUsedByTeam[p.team] = true; // se gasta al declarar, aunque el chequeo de rasgo falle después
  log('🎯 ' + teamName(p.team) + ' declara su Pase de este turno (' + p.name + ').');
  runTraitCheckThen(p, 'pass');
}

function actionMenuStandPass(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  passUsedByTeam[p.team] = true;
  log('🎯 ' + teamName(p.team) + ' declara su Pase de este turno (' + p.name + ', levantándose).');
  runTraitCheckThen(p, 'standpass');
}

function actionMenuHandoff(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  handoffUsedByTeam[p.team] = true; // se gasta al declarar, aunque el chequeo de rasgo falle después
  log('🤝 ' + teamName(p.team) + ' declara su Entrega de Balón de este turno (' + p.name + ').');
  runTraitCheckThen(p, 'handoff');
}

function actionMenuStandHandoff(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  handoffUsedByTeam[p.team] = true;
  log('🤝 ' + teamName(p.team) + ' declara su Entrega de Balón de este turno (' + p.name + ', levantándose).');
  runTraitCheckThen(p, 'standhandoff');
}

function actionMenuApunalar(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  declaredAction = 'apunalar';
  updateStatus(p.name + ' declara Apuñalar — elegid al rival adyacente (resaltado).');
  renderPitch(); renderSelInfo();
  broadcastState();
}

function actionMenuStandApunalar(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  standUp();
  selected = id;
  declaredAction = 'apunalar';
  updateStatus(p.name + ' declara Apuñalar — elegid al rival adyacente (resaltado).');
  renderPitch(); renderSelInfo();
  broadcastState();
}

function actionMenuFoul(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  foulUsedByTeam[p.team] = true; // se gasta al declarar, aunque el chequeo de rasgo falle después
  if(ajusteArmed[p.team]){ ajusteArmed[p.team] = false; ajusteFouler = p.id; log('🥊 AJUSTE DE CUENTAS: ' + p.name + ' no podrá ser Expulsado en esta Falta.'); }
  log('🥊 ' + teamName(p.team) + ' declara su Falta de este turno (' + p.name + ').');
  runTraitCheckThen(p, 'foul');
}

function actionMenuEndActivation(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  endActivation(id);
}

function actionMenuStandFin(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  runTraitCheckThen(p, 'standfin');
}

function actionMenuStandMove(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  runTraitCheckThen(p, 'standmove');
}

function actionMenuStandBlitz(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  blitzUsedByTeam[p.team] = true; // se gasta al declarar, aunque el chequeo de rasgo falle después
  log('⚡ ' + teamName(p.team) + ' declara su Blitz de este turno (' + p.name + ', levantándose).');
  runTraitCheckThen(p, 'standblitz');
}

function actionMenuStandSecureBall(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  secureBallUsedByTeam[p.team] = true; // se gasta al declarar, aunque el chequeo de rasgo falle después
  log('🔒 ' + teamName(p.team) + ' declara su Asegurar Balón de este turno (' + p.name + ', levantándose).');
  runTraitCheckThen(p, 'standsecureball');
}

function actionMenuStandFoul(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  selected = id;
  foulUsedByTeam[p.team] = true;
  if(ajusteArmed[p.team]){ ajusteArmed[p.team] = false; ajusteFouler = p.id; log('🥊 AJUSTE DE CUENTAS: ' + p.name + ' no podrá ser Expulsado en esta Falta.'); }
  log('🥊 ' + teamName(p.team) + ' declara su Falta de este turno (' + p.name + ', levantándose).');
  runTraitCheckThen(p, 'standfoul');
}

function actionMenuJumpUp(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  selected = id;
  jumpUpBlitzCheck();
}

function actionMenuThrowPass(){
  const id = pendingActionMenuPlayer;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p || ball.carrierId!==p.id) return;
  pendingPassTargetSelection = { passerId: p.id };
  updateStatus(p.name + ': elegid la casilla objetivo del pase (dentro del contorno de color)' +
    (playerHasSkill(p, 'pase a lo loco', 'hail mary pass') ? ' — o cualquier casilla del campo con Pase a lo loco.' : '.'));
  renderPitch(); renderSelInfo();
  broadcastState();
}

function actionMenuDejada(){
  const id = pendingActionMenuPlayer;
  const savedDeclaredAction = declaredAction;
  closeActionMenu();
  const p = players.find(x=>x.id===id);
  if(!p || ball.carrierId!==p.id) return;
  ball.carrierId = null;
  ball.row = p.row; ball.col = p.col;
  selected = id;
  declaredAction = savedDeclaredAction; // el jugador sigue su movimiento con normalidad
  log('📍 ' + p.name + ' usa Dejada — deja el balón en su casilla actual y sigue moviéndose. Sin cambio de turno.');
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
}

function unstickState(){
  // Cierra TODOS los modales (por si alguno se quedó marcado como abierto en el estado compartido)
  document.querySelectorAll('.modal-back').forEach(m=> m.classList.remove('show'));
  document.getElementById('turnoverOverlay').classList.remove('show');
  // Limpia todos los "pendientes" de chequeos/acciones en curso
  pendingDodge = null; dodgeRerollUsed = false;
  pendingGfi = null; gfiRerollUsed = false;
  pendingCatch = null; catchRerollUsed = false;
  pendingSecureBall = null; secureBallRerollUsed = false;
  activeBlock = null; blockTargeting = null; blockDiceRolled = false; currentBlockDiceIndices = [];
  pendingTraitCheck = null;
  pendingFerocityAttack = null;
  pendingAnimosity = null;
  pendingHailMaryChoice = null;
  pendingProvocarChoice = null; luchadorUsed = false; luchadorPickMode = false; blockProNote = '';
  pendingHeroicTackle = null;
  renderProvocarModal(); renderHeroicTackleModal();
  pendingBlitzStabChoice = null;
  pendingHandoffChoice = null;
  pendingFoulContext = null;
  pendingForcejearChoice = null;
  document.getElementById('forcejearModal').classList.remove('show');
  pendingVeteranoBlockChoice = null;
  document.getElementById('veteranoBlockModal').classList.remove('show');
  pendingPassTargetSelection = null;
  pendingPassRoll = null;
  pendingPassTurnoverMode = null;
  pendingPassOriginalTeam = null;
  passThrowWheelActive = false;
  document.getElementById('passModal').classList.remove('show');
  pendingInterceptionChoice = null;
  pendingInterceptionRoll = null;
  document.getElementById('interceptModal').classList.remove('show');
  document.getElementById('interceptChoicePanel').style.display = 'none';
  pendingManualStatus = null;
  armorForPlayer = null; pendingArmorQueue = [];
  golpeMortiferoUsedOnArmor = false;
  llaveDeBrazoUsedOnArmor = false;
  pendingApunalarContext = null;
  document.getElementById('regenRow').style.display = 'none';
  pendingRegenInjuryKind = null;
  pendingHeroicReception = null;
  document.getElementById('heroicReceptionPanel').style.display = 'none';
  pendingRobarBalonContinuation = null;
  pendingPush = null; chainPushStack = [];
  pendingFollowUp = null;
  freeCatchTeam = null;
  placingBallFree = false;
  pendingKickPlacement = false; kickoffBounceStep = false;
  ballBounceActive = false;
  ballInFlight = false;
  kickoffTargetRow = null; kickoffTargetCol = null;
  blitzActivePlayer = null;
  secureBallActivePlayer = null;
  pendingActionMenuPlayer = null;
  declaredAction = null;
  selected = null;
  const oldMenu = document.getElementById('radialMenuContainer');
  if(oldMenu) oldMenu.remove();
  log('🆘 Estado desatascado manualmente — modales cerrados y acciones pendientes canceladas.');
  refreshManualStatusButtons();
  renderRosters(); renderPitch(); renderScoreboard(); renderSelInfo();
  broadcastState();
}

function endActivation(id){
  const p = players.find(x=>x.id===id);
  if(!p) return;
  p.activated = true;
  selected = null;
  declaredAction = null;
  renderPitch(); renderRosters(); renderSelInfo();
  updateStatus(p.name + ' termina su activación.');
  broadcastState();
}

function cellClicked(r,c){
  if(wizardSt && (wizardSt.mode==='pickCell' || wizardSt.mode==='pickPlayer')){ wizardPickAt(r,c); return; }
  if(kickoffEvt && kickoffEvt.phase==='board'){ kickoffBoardCellClick(r,c); return; }
  if(pendingPassTargetSelection){
    const passer = players.find(x=>x.id===pendingPassTargetSelection.passerId);
    if(!passer){ pendingPassTargetSelection = null; broadcastState(); return; }
    handlePassTargetChosen(passer, r, c);
    return;
  }
  if(placingBallFree){
    placingBallFree = false;
    ball.carrierId = null;
    ball.row = r; ball.col = c;
    log('🏈 Balón colocado manualmente en el campo.');
    renderPitch();
    broadcastState();
    return;
  }
  if(pendingKickPlacement){
    if(isValidKickPlacementCell(r,c)){ placeKickBall(r,c); }
    return;
  }
  if(kickoffBounceStep){
    if(isValidKickoffBounceCell(r,c)){ resolveKickoffBounce(r,c); }
    return;
  }
  if(ballBounceActive){
    if(isValidBounceCell(r,c)){ resolveBounce(r,c); }
    return;
  }
  if(pendingPush){
    const defender = players.find(x=>x.id===pendingPush.defenderId);
    if(defender && isValidPushCell(defender, r, c, pendingPush.offsets, isFreePushActive(pendingPush))){ resolvePush(r,c); }
    return;
  }
  if(anyModalOpen()) return;

  if(phase==='setup'){
    if(placing===null) return;
    const p = players.find(x=>x.id===placing);
    if(!p) { placing=null; return; }
    if(!isLegalSetupCell(p.team,r,c)){
      alert('Casilla no válida: debe estar en vuestra mitad, fuera de la zona de anotación, y respetar el máx. de 1 jugador por zona lateral.');
      return;
    }
    const onPitchCount = players.filter(p2 => p2.team===p.team && p2.onPitch && p2.id!==p.id).length;
    if(onPitchCount>=7){
      showInfoModal('⚠️ CAMPO COMPLETO', 'Ya tenéis 7 jugadores de ' + teamName(p.team) + ' en el campo. Tenéis que quitar a uno antes de poder colocar a otro más.');
      placing = null;
      renderRosters(); renderPitch();
      broadcastState();
      return;
    }
    p.onPitch=true; p.row=r; p.col=c;
    placing=null;
    renderRosters(); renderPitch();
    updateStatus('Jugador colocado. Seguid colocando o pulsad "Iniciar Entrada".');
    broadcastState();
    return;
  }

  // live phase — step by step movement
  if(selected!==null && (declaredAction==='move' || declaredAction==='blitz' || declaredAction==='secureball' || declaredAction==='handoff' || declaredAction==='foul' || declaredAction==='pass')){
    const p = players.find(x=>x.id===selected);
    if(p && kickoffEvt && kickoffEvt.phase==='charge' && ball.carrierId===null && ball.row===r && ball.col===c && inAdjacentReach(p,r,c)){
      updateStatus('¡A la carga!: no se puede pisar la casilla donde va a caer el balón.');
      return;
    }
    if(p && inAdjacentReach(p,r,c) && !occupiedBy(r,c)){
      const fromR=p.row, fromC=p.col;
      const mode = moveMode(p);
      const tackle = isInOpponentTackleZone(fromR,fromC,p.team);
      if(mode==='gfi'){
        openGfiModal(p, r, c, tackle);
      } else if(tackle){
        openDodgeModal(p, r, c, false);
      } else {
        completeStep(p, r, c, 'normal');
      }
      return;
    }
  }
  selected=null; renderPitch(); renderSelInfo();
}

function completeStep(p, r, c, consume){
  p.previousRow = p.row; p.previousCol = p.col;
  p.row=r; p.col=c;
  if(consume==='gfi'){ p.gfiUsed = (p.gfiUsed ?? 0) + 1; }
  else if(consume==='normal'){ p.remainingMove = Math.max(0, (p.remainingMove ?? p.ma) - 1); }
  // consume==='none' → already accounted for by a prior chained check
  p.justStoodThisActivation = false;
  if(ball.carrierId===p.id){ checkTouchdown(p); }
  const activationEnding = moveMode(p)===null || pendingTD;
  if(activationEnding){
    p.activated = true;
    selected = null;
  }
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
  if(ball.carrierId===null && ball.row===r && ball.col===c && p.condition==='standing'){
    if(secureBallActivePlayer===p.id){
      secureBallActivePlayer = null;
      openSecureBallRoll(p);
    } else {
      openCatchModal(p, false, true);
    }
  }
}

function tokenClicked(id){
  if(wizardSt && (wizardSt.mode==='pickCell' || wizardSt.mode==='pickPlayer')){ const wp = players.find(x=>x.id===id); if(wp && wp.onPitch){ wizardPickAt(wp.row, wp.col); } return; }
  if(kickoffEvt && kickoffEvt.phase==='board'){ kickoffBoardTokenClick(id); return; }
  if(isValidInterceptTarget(id)){
    attemptInterception(id);
    return;
  }
  if(isValidHeroicReceptionTarget(id)){
    attemptHeroicReception(id);
    return;
  }
  if(pendingPassTargetSelection){
    const passer = players.find(x=>x.id===pendingPassTargetSelection.passerId);
    const target = players.find(x=>x.id===id);
    if(passer && target){
      handlePassTargetChosen(passer, target.row, target.col);
    }
    return;
  }
  if(pendingManualStatus!==null){
    applyManualStatus(id);
    return;
  }
  const p0 = players.find(x=>x.id===id);
  if(p0 && p0.onPitch && (placingBallFree || pendingKickPlacement || kickoffBounceStep || ballBounceActive || pendingPush)){
    cellClicked(p0.row, p0.col);
    return;
  }
  if(freeCatchTeam!==null){
    assignFreeCatch(id);
    return;
  }
  if(blockTargeting!==null){
    if(isValidBlockTarget(id)){ chooseBlockTarget(id); }
    return;
  }
  if(blitzActivePlayer!==null && isValidBlockTarget(id)){
    const blitzAttacker = players.find(x=>x.id===blitzActivePlayer);
    if(blitzAttacker && playerHasSkill(blitzAttacker, 'apuñalar', 'stab')){
      openBlitzStabChoice(id);
    } else {
      chooseBlockTarget(id);
    }
    return;
  }
  if(isValidApunalarTarget(id)){
    const attacker = players.find(x=>x.id===selected);
    const target = players.find(x=>x.id===id);
    startApunalarOn(attacker, target);
    return;
  }
  if(isValidFoulTarget(id)){
    const fouler = players.find(x=>x.id===selected);
    const target = players.find(x=>x.id===id);
    fouler.activated = true;
    selected = null;
    declaredAction = null;
    startFoulOn(fouler, target);
    return;
  }
  if(isValidHandoffTarget(id)){
    const mover = players.find(x=>x.id===selected);
    const clicked = players.find(x=>x.id===id);
    const carrier = ball.carrierId===mover.id ? mover : clicked;
    const receiver = ball.carrierId===mover.id ? clicked : mover;
    if(carrier.id===mover.id && animosityAppliesTo(mover, receiver)){
      if(!resolveAnimosityCheck(mover, receiver, 'handoff')) return;
    }
    mover.activated = true;
    selected = null;
    declaredAction = null;
    resolveHandoffTo(carrier, receiver);
    return;
  }
  if(pendingFerocityAttack!==null){
    resolveFerocityAttack(id);
    return;
  }
  if(anyModalOpen()) return;
  const p = players.find(x=>x.id===id);
  if(!p) return;

  if(phase==='setup'){
    placing = id;
    p.onPitch = false;
    renderRosters(); renderPitch();
    updateStatus('Reposicionando a ' + p.name + '. Click en una casilla dorada.');
    broadcastState();
    return;
  }

  if(p.team!==state.active){
    updateStatus('No es el turno de ' + teamName(p.team) + '.');
    return;
  }
  if(p.activated && p.condition!=='tumbado' && p.condition!=='aturdido' && p.condition!=='despistado'){
    updateStatus(p.name + ' ya se ha activado este turno.');
    return;
  }
  if(!chargeGate(p)) return;
  if(selected!==null && selected!==id){
    const prev = players.find(x=>x.id===selected);
    if(prev && prev.condition==='standing' && !prev.activated &&
       (((prev.remainingMove ?? prev.ma) < prev.ma) || (prev.gfiUsed ?? 0) > 0)){
      prev.activated = true;
      log('⏹️ ' + prev.name + ' termina su activación (se movió y se cambió de jugador).');
    }
  }

  const hasMoved = ((p.remainingMove ?? p.ma) !== p.ma || (p.gfiUsed ?? 0) > 0) && !p.justStoodThisActivation;
  const freshActivation = !p.activated && !p.blockedThisActivation && !hasMoved && (p.condition==='standing' || p.condition==='tumbado' || p.condition==='despistado');
  if(freshActivation && selected!==id){
    selected = id;
    openActionMenu(id);
    return;
  }

  if(selected===id){
    if(p.condition==='standing' && !p.activated &&
       (((p.remainingMove ?? p.ma) < p.ma) || (p.gfiUsed ?? 0) > 0)){
      p.activated = true;
      declaredAction = null;
      selected = null;
      log('⏹️ ' + p.name + ' termina su activación (se movió y se deseleccionó).');
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
      return;
    }
    selected = null;
    declaredAction = null;
  } else {
    selected = id;
  }
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
}

function selectPlayerLive(id){
  if(phase!=='live') return;
  tokenClicked(id);
}

function renderSelInfo(){
  const elLeft = document.getElementById('selInfoLeft');
  const elRight = document.getElementById('selInfoRight');
  const blockBtn = document.getElementById('blockBtn');
  const blitzBtn = document.getElementById('blitzBtn');
  const despBtn = document.getElementById('despistadoBtn');
  const freePushBtn = document.getElementById('freePushBtn');
  const jumpUpBtn = document.getElementById('jumpUpBtn');
  if(selected===null){
    elLeft.innerHTML = 'Ninguno';
    elRight.innerHTML = '';
    blockBtn.style.display = 'none';
    blitzBtn.style.display = 'none';
    despBtn.style.display = 'none';
    freePushBtn.style.display = 'none';
    jumpUpBtn.style.display = 'none';
    return;
  }
  const p = players.find(x=>x.id===selected);
  if(!p){
    elLeft.innerHTML = 'Ninguno';
    elRight.innerHTML = '';
    blockBtn.style.display = 'none';
    blitzBtn.style.display = 'none';
    despBtn.style.display = 'none';
    freePushBtn.style.display = 'none';
    jumpUpBtn.style.display = 'none';
    return;
  }
  const condLabel = p.condition==='tumbado' ? ' · <span style="color:var(--bad)">TUMBADO</span>'
                   : p.condition==='aturdido' ? ' · <span style="color:var(--bad)">ATURDIDO</span>'
                   : p.condition==='despistado' ? ' · <span style="color:var(--gold)">DESPISTADO</span>' : '';
  const blitzLabel = (blitzActivePlayer===p.id) ? ' · <span style="color:var(--gold)">⚡ BLITZ EN CURSO</span>' : '';
  const freePushLabel = p.freePushOverride ? ' · <span style="color:var(--gold)">🔓 EMPUJE LIBRE</span>' : '';
  const skillsText = (p.skills && p.skills.length) ? p.skills.join(', ') : 'Sin habilidades';
  elLeft.innerHTML = `
    <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${p.name} <span style="color:#a99b7f; font-weight:400;">#${p.num} · ${teamName(p.team)}</span></div>
    <div style="color:#a99b7f; font-size:11.5px; margin-bottom:4px;">${p.position || 'Sin posición'}</div>
    <div>${(p.gfiUsed??0)>0?'A por ellos '+p.gfiUsed+'/'+maxGfiFor(p):''}${condLabel}${blitzLabel}${freePushLabel}${ball.carrierId===p.id?' · ' + ballImgHtml() + ' lleva el balón':''}</div>`;
  elRight.innerHTML = `
    <div style="font-size:13px; margin-bottom:4px;">MA ${p.ma} (restante ${p.remainingMove ?? p.ma}) · ST ${p.st ?? '-'} · AG ${p.ag ?? '-'} · PA ${p.pa ?? '-'} · AV ${p.av ?? '-'}</div>
    <div style="font-size:11.5px; font-style:italic; color:#8a7d64;">${skillsText}</div>`;

  const canAct = phase==='live' && p.team===state.active && !p.activated && p.condition==='standing';
  blockBtn.style.display = (canAct && !p.blockedThisActivation) ? 'block' : 'none';
  blitzBtn.style.display = (canAct && !p.blockedThisActivation && !blitzUsedByTeam[p.team] && blitzActivePlayer!==p.id) ? 'block' : 'none';

  freePushBtn.style.display = (p.onPitch && p.condition==='standing') ? 'block' : 'none';
  freePushBtn.textContent = p.freePushOverride ? '🔒 Desactivar empuje libre' : '🔓 Activar todos los empujes';
  freePushBtn.classList.toggle('active-toggle', !!p.freePushOverride);

  if(p.condition==='standing'){
    despBtn.textContent = '😵‍💫 Marcar Despistado';
    despBtn.style.display = 'block';
  } else if(p.condition==='despistado'){
    despBtn.textContent = '✅ Quitar Despistado';
    despBtn.style.display = 'block';
  } else {
    despBtn.style.display = 'none';
  }

  jumpUpBtn.style.display = (p.condition==='tumbado' && phase==='live' && p.team===state.active && playerHasSkill(p, 'salto', 'jump up')) ? 'block' : 'none';
}

function assignBall(){
  if(selected===null){ alert('Selecciona primero un jugador en el campo.'); return; }
  const p = players.find(x=>x.id===selected);
  if(!p || !p.onPitch){ alert('El jugador debe estar en el campo.'); return; }
  ball.carrierId = p.id;
  renderPitch(); renderSelInfo();
  log('🏈 Balón asignado a ' + p.name + ' (' + teamName(p.team) + ')');
  checkTouchdown(p);
  broadcastState();
}

let placingBallFree = false;
function startPlaceBallFree(){
  placingBallFree = true;
  updateStatus('Click en una casilla del campo para soltar el balón ahí.');
  renderPitch();
  broadcastState();
}

// ---------- Blitz declaration ----------
function declareBlitz(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p || p.condition!=='standing' || p.team!==state.active || p.activated || p.blockedThisActivation) return;
  blitzUsedByTeam[p.team] = true;
  blitzActivePlayer = p.id;
  log('⚡ ' + p.name + ' declara BLITZ.');
  renderPitch(); renderSelInfo();
  broadcastState();
}

// ---------- Block/Placaje targeting ----------
function isValidBlockTarget(defenderId){
  const attackerId = blockTargeting!==null ? blockTargeting : blitzActivePlayer;
  if(attackerId===null) return false;
  const attacker = players.find(x=>x.id===attackerId);
  const defender = players.find(x=>x.id===defenderId);
  if(!attacker || !defender) return false;
  return defender.onPitch && defender.team!==attacker.team &&
    (defender.condition==='standing' || defender.condition==='despistado') &&
    Math.max(Math.abs(defender.row-attacker.row), Math.abs(defender.col-attacker.col))===1;
}

function playersNearPassLine(fromR, fromC, toR, toC, excludeTeam){
  // Aproxima el "pasillo" de la regla de alcance física: rivales en pie a máx. 1 casilla de la línea recta.
  const candidates = [];
  const steps = Math.max(Math.abs(toR-fromR), Math.abs(toC-fromC), 1) * 2;
  for(let i=0; i<=steps; i++){
    const r = fromR + (toR-fromR) * i / steps;
    const c = fromC + (toC-fromC) * i / steps;
    players.forEach(p2=>{
      if(!p2.onPitch || p2.team===excludeTeam || p2.condition!=='standing') return;
      if(candidates.includes(p2)) return;
      const dist = Math.max(Math.abs(p2.row-r), Math.abs(p2.col-c));
      if(dist<=1) candidates.push(p2);
    });
  }
  return candidates;
}

function isValidInterceptTarget(id){
  return !!pendingInterceptionChoice && pendingInterceptionChoice.candidateIds.includes(id);
}

function isValidFerocityTarget(targetId){
  if(!pendingFerocityAttack) return false;
  const attacker = players.find(x=>x.id===pendingFerocityAttack.attackerId);
  const target = players.find(x=>x.id===targetId);
  if(!attacker || !target || attacker.id===target.id) return false;
  return target.onPitch && target.team===attacker.team && target.condition==='standing' &&
    Math.max(Math.abs(target.row-attacker.row), Math.abs(target.col-attacker.col))===1;
}

function isValidApunalarTarget(targetId){
  if(declaredAction!=='apunalar' || selected===null) return false;
  const attacker = players.find(x=>x.id===selected);
  const target = players.find(x=>x.id===targetId);
  if(!attacker || !target) return false;
  return target.onPitch && target.team!==attacker.team && target.condition==='standing' &&
    Math.max(Math.abs(target.row-attacker.row), Math.abs(target.col-attacker.col))===1;
}

function isValidFoulTarget(targetId){
  if(declaredAction!=='foul' || selected===null) return false;
  const fouler = players.find(x=>x.id===selected);
  const target = players.find(x=>x.id===targetId);
  if(!fouler || !target) return false;
  return target.onPitch && target.team!==fouler.team && (target.condition==='tumbado' || target.condition==='aturdido') &&
    Math.max(Math.abs(target.row-fouler.row), Math.abs(target.col-fouler.col))===1;
}

function isValidHandoffTarget(targetId){
  if(declaredAction!=='handoff' || selected===null) return false;
  const mover = players.find(x=>x.id===selected);
  const target = players.find(x=>x.id===targetId);
  if(!mover || !target || mover.id===target.id) return false;
  if(Math.max(Math.abs(target.row-mover.row), Math.abs(target.col-mover.col))!==1) return false;
  if(ball.carrierId===mover.id){
    if(playerHasSkill(mover, 'el balón es mío', 'el balon es mio', 'ball and chain')) return false;
    // El que se mueve ES el portador: el objetivo debe ser un compañero en pie.
    return target.onPitch && target.team===mover.team && target.condition==='standing';
  }
  if(ball.carrierId===target.id && target.team===mover.team){
    if(playerHasSkill(target, 'el balón es mío', 'el balon es mio', 'ball and chain')) return false;
    // El que se mueve es un compañero acercándose al portador.
    return mover.condition==='standing' && target.condition==='standing';
  }
  return false;
}

function startBlockTargeting(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p || p.condition!=='standing' || p.team!==state.active || p.activated || p.blockedThisActivation) return;
  const hasTarget = players.some(p2 => p2.onPitch && p2.team!==p.team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-p.row), Math.abs(p2.col-p.col))===1);
  if(!hasTarget){ alert('No hay rivales en pie adyacentes.'); return; }
  document.getElementById('blockDiceArea').innerHTML = ''; currentBlockDiceIndices = [];
  document.getElementById('blockDiceHint').style.display = 'none';
  document.getElementById('blockOutcomeRow').classList.remove('active');
  blockDiceRolled = false;
  blockTargeting = p.id;
  renderPitch();
  updateStatus('Elige el rival a placar (ficha resaltada en rojo).');
}

function cancelBlockTargeting(){
  blockTargeting = null;
  renderPitch();
}

function chooseBlockTarget(defenderId){
  const attackerId = blockTargeting!==null ? blockTargeting : blitzActivePlayer;
  const attacker = players.find(x=>x.id===attackerId);
  const defender = players.find(x=>x.id===defenderId);
  blockTargeting = null;
  if(!attacker || !defender){ renderPitch(); return; }

  const isBlitz = (blitzActivePlayer === attacker.id);
  if(isBlitz){ blitzActivePlayer = null; }
  executeBlockHit(attacker, defender, isBlitz);
}

function executeBlockHit(attacker, defender, isBlitz){
  if(isBlitz){
    if((attacker.remainingMove ?? attacker.ma) >= 1){
      attacker.remainingMove -= 1;
      renderRosters(); renderSelInfo();
      broadcastState();
      proceedToBlockDice(attacker, defender, true);
    } else {
      openGfiModal(attacker, attacker.row, attacker.col, false, defender.id);
    }
  } else {
    proceedToBlockDice(attacker, defender, false);
  }
}

// ---------- Apuñalar como sustituto del Placaje en un Blitz (Penetración) ----------
function openBlitzStabChoice(defenderId){
  if(blitzActivePlayer===null) return;
  pendingBlitzStabChoice = { attackerId: blitzActivePlayer, targetId: defenderId };
  document.getElementById('blitzStabModal').classList.add('show');
  broadcastState();
}

function closeBlitzStabChoice(){
  pendingBlitzStabChoice = null;
  document.getElementById('blitzStabModal').classList.remove('show');
  broadcastState();
}

function blitzStabChoosePlacaje(){
  if(!pendingBlitzStabChoice) return;
  const targetId = pendingBlitzStabChoice.targetId;
  pendingBlitzStabChoice = null;
  document.getElementById('blitzStabModal').classList.remove('show');
  broadcastState();
  chooseBlockTarget(targetId);
}

function blitzStabChooseApunalar(){
  if(!pendingBlitzStabChoice) return;
  const { attackerId, targetId } = pendingBlitzStabChoice;
  pendingBlitzStabChoice = null;
  document.getElementById('blitzStabModal').classList.remove('show');
  const attacker = players.find(x=>x.id===attackerId);
  const defender = players.find(x=>x.id===targetId);
  blitzActivePlayer = null;
  if(!attacker || !defender){ broadcastState(); renderPitch(); return; }
  executeApunalarHit(attacker, defender, true);
}

function executeApunalarHit(attacker, defender, isBlitz){
  if(isBlitz){
    if((attacker.remainingMove ?? attacker.ma) >= 1){
      attacker.remainingMove -= 1;
      renderRosters(); renderSelInfo();
      broadcastState();
      startApunalarOn(attacker, defender);
    } else {
      openGfiModal(attacker, attacker.row, attacker.col, false, null, defender.id);
    }
  } else {
    startApunalarOn(attacker, defender);
  }
}

function getAssistingPlayers(supporterTeam, targetId, excludeId, context){
  // context: undefined/'block' (por defecto) -> Defensa bypassa la restricción en los dos lados.
  // 'foulOff' -> apoyo ofensivo en una Falta -> Meter la Bota bypassa la restricción.
  // 'foulDef' -> apoyo defensivo en una Falta -> ninguna de las dos habilidades aplica aquí.
  const target = players.find(x=>x.id===targetId);
  if(!target) return [];
  const enemyTeam = supporterTeam==='A' ? 'B' : 'A';
  return players.filter(p2=>{
    if(p2.id===excludeId) return false;
    if(!(p2.onPitch && p2.team===supporterTeam && p2.condition==='standing')) return false;
    const distToTarget = Math.max(Math.abs(p2.row-target.row), Math.abs(p2.col-target.col));
    if(distToTarget!==1) return false;
    const markingEnemies = players.filter(e => e.onPitch && e.team===enemyTeam && e.condition==='standing' && e.id!==targetId &&
      Math.max(Math.abs(e.row-p2.row), Math.abs(e.col-p2.col))===1);
    const nullifiedByRomperDefensas = markingEnemies.some(e => playerHasSkill(e, 'romper defensas', 'break tackle'));
    const bypass = !nullifiedByRomperDefensas && (
      (context!=='foulOff' && context!=='foulDef' && playerHasSkill(p2, 'defensa', 'guard')) ||
      (context==='foulOff' && playerHasSkill(p2, 'meter la bota', 'dirty player'))
    );
    if(bypass) return true;
    return markingEnemies.length===0;
  });
}

function joinNames(list){
  const names = list.map(p=>p.name);
  if(names.length===0) return '';
  if(names.length===1) return names[0];
  return names.slice(0,-1).join(', ') + ' y ' + names[names.length-1];
}

function computeBlockDiceInfo(attacker, defender, isBlitz){
  let baseAtk = parseInt(attacker.st, 10) || 0;
  if(isBlitz && playerHasSkill(attacker, 'cuernos', 'horns')){
    baseAtk += 1;
  }
  const baseDef = parseInt(defender.st, 10) || 0;

  let agallasNote = '';
  if(baseAtk < baseDef && playerHasSkill(attacker, 'agallas', 'guts')){
    const agallasRoll = Math.floor(Math.random()*6)+1;
    const total = baseAtk + agallasRoll;
    if(total > baseDef){
      log('🦾 Agallas de ' + attacker.name + ': FU' + baseAtk + ' + D6(' + agallasRoll + ') = ' + total + ' > FU' + baseDef + ' rival — su FU sube a ' + baseDef + ' para este placaje.');
      agallasNote = ' (Agallas: FU' + baseAtk + '→' + baseDef + ')';
      baseAtk = baseDef;
    } else {
      log('🦾 Agallas de ' + attacker.name + ': FU' + baseAtk + ' + D6(' + agallasRoll + ') = ' + total + ' no supera FU' + baseDef + ' rival — sin efecto.');
    }
  }

  const offAssisters = getAssistingPlayers(attacker.team, defender.id, attacker.id);
  const defAssisters = getAssistingPlayers(defender.team, attacker.id, defender.id);
  const offAssists = offAssisters.length;
  const defAssists = defAssisters.length;
  const cheerOff = cheerBonus[attacker.team]==='active' ? 1 : 0;
  const stAtk = baseAtk + offAssists + cheerOff;
  const stDef = baseDef + defAssists;
  let diceCount, chooser;
  if(stAtk === stDef){ diceCount = 1; chooser = null; }
  else if(stAtk > stDef){ diceCount = (stAtk > stDef*2) ? 3 : 2; chooser = 'attacker'; }
  else { diceCount = (stDef > stAtk*2) ? 3 : 2; chooser = 'defender'; }
  const cuernosApplied = isBlitz && playerHasSkill(attacker, 'cuernos', 'horns');
  return { baseAtk, baseDef, offAssisters, defAssisters, offAssists, defAssists, stAtk, stDef, diceCount, chooser, cuernosApplied, agallasNote, cheerOff };
}

function proceedToBlockDice(attacker, defender, isBlitzHit){
  activeBlock = { attackerId: attacker.id, defenderId: defender.id, isBlitz: !!isBlitzHit };
  blockDiceRolled = false;
  document.getElementById('blockText').textContent = `${attacker.name} placa a ${defender.name} (${teamName(defender.team)}).`;

  const info = computeBlockDiceInfo(attacker, defender, isBlitzHit);
  activeBlock.diceInfo = info;
  const atkLine = 'Atacante ' + attacker.name + ' con FU' + info.baseAtk + (info.cuernosApplied ? ' (incl. +1 Cuernos)' : '') + info.agallasNote
    + (info.offAssists>0 ? ' + apoyos ofensivos ' + joinNames(info.offAssisters) : '')
    + (info.cheerOff ? ' + 1 apoyo ofensivo (Los hinchas animan)' : '')
    + ' = FU' + info.stAtk;
  const defLine = 'Defensor ' + defender.name + ' con FU' + info.baseDef
    + (info.defAssists>0 ? ' + apoyos defensivos ' + joinNames(info.defAssisters) : '')
    + ' = FU' + info.stDef;
  const chooserTxt = info.chooser==='attacker' ? 'elige el ATACANTE' : info.chooser==='defender' ? 'elige el DEFENSOR' : 'sin elección (1 dado)';
  const diceLine = '→ ' + info.diceCount + ' dado' + (info.diceCount>1?'s':'') + ' recomendado' + (info.diceCount>1?'s':'') + ', ' + chooserTxt + '.';
  document.getElementById('blockStrengthInfo').innerHTML = atkLine + '<br>' + defLine + '<br>' + diceLine;

  const chooserBanner = document.getElementById('blockChooserBanner');
  if(info.chooser==='attacker'){
    chooserBanner.textContent = '🎯 ELIGE EL ATACANTE — ' + attacker.name;
    chooserBanner.style.background = tokenColorFor(attacker);
    chooserBanner.style.color = textColorFor(attacker);
    chooserBanner.style.borderColor = tokenColorFor(attacker);
  } else if(info.chooser==='defender'){
    chooserBanner.textContent = '🎯 ELIGE EL DEFENSOR — ' + defender.name;
    chooserBanner.style.background = tokenColorFor(defender);
    chooserBanner.style.color = textColorFor(defender);
    chooserBanner.style.borderColor = tokenColorFor(defender);
  } else {
    chooserBanner.textContent = '🎯 SIN ELECCIÓN (1 dado)';
    chooserBanner.style.background = '';
    chooserBanner.style.color = '';
    chooserBanner.style.borderColor = '';
  }

  [1,2,3].forEach(n=>{
    document.getElementById('blockDiceBtn'+n).classList.toggle('active-toggle', n===info.diceCount);
  });

  document.getElementById('blockDiceArea').innerHTML = ''; currentBlockDiceIndices = [];
  document.getElementById('blockDiceHint').style.display = 'none';
  document.getElementById('blockOutcomeRow').classList.remove('active');
  document.getElementById('blockFreePushBtn').textContent = attacker.freePushOverride
    ? '🔒 Desactivar empuje libre (para este placaje)'
    : '🔓 Activar todos los empujes (para este placaje)';
  document.getElementById('blockFreePushBtn').classList.toggle('active-toggle', !!attacker.freePushOverride);
  document.getElementById('blockModal').classList.add('show');
  broadcastState();
}

function toggleFreePushForActiveBlock(){
  if(!activeBlock) return;
  const attacker = players.find(x=>x.id===activeBlock.attackerId);
  if(!attacker) return;
  attacker.freePushOverride = !attacker.freePushOverride;
  document.getElementById('blockFreePushBtn').textContent = attacker.freePushOverride
    ? '🔒 Desactivar empuje libre (para este placaje)'
    : '🔓 Activar todos los empujes (para este placaje)';
  document.getElementById('blockFreePushBtn').classList.toggle('active-toggle', !!attacker.freePushOverride);
  log(attacker.freePushOverride
    ? '🔓 ' + attacker.name + ': empuje libre activado para este placaje.'
    : '🔒 ' + attacker.name + ': empuje libre desactivado para este placaje.');
  renderSelInfo();
  broadcastState();
}

function blockFaceHtml(idx){
  return `<img class="block-icon-img" src="${BLOCK_ICON_IMAGES[idx]}" alt="${BLOCK_FACES[idx]}" title="${BLOCK_FACES[idx]}" onerror="this.outerHTML='<div class=&quot;block-icon&quot;>${BLOCK_ICONS[idx]}</div>'">`;
}

let currentBlockDiceIndices = [];

let blockProfesionalUsed = false;
let profesionalPickMode = false;
let blockProNote = ''; // '' | 'ok' | 'fail' — resultado visible de la tirada de Profesional en el modal de Placaje

function renderBlockDice(indices){
  const el = document.getElementById('blockDiceArea');
  el.innerHTML = '';
  indices.forEach((idx, i)=>{
    const d = document.createElement('div');
    const lucPick = luchadorPickMode && BLOCK_OUTCOME_KINDS[idx]==='bothDown';
    d.className = 'block-face clickable-die' + (profesionalPickMode ? ' pro-pick' : (lucPick ? ' profesional-pick' : ''));
    d.innerHTML = blockFaceHtml(idx);
    d.onclick = ()=>{
      if(profesionalPickMode){ rerollBlockDie(i); }
      else if(luchadorPickMode){ if(BLOCK_OUTCOME_KINDS[idx]==='bothDown') luchadorRerollDie(i); }
      else { applyBlockOutcome(BLOCK_OUTCOME_KINDS[idx]); }
    };
    el.appendChild(d);
  });
  refreshBlockSkillUi();
}

// LUCHADOR: al declarar un Placaje (no Blitz) puede repetir UN único dado de "Ambos caen" de toda la tirada.
function refreshBlockSkillUi(){
  const proNote = document.getElementById('blockProNote');
  if(proNote){
    if(blockProNote==='ok'){ proNote.style.display='block'; proNote.className='pro-note ok'; proNote.textContent='✅ Éxito al usar PROFESIONAL: elige el dado a repetir'; }
    else if(blockProNote==='fail'){ proNote.style.display='block'; proNote.className='pro-note fail'; proNote.textContent='❌ Tirada Profesional fallada'; }
    else { proNote.style.display='none'; proNote.textContent=''; }
  }
  const btn = document.getElementById('blockLuchadorBtn');
  const note = document.getElementById('blockLuchadorNote');
  if(!btn || !note) return;
  const attacker = activeBlock ? players.find(x=>x.id===activeBlock.attackerId) : null;
  const hasBoth = currentBlockDiceIndices.some(i=>BLOCK_OUTCOME_KINDS[i]==='bothDown');
  const avail = !!(attacker && blockDiceRolled && !activeBlock.isBlitz && playerHasSkill(attacker, 'luchador', 'brawler') && !luchadorUsed && hasBoth);
  btn.style.display = avail ? 'block' : 'none';
  note.style.display = avail ? 'block' : 'none';
  if(avail){
    const rr = teamRerollsLeft[attacker.team] || 0;
    btn.textContent = luchadorPickMode ? '✖ Cancelar Luchador' : '💪 Usar Luchador (repite solo 1 dado de Ambos caen)';
    note.textContent = 'LUCHADOR: ' + attacker.name + ' puede repetir un único dado de Ambos caen.' +
      (rr>0 ? ' O bien gastad una reroll de equipo (' + rr + ' disponible' + (rr===1?'':'s') + ': RR −1 y volved a tirar) para repetir TODOS los dados.' : '');
  }
}
function useLuchador(){
  if(luchadorUsed || !activeBlock || !blockDiceRolled) return;
  const attacker = players.find(x=>x.id===activeBlock.attackerId);
  if(!attacker || activeBlock.isBlitz || !playerHasSkill(attacker, 'luchador', 'brawler')) return;
  if(luchadorPickMode){ luchadorPickMode = false; renderBlockDice(currentBlockDiceIndices); broadcastState(); return; }
  const idxs = [];
  currentBlockDiceIndices.forEach((v,i)=>{ if(BLOCK_OUTCOME_KINDS[v]==='bothDown') idxs.push(i); });
  if(!idxs.length) return;
  if(idxs.length===1){ luchadorRerollDie(idxs[0]); return; }
  luchadorPickMode = true;
  log('💪 ' + attacker.name + ' usa Luchador — elegid cuál de los dados de Ambos caen repetir (click en él).');
  renderBlockDice(currentBlockDiceIndices);
  broadcastState();
}
function luchadorRerollDie(i){
  const attacker = activeBlock ? players.find(x=>x.id===activeBlock.attackerId) : null;
  const oldFace = BLOCK_FACES[currentBlockDiceIndices[i]];
  const newIdx = Math.floor(Math.random()*6);
  currentBlockDiceIndices[i] = newIdx;
  luchadorUsed = true; luchadorPickMode = false;
  log('💪 Luchador' + (attacker ? ' (' + attacker.name + ')' : '') + ': dado repetido — ' + oldFace + ' → ' + BLOCK_FACES[newIdx] + '.');
  renderBlockDice(currentBlockDiceIndices);
  broadcastState();
}

function rerollBlockDie(i){
  const oldFace = BLOCK_FACES[currentBlockDiceIndices[i]];
  const newIdx = Math.floor(Math.random()*6);
  currentBlockDiceIndices[i] = newIdx;
  profesionalPickMode = false; blockProNote = '';
  log('🎓 Profesional: dado repetido — ' + oldFace + ' → ' + BLOCK_FACES[newIdx] + '.');
  renderBlockDice(currentBlockDiceIndices);
  broadcastState();
}

function useProfesionalOnBlock(){
  if(blockProfesionalUsed || !activeBlock || !blockDiceRolled) return;
  const attacker = players.find(x=>x.id===activeBlock.attackerId);
  if(!attacker || !hasProfesional(attacker)) return;
  blockProfesionalUsed = true;
  document.getElementById('blockProfesionalBtn').style.display = 'none';
  const roll = Math.floor(Math.random()*6)+1;
  if(roll>=3){
    log('🎓 ' + attacker.name + ' usa Profesional: tirada ' + roll + ' (3+) — elegid qué dado repetir (click en él).');
    profesionalPickMode = true; blockProNote = 'ok';
    renderBlockDice(currentBlockDiceIndices);
  } else {
    log('🎓 ' + attacker.name + ' intenta usar Profesional: tirada ' + roll + ' (1-2) — no puede repetir ningún dado.');
    blockProNote = 'fail';
    refreshBlockSkillUi();
  }
  broadcastState();
}

function rollBlockDiceModal(n){
  const atkForCheer = activeBlock ? players.find(x=>x.id===activeBlock.attackerId) : null;
  if(atkForCheer && cheerBonus[atkForCheer.team]==='active'){
    cheerBonus[atkForCheer.team] = 'used';
    log('📣 Los hinchas animan: ' + teamName(atkForCheer.team) + ' usa su +1 de apoyo ofensivo en este Placaje.');
  }
  const results = [];
  for(let i=0;i<n;i++){ results.push(Math.floor(Math.random()*6)); }
  currentBlockDiceIndices = results;
  renderBlockDice(results);
  document.getElementById('blockOutcomeRow').classList.add('active');
  document.getElementById('blockDiceHint').style.display = 'block';
  blockDiceRolled = true;
  blockProfesionalUsed = false;
  profesionalPickMode = false; blockProNote = '';
  luchadorUsed = false; luchadorPickMode = false;
  renderBlockDice(results);
  const attacker = activeBlock ? players.find(x=>x.id===activeBlock.attackerId) : null;
  document.getElementById('blockProfesionalBtn').style.display = (attacker && hasProfesional(attacker)) ? 'block' : 'none';
  log('🎲 Placaje x' + n + ': ' + results.map(i=>BLOCK_FACES[i]).join(' / '));
  broadcastState();
}

let pendingForcejearChoice = null; // { attackerId, defenderId, isBlitz }
let pendingProvocarChoice = null;  // { attackerId, defenderId, followText } — ¿obliga el defensor con Provocar al atacante a seguirle?
let luchadorUsed = false;          // Luchador ya usado en el placaje actual
let luchadorPickMode = false;      // eligiendo qué dado de Ambos caen repetir

function tryProvocar(attacker, defender, vacR, vacC, followText){
  if(!attacker || !defender || !defender.onPitch) return false;
  if(!playerHasSkill(defender, 'provocar', 'taunt')) return false;
  if(attacker.rooted) return false; // no vale contra un jugador que ha Echado raíces
  if(occupiedBy(vacR, vacC)) return false;
  pendingProvocarChoice = { attackerId: attacker.id, defenderId: defender.id, followText: followText };
  renderProvocarModal();
  broadcastState();
  return true;
}
function renderProvocarModal(){
  const m = document.getElementById('provocarModal');
  if(!m) return;
  if(!pendingProvocarChoice){ m.classList.remove('show'); return; }
  const a = players.find(x=>x.id===pendingProvocarChoice.attackerId);
  const d = players.find(x=>x.id===pendingProvocarChoice.defenderId);
  document.getElementById('provocarText').textContent = (d ? d.name : 'El jugador empujado') + ' tiene PROVOCAR. ¿Obliga a ' + (a ? a.name : 'su rival') + ' a hacer el movimiento de impulso (seguirle)?';
  m.classList.add('show');
}
function provocarChoose(yes){
  const ctx = pendingProvocarChoice;
  if(!ctx) return;
  pendingProvocarChoice = null;
  renderProvocarModal();
  const a = players.find(x=>x.id===ctx.attackerId);
  const d = players.find(x=>x.id===ctx.defenderId);
  if(yes){
    log('😤 ' + (d ? d.name : 'El jugador') + ' usa PROVOCAR — ' + (a ? a.name : 'el atacante') + ' debe hacer el movimiento de impulso.');
    resolveFollowUp(true);
  } else {
    log('😤 ' + (d ? d.name : 'El jugador') + ' no usa Provocar.');
    document.getElementById('followUpText').textContent = ctx.followText || '';
    document.getElementById('followUpModal').classList.add('show');
    broadcastState();
  }
}

function resolveBothDownFall(attacker, defender, isBlitz, forcejearUsed){
  if(forcejearUsed){
    attacker.condition = 'tumbado'; attacker.rooted = false;
    defender.condition = 'tumbado'; defender.rooted = false;
    queueBallDropIfCarrier(attacker.id, attacker.row, attacker.col);
    queueBallDropIfCarrier(defender.id, defender.row, defender.col);
    attacker.activated = true; selected = null;
    log('🤼 Forcejear usado — ' + attacker.name + ' y ' + defender.name + ' quedan Tumbados directamente, sin tirada de Armadura ni otras habilidades de por medio.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }

  const atkHasTackle = playerHasSkill(attacker, 'placar', 'tackle');
  const defHasTackle = playerHasSkill(defender, 'placar', 'tackle');
  let attackerFalls = !atkHasTackle;
  let defenderFalls = !defHasTackle;

  let attackerResisted = false, defenderResisted = false;
  if(attackerFalls && checkEquilibrioFirme(attacker)){ attackerFalls = false; attackerResisted = true; }
  if(defenderFalls && checkEquilibrioFirme(defender)){ defenderFalls = false; defenderResisted = true; }

  const fallenNames = [];
  if(attackerFalls){ attacker.condition = 'tumbado'; attacker.rooted = false; fallenNames.push(attacker.name); queueBallDropIfCarrier(attacker.id, attacker.row, attacker.col); }
  if(defenderFalls){ defender.condition = 'tumbado'; defender.rooted = false; fallenNames.push(defender.name); queueBallDropIfCarrier(defender.id, defender.row, defender.col); }

  if(!attackerFalls && isBlitz){
    selected = attacker.id;
    updateStatus(attacker.name + ' puede seguir moviéndose (Blitz).');
  } else {
    attacker.activated = true;
    selected = null;
  }

  if(forcejearUsed) log('🤼 Forcejear usado — ambos caen, con independencia de otras habilidades.');
  if(attackerResisted) log('🛡️ ' + attacker.name + ' resiste la caída con Equilibrio Firme.');
  if(defenderResisted) log('🛡️ ' + defender.name + ' resiste la caída con Equilibrio Firme.');

  if(fallenNames.length===0){
    log('🤝 Ambos caen, pero al final ninguno cae (Placar/Equilibrio Firme).');
  } else {
    const tackleWho = atkHasTackle ? attacker.name : (defHasTackle ? defender.name : null);
    const tackleNote = tackleWho ? ' (Placar evita la caída de ' + tackleWho + ')' : '';
    log('👊 Ambos caen: ' + fallenNames.join(' y ') + '.' + tackleNote);
  }
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();

  if(fallenNames.length===0) return;

  const armorQueue = [];
  if(defenderFalls){ armorQueue.push(defender.id); golpeMortiferoMap[defender.id] = attacker.id; }
  if(attackerFalls) armorQueue.push(attacker.id);
  pendingArmorQueue = armorQueue;
  if(attackerFalls) pendingTurnoverAfterResolve = true;
  processNextArmorInQueue();
}

function resolveForcejearChoice(useIt){
  const ctx = pendingForcejearChoice;
  pendingForcejearChoice = null;
  document.getElementById('forcejearModal').classList.remove('show');
  if(!ctx){ broadcastState(); return; }
  const attacker = players.find(x=>x.id===ctx.attackerId);
  const defender = players.find(x=>x.id===ctx.defenderId);
  if(!attacker || !defender){ broadcastState(); return; }
  resolveBothDownFall(attacker, defender, ctx.isBlitz, !!useIt);
}

let pendingVeteranoBlockChoice = null; // { kind } — resultado de bloqueo en espera de decisión de Veterano

function applyBlockOutcome(kind){
  if(!activeBlock) return;
  if(!blockDiceRolled){ alert('Tirad primero los dados de placaje.'); return; }
  const attackerCheck = players.find(x=>x.id===activeBlock.attackerId);
  if((kind==='attackerDown' || kind==='bothDown') && attackerCheck && playerHasSkill(attackerCheck, 'veterano', 'veteran') && !attackerCheck.veteranoUsedThisMatch){
    pendingVeteranoBlockChoice = { kind };
    document.getElementById('veteranoBlockModal').classList.add('show');
    broadcastState();
    return;
  }
  applyBlockOutcomeConfirmed(kind);
}

function veteranoBlockChooseKeep(){
  const choice = pendingVeteranoBlockChoice;
  pendingVeteranoBlockChoice = null;
  document.getElementById('veteranoBlockModal').classList.remove('show');
  if(!choice){ broadcastState(); return; }
  applyBlockOutcomeConfirmed(choice.kind);
}

function veteranoBlockChooseReroll(){
  pendingVeteranoBlockChoice = null;
  document.getElementById('veteranoBlockModal').classList.remove('show');
  const attacker = activeBlock ? players.find(x=>x.id===activeBlock.attackerId) : null;
  if(!attacker){ broadcastState(); return; }
  attacker.veteranoUsedThisMatch = true; renderScoreboard();
  const n = currentBlockDiceIndices.length;
  const results = [];
  for(let i=0;i<n;i++){ results.push(Math.floor(Math.random()*6)); }
  currentBlockDiceIndices = results;
  log('⭐ ' + attacker.name + ' usa VETERANO — repite la tirada de Placaje x' + n + ': ' + results.map(i=>BLOCK_FACES[i]).join(' / ') + ' (ya gastado para el resto del partido).');
  blockProfesionalUsed = false;
  profesionalPickMode = false; blockProNote = '';
  luchadorUsed = false; luchadorPickMode = false;
  renderBlockDice(results);
  document.getElementById('blockProfesionalBtn').style.display = hasProfesional(attacker) ? 'block' : 'none';
  broadcastState();
}

function applyBlockOutcomeConfirmed(kind){
  const attacker = players.find(x=>x.id===activeBlock.attackerId);
  const defender = players.find(x=>x.id===activeBlock.defenderId);
  const isBlitz = activeBlock.isBlitz;
  document.getElementById('blockModal').classList.remove('show');
  activeBlock = null;
  if(!attacker || !defender){ broadcastState(); return; }

  attacker.blockedThisActivation = true;

  if(kind==='attackerDown'){
    if(checkEquilibrioFirme(attacker)){
      log('🛡️ ' + attacker.name + ' resiste la caída con Equilibrio Firme — sigue de pie y puede continuar su activación.');
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
      return;
    }
    attacker.condition = 'tumbado'; attacker.rooted = false;
    attacker.activated = true;
    selected = null;
    log('👊 ' + attacker.name + ' (atacante) cae.');
    queueBallDropIfCarrier(attacker.id, attacker.row, attacker.col);
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    pendingTurnoverAfterResolve = true;
    openArmorModal(attacker);
    return;
  }

  if(kind==='bothDown'){
    const atkHasForcejear = playerHasSkill(attacker, 'forcejear', 'wrestle');
    const defHasForcejear = playerHasSkill(defender, 'forcejear', 'wrestle');
    if(atkHasForcejear || defHasForcejear){
      pendingForcejearChoice = { attackerId: attacker.id, defenderId: defender.id, isBlitz: !!isBlitz };
      document.getElementById('forcejearText').textContent = (atkHasForcejear ? attacker.name : defender.name) +
        ' tiene Forcejear. ¿Usarla? Ambos caerán al suelo, con independencia de otras habilidades.';
      document.getElementById('forcejearModal').classList.add('show');
      broadcastState();
      return;
    }
    resolveBothDownFall(attacker, defender, isBlitz, false);
    return;
  }

  if(kind==='none'){
    log('🤝 Nadie cae (ambos jugadores con Placar). Sigue el juego.');
    if(!isBlitz){
      attacker.activated = true;
      selected = null;
    } else if(attacker.condition==='standing'){
      selected = attacker.id;
      updateStatus(attacker.name + ' puede seguir moviéndose (Blitz).');
    }
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }

  // push / stumble / pow
  if(!isBlitz){
    attacker.activated = true;
    selected = null;
  }

  if(defender.rooted){
    log('🌳 ' + defender.name + ' está Echando raíces — no puede ser empujado, se queda en su casilla.');
    if(kind==='pow' || (kind==='stumble' && !playerHasSkill(defender, 'esquiva', 'dodge'))){
      defender.condition = 'tumbado'; defender.rooted = false;
      queueBallDropIfCarrier(defender.id, defender.row, defender.col);
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
      golpeMortiferoMap[defender.id] = attacker.id;
      pendingArmorQueue = [defender.id];
      processNextArmorInQueue();
    } else {
      if(kind==='stumble'){ log('🤸 ' + defender.name + ' tiene Esquiva — no cae.'); }
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
    }
    return;
  }

  chainPushStack = [];
  const offsets = computePushOffsets(attacker.row, attacker.col, defender.row, defender.col);
  pendingPush = { attackerId: attacker.id, defenderId: defender.id, kind, isBlitz, offsets, freePush: !!attacker.freePushOverride };
  document.getElementById('pushControlPanel').style.display = 'block';
  let hasEmptyAdjacent = false;
  for(let dr=-1; dr<=1 && !hasEmptyAdjacent; dr++){
    for(let dc=-1; dc<=1 && !hasEmptyAdjacent; dc++){
      if(dr===0 && dc===0) continue;
      const rr = defender.row+dr, cc = defender.col+dc;
      if(rr<0||rr>=ROWS||cc<0||cc>=COLS) continue;
      if(!occupiedBy(rr,cc)) hasEmptyAdjacent = true;
    }
  }
  const hasSideStep = !attacker.freePushOverride && playerHasSkill(defender, 'echarse a un lado', 'side step') && hasEmptyAdjacent;
  if(hasSideStep){
    showInfoModal('🔀 ECHARSE A UN LADO', defender.name + ' tiene esta habilidad. Es el EQUIPO DE ' + teamName(defender.team).toUpperCase() + ' (el del propio jugador empujado) quien elige a qué casilla desocupada adyacente se mueve — no el equipo atacante.');
    document.getElementById('pushControlText').textContent = '🔀 Echarse a un Lado: el equipo de ' + defender.name + ' elige cualquier casilla desocupada adyacente (resaltadas).';
  } else {
    document.getElementById('pushControlText').textContent = attacker.freePushOverride
      ? 'Empuje libre activado: elegid cualquiera de las 8 casillas adyacentes para ' + defender.name + '.'
      : 'Elegid una de las 3 casillas resaltadas para ' + defender.name + ' (según la dirección del placaje) — puede empujar en cadena si hay otro jugador ahí.';
  }
  document.getElementById('pushFreeToggleBtn').textContent = attacker.freePushOverride ? '🔒 Desactivar empuje libre' : '🔓 Activar todos los empujes';
  document.getElementById('pushFreeToggleBtn').classList.toggle('active-toggle', !!attacker.freePushOverride);
  renderRosters(); renderPitch(); renderSelInfo();
  updateStatus('Elegid casilla de empuje para ' + defender.name + '.');
  broadcastState();
}

function processNextArmorInQueue(){
  if(!pendingArmorQueue || pendingArmorQueue.length===0) return;
  const id = pendingArmorQueue.shift();
  const p = players.find(x=>x.id===id);
  if(!p){ processNextArmorInQueue(); return; }
  openArmorModal(p);
}

// ---------- Push resolution + follow-up ----------
let chainPushStack = []; // steps of a chain push in progress: {playerId, fromR, fromC, toR, toC}

function computePushOffsets(pusherR, pusherC, targetR, targetC){
  const awayR = Math.sign(targetR - pusherR);
  const awayC = Math.sign(targetC - pusherC);
  if(awayR!==0 && awayC!==0){
    // diagonal hit: continues into the opposite diagonal + its two orthogonal neighbours
    return [{dr:awayR,dc:awayC},{dr:awayR,dc:0},{dr:0,dc:awayC}];
  } else if(awayR!==0){
    // vertical hit: the 3 squares continuing straight on, spanning the row
    return [{dr:awayR,dc:-1},{dr:awayR,dc:0},{dr:awayR,dc:1}];
  } else {
    // horizontal hit: the 3 squares continuing straight on, spanning the column
    return [{dr:-1,dc:awayC},{dr:0,dc:awayC},{dr:1,dc:awayC}];
  }
}

function isFreePushActive(info){
  if(!info) return false;
  const root = info.chainRoot || info;
  const attacker = players.find(x=>x.id===root.attackerId);
  return !!(attacker && attacker.freePushOverride);
}

function toggleFreePushDuringPush(){
  if(!pendingPush) return;
  const root = pendingPush.chainRoot || pendingPush;
  const attacker = players.find(x=>x.id===root.attackerId);
  if(!attacker) return;
  attacker.freePushOverride = !attacker.freePushOverride;
  const active = attacker.freePushOverride;
  document.getElementById('pushFreeToggleBtn').textContent = active ? '🔒 Desactivar empuje libre' : '🔓 Activar todos los empujes';
  document.getElementById('pushFreeToggleBtn').classList.toggle('active-toggle', active);
  document.getElementById('pushControlText').textContent = active
    ? 'Empuje libre activado: elegid cualquiera de las 8 casillas adyacentes.'
    : 'Elegid una de las 3 casillas resaltadas en rojo, según la dirección.';
  log(active ? '🔓 Empuje libre activado (' + attacker.name + ').' : '🔒 Empuje libre desactivado (' + attacker.name + ').');
  renderPitch(); renderSelInfo();
  broadcastState();
}

function currentPushTargets(mover, offsets, freePush){
  if(mover && !freePush && playerHasSkill(mover, 'echarse a un lado', 'side step')){
    const sideStepOptions = [];
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
      if(dr===0 && dc===0) continue;
      const rr = mover.row+dr, cc = mover.col+dc;
      if(rr<0 || rr>=ROWS || cc>=COLS || cc<0) continue;
      if(!occupiedBy(rr,cc)) sideStepOptions.push({ row: rr, col: cc });
    }
    if(sideStepOptions.length>0) return sideStepOptions;
    // sin casillas libres adyacentes: la habilidad no se puede usar, cae al empuje normal
  }
  if(freePush){
    const list = [];
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
      if(dr===0 && dc===0) continue;
      list.push({ row: mover.row+dr, col: mover.col+dc });
    }
    return list;
  }
  const raw = offsets.map(o=>({ row: mover.row+o.dr, col: mover.col+o.dc }));
  const classify = t => {
    if(t.row<0 || t.row>=ROWS || t.col<0 || t.col>=COLS) return 'offboard';
    return occupiedBy(t.row, t.col) ? 'occupied' : 'free';
  };
  const withClass = raw.map(t => ({ row:t.row, col:t.col, kind: classify(t) }));
  const free = withClass.filter(t => t.kind==='free');
  if(free.length) return free;
  const offboard = withClass.filter(t => t.kind==='offboard');
  if(offboard.length) return offboard;
  return withClass; // las 3 ocupadas: empuje en cadena forzoso, cualquiera es válida
}

function isValidPushCell(mover, r, c, offsets, freePush){
  if(!mover) return false;
  return currentPushTargets(mover, offsets || [], freePush).some(t=>t.row===r && t.col===c);
}

function resolvePush(r,c){
  const info = pendingPush;
  pendingPush = null;
  const mover = players.find(x=>x.id===info.defenderId);
  if(!mover){ document.getElementById('pushControlPanel').style.display='none'; chainPushStack=[]; renderPitch(); broadcastState(); return; }

  const occupant = occupiedBy(r,c);
  chainPushStack.push({ playerId: mover.id, fromR: mover.row, fromC: mover.col, toR: r, toC: c });

  if(occupant){
    const newOffsets = computePushOffsets(mover.row, mover.col, r, c);
    log('⛓️ Empuje en cadena: ' + mover.name + ' choca con ' + occupant.name + ', que también será empujado.');
    pendingPush = { attackerId: info.attackerId, defenderId: occupant.id, kind: info.kind, isBlitz: info.isBlitz, offsets: newOffsets, freePush: info.freePush, chainRoot: info.chainRoot || info };
    document.getElementById('pushControlText').textContent = 'Empuje en cadena: elegid casilla para ' + occupant.name + ' (dirección heredada del empujón anterior, resaltada en el campo).';
    const rootAttacker = players.find(x=>x.id===(info.chainRoot || info).attackerId);
    if(rootAttacker){
      document.getElementById('pushFreeToggleBtn').textContent = rootAttacker.freePushOverride ? '🔒 Desactivar empuje libre' : '🔓 Activar todos los empujes';
      document.getElementById('pushFreeToggleBtn').classList.toggle('active-toggle', !!rootAttacker.freePushOverride);
    }
    renderPitch();
    broadcastState();
    return;
  }

  // chain terminates in an empty square: unwind from last to first
  document.getElementById('pushControlPanel').style.display = 'none';
  const chain = chainPushStack;
  chainPushStack = [];
  for(let i=chain.length-1; i>=0; i--){
    const step = chain[i];
    const p2 = players.find(x=>x.id===step.playerId);
    if(p2){ p2.row = step.toR; p2.col = step.toC; }
  }

  const rootInfo = info.chainRoot || info;
  const original = chain[0];
  const originalPlayer = players.find(x=>x.id===original.playerId);
  const attacker = players.find(x=>x.id===rootInfo.attackerId);

  log(chain.length>1
    ? '➡️ Empuje en cadena resuelto (' + chain.length + ' jugadores desplazados).'
    : '➡️ ' + originalPlayer.name + ' es empujado.');

  const hitLooseBall = (ball.carrierId===null && ball.row===original.toR && ball.col===original.toC);
  if(!hitLooseBall && originalPlayer){ checkTouchdown(originalPlayer); }

  let effectiveFallKind = null;
  if(rootInfo.kind==='pow'){
    effectiveFallKind = 'pow';
  } else if(rootInfo.kind==='stumble'){
    if(originalPlayer && playerHasSkill(originalPlayer, 'esquiva', 'dodge') && attacker && playerHasSkill(attacker, 'placaje defensivo', 'defensive tackle')){
      effectiveFallKind = 'pow';
      log('⛔ ' + attacker.name + ' tiene PLACAJE DEFENSIVO — ' + originalPlayer.name + ' no puede usar Esquiva: el Desequilibrado se trata como un POW.');
    } else if(originalPlayer && playerHasSkill(originalPlayer, 'esquiva', 'dodge')){
      log('🤸 ' + originalPlayer.name + ' tiene Esquiva — el Desequilibrado se trata como un simple empujón, no cae.');
    } else {
      effectiveFallKind = 'pow';
      log('💥 ' + (originalPlayer ? originalPlayer.name : 'El jugador') + ' no tiene Esquiva — el Desequilibrado se trata como un POW.');
    }
  }

  pendingFollowUp = {
    attackerId: rootInfo.attackerId, defenderId: original.playerId,
    vacatedR: original.fromR, vacatedC: original.fromC,
    fallKind: effectiveFallKind,
    isBlitz: rootInfo.isBlitz
  };

  renderRosters(); renderPitch();
  broadcastState();

  if(hitLooseBall){
    log('🏈 El balón sale despedido por el empujón y rebota.');
    startBallBounce();
  }

  if(pendingTD){
    pendingFollowUp = null;
    return;
  }

  if(attacker && originalPlayer){
    if(attacker.rooted){
      log('🌳 ' + attacker.name + ' está Echando raíces — no puede hacer el movimiento de impulso.');
      finishPushSequence(pendingFollowUp);
      return;
    }
    if(playerHasSkill(attacker, 'furia', 'frenzy') && !occupiedBy(original.fromR, original.fromC)){
      log('😡 ' + attacker.name + ' tiene Furia — el movimiento de impulso es obligatorio.');
      resolveFollowUp(true);
      return;
    }
    const followTextP = `¿${attacker.name} avanza a la casilla que deja libre ${originalPlayer.name}?`;
    if(tryProvocar(attacker, originalPlayer, original.fromR, original.fromC, followTextP)) return;
    document.getElementById('followUpText').textContent = followTextP;
    document.getElementById('followUpModal').classList.add('show');
    broadcastState();
  } else {
    finishPushSequence(pendingFollowUp);
  }
}

function pushOutOfBounds(exitR, exitC){
  if(!pendingPush) return;
  const info = pendingPush;
  pendingPush = null;
  document.getElementById('pushControlPanel').style.display = 'none';
  const mover = players.find(x=>x.id===info.defenderId);
  if(!mover){ chainPushStack=[]; renderPitch(); broadcastState(); return; }

  const fromR = mover.row, fromC = mover.col;
  queueBallDropIfCarrier(mover.id, fromR, fromC, exitR, exitC);
  mover.onPitch = false; mover.row = null; mover.col = null;
  log('🌀 ' + mover.name + ' sale del campo empujado' + (chainPushStack.length ? ' (empuje en cadena)' : '') + ' — tirada de heridas directa (sin armadura).');

  const chain = chainPushStack;
  chainPushStack = [];
  let vacatedR = fromR, vacatedC = fromC;
  for(let i=chain.length-1; i>=0; i--){
    const step = chain[i];
    const p2 = players.find(x=>x.id===step.playerId);
    if(p2){ p2.row = vacatedR; p2.col = vacatedC; }
    vacatedR = step.fromR; vacatedC = step.fromC;
  }

  const rootInfo = info.chainRoot || info;
  const attacker = players.find(x=>x.id===rootInfo.attackerId);
  const original = chain[0];
  const followUpDefenderId = original ? original.playerId : mover.id;
  const followUpPlayer = original ? players.find(x=>x.id===original.playerId) : null;
  const followUpVacatedR = original ? original.fromR : fromR;
  const followUpVacatedC = original ? original.fromC : fromC;

  pendingFollowUp = {
    attackerId: rootInfo.attackerId, defenderId: original ? followUpDefenderId : null,
    vacatedR: followUpVacatedR, vacatedC: followUpVacatedC,
    fallKind: null, isBlitz: rootInfo.isBlitz,
    directInjuryPlayerId: mover.id
  };

  renderRosters(); renderPitch();
  broadcastState();

  if(attacker && (followUpPlayer || !original)){
    const targetName = followUpPlayer ? followUpPlayer.name : mover.name;
    if(attacker.rooted){
      log('🌳 ' + attacker.name + ' está Echando raíces — no puede hacer el movimiento de impulso.');
      finishPushSequence(pendingFollowUp);
      return;
    }
    if(playerHasSkill(attacker, 'furia', 'frenzy') && !occupiedBy(followUpVacatedR, followUpVacatedC)){
      log('😡 ' + attacker.name + ' tiene Furia — el movimiento de impulso es obligatorio.');
      resolveFollowUp(true);
      return;
    }
    document.getElementById('followUpText').textContent = `¿${attacker.name} avanza a la casilla que deja libre ${targetName}?`;
    document.getElementById('followUpModal').classList.add('show');
    broadcastState();
  } else {
    finishPushSequence(pendingFollowUp);
  }
}

function resolveFollowUp(doFollow){
  const info = pendingFollowUp;
  pendingFollowUp = null;
  document.getElementById('followUpModal').classList.remove('show');
  let landedOnBall = false;
  if(info && doFollow){
    const attacker = players.find(x=>x.id===info.attackerId);
    if(attacker && !occupiedBy(info.vacatedR, info.vacatedC)){
      attacker.row = info.vacatedR; attacker.col = info.vacatedC;
      log('👣 ' + attacker.name + ' avanza al hueco.');
      if(ball.carrierId===null && ball.row===info.vacatedR && ball.col===info.vacatedC && attacker.condition==='standing'){
        landedOnBall = true;
      }
      checkTouchdown(attacker);
    }
  }
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
  finishPushSequence(info);
  if(landedOnBall){
    const attacker = players.find(x=>x.id===info.attackerId);
    if(attacker) openCatchModal(attacker, false, true);
  }
}

function isBigGuy(p){
  const combined = ((p.position||'') + ' ' + (p.skills||[]).join(' ')).toLowerCase();
  return combined.includes('grandullón') || combined.includes('grandullon') || combined.includes('big guy');
}

function secureTheBall(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p || p.condition!=='standing' || p.team!==state.active || p.activated) return;
  if(isBigGuy(p)){ alert('Los jugadores con la clave Grandullón no pueden declarar Asegurar el Balón.'); return; }
  if(ball.carrierId!==null || ball.row===null){ alert('No hay ningún balón suelto en el campo.'); return; }
  const enemyNear = players.some(p2 => p2.onPitch && p2.team!==p.team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-ball.row), Math.abs(p2.col-ball.col)) <= 2);
  if(enemyNear){ alert('El balón está a 2 casillas o menos de un rival en pie (no Despistado) — no se puede declarar esta acción.'); return; }

  secureBallUsedByTeam[p.team] = true;
  secureBallActivePlayer = p.id;
  log('🔒 ' + p.name + ' declara Asegurar el Balón — moved hasta el balón casilla a casilla.');
  renderRosters(); renderPitch(); renderSelInfo();
  updateStatus('Mueve a ' + p.name + ' hasta el balón suelto. Al llegar, se hará la tirada de Asegurar el Balón.');
  broadcastState();
}

function openSecureBallRoll(p){
  pendingSecureBall = { playerId: p.id };
  secureBallRerollUsed = false;
  document.getElementById('secureBallText').textContent = `${p.name} intenta Asegurar el Balón — necesita 2+ (solo falla con un 1). Tirad D6.`;
  document.getElementById('secureBallDie').textContent = '–';
  document.getElementById('secureBallResultText').textContent = '';
  document.getElementById('secureBallResultText').className = 'check-result';
  document.getElementById('secureBallRollBtn').style.display = 'block';
  document.getElementById('secureBallActionRow').style.display = 'none';
  document.getElementById('secureBallActionRow').innerHTML = '';
  document.getElementById('secureBallModal').classList.add('show');
  broadcastState();
}

function rollSecureBallDie(){
  if(!pendingSecureBall) return;
  const r = Math.floor(Math.random()*6)+1;
  document.getElementById('secureBallDie').textContent = r;
  const p = players.find(x=>x.id===pendingSecureBall.playerId);
  const success = r>=2;
  pendingSecureBall.lastSuccess = success;
  log('🎲 Asegurar el Balón: tirada ' + r + ' → ' + (success?'CONSEGUIDO':'FALLADO'));
  checkActionButtons('secureBall', success, p);
  broadcastState();
}

function resolveSecureBall(success){
  const p = players.find(x=>x.id===(pendingSecureBall && pendingSecureBall.playerId));
  document.getElementById('secureBallModal').classList.remove('show');
  pendingSecureBall = null;
  if(!p){ broadcastState(); return; }
  p.activated = true;
  selected = null;
  if(success){
    ball.carrierId = p.id;
    log('🔒 ' + p.name + ' asegura el balón. Su activación termina.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    checkTouchdown(p);
  } else {
    log('💥 ' + p.name + ' falla Asegurar el Balón — el balón rebota y el turno de equipo termina aquí.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    startBallBounce();
    autoTurnoverThenEndTurn();
  }
}

const POSITION_BORDER_COLORS = [
  { keys:['línea', 'linea', 'lineman'], color:'#9e9e9e' },        // gris
  { keys:['lanzador', 'thrower'], color:'#f5f5f5' },               // blanco
  { keys:['blitzer'], color:'#e53935' },                           // rojo
  { keys:['defensor', 'blocker'], color:'#43a047' },               // verde
  { keys:['receptor', 'catcher'], color:'#fdd835' },               // amarillo
  { keys:['grandullón', 'grandullon', 'big guy'], color:'#0089E8' }, // azul
  { keys:['especial', 'special'], color:'#8e44ad' },               // morado
  { keys:['corredor', 'runner'], color:'#f39c12' },                // naranja
  { keys:['starplayer', 'star player'], color:'#d4af37' }          // dorado
];

function positionBorderColor(p){
  const skillsText = (p.skills || []).join(' | ').toLowerCase();
  const posText = (p.position || '').toLowerCase();
  const combined = skillsText + ' ' + posText;
  if(posText.includes('journeyman') || posText.includes('journey')) return null; // sin color, forzado (mirando "position")
  const match = POSITION_BORDER_COLORS.find(entry => entry.keys.some(k=>combined.includes(k)));
  return match ? match.color : null;
}

function normalizeSkillText(s){
  // NFC normaliza combinaciones de acentos (p.ej. "n"+"~" vs "ñ" precompuesta) y luego quitamos
  // los diacríticos por completo, para que una diferencia de codificación invisible en el JSON
  // del equipo (habitual al copiar/pegar desde Excel/Word) nunca impida detectar una habilidad
  // que el usuario ve perfectamente escrita en pantalla.
  return (s || '')
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function playerHasSkill(p, ...keywords){
  if(!p || !p.skills) return false;
  const lower = p.skills.map(normalizeSkillText);
  return keywords.some(k => { const nk = normalizeSkillText(k); return lower.some(s => s.includes(nk)); });
}

function checkEquilibrioFirme(p){
  if(!p || !playerHasSkill(p, 'equilibrio firme', 'sure feet')) return false;
  const roll = Math.floor(Math.random()*6)+1;
  const resisted = roll===6;
  log('🎲 Equilibrio Firme de ' + p.name + ': ' + roll + (resisted ? ' — ¡RESISTE, no cae!' : ' — no resiste, cae con normalidad.'));
  return resisted;
}

function getPlayerTrait(p){
  // Orden importante: comprobar las más específicas antes que las genéricas (p.ej. "realmente estúpido" contiene "estúpido").
  if(playerHasSkill(p, 'realmente estúpido', 'realmente estupido', 'really stupid')) return 'reallyStupid';
  if(playerHasSkill(p, 'estúpido', 'estupido', 'bone-head', 'bonehead')) return 'stupid';
  if(playerHasSkill(p, 'echar raíces', 'echar raices', 'take root')) return 'takeRoot';
  if(playerHasSkill(p, 'ferocidad animal', 'wild animal')) return 'wildAnimal';
  if(playerHasSkill(p, 'ira descontrolada', 'really wild')) return 'uncontrolledRage';
  return null;
}

const TRAIT_LABELS = {
  stupid: 'Estúpido',
  reallyStupid: 'Realmente Estúpido',
  takeRoot: 'Echar Raíces',
  wildAnimal: 'Ferocidad Animal',
  uncontrolledRage: 'Ira Descontrolada'
};

function traitTargetAndModifier(p, trait, actionLabel){
  // Devuelve { target, modifier, modifierNote }. Todas estas tiradas son ÚNICAS, sin reroll de ningún tipo.
  if(trait==='stupid'){
    return { target:2, modifier:0, modifierNote:'' };
  }
  if(trait==='takeRoot'){
    return { target:2, modifier:0, modifierNote:'' };
  }
  if(trait==='reallyStupid'){
    const hasHelper = players.some(p2 => p2.onPitch && p2.id!==p.id && p2.team===p.team && p2.condition==='standing' &&
      Math.max(Math.abs(p2.row-p.row), Math.abs(p2.col-p.col))===1 &&
      getPlayerTrait(p2)!=='reallyStupid');
    return { target:4, modifier: hasHelper?2:0, modifierNote: hasHelper ? ' (+2 por compañero en pie adyacente)' : '' };
  }
  if(trait==='wildAnimal' || trait==='uncontrolledRage'){
    const isAggro = (actionLabel==='blitz' || actionLabel==='block' || actionLabel==='standblitz');
    return { target:4, modifier: isAggro?2:0, modifierNote: isAggro ? ' (+2 por Placaje/Blitz)' : '' };
  }
  return { target:2, modifier:0, modifierNote:'' };
}

function runTraitCheckThen(p, actionLabel){
  const trait = getPlayerTrait(p);
  if(!trait || (trait==='takeRoot' && p.condition==='tumbado')){
    // Echar Raíces solo se comprueba "activado estando En pie" — no aplica al intentar levantarse.
    proceedDeclaredAction(p, actionLabel);
    return;
  }
  pendingTraitCheck = { playerId: p.id, actionLabel, trait };
  const info = traitTargetAndModifier(p, trait, actionLabel);
  pendingTraitCheck.target = info.target;
  pendingTraitCheck.modifier = info.modifier;
  document.getElementById('traitCheckTitle').textContent = '🎲 ' + TRAIT_LABELS[trait].toUpperCase();
  document.getElementById('traitCheckText').textContent =
    p.name + ' tiene ' + TRAIT_LABELS[trait] + ' — necesita ' + info.target + '+' + info.modifierNote + '. Tirada única, sin repetición. Tirad D6.';
  document.getElementById('traitCheckDie').textContent = '–';
  document.getElementById('traitCheckMathText').textContent = '';
  document.getElementById('traitCheckResultText').textContent = '';
  document.getElementById('traitCheckResultText').className = 'check-result';
  document.getElementById('traitCheckRollBtn').style.display = 'block';
  document.getElementById('traitCheckContinueBtn').style.display = 'none';
  document.getElementById('traitCheckModal').classList.add('show');
  broadcastState();
}

function rollTraitCheck(){
  if(!pendingTraitCheck) return;
  const p = players.find(x=>x.id===pendingTraitCheck.playerId);
  if(!p){ document.getElementById('traitCheckModal').classList.remove('show'); pendingTraitCheck=null; broadcastState(); return; }
  const raw = Math.floor(Math.random()*6)+1;
  const modified = raw + pendingTraitCheck.modifier;
  const success = modified >= pendingTraitCheck.target;
  document.getElementById('traitCheckDie').textContent = raw;
  document.getElementById('traitCheckMathText').textContent = pendingTraitCheck.modifier
    ? ('Tirada ' + raw + ' + ' + pendingTraitCheck.modifier + ' = ' + modified + ' (necesita ' + pendingTraitCheck.target + '+)')
    : ('Tirada ' + raw + ' (necesita ' + pendingTraitCheck.target + '+)');
  document.getElementById('traitCheckResultText').textContent = success ? '✅ SUPERADO' : '❌ FALLADO';
  document.getElementById('traitCheckResultText').className = 'check-result ' + (success ? 'ok' : 'fail');
  document.getElementById('traitCheckRollBtn').style.display = 'none';
  document.getElementById('traitCheckContinueBtn').style.display = 'block';
  log('🎲 ' + TRAIT_LABELS[pendingTraitCheck.trait] + ' de ' + p.name + ': ' + raw + (pendingTraitCheck.modifier?'+'+pendingTraitCheck.modifier:'') + ' vs ' + pendingTraitCheck.target + '+ → ' + (success?'SUPERADO':'FALLADO'));
  pendingTraitCheck.success = success;
  broadcastState();
}

function closeTraitCheckModal(){
  if(!pendingTraitCheck){ document.getElementById('traitCheckModal').classList.remove('show'); broadcastState(); return; }
  const p = players.find(x=>x.id===pendingTraitCheck.playerId);
  const info = pendingTraitCheck;
  document.getElementById('traitCheckModal').classList.remove('show');
  pendingTraitCheck = null;
  if(!p){ broadcastState(); return; }

  if(info.success){
    proceedDeclaredAction(p, info.actionLabel);
    return;
  }

  applyTraitFailure(p, info.trait);
}

function applyTraitFailure(p, trait){
  const wasTumbado = (p.condition==='tumbado');
  if(trait==='stupid' || trait==='reallyStupid'){
    if(!wasTumbado) p.condition = 'despistado';
    p.activated = true;
    selected = null; declaredAction = null;
    log('😵‍💫 ' + p.name + ' falla ' + TRAIT_LABELS[trait] + (wasTumbado ? ' — sigue Tumbado, activación terminada.' : ' — queda Distraído, activación terminada.'));
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }
  if(trait==='uncontrolledRage'){
    p.activated = true;
    selected = null; declaredAction = null;
    log('🗯️ ' + p.name + ' falla Ira Descontrolada — ruge de forma incoherente, activación terminada.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }
  if(trait==='takeRoot'){
    p.rooted = true;
    p.activated = true;
    selected = null; declaredAction = null;
    log('🌳 ' + p.name + ' Echa Raíces en su casilla — no podrá moverse en los próximos turnos.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }
  if(trait==='wildAnimal'){
    const mates = players.filter(p2 => p2.onPitch && p2.id!==p.id && p2.team===p.team && p2.condition==='standing' &&
      Math.max(Math.abs(p2.row-p.row), Math.abs(p2.col-p.col))===1);
    if(mates.length===0){
      if(!wasTumbado) p.condition = 'despistado';
      p.activated = true;
      selected = null; declaredAction = null;
      log('🐗 ' + p.name + ' falla Ferocidad Animal sin compañeros adyacentes' + (wasTumbado ? ' — sigue Tumbado.' : ' — queda Distraído.'));
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
      return;
    }
    p.activated = true;
    selected = null; declaredAction = null;
    pendingFerocityAttack = { attackerId: p.id };
    log('🐗 ' + p.name + ' falla Ferocidad Animal — elegid a qué compañero adyacente ataca (click en él).');
    updateStatus(p.name + ' ataca a un compañero — click en el compañero adyacente elegido.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }
}

function startRefereeArgument(fouler){
  const roll = Math.floor(Math.random()*6)+1;
  if(roll<=4){
    fouler.condition = 'expelled';
    fouler.onPitch = false; fouler.row = null; fouler.col = null;
    if(ball.carrierId===fouler.id) ball.carrierId = null;
    log('🟥 ' + fouler.name + ' protesta al árbitro (D6=' + roll + ') — "¡ME DA IGUAL!" Expulsado del resto del partido.');
  } else {
    log('🟨 ' + fouler.name + ' protesta al árbitro (D6=' + roll + ') — "AHORA QUE LO DICES..." No es expulsado, vuelve a su casilla. Cambio de turno igualmente.');
  }
  renderRosters(); renderPitch(); renderScoreboard(); renderSelInfo();
  broadcastState();
  autoTurnoverThenEndTurn();
}

let pendingApunalarContext = null; // { attackerId, targetId }

function startApunalarOn(attacker, target){
  attacker.activated = true;
  selected = null;
  declaredAction = null;
  pendingApunalarContext = { attackerId: attacker.id, targetId: target.id };
  log('🔪 ' + attacker.name + ' Apuñala a ' + target.name + ' — tirada de Armadura sin modificadores.');
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
  openArmorModal(target);
}

function startFoulOn(fouler, target){
  const offAssisters = getAssistingPlayers(fouler.team, target.id, fouler.id, 'foulOff');
  const defAssisters = getAssistingPlayers(target.team, fouler.id, target.id, 'foulDef');
  const modifier = offAssisters.length - defAssisters.length;
  pendingFoulContext = {
    foulerId: fouler.id, targetId: target.id,
    offAssists: offAssisters.length, defAssists: defAssisters.length, modifier,
    doubleDetected: false, ajuste: ajusteFouler===fouler.id
  };
  if(ajusteFouler===fouler.id) ajusteFouler = null;
  const assistTxt = (offAssisters.length>0 || defAssisters.length>0)
    ? (' (' + (offAssisters.length>0 ? '+'+offAssisters.length+' apoyo ofensivo ('+joinNames(offAssisters)+')' : '') +
       (offAssisters.length>0 && defAssisters.length>0 ? ', ' : '') +
       (defAssisters.length>0 ? '-'+defAssisters.length+' apoyo defensivo ('+joinNames(defAssisters)+')' : '') + ')')
    : '';
  log('🥊 ' + fouler.name + ' comete Falta contra ' + target.name + assistTxt + '.');
  openArmorModal(target);
}

function resolveHandoffTo(p, target){
  ball.carrierId = null;
  ball.row = target.row; ball.col = target.col;
  log('🤝 ' + p.name + ' entrega el balón a ' + target.name + '.');
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
  openCatchModal(target, false, true, 0, '', true); // voluntary=true -> rebote+cambio de turno automático si falla; useAtraparSkill=true
}

function resolveFerocityAttack(targetId){
  if(!pendingFerocityAttack) return;
  const attacker = players.find(x=>x.id===pendingFerocityAttack.attackerId);
  const target = players.find(x=>x.id===targetId);
  if(!attacker || !target) return;
  if(target.team!==attacker.team || target.condition!=='standing' || target.onPitch!==true ||
     Math.max(Math.abs(target.row-attacker.row), Math.abs(target.col-attacker.col))!==1){
    alert('Ese jugador no es un compañero en pie adyacente válido.');
    return;
  }
  pendingFerocityAttack = null;
  const wasCarrier = ball.carrierId===target.id;
  target.condition = 'tumbado'; target.rooted = false;
  log('🐗 ' + attacker.name + ' ataca a su compañero ' + target.name + ' — Derribado de inmediato.');
  queueBallDropIfCarrier(target.id, target.row, target.col);
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
  pendingArmorQueue = [target.id];
  golpeMortiferoMap[target.id] = attacker.id;
  if(wasCarrier){
    pendingTurnoverAfterResolve = true;
    log('🔄 El compañero derribado llevaba el balón — cambio de turno.');
  }
  processNextArmorInQueue();
}

function proceedDeclaredAction(p, actionLabel){
  selected = p.id;
  if(p.condition==='despistado'){
    p.condition = 'standing';
    log('✅ ' + p.name + ' supera su chequeo y deja de estar Despistado.');
  }
  if(actionLabel==='move'){
    declaredAction = 'move';
    renderPitch(); renderRosters(); renderSelInfo();
    broadcastState();
  } else if(actionLabel==='blitz'){
    declaredAction = 'blitz';
    declareBlitz();
  } else if(actionLabel==='block'){
    declaredAction = 'block';
    startBlockTargeting();
  } else if(actionLabel==='secureball'){
    declaredAction = 'secureball';
    secureTheBall();
  } else if(actionLabel==='handoff'){
    declaredAction = 'handoff';
    renderPitch(); renderRosters(); renderSelInfo();
    updateStatus(p.name + ' declara Entrega de Balón — mueve hasta quedar adyacente a un compañero en pie.');
    broadcastState();
  } else if(actionLabel==='pass'){
    declaredAction = 'pass';
    renderPitch(); renderRosters(); renderSelInfo();
    updateStatus(p.name + ' declara Pase — mueve y luego click derecho para lanzar.');
    broadcastState();
  } else if(actionLabel==='foul'){
    declaredAction = 'foul';
    renderPitch(); renderRosters(); renderSelInfo();
    updateStatus(p.name + ' declara Falta — mueve hasta quedar adyacente a un rival Tumbado o Aturdido.');
    broadcastState();
  } else if(actionLabel==='standfin'){
    standUp();
    endActivation(p.id);
  } else if(actionLabel==='standmove'){
    standUp();
    declaredAction = 'move';
    renderPitch(); renderRosters(); renderSelInfo();
    broadcastState();
  } else if(actionLabel==='standblitz'){
    standUp();
    declaredAction = 'blitz';
    declareBlitz();
  } else if(actionLabel==='standsecureball'){
    standUp();
    declaredAction = 'secureball';
    secureTheBall();
  } else if(actionLabel==='standhandoff'){
    standUp();
    declaredAction = 'handoff';
    renderPitch(); renderRosters(); renderSelInfo();
    updateStatus(p.name + ' declara Entrega de Balón — mueve hasta quedar adyacente a un compañero en pie.');
    broadcastState();
  } else if(actionLabel==='standpass'){
    standUp();
    declaredAction = 'pass';
    renderPitch(); renderRosters(); renderSelInfo();
    updateStatus(p.name + ' declara Pase — mueve y luego click derecho para lanzar.');
    broadcastState();
  } else if(actionLabel==='standfoul'){
    standUp();
    declaredAction = 'foul';
    renderPitch(); renderRosters(); renderSelInfo();
    updateStatus(p.name + ' declara Falta — mueve hasta quedar adyacente a un rival Tumbado o Aturdido.');
    broadcastState();
  }
}

const PASS_ZONE_NAMES = ['Pase Rápido', 'Pase Corto', 'Pase Largo', 'Bomba Larga'];
const PASS_ZONE_PENALTIES = [0, 1, 2, 3];

// ---------- Habilidad: Pase a lo loco ----------
function handlePassTargetChosen(passer, r, c){
  const zone = passRangeZone(r-passer.row, c-passer.col);
  const hasHailMary = playerHasSkill(passer, 'pase a lo loco', 'hail mary pass') && weatherKind()!=='ventisca';
  if(zone===-1){
    if(hasHailMary){ declarePassTarget(passer, r, c, 3, true); } // fuera de alcance: solo posible con Pase a lo loco (Bomba larga)
    else { updateStatus(weatherKind()==='ventisca' ? 'Ventisca: solo se pueden hacer Pases Rápidos o Cortos.' : 'Esa casilla está fuera del alcance máximo de pase.'); }
    return;
  }
  if(hasHailMary){ openHailMaryChoice(passer, r, c, zone); return; } // dentro de alcance: puede elegir entre pase normal o a lo loco
  declarePassTarget(passer, r, c, zone, false);
}

function openHailMaryChoice(passer, r, c, zone){
  pendingPassTargetSelection = null;
  pendingHailMaryChoice = { passerId: passer.id, r, c, zone };
  renderHailMaryModal();
  broadcastState();
}

function renderHailMaryModal(){
  const m = document.getElementById('hailMaryModal');
  if(!m) return;
  if(!pendingHailMaryChoice){ m.classList.remove('show'); return; }
  const p = players.find(x=>x.id===pendingHailMaryChoice.passerId);
  document.getElementById('hailMaryText').textContent = (p ? p.name : 'Este jugador') +
    ' tiene Pase a lo loco. ¿Pase normal (' + PASS_ZONE_NAMES[pendingHailMaryChoice.zone] + ') o Pase a lo loco (Bomba larga, preciso = impreciso, sin intercepción)?';
  m.classList.add('show');
}

function hailMaryChooseNormal(){
  if(!pendingHailMaryChoice) return;
  const h = pendingHailMaryChoice; pendingHailMaryChoice = null;
  renderHailMaryModal();
  const passer = players.find(x=>x.id===h.passerId);
  if(!passer){ broadcastState(); return; }
  declarePassTarget(passer, h.r, h.c, h.zone, false);
}

function hailMaryChooseWild(){
  if(!pendingHailMaryChoice) return;
  const h = pendingHailMaryChoice; pendingHailMaryChoice = null;
  renderHailMaryModal();
  const passer = players.find(x=>x.id===h.passerId);
  if(!passer){ broadcastState(); return; }
  declarePassTarget(passer, h.r, h.c, 3, true);
}

function hailMaryCancel(){
  if(!pendingHailMaryChoice) return;
  const h = pendingHailMaryChoice; pendingHailMaryChoice = null;
  pendingPassTargetSelection = { passerId: h.passerId }; // vuelve a elegir casilla objetivo
  renderHailMaryModal();
  renderPitch(); renderSelInfo();
  broadcastState();
}

// ---------- Habilidad: Animosidad ----------
function animosityEntries(p){
  return (p && p.skills ? p.skills : []).filter(s=>{ const n = normalizeSkillText(s); return n.includes('animosidad') || n.includes('animosity'); });
}

// Texto donde buscar la clave: habilidades/claves del jugador (sin sus propias Animosidades) + posición.
function keywordHaystack(p){
  const parts = (p.skills || []).filter(s=>{ const n = normalizeSkillText(s); return !(n.includes('animosidad') || n.includes('animosity')); });
  if(p.position) parts.push(p.position);
  return parts.map(normalizeSkillText);
}

function animosityAppliesTo(passer, receiver){
  if(!passer || !receiver || passer.id===receiver.id || passer.team!==receiver.team) return false;
  const entries = animosityEntries(passer);
  if(entries.length===0) return false;
  const hay = keywordHaystack(receiver);
  return entries.some(s=>{
    const m = String(s).match(/\(([^)]*)\)/);
    const inner = m ? normalizeSkillText(m[1]).trim() : '';
    if(inner==='' || inner.includes('todo') || inner.includes('toda') || inner.includes('all')) return true; // Animosidad (todos / todo el equipo / all)
    return inner.split(/,|\/|\by\b|\bo\b|\band\b|\bor\b/).map(x=>x.trim()).filter(Boolean).some(k=> hay.some(h=>h.includes(k)));
  });
}

function resolveAnimosityCheck(passer, receiver, kind){
  const raw = Math.floor(Math.random()*6)+1;
  const success = raw!==1;
  log('🎲 Animosidad de ' + passer.name + ' (' + (kind==='handoff' ? 'entrega a ' : 'pase a ') + receiver.name + '): ' + raw + ' → ' + (success ? 'ACEPTA' : 'SE NIEGA'));
  if(!success){
    passer.activated = true; selected = null; declaredAction = null;
    updateStatus('🙅 ' + passer.name + ' se niega por Animosidad a ' + (kind==='handoff' ? 'entregar el balón a ' : 'pasar el balón a ') + receiver.name + ' — su activación termina. Conserva el balón, sin cambio de turno.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
  }
  return success;
}

function openAnimosityCheck(passer, receiver, kind, ctx){
  pendingAnimosity = { playerId: passer.id, receiverId: receiver.id, kind, ctx: ctx || {} };
  renderAnimosityModal();
  broadcastState();
}

function renderAnimosityModal(){
  const m = document.getElementById('animosityModal');
  if(!m) return;
  if(!pendingAnimosity){ m.classList.remove('show'); return; }
  const a = pendingAnimosity;
  const p = players.find(x=>x.id===a.playerId);
  const r = players.find(x=>x.id===a.receiverId);
  const what = a.kind==='handoff' ? 'entregar el balón a' : 'pasar el balón a';
  const rolled = (a.roll!==undefined && a.roll!==null);
  document.getElementById('animosityText').textContent = (p ? p.name : 'Este jugador') + ' tiene Animosidad y quiere ' + what + ' ' +
    (r ? r.name : 'un compañero') + '. Con un 1 se niega y su activación termina. Tirada única. Tirad D6.';
  document.getElementById('animosityDie').textContent = rolled ? a.roll : '–';
  const res = document.getElementById('animosityResultText');
  res.textContent = !rolled ? '' : (a.success ? '✅ ACEPTA' : '❌ SE NIEGA');
  res.className = 'check-result' + (!rolled ? '' : (a.success ? ' ok' : ' fail'));
  document.getElementById('animosityRollBtn').style.display = rolled ? 'none' : 'block';
  document.getElementById('animosityContinueBtn').style.display = rolled ? 'block' : 'none';
  m.classList.add('show');
}

function rollAnimosity(){
  if(!pendingAnimosity || (pendingAnimosity.roll!==undefined && pendingAnimosity.roll!==null)) return;
  const raw = Math.floor(Math.random()*6)+1;
  pendingAnimosity.roll = raw;
  pendingAnimosity.success = raw!==1;
  const p = players.find(x=>x.id===pendingAnimosity.playerId);
  log('🎲 Animosidad de ' + (p ? p.name : '?') + ': ' + raw + ' → ' + (raw===1 ? 'SE NIEGA' : 'ACEPTA'));
  renderAnimosityModal();
  broadcastState();
}

function continueAnimosity(){
  if(!pendingAnimosity || pendingAnimosity.roll===undefined || pendingAnimosity.roll===null) return;
  const a = pendingAnimosity;
  pendingAnimosity = null;
  renderAnimosityModal();
  const p = players.find(x=>x.id===a.playerId);
  if(!p){ broadcastState(); return; }
  if(!a.success){
    const r = players.find(x=>x.id===a.receiverId);
    p.activated = true; selected = null; declaredAction = null;
    log('🙅 ' + p.name + ' se niega a ' + (a.kind==='handoff' ? 'entregar el balón' : 'pasar el balón') + (r ? ' a ' + r.name : '') +
      ' por Animosidad — su activación termina. Conserva el balón, sin cambio de turno.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }
  if(a.kind==='pass'){
    startPassRoll(p, a.ctx.targetR, a.ctx.targetC, a.ctx.zone, !!a.ctx.hailMary);
  } else if(a.kind==='handoff'){
    const mover = players.find(x=>x.id===a.ctx.moverId);
    const carrier = players.find(x=>x.id===a.ctx.carrierId);
    const receiver = players.find(x=>x.id===a.ctx.receiverId);
    if(!mover || !carrier || !receiver){ broadcastState(); return; }
    mover.activated = true; selected = null; declaredAction = null;
    resolveHandoffTo(carrier, receiver);
  }
}

function declarePassTarget(passer, targetR, targetC, zone, hailMary){
  pendingPassTargetSelection = null;
  // Animosidad: si en la casilla objetivo hay un compañero afectado, hay que tirar antes de lanzar.
  const receiver = players.find(x=>x.onPitch && x.row===targetR && x.col===targetC && x.id!==passer.id);
  if(receiver && animosityAppliesTo(passer, receiver)){
    if(!resolveAnimosityCheck(passer, receiver, 'pass')) return;
  }
  startPassRoll(passer, targetR, targetC, zone, hailMary);
}

function startPassRoll(passer, targetR, targetC, zone, hailMary){
  pendingPassTargetSelection = null;
  const hasNerviosPass = playerHasSkill(passer, 'nervios de acero', 'nerves of steel');
  const markers = hasNerviosPass ? 0 : countOpponentTackleZones(passer.row, passer.col, passer.team);
  const wxPassPen = weatherKind()==='soleado' ? 1 : 0;
  const totalPenalty = PASS_ZONE_PENALTIES[zone] + markers + wxPassPen;
  pendingPassRoll = { passerId: passer.id, targetR, targetC, zone, totalPenalty, hailMary: !!hailMary };
  if(despAvail(passer.team, 5) && confirm('¿Usar ESCENA ENSAYADA en este Pase? El pasador necesita 2+ (más modificadores) y el receptor atrapa el pase con base 2+. Se gasta al usarla.')){
    despSpend(passer.team, 5); pendingPassRoll.escena = true; escenaCatch[passer.team] = true;
    log('🎭 ESCENA ENSAYADA: ' + teamName(passer.team) + ' la usa en este Pase (pasador 2+, recepción 2+, más modificadores).');
    renderResourceIcons();
  }
  const target = pendingPassRoll.escena ? 2 : parseAgTarget(passer.ag);
  document.getElementById('passText').textContent = (hailMary ? 'PASE A LO LOCO (' + PASS_ZONE_NAMES[zone] + ')' : PASS_ZONE_NAMES[zone]) + ' de ' + passer.name +
    ' — necesita ' + target + '+ (' + (pendingPassRoll.escena ? 'Escena ensayada: base 2+' : 'AG' + (passer.ag ?? '?')) + ', modificador -' + totalPenalty +
    ((markers>0 || wxPassPen>0) ? ' = -' + PASS_ZONE_PENALTIES[zone] + ' por el rango' + (markers>0 ? ', -' + markers + ' por marcaje' : '') + (wxPassPen>0 ? ', -1 por Muy soleado' : '') : ' por el rango') + '). Tirad 1D6.';
  document.getElementById('passDie').textContent = '–';
  document.getElementById('passResultText').textContent = '';
  document.getElementById('passResultText').className = 'check-result';
  document.getElementById('passRollBtn').style.display = 'block';
  document.getElementById('passActionRow').style.display = 'none';
  document.getElementById('passActionRow').innerHTML = '';
  document.getElementById('passModal').classList.add('show');
  passer.activated = true;
  declaredAction = null;
  selected = null;
  renderPitch(); renderRosters(); renderSelInfo();
  broadcastState();
}

function rollPassDie(){
  if(!pendingPassRoll) return;
  const raw = Math.floor(Math.random()*6)+1;
  finishPassRoll(raw);
}

function finishPassRoll(raw){
  const passer = players.find(x=>x.id===pendingPassRoll.passerId);
  const modified = raw - pendingPassRoll.totalPenalty;
  const target = pendingPassRoll.escena ? 2 : parseAgTarget(passer.ag);
  let outcome;
  if(raw===6) outcome = 'preciso';
  else if(raw===1) outcome = playerHasSkill(passer, 'pase seguro', 'safe pass') ? 'safepass' : 'perdido';
  else if(modified<=1) outcome = 'perdido';
  else if(modified>=target) outcome = 'preciso';
  else outcome = 'impreciso';
  let hailMaryDowngrade = false;
  if(pendingPassRoll.hailMary && outcome==='preciso'){ outcome = 'impreciso'; hailMaryDowngrade = true; }
  pendingPassRoll.lastOutcome = outcome;
  document.getElementById('passDie').textContent = raw;
  const resEl = document.getElementById('passResultText');
  resEl.textContent = outcome==='preciso' ? '✅ PRECISO' : (outcome==='safepass' ? '🛡️ PASE SEGURO — SIN BALÓN PERDIDO' : (outcome==='impreciso' ? (hailMaryDowngrade ? '➖ IMPRECISO (Pase a lo loco: el preciso cuenta como impreciso)' : '➖ IMPRECISO') : '❌ BALÓN PERDIDO'));
  resEl.className = 'check-result ' + (outcome==='preciso' || outcome==='safepass' ? 'ok' : 'fail');
  log('🎲 Pase de ' + passer.name + ': ' + raw + ' - ' + pendingPassRoll.totalPenalty + ' = ' + modified + ' (necesitaba ' + target + '+) → ' + outcome.toUpperCase());
  document.getElementById('passRollBtn').style.display = 'none';
  broadcastState();
  renderPassActionRow(passer, outcome);
}

function renderPassActionRow(passer, outcome){
  const row = document.getElementById('passActionRow');
  row.innerHTML = '';
  if(outcome==='preciso' || outcome==='safepass' || pendingPassRoll.rerollUsed){
    row.style.display = 'none';
    broadcastState();
    setTimeout(()=>{
      document.getElementById('passModal').classList.remove('show');
      resolvePassOutcome(passer, outcome);
    }, (outcome==='preciso' || outcome==='safepass') ? 900 : 300);
    return;
  }
  row.style.display = 'flex';
  const hasPasarSkill = playerHasSkill(passer, 'pasar', 'pass') && !passer.passSkillUsedThisTurn;
  if(hasPasarSkill){
    const btn = document.createElement('button');
    btn.textContent = '🔁 Usar Pasar (repite gratis)';
    btn.onclick = ()=> usePassReroll(true);
    row.appendChild(btn);
  } else if((teamRerollsLeft[passer.team] || 0) > 0){
    const btn = document.createElement('button');
    btn.textContent = '🔄 Usar Reroll de equipo (quedan ' + teamRerollsLeft[passer.team] + ')';
    btn.onclick = ()=> usePassReroll(false);
    row.appendChild(btn);
  }
  if(playerHasSkill(passer, 'veterano', 'veteran') && !passer.veteranoUsedThisMatch){
    const vbtn = document.createElement('button');
    vbtn.textContent = '⭐ Usar Veterano (repite, 1 vez/partido)';
    vbtn.onclick = ()=> usePassVeteranoReroll();
    row.appendChild(vbtn);
  }
  const acceptBtn = document.createElement('button');
  acceptBtn.textContent = 'Aceptar resultado';
  acceptBtn.className = 'primary';
  acceptBtn.onclick = ()=>{
    row.style.display = 'none';
    document.getElementById('passModal').classList.remove('show');
    broadcastState();
    resolvePassOutcome(passer, outcome);
  };
  row.appendChild(acceptBtn);
  broadcastState();
}

function usePassReroll(isSkill){
  if(!pendingPassRoll) return;
  pendingPassRoll.rerollUsed = true;
  const passer = players.find(x=>x.id===pendingPassRoll.passerId);
  if(isSkill){
    passer.passSkillUsedThisTurn = true;
    log('🔁 ' + passer.name + ' repite gratis con su habilidad Pasar.');
  } else {
    if(captainSavesReroll(passer.team)){
      log('🔄 ' + teamName(passer.team) + ' repite la tirada sin gastar reroll (Capitán) — siguen ' + teamRerollsLeft[passer.team] + '.');
    } else {
      teamRerollsLeft[passer.team] = Math.max(0, (teamRerollsLeft[passer.team]||0) - 1);
      log('🔄 ' + teamName(passer.team) + ' gasta un reroll — quedan ' + teamRerollsLeft[passer.team] + '.');
    }
    renderStaffPanels();
    if(lonerBlocksReroll(passer)){
      renderPassActionRow(passer, pendingPassRoll.lastOutcome);
      return;
    }
  }
  document.getElementById('passActionRow').style.display = 'none';
  document.getElementById('passRollBtn').style.display = 'block';
  document.getElementById('passResultText').textContent = '';
  document.getElementById('passResultText').className = 'check-result';
  document.getElementById('passDie').textContent = '–';
  broadcastState();
}

function usePassVeteranoReroll(){
  if(!pendingPassRoll) return;
  pendingPassRoll.rerollUsed = true;
  const passer = players.find(x=>x.id===pendingPassRoll.passerId);
  passer.veteranoUsedThisMatch = true; renderScoreboard();
  log('⭐ ' + passer.name + ' repite su tirada de Pase usando VETERANO (1 vez por partido).');
  document.getElementById('passActionRow').style.display = 'none';
  document.getElementById('passRollBtn').style.display = 'block';
  document.getElementById('passResultText').textContent = '';
  document.getElementById('passResultText').className = 'check-result';
  document.getElementById('passDie').textContent = '–';
  broadcastState();
}

function scatterFrom(r, c, steps){
  let curR = r, curC = c;
  for(let i=0;i<steps;i++){
    const dirRoll = Math.floor(Math.random()*8)+1;
    const off = kickoffDirOffset(dirRoll);
    log('🎲 Desvío ' + (i+1) + '/' + steps + ': D8=' + dirRoll + '.');
    const nr = curR + off.dr, nc = curC + off.dc;
    if(nr<0 || nr>=ROWS || nc<0 || nc>=COLS){
      return { outOfBounds:true, exitR:nr, exitC:nc, fromR:curR, fromC:curC };
    }
    curR = nr; curC = nc;
  }
  return { outOfBounds:false, r:curR, c:curC };
}

let pendingPassTurnoverMode = null; // null | 'always' | 'ifNotTeam'
let pendingPassOriginalTeam = null;

function finalizePassTurnoverIfNeeded(){
  if(pendingPassTurnoverMode==='always'){
    pendingPassTurnoverMode = null;
    pendingPassOriginalTeam = null;
    autoTurnoverThenEndTurn();
  } else if(pendingPassTurnoverMode==='ifNotTeam'){
    const team = pendingPassOriginalTeam;
    pendingPassTurnoverMode = null;
    pendingPassOriginalTeam = null;
    const carrier = ball.carrierId!==null ? players.find(x=>x.id===ball.carrierId) : null;
    if(!carrier || carrier.team!==team){
      autoTurnoverThenEndTurn();
    }
  }
}

function resolvePassOutcome(passer, outcome){
  const { targetR, targetC, hailMary } = pendingPassRoll;
  pendingPassRoll = null;
  if(outcome==='safepass'){
    log('🛡️ ' + passer.name + ' evita el Balón Perdido con Pase Seguro — mantiene la posesión y su activación termina. Sin cambio de turno.');
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }
  ball.carrierId = null;
  ballInFlight = true;
  pendingPassOriginalTeam = passer.team;
  if(outcome==='perdido'){
    pendingPassTurnoverMode = 'always';
    log('🏈 ¡BALÓN PERDIDO! El balón cae y rebota desde la casilla de ' + passer.name + '. Cambio de turno.');
    const scatter = scatterFrom(passer.row, passer.col, 1);
    if(scatter.outOfBounds){
      log('🏈 El balón sale del campo al rebotar — se produce una devolución.');
      resolveThrowIn(scatter.exitR, scatter.exitC, scatter.fromR, scatter.fromC, 0);
    } else {
      resolvePassFinalLanding(scatter.r, scatter.c, false);
    }
    return;
  }
  pendingPassTurnoverMode = 'ifNotTeam';
  if(outcome==='impreciso'){
    log('🏈 Pase impreciso — se desvía 3 veces desde la casilla objetivo.');
    const scatter = scatterFrom(targetR, targetC, 3);
    if(scatter.outOfBounds){
      log('🏈 El balón sale del campo al escorarse — se produce una devolución.');
      resolveThrowIn(scatter.exitR, scatter.exitC, scatter.fromR, scatter.fromC, 0);
      return;
    }
    finishPassLandingWithIntercept(passer, scatter.r, scatter.c, outcome, hailMary);
    return;
  }
  log('🎯 ¡Pase preciso! El balón aterriza en la casilla objetivo.');
  finishPassLandingWithIntercept(passer, targetR, targetC, outcome, hailMary);
}

function finishPassLandingWithIntercept(passer, landR, landC, outcome, noIntercept){
  if(noIntercept){ log('🙏 Un Pase a lo loco no puede interceptarse.'); }
  const candidates = (noIntercept || playerHasSkill(passer, 'partenubes', 'cloud burster')) ? [] : playersNearPassLine(passer.row, passer.col, landR, landC, passer.team);
  if(candidates.length>0){
    pendingInterceptionChoice = { landR, landC, outcome, candidateIds: candidates.map(p=>p.id) };
    updateStatus('¿Algún rival intenta interceptar el pase? (resaltados en azul, click en uno, o "sin intercepción").');
    document.getElementById('interceptChoicePanel').style.display = 'block';
    renderPitch(); renderSelInfo();
    broadcastState();
    return;
  }
  resolvePassFinalLanding(landR, landC, outcome==='preciso');
}

function declineInterception(){
  if(!pendingInterceptionChoice) return;
  const { landR, landC, outcome } = pendingInterceptionChoice;
  pendingInterceptionChoice = null;
  document.getElementById('interceptChoicePanel').style.display = 'none';
  log('🖐️ Ningún rival intenta interceptar — el pase continúa.');
  renderPitch();
  broadcastState();
  resolvePassFinalLanding(landR, landC, outcome==='preciso');
}

function attemptInterception(id){
  if(!pendingInterceptionChoice) return;
  const interceptor = players.find(x=>x.id===id);
  if(!interceptor) return;
  const outcome = pendingInterceptionChoice.outcome;
  document.getElementById('interceptChoicePanel').style.display = 'none';
  const zonePenalty = outcome==='preciso' ? 3 : 2;
  const markers = countOpponentTackleZones(interceptor.row, interceptor.col, interceptor.team);
  const escurridizoPenalty = playerHasSkill(interceptor, 'escurridizo', 'diving tackle immune', 'slippery') ? 1 : 0;
  const rainPen = weatherKind()==='lluvia' ? 1 : 0;
  const target = parseAgTarget(interceptor.ag) + zonePenalty + markers + escurridizoPenalty + rainPen;
  pendingInterceptionRoll = { interceptorId: interceptor.id, target };
  document.getElementById('interceptText').textContent = interceptor.name + ' intenta interceptar — necesita ' + target + '+ (AG' + (interceptor.ag ?? '?') +
    ' -' + zonePenalty + ' por ser ' + (outcome==='preciso' ? 'un pase preciso' : 'un pase impreciso') +
    (markers>0 ? (', -' + markers + ' por marcaje') : '') +
    (escurridizoPenalty>0 ? ', -1 por Escurridizo' : '') + (rainPen>0 ? ', -1 por Lluvioso' : '') + '). Tirad 1D6.';
  document.getElementById('interceptDie').textContent = '–';
  document.getElementById('interceptResultText').textContent = '';
  document.getElementById('interceptResultText').className = 'check-result';
  document.getElementById('interceptModal').classList.add('show');
  renderPitch();
  broadcastState();
}

function rollInterceptDie(){
  if(!pendingInterceptionRoll) return;
  const raw = Math.floor(Math.random()*6)+1;
  const interceptor = players.find(x=>x.id===pendingInterceptionRoll.interceptorId);
  const success = raw===6 ? true : raw>=pendingInterceptionRoll.target;
  document.getElementById('interceptDie').textContent = raw;
  const resEl = document.getElementById('interceptResultText');
  resEl.textContent = success ? '✅ ¡INTERCEPTADO!' : '❌ FALLADO';
  resEl.className = 'check-result ' + (success ? 'ok' : 'fail');
  log('🎲 Intercepción de ' + (interceptor ? interceptor.name : '?') + ': ' + raw + ' (necesitaba ' + pendingInterceptionRoll.target + '+) → ' + (success ? 'CONSEGUIDA' : 'FALLADA'));
  broadcastState();
  setTimeout(()=>{
    document.getElementById('interceptModal').classList.remove('show');
    resolveInterceptionResult(interceptor, success);
  }, 900);
}

function resolveInterceptionResult(interceptor, success){
  const { landR, landC, outcome } = pendingInterceptionChoice;
  pendingInterceptionRoll = null;
  pendingInterceptionChoice = null;
  if(success && interceptor){
    ball.carrierId = interceptor.id;
    ballInFlight = false;
    log('🖐️ ¡' + interceptor.name + ' intercepta el pase!');
    pendingPassTurnoverMode = null;
    pendingPassOriginalTeam = null;
    renderPitch(); renderRosters(); renderSelInfo();
    broadcastState();
    checkTouchdown(interceptor);
    if(!pendingTD) autoTurnoverThenEndTurn();
    return;
  }
  log('🖐️ ' + (interceptor ? interceptor.name : 'El rival') + ' falla el intento de intercepción — el pase continúa.');
  renderPitch();
  broadcastState();
  resolvePassFinalLanding(landR, landC, outcome==='preciso');
}

// ---------- Recepción Heroica ----------
// "Este jugador puede intentar atrapar el balón si cae en una casilla de su zona de defensa (adyacente a él)
// debido a un pase, una patada inicial o una devolución. No aplica si el balón rebota hasta esa casilla."
function hasRecepcionHeroica(p){
  return !!p && playerHasSkill(p, 'recepción heroica', 'recepcion heroica', 'heroic reception');
}

function findHeroicReceptionCandidates(r, c){
  return players.filter(p => p.onPitch && p.condition==='standing' &&
    Math.max(Math.abs(p.row-r), Math.abs(p.col-c))===1 &&
    hasRecepcionHeroica(p));
}

// Devuelve true si se ha ofrecido el intento (y por tanto el flujo se detiene aquí a esperar al Entrenador);
// false si no hay candidatos y el llamador debe continuar con la resolución normal.
function offerHeroicReception(r, c, resumeKind, resumeData){
  const candidates = findHeroicReceptionCandidates(r, c);
  if(candidates.length===0) return false;
  pendingHeroicReception = { landR: r, landC: c, candidateIds: candidates.map(p=>p.id), resumeKind, resumeData: resumeData || {} };
  updateStatus('🌟 Recepción Heroica: ¿algún jugador resaltado en dorado intenta atrapar el balón?');
  document.getElementById('heroicReceptionPanel').style.display = 'block';
  renderPitch(); renderSelInfo();
  broadcastState();
  return true;
}

function isValidHeroicReceptionTarget(id){
  return !!pendingHeroicReception && pendingHeroicReception.candidateIds.includes(id);
}

function resumeAfterHeroicReceptionDecline(landR, landC, resumeKind, resumeData){
  if(resumeKind==='pass'){
    if(resumeData.mustBounceOnceIfEmpty){
      const dirRoll = Math.floor(Math.random()*8)+1;
      const off = kickoffDirOffset(dirRoll);
      log('🎲 Rebote: D8=' + dirRoll + '.');
      resolvePassFinalLanding(landR+off.dr, landC+off.dc, false, false);
    } else {
      ballInFlight = false;
      ball.row = landR; ball.col = landC;
      renderPitch(); renderRosters(); renderSelInfo();
      log('🏈 El balón queda suelto en el campo.');
      broadcastState();
      finalizePassTurnoverIfNeeded();
    }
  } else if(resumeKind==='kickoff'){
    log('🏈 El balón queda en el campo tras el saque.');
    checkDriveStartAfterBounce();
  } else if(resumeKind==='throwin'){
    log('🏈 La devolución queda suelta en el campo.');
    checkDriveStartAfterBounce();
  }
}

function declineHeroicReception(){
  if(!pendingHeroicReception) return;
  const { landR, landC, resumeKind, resumeData } = pendingHeroicReception;
  pendingHeroicReception = null;
  document.getElementById('heroicReceptionPanel').style.display = 'none';
  log('🏈 Sin intento de Recepción Heroica — el balón sigue su curso.');
  renderPitch();
  broadcastState();
  resumeAfterHeroicReceptionDecline(landR, landC, resumeKind, resumeData);
}

function attemptHeroicReception(id){
  if(!pendingHeroicReception || !pendingHeroicReception.candidateIds.includes(id)) return;
  const candidate = players.find(x=>x.id===id);
  if(!candidate) return;
  const { landR, landC, resumeKind } = pendingHeroicReception;
  pendingHeroicReception = null;
  document.getElementById('heroicReceptionPanel').style.display = 'none';
  ball.carrierId = null;
  ballInFlight = false;
  ball.row = landR; ball.col = landC;
  renderPitch();
  broadcastState();
  const noModifiers = (resumeKind==='kickoff');
  const extraPenalty = (resumeKind==='throwin') ? 1 : 0;
  const extraReason = (resumeKind==='throwin') ? 'devolución' : '';
  openCatchModal(candidate, noModifiers, false, extraPenalty, extraReason, true, 'atrapar el balón (Recepción Heroica)', 0, 'heroic');
}

function resolvePassFinalLanding(r, c, mustBounceOnceIfEmpty, isDirectLanding){
  if(isDirectLanding===undefined) isDirectLanding = true;
  r = Math.max(0, Math.min(ROWS-1, r));
  c = Math.max(0, Math.min(COLS-1, c));
  const occ = occupiedBy(r,c);
  if(occ && occ.condition==='standing'){
    ballInFlight = false;
    ball.row = r; ball.col = c;
    renderPitch(); renderRosters(); renderSelInfo();
    broadcastState();
    const rhBonus = (mustBounceOnceIfEmpty && hasRecepcionHeroica(occ)) ? 1 : 0;
    openCatchModal(occ, false, false, mustBounceOnceIfEmpty ? 0 : 1, mustBounceOnceIfEmpty ? '' : 'pase', true, 'atrapar el pase', rhBonus, 'pass');
    return;
  }
  if(!occ && isDirectLanding){
    if(offerHeroicReception(r, c, 'pass', { mustBounceOnceIfEmpty })) return;
  }
  if(occ || mustBounceOnceIfEmpty){
    const dirRoll = Math.floor(Math.random()*8)+1;
    const off = kickoffDirOffset(dirRoll);
    log('🎲 Rebote' + (occ ? (' sobre ' + occ.name + ' (' + occ.condition + ')') : '') + ': D8=' + dirRoll + '.');
    resolvePassFinalLanding(r+off.dr, c+off.dc, false, false);
    return;
  }
  ballInFlight = false;
  ball.row = r; ball.col = c;
  renderPitch(); renderRosters(); renderSelInfo();
  log('🏈 El balón queda suelto en el campo.');
  broadcastState();
  finalizePassTurnoverIfNeeded();
}

function parseAgTarget(agStr){
  const n = parseInt(agStr, 10);
  return isNaN(n) ? 4 : n;
}

function parseAvTarget(avStr){
  const n = parseInt(avStr, 10);
  return isNaN(n) ? 8 : n;
}

let golpeMortiferoMap = {}; // { fallingPlayerId: attackerId } — Golpe Mortífero elegible en esta caída concreta
let llaveDeBrazoMap = {}; // { fallingPlayerId: opponentId } — Llave de Brazo elegible en esta caída concreta (esquiva fallida)
let golpeMortiferoUsedOnArmor = false;
let llaveDeBrazoUsedOnArmor = false;

let pendingRobarBalonContinuation = null; // { attackerId, defenderId, fallKind, directInjuryPlayerId, isBlitz } — el 'info' original de finishPushSequence

function finishPushSequence(info){
  if(!info) return;
  const attacker = players.find(x=>x.id===info.attackerId);
  const defender = players.find(x=>x.id===info.defenderId);

  if(attacker && defender && ball.carrierId===defender.id && playerHasSkill(attacker, 'robar balón', 'strip ball')){
    ball.carrierId = null;
    log('🏈 Robar Balón: ' + defender.name + ' deja caer el balón en su casilla al ser empujado por ' + attacker.name + '.');
    pendingRobarBalonContinuation = info;
    const dirRoll = Math.floor(Math.random()*8)+1;
    const off = kickoffDirOffset(dirRoll);
    log('🎲 Rebote (Robar Balón): D8=' + dirRoll + '.');
    const nr = defender.row + off.dr, nc = defender.col + off.dc;
    renderPitch();
    broadcastState();
    if(nr<0 || nr>=ROWS || nc<0 || nc>=COLS){
      log('🏈 El balón sale del campo al rebotar — se produce una devolución.');
      resolveThrowIn(nr, nc, defender.row, defender.col, 0);
    } else {
      resolveBounce(nr, nc);
    }
    return; // la caída/heridas del empujado se retoma en cuanto el rebote quede resuelto del todo
  }

  continueFinishPushSequenceAfterSteal(info);
}

function continueFinishPushSequenceAfterSteal(info){
  if(!info) return;
  const attacker = players.find(x=>x.id===info.attackerId);

  if(info.directInjuryPlayerId){
    const defender = players.find(x=>x.id===info.directInjuryPlayerId);
    if(defender){ openInjuryDirect(defender); }
  } else if(info.fallKind){
    const defender = players.find(x=>x.id===info.defenderId);
    if(defender){
      if(checkEquilibrioFirme(defender)){
        log('🛡️ ' + defender.name + ' resiste la caída con Equilibrio Firme — se queda en pie.');
        renderRosters(); renderPitch(); renderSelInfo();
        broadcastState();
        return;
      }
      defender.condition = 'tumbado'; defender.rooted = false;
      log('💥 ' + defender.name + (info.fallKind==='pow' ? ' cae (POW).' : ' cae (desequilibrado).'));
      queueBallDropIfCarrier(defender.id, defender.row, defender.col);
      renderRosters(); renderPitch();
      broadcastState();
      if(attacker) golpeMortiferoMap[defender.id] = attacker.id;
      openArmorModal(defender);
    }
  } else {
    // plain push, defender still standing — check Furia/Frenzy
    const defender = players.find(x=>x.id===info.defenderId);
    if(attacker && defender && attacker.condition==='standing' && defender.condition==='standing'){
      const stillAdjacent = Math.max(Math.abs(attacker.row-defender.row), Math.abs(attacker.col-defender.col))===1;
      if(stillAdjacent && playerHasSkill(attacker, 'furia', 'frenzy')){
        log('😡 ¡FURIA! ' + attacker.name + ' debe repetir el placaje.');
        executeBlockHit(attacker, defender, info.isBlitz);
        return; // el propio placaje repetido gestiona la continuación del Blitz si procede
      }
    }
  }

  if(info.isBlitz && attacker && attacker.condition==='standing' && !attacker.activated){
    selected = attacker.id;
    renderPitch(); renderSelInfo();
    updateStatus(attacker.name + ' puede seguir moviéndose (Blitz).');
    broadcastState();
  }
}

function checkTouchdown(p){
  if(ball.carrierId!==p.id) return;
  const opponentEndzoneCol = p.team==='A' ? (COLS-1) : 0;
  if(p.col===opponentEndzoneCol){
    pendingTD = { team: p.team, name: p.name };
    document.getElementById('tdText').textContent = `${teamName(p.team)} anota con ${p.name}!`;
    document.getElementById('tdModal').classList.add('show');
  }
}

// ---------- Ball: loose position, bounces, catching, kickoff ----------
function ballPosition(){
  if(ball.carrierId!==null){
    const carrier = players.find(x=>x.id===ball.carrierId);
    if(carrier) return { row: carrier.row, col: carrier.col };
  }
  if(ball.row===null) return null;
  return { row: ball.row, col: ball.col };
}

function bounceDirectionNumber(baseR, baseC, r, c){
  const dr = r - baseR, dc = c - baseC;
  const map = {
    '-1,-1':1, '-1,0':2, '-1,1':3,
    '0,-1':4,           '0,1':5,
    '1,-1':6, '1,0':7, '1,1':8
  };
  return map[dr+','+dc] || null;
}

function isValidBounceCell(r,c){
  if(!ballBounceActive) return false;
  const pos = ballPosition();
  if(!pos) return false;
  const dist = Math.max(Math.abs(pos.row-r), Math.abs(pos.col-c));
  return dist===1 && r>=0 && r<ROWS && c>=0 && c<COLS;
}

function startBallBounce(){
  ballBounceActive = true;
  document.getElementById('ballBouncePanel').style.display = 'block';
  document.getElementById('bounceDirDie').textContent = '–';
  renderPitch();
  updateStatus('El balón bota: tirad 1D8 y elegid la casilla adyacente correspondiente (resaltada en azul).');
  broadcastState();
}

function resolveBounce(r,c){
  ballBounceActive = false;
  ball.row = r; ball.col = c;
  document.getElementById('ballBouncePanel').style.display = 'none';
  renderPitch();
  broadcastState();

  const occ = occupiedBy(r,c);
  if(!occ){
    log('🏈 El balón queda suelto en el campo.');
    checkDriveStartAfterBounce();
    return;
  }
  if(occ.condition==='standing'){
    const inPassChain = pendingPassTurnoverMode!==null;
    openCatchModal(occ, false, false, 1, inPassChain ? '' : 'rebote', inPassChain, inPassChain ? 'atrapar el pase' : undefined, 0, inPassChain ? 'pass' : 'pickup');
  } else {
    log('🏈 El balón bota sobre ' + occ.name + ' (' + occ.condition + ') y sigue botando.');
    startBallBounce();
  }
}

// ---------- Capitán / Profesional / habilidades varias ----------
function hasProfesional(p){
  if(!p || !p.skills) return false;
  return p.skills.map(normalizeSkillText).some(t=> t==='pro' || t.includes('profesional') || t.includes('professional'));
}
function isCaptain(p){ return playerHasSkill(p, 'cap: profesional', 'cap:profesional', 'capitan', 'captain'); }
function captainInPlay(team){
  const out = ['ko','injured','injuredGrave','dead','expelled'];
  return players.find(p=>p.team===team && isCaptain(p) && p.onPitch && !out.includes(p.condition)) || null;
}
// CAP: PROFESIONAL — con el Capitán en el campo, al usar una reroll de equipo se tira 1D6: con un 6 la reroll NO se gasta.
function captainSavesReroll(team){
  const cap = captainInPlay(team);
  if(!cap) return false;
  const r = rollDieN(6);
  if(r===6){ log('⭐ Capitán ' + cap.name + ' (' + teamName(team) + '): D6=6 — ¡la reroll NO se gasta!'); return true; }
  log('⭐ Capitán ' + cap.name + ' (' + teamName(team) + '): D6=' + r + ' — la reroll se gasta con normalidad.');
  return false;
}
const BALL_IMG_SRC = 'icons/spiked_ball_1.png';
function ballImgHtml(cls){
  return '<img class="ball-ico' + (cls ? ' ' + cls : '') + '" src="' + BALL_IMG_SRC + '" alt="Balón" onerror="this.outerHTML=\'🏈\'">';
}
function catchKindOf(pc){
  if(!pc) return 'pickup';
  return pc.catchKind || (pc.useAtraparSkill ? 'handoff' : 'pickup');
}
function updateCatchTitle(){
  const el = document.getElementById('catchTitle');
  if(!el) return;
  el.textContent = catchKindOf(pendingCatch)==='pickup' ? 'RECOGER BALÓN' : 'ATRAPAR BALÓN';
}

function openCatchModal(p, noModifiers, voluntary, extraPenalty, extraReason, useAtraparSkill, catchVerb, rhBonus, catchKind){
  const hasNerviosCatch = playerHasSkill(p, 'nervios de acero', 'nerves of steel');
  const markers = (noModifiers || hasNerviosCatch) ? 0 : countOpponentTackleZones(p.row, p.col, p.team);
  const extra = noModifiers ? 0 : (extraPenalty || 0);
  const bonus = noModifiers ? 0 : (rhBonus || 0);
  const rainPen = (!noModifiers && weatherKind()==='lluvia') ? 1 : 0;
  let baseT = parseAgTarget(p.ag);
  const escenaOn = (catchKind==='pass' || catchKind==='heroic') && escenaCatch[p.team];
  if(escenaOn){ baseT = 2; escenaCatch[p.team] = false; log('🎭 ESCENA ENSAYADA: ' + p.name + ' recibe con base 2+ (más modificadores).'); }
  const target = noModifiers ? baseT : baseT + markers + extra + rainPen - bonus;
  pendingCatch = { playerId: p.id, target, voluntary: !!voluntary, useAtraparSkill: !!useAtraparSkill, catchKind: catchKind || (useAtraparSkill ? 'handoff' : 'pickup') };
  catchRerollUsed = false;
  updateCatchTitle();
  let modText;
  if(noModifiers){
    modText = `(AG${p.ag ?? '?'}, sin modificadores — rebote del saque inicial)`;
  } else {
    const parts = [];
    if(markers>0) parts.push('-1 por cada rival marcándole (' + markers + ')');
    if(extra>0) parts.push('-1 por ser ' + (extraReason || 'recogida especial'));
    if(rainPen>0) parts.push('-1 por Lluvioso');
    if(bonus>0) parts.push('+1 por Recepción Heroica (en la casilla objetivo)');
    modText = `(AG${p.ag ?? '?'}${parts.length ? ' ' + parts.join(' ') : ', sin modificadores'})`;
  }
  const verb = catchVerb || (useAtraparSkill ? 'atrapar la entrega de balón' : 'recoger el balón');
  document.getElementById('catchText').textContent = `${p.name} intenta ${verb} — necesita ${target}+ ${modText}. Tirad D6.`;
  document.getElementById('catchDie').textContent = '–';
  document.getElementById('catchResultText').textContent = '';
  document.getElementById('catchResultText').className = 'check-result';
  document.getElementById('catchRollBtn').style.display = 'block';
  document.getElementById('catchActionRow').style.display = 'none';
  document.getElementById('catchActionRow').innerHTML = '';
  document.getElementById('catchModal').classList.add('show');
  broadcastState();
}

function rollCatchDie(){
  if(!pendingCatch) return;
  const r = Math.floor(Math.random()*6)+1;
  document.getElementById('catchDie').textContent = r;
  const p = players.find(x=>x.id===pendingCatch.playerId);
  const success = r===6 ? true : (r===1 ? false : r>=pendingCatch.target);
  pendingCatch.lastSuccess = success;
  log('🎲 ' + (catchKindOf(pendingCatch)==='pickup' ? 'Recoger balón' : 'Atrapar balón') + ': tirada ' + r + ' (necesitaba ' + pendingCatch.target + '+) → ' + (success?'CONSEGUIDO':'FALLADO'));
  checkActionButtons('catch', success, p);
  broadcastState();
}

function resolveCatch(success){
  if(!pendingCatch){ broadcastState(); return; }
  const p = players.find(x=>x.id===pendingCatch.playerId);
  const wasVoluntary = !!pendingCatch.voluntary;
  const kind = pendingCatch.catchKind || (pendingCatch.useAtraparSkill ? 'handoff' : 'pickup');
  document.getElementById('catchModal').classList.remove('show');
  pendingCatch = null;
  const successVerb = kind==='handoff' ? 'atrapa la entrega de balón' : kind==='pass' ? 'atrapa el pase' : kind==='heroic' ? 'atrapa el balón (¡Recepción Heroica!)' : 'recoge el balón';
  const failVerb = kind==='handoff' ? 'falla al atrapar la entrega' : kind==='pass' ? 'falla al atrapar el pase' : kind==='heroic' ? 'falla el intento de Recepción Heroica' : 'falla la recogida';
  if(p && success){
    ball.carrierId = p.id;
    log('🏈 ' + p.name + ' ' + successVerb + '.');
    renderPitch(); renderRosters();
    broadcastState();
    checkTouchdown(p);
    if(!pendingTD) checkDriveStartAfterBounce();
  } else if(p){
    log('🏈 ' + p.name + ' ' + failVerb + ' — el balón rebota.' + (wasVoluntary ? ' Cambio de turno.' : ''));
    broadcastState();
    startBallBounce();
    if(wasVoluntary) autoTurnoverThenEndTurn();
  } else {
    broadcastState();
  }
}

function checkDriveStartAfterBounce(){
  finalizePassTurnoverIfNeeded();
  if(pendingRobarBalonContinuation){
    const info = pendingRobarBalonContinuation;
    pendingRobarBalonContinuation = null;
    continueFinishPushSequenceAfterSteal(info);
  }
  if(pendingDriveStart){
    const team = pendingDriveStart;
    pendingDriveStart = null;
    beginTurn(team);
  }
}

// ---------- Kickoff: manual placement + kick event + double scatter + free catch ----------
let pendingKickPlacement = null; // { kickingTeam, receivingTeam }
let kickoffBounceStep = 0;       // 0 inactive, 1 first scatter, 2 second scatter
let kickoffKickingTeam = null;
let kickoffTargetRow = null;
let kickoffTargetCol = null;
let kickoffReceivingTeam = null;
let kickoffDistance = 1;
let kickoffPendingOOBAfterEvent = false;
let freeCatchTeam = null;

function chefHalflingAtHalfStart(){
  ['A','B'].forEach(t=>{
    const n = incCount(t, 'chef');
    if(!(n>0)) return;
    const other = t==='A' ? 'B' : 'A';
    const dice = [rollDieN(6), rollDieN(6), rollDieN(6)];
    const hits = dice.filter(d=>d>=4).length;
    log('👨‍🍳 CHEF MAESTRO HALFLING (' + teamName(t) + '): D6 ' + dice.join(', ') + ' → ' + hits + ' acierto(s) (4+).');
    if(hits>0){
      const lose = Math.min(hits, teamRerollsLeft[other] || 0);
      teamRerollsLeft[t] = (teamRerollsLeft[t] || 0) + hits;
      teamRerollsLeft[other] = Math.max(0, (teamRerollsLeft[other] || 0) - lose);
      log('👨‍🍳 ' + teamName(t) + ' gana ' + hits + ' Segunda(s) oportunidad(es) para esta parte y ' + teamName(other) + ' pierde ' + lose + '.');
    }
  });
  renderStaffPanels();
}
function beginKickPlacement(kicking, receiving){
  expireFreeRR();
  if((state.turns.A||0)===0 && (state.turns.B||0)===0){ chefHalflingAtHalfStart(); }
  pendingKickPlacement = { kickingTeam: kicking, receivingTeam: receiving };
  document.getElementById('kickPlacementPanel').style.display = 'block';
  document.getElementById('kickPlacementText').textContent =
    `Equipo ${teamName(kicking)}: elegid la casilla del saque (zona neutral, resaltada en verde, o campo de ${teamName(receiving)}).`;
  renderPitch();
  updateStatus('Colocando el balón del saque inicial...');
  broadcastState();
}

function isValidKickPlacementCell(r,c){
  if(!pendingKickPlacement) return false;
  const kicking = pendingKickPlacement.kickingTeam;
  const neutral = (c>=LOS_A+1 && c<=LOS_B-1);
  const opponentHalf = kicking==='A' ? (c>=LOS_B && c<=COLS-2) : (c>=1 && c<=LOS_A);
  return neutral || opponentHalf;
}

function placeKickBall(r,c){
  const info = pendingKickPlacement;
  pendingKickPlacement = null;
  document.getElementById('kickPlacementPanel').style.display = 'none';
  ball.carrierId = null; ball.row = r; ball.col = c;
  kickoffTargetRow = r; kickoffTargetCol = c;
  kickoffKickingTeam = info.kickingTeam;
  kickoffReceivingTeam = info.receivingTeam;
  log('🏈 Saque colocado por ' + teamName(info.kickingTeam) + '.');
  renderPitch();
  broadcastState();
  startKickoffBounce(1);
}

// ---------- Tabla de eventos de patada inicial (2D6) ----------
const KICKOFF_EVENTS = {
  2:{ name:'ÁRBITRO INTIMIDADO', desc:'Cada equipo recibe un Incentivo de Soborno gratuito. Este incentivo debe usarse antes del final del partido.' },
  3:{ name:'TIEMPO MUERTO', desc:'' },
  4:{ name:'DEFENSA ATENTA', desc:'El Entrenador del equipo pateador elige hasta 1D3+1 jugadores Desmarcados de su equipo. Dichos jugadores pueden moverse inmediatamente una casilla en cualquier dirección, incluso entrando en tierra de nadie.' },
  5:{ name:'PATADA ALTA', desc:'Un jugador Desmarcado del equipo receptor puede ser colocado inmediatamente en la casilla en la que va a caer el balón.' },
  6:{ name:'LOS HINCHAS ANIMAN', desc:'Cada Entrenador tira 1D6 y le suma el número de Animadoras de su Hoja de plantilla. La primera acción de Placaje realizada en el siguiente turno del Entrenador que haya sacado un total más alto en esta tirada recibe un apoyo ofensivo adicional. Si la tirada ha sido un empate, ambos Entrenadores reciben este beneficio durante su siguiente turno.' },
  7:{ name:'ENTRENADOR BRILLANTE', desc:'Ambos Entrenadores tiran 1D6 y suman el número de Ayudantes del Entrenador. El Entrenador que saque el resultado más alto (o ambos Entrenadores, si empatan la tirada) obtiene una Segunda oportunidad gratuita para esa entrada.' },
  8:{ name:'CLIMA CAMBIANTE', desc:'' },
  9:{ name:'ANTICIPACIÓN', desc:'El Entrenador del equipo receptor elige hasta 1D3+1 jugadores Desmarcados de su equipo. Dichos jugadores pueden moverse inmediatamente una casilla en cualquier dirección, incluso entrando en tierra de nadie.' },
  10:{ name:'¡A LA CARGA!', desc:'El Entrenador del equipo pateador elige hasta 1D3+1 jugadores Desmarcados de su equipo. Dichos jugadores se pueden activar uno tras otro, como si fuera el turno de su equipo, y realizar una acción de Movimiento gratuita. Uno de ellos puede realizar en su lugar una acción de Penetración gratuita, otro puede realizar en su lugar una acción de Lanzar compañero gratuita, y otro puede realizar en su lugar una acción de Patear compañero gratuita. Si uno de los jugadores elegidos se Cae o es Derribado durante su activación, ya no se pueden activar más jugadores y la Carga termina.' },
  11:{ name:'INDIGESTIÓN', desc:'El Entrenador con el total más bajo, o ambos en caso de empate, determina al azar a uno de sus jugadores sobre el campo. El aperitivo que ha tomado el jugador antes de la entrada no le ha sentado bien, por lo que, mientras dure esa entrada, dicho jugador reduce en 1 su MV y su AR. Con un 1, el aperitivo le ha provocado una evacuación forzosa; coloca al jugador en la zona de Reserva de su equipo, ¡para reflejar que se pasa el resto de la entrada encerrado en la letrina!' },
  12:{ name:'INVASIÓN DE CAMPO', desc:'El Entrenador que saque un total más bajo, o ambos Entrenadores en caso de empate, selecciona al azar un jugador de su equipo que esté sobre el campo. Dichos jugadores son colocados Tumbados boca arriba y quedan Aturdidos.' }
};
let kickoffEvt = null;          // { phase:'roll'|'show'|'board', d1, d2, sum, kind:'alert'|'high', n, moved:[], sel:-1 }
let kickoffLandingOverride = null;   // Clima perfecto (Clima cambiante): aterrizaje tras 3 escoras, sustituye al 2º rebote
let teamFreeRR = { A:-1, B:-1 };   // -1 = sin RR gratuita; si no, nº de RR que tenía el equipo ANTES de recibir la gratuita (Entrenador brillante)
let despisteArmed = { A:false, B:false };   // Jugar al despiste: armado, se liga al siguiente jugador que se active
let ajusteArmed = { A:false, B:false };     // Ajuste de cuentas: la próxima Falta del equipo no expulsa al jugador
let ajusteFouler = null;
let escenaCatch = { A:false, B:false };     // Escena ensayada: la recepción del pase se hace con base 2+
let teamBonusRR = { A:0, B:0 };             // Espionaje deportivo: Segundas oportunidades extra que duran todo el partido
let ownTurnChanged = { A:false, B:false };  // el equipo ya ha tenido un cambio de turno propio
let despisteSt = null;
let wizardSt = null;                        // Mago deportivo: { mode:'gap'|'choose'|'pickCell'|'pickPlayer'|'wait', team, next }
let armorBonusMap = {};                     // Bola de fuego: +1 a la Armadura de estos jugadores { id:{ mod, keep } }                      // solo local: { id, team, stage, snap, first }
let teamBribe = { A:'none', B:'none' };   // none | active | used  (Soborno gratuito de Árbitro intimidado)
let cheerBonus = { A:'none', B:'none' };  // none | pending | active | used  (Los hinchas animan: +1 apoyo en el primer Placaje del próximo turno)

function kickoffEvtTimeoutPreview(){
  const k = kickoffKickingTeam;
  if(!k) return '';
  const kt = state.turns[k] || 0;
  return 'Ficha de turno del equipo pateador (' + teamName(k) + '): turno ' + Math.min(kt,6) + '. ' +
    (kt>=5 ? 'Está en el turno 5 o 6: ambos equipos mueven su ficha de turno un espacio HACIA ATRÁS.' : 'No está en el turno 5 o 6: ambos equipos mueven su ficha de turno un espacio HACIA DELANTE.');
}
function renderKickoffEvent(){
  const modal = document.getElementById('kickoffEventModal');
  const panel = document.getElementById('kickoffEventPanel');
  if(!modal || !panel) return;
  const ev = kickoffEvt;
  const modalOpen = !!ev && (ev.phase==='roll' || ev.phase==='show');
  modal.classList.toggle('show', modalOpen);
  if(modalOpen){
    const rolled = ev.phase==='show';
    document.getElementById('keDie1').textContent = rolled ? ev.d1 : '–';
    document.getElementById('keDie2').textContent = rolled ? ev.d2 : '–';
    document.getElementById('keSum').textContent = rolled ? ('Total: ' + ev.sum) : 'Tirad los dados del evento de patada';
    const def = rolled ? KICKOFF_EVENTS[ev.sum] : null;
    document.getElementById('keName').textContent = rolled ? (def ? def.name : 'RESULTADO ' + ev.sum) : '';
    let desc = '';
    if(rolled){
      if(ev.sum===3) desc = kickoffEvtTimeoutPreview();
      else if(ev.sum===8 && ev.wk && WEATHER_TABLE[ev.wk]) desc = 'Nueva tirada de clima: ' + ev.wa + ' + ' + ev.wb + ' = ' + (ev.wa+ev.wb) + ' → ' + WEATHER_TABLE[ev.wk].name + '. ' + WEATHER_TABLE[ev.wk].desc + (ev.wk==='perfecto' ? ' Con Clima perfecto, el balón se escora 3 veces antes de caer al suelo.' : '');
      else if(def) desc = def.desc;
      else desc = 'Este resultado aún no está automatizado: aplicad el efecto de vuestra tabla de eventos manualmente.';
    }
    document.getElementById('keDesc').textContent = desc;
    document.getElementById('keRollBtn').style.display = rolled ? 'none' : 'block';
    document.getElementById('keOkBtn').style.display = rolled ? 'block' : 'none';
  }
  const boardOpen = !!ev && (ev.phase==='board' || ev.phase==='charge');
  panel.style.display = boardOpen ? 'block' : 'none';
  if(boardOpen){
    const moved = (ev.moved || []).length;
    const btn = document.getElementById('kickoffBoardBtn');
    if(ev.phase==='charge'){
      document.getElementById('kickoffBoardTitle').textContent = '⚡ ¡A LA CARGA!';
      document.getElementById('kickoffBoardText').textContent = teamName(kickoffKickingTeam) + ': activad uno tras otro hasta ' + ev.n + ' jugadores Desmarcados (Movimiento gratuito; uno de ellos puede hacer Penetración en su lugar). Activados ' + (ev.activated||[]).length + '/' + ev.n + '. Si un jugador se Cae o es Derribado, la Carga termina. Cuando acabéis, pulsad el botón.';
      if(btn) btn.textContent = '➡️ Terminar la Carga y continuar al rebote final';
    } else {
      document.getElementById('kickoffBoardTitle').textContent = '🎲 ' + (ev.title || (ev.kind==='alert' ? 'DEFENSA ATENTA' : 'PATADA ALTA'));
      document.getElementById('kickoffBoardText').textContent = ev.kind==='alert'
        ? teamName(ev.team || kickoffKickingTeam) + ': elegid un jugador Desmarcado (resaltado en dorado) y luego la casilla adyacente a la que se mueve (incluida tierra de nadie). Movidos ' + moved + '/' + ev.n + '. Podéis continuar en cualquier momento.'
        : teamName(kickoffReceivingTeam) + ': elegid un jugador Desmarcado (resaltado en dorado) para colocarlo en la casilla donde va a caer el balón, o continuad sin colocar a nadie.';
      if(btn) btn.textContent = '➡️ Continuar al rebote final';
    }
  }
}
function useBribe(team){
  if(teamBribe[team]!=='active') return;
  if(!confirm('¿Marcar como USADO el Soborno de ' + teamName(team) + '? Después no se podrá recuperar.')) return;
  teamBribe[team] = 'used';
  log('🧑‍⚖️ ' + teamName(team) + ' usa su Soborno gratuito.');
  renderScoreboard();
  broadcastState();
}
function showKickoffEvent(){
  cheerBonus = { A:'none', B:'none' };
  kickoffEvt = { phase:'roll', d1:0, d2:0, sum:0, kind:'', n:0, moved:[], sel:-1 };
  renderKickoffEvent();
  rollKickoffEvent2D6();
}

function rollKickoffEvent2D6(){
  if(!kickoffEvt || kickoffEvt.phase!=='roll') return;
  const d1 = Math.floor(Math.random()*6)+1, d2 = Math.floor(Math.random()*6)+1;
  kickoffEvt = { phase:'show', d1, d2, sum:d1+d2, kind:'', n:0, moved:[], sel:-1 };
  if(d1+d2===8){ kickoffEvt.wa = rollDieN(6); kickoffEvt.wb = rollDieN(6); kickoffEvt.wk = weatherKindFromSum(kickoffEvt.wa+kickoffEvt.wb); }
  const def = KICKOFF_EVENTS[d1+d2];
  log('🎲 Evento de patada inicial (2D6): ' + d1 + ' + ' + d2 + ' = ' + (d1+d2) + (def ? ' — ' + def.name + '.' : ' (aplicad el resultado de vuestra tabla).'));
  renderKickoffEvent();
  broadcastState();
}

function kickoffBoardEligible(p, team){
  return !!p && p.team===team && p.onPitch && p.condition==='standing' && !isInOpponentTackleZone(p.row, p.col, p.team);
}
function kickoffReceiverHalfCell(r,c){
  if(c==null || r==null) return false;
  return kickoffReceivingTeam==='A' ? (c>=1 && c<=LOS_A) : (c>=LOS_B && c<=COLS-2);
}
function kickoffAlertCellOk(p, r, c){
  if(r<0||r>=ROWS||c<0||c>=COLS) return false;
  if(Math.max(Math.abs(p.row-r), Math.abs(p.col-c))!==1) return false;
  if(occupiedBy(r,c)) return false;
  // zona permitida: su campo + tierra de nadie (nunca el campo rival ni las zonas de anotación)
  return p.team==='A' ? (c>=1 && c<=LOS_B-1) : (c>=LOS_A+1 && c<=COLS-2);
}
function isKickoffBoardTargetCell(r,c){
  if(!kickoffEvt || kickoffEvt.phase!=='board' || kickoffEvt.kind!=='alert' || kickoffEvt.sel<0) return false;
  const p = players.find(x=>x.id===kickoffEvt.sel);
  return !!p && kickoffAlertCellOk(p,r,c);
}
function isKickoffBoardCandidate(p){
  if(!kickoffEvt || kickoffEvt.phase!=='board') return false;
  if(kickoffEvt.kind==='alert') return kickoffBoardEligible(p, kickoffEvt.team || kickoffKickingTeam) && !(kickoffEvt.moved||[]).includes(p.id) && (kickoffEvt.moved||[]).length < kickoffEvt.n;
  return kickoffBoardEligible(p, kickoffReceivingTeam);
}
function kickoffBoardTokenClick(id){
  const p = players.find(x=>x.id===id);
  if(!p || !isKickoffBoardCandidate(p)) return;
  if(kickoffEvt.kind==='alert'){
    kickoffEvt.sel = (kickoffEvt.sel===id) ? -1 : id;
    renderPitch(); broadcastState();
    return;
  }
  // Patada alta: el jugador se coloca en la casilla donde va a caer el balón
  const r = ball.row, c = ball.col;
  p.row = r; p.col = c;
  log('⬆️ PATADA ALTA: ' + p.name + ' (' + teamName(p.team) + ') se coloca en la casilla donde va a caer el balón.');
  renderPitch(); renderRosters();
  kickoffBoardContinue();
}
function kickoffBoardCellClick(r,c){
  if(!kickoffEvt || kickoffEvt.phase!=='board' || kickoffEvt.kind!=='alert') return;
  const p = kickoffEvt.sel>=0 ? players.find(x=>x.id===kickoffEvt.sel) : null;
  if(!p) return;
  if(!kickoffAlertCellOk(p,r,c)){ kickoffEvt.sel = -1; renderPitch(); broadcastState(); return; }
  p.row = r; p.col = c;
  kickoffEvt.moved = (kickoffEvt.moved || []).concat([p.id]);
  kickoffEvt.sel = -1;
  log('🛡️ ' + (kickoffEvt.title||'DEFENSA ATENTA') + ': ' + p.name + ' se mueve una casilla (' + kickoffEvt.moved.length + '/' + kickoffEvt.n + ').');
  renderPitch(); renderRosters();
  if(kickoffEvt.moved.length >= kickoffEvt.n){ kickoffBoardContinue(); return; }
  renderKickoffEvent();
  broadcastState();
}
function kickoffBoardContinue(){
  if(!kickoffEvt) return;
  if(kickoffEvt.phase==='charge'){ endCharge(); return; }
  finishKickoffEvent();
}
function finishKickoffEvent(){
  kickoffEvt = null;
  renderKickoffEvent();
  continueAfterKickoffEvent();
}

let teamInc = { A:{}, B:{} };           // Incentivos comprados (cheerleaders, assistants, apothecary, wizard, keg, morgue...) — se rellena al implementar la compra
let teamUsedRes = { A:{}, B:{} };       // usos consumidos por partido: apothecary, wizard, morgue
function incCount(team, key){ const n = (teamInc[team] || {})[key]; return (typeof n==='number' && isFinite(n)) ? n : 0; }
function getStaffCount(team, key){
  return getStaffBase(team, key) + incCount(team, key);
}
const STAFF_ALIASES = {
  apothecary:['apothecary','apothecaries','apotecario','apotecarios'],
  assistants:['assistants','assistantCoaches','assistant_coaches','ayudantes'],
  bribes:['bribes','sobornos'],
  cheerleaders:['cheerleaders','animadoras']
};
function getStaffBase(team, key){
  const st = teamStaff[team];
  if(!st || typeof st!=='object') return 0;
  const num = v=> (typeof v==='number' && isFinite(v)) ? v : (typeof v==='string' && v.trim()!=='' && isFinite(Number(v)) ? Number(v) : null);
  const names = STAFF_ALIASES[key] || [key];
  const read = (o)=>{
    if(!o || typeof o!=='object') return null;
    for(const k of names){
      const c = o[k];
      if(c && typeof c==='object'){ const n = num(c.count); if(n!==null) return n; }
      const n2 = num(c); if(n2!==null) return n2;
    }
    return null;
  };
  const fromLeague = read(st.leagueStaff);
  if(fromLeague!==null) return fromLeague;
  const fromRoster = read(st);
  return fromRoster!==null ? fromRoster : 0;
}
function getCheerleaders(team){ return getStaffCount(team,'cheerleaders'); }
function getAssistants(team){ return getStaffCount(team,'assistants'); }
function randomOnPitch(team){
  const pool = players.filter(p=>p.team===team && p.onPitch && p.row!==null);
  return pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
}
function dualRoll(extraFn){
  const r = {};
  ['A','B'].forEach(t=>{ const die = rollDieN(6); const ex = extraFn(t); r[t] = { die, ex, total: die+ex }; });
  const tie = r.A.total===r.B.total;
  return { r, tie, low: tie ? ['A','B'] : [r.A.total<r.B.total ? 'A' : 'B'], high: tie ? ['A','B'] : [r.A.total>r.B.total ? 'A' : 'B'] };
}
function expireFreeRR(){
  ['A','B'].forEach(t=>{
    if(teamFreeRR[t] < 0) return;
    const left = teamRerollsLeft[t] || 0;
    if(left > teamFreeRR[t]){
      teamRerollsLeft[t] = Math.max(0, left - 1);
      log('⏳ ' + teamName(t) + ' pierde la Segunda oportunidad gratuita de Entrenador brillante (no se usó en la entrada).');
    }
    teamFreeRR[t] = -1;
  });
  renderStaffPanels();
}
function chargeGate(p){
  const ev = kickoffEvt;
  if(!ev || ev.phase!=='charge') return true;
  ev.activated = ev.activated || [];
  if(ev.activated.includes(p.id)) return true;
  if(ev.activated.length >= ev.n){ updateStatus('¡A la carga!: ya se han activado los ' + ev.n + ' jugadores permitidos.'); return false; }
  if(!kickoffBoardEligible(p, p.team)){ updateStatus('¡A la carga!: solo pueden activarse jugadores Desmarcados (en pie y fuera de zonas de defensa rivales).'); return false; }
  ev.activated.push(p.id);
  renderKickoffEvent();
  return true;
}
function endCharge(){
  const ev = kickoffEvt;
  if(!ev || ev.phase!=='charge') return;
  const team = kickoffKickingTeam;
  players.filter(p=>p.team===team).forEach(p=>{
    p.activated = false; p.remainingMove = p.ma; p.gfiUsed = 0;
    p.blockedThisActivation = false; p.justStoodThisActivation = false;
    p.dodgeSkillUsedThisTurn = false; p.proRerollUsedThisTurn = false; p.breakTackleUsedThisTurn = false;
  });
  if(ev.prevActive) state.active = ev.prevActive;
  selected = null; declaredAction = null; pendingActionMenuPlayer = null; blitzActivePlayer = null; blockTargeting = null;
  blitzUsedByTeam[team] = false;
  log('⚡ Fin de ¡A LA CARGA! (' + (ev.activated||[]).length + '/' + ev.n + ' jugadores activados).');
  kickoffEvt = null;
  renderKickoffEvent(); renderPitch(); renderRosters(); renderScoreboard();
  continueAfterKickoffEvent();
}

function acceptKickoffEvent(){
  if(!kickoffEvt || kickoffEvt.phase!=='show') return;
  const sum = kickoffEvt.sum;
  const kicking = kickoffKickingTeam, receiving = kickoffReceivingTeam;
  switch(sum){
    case 2:
      teamBribe = { A:'active', B:'active' };
      log('🧑‍⚖️ ÁRBITRO INTIMIDADO: cada equipo recibe un Incentivo de Soborno gratuito (debe usarse antes del final del partido).');
      renderScoreboard();
      finishKickoffEvent();
      return;
    case 3: {
      const kt = state.turns[kicking] || 0;
      const delta = kt>=5 ? -1 : 1;
      state.turns = { A: Math.max(0, Math.min(6, (state.turns.A||0)+delta)), B: Math.max(0, Math.min(6, (state.turns.B||0)+delta)) };
      log('⏱️ TIEMPO MUERTO: la ficha de turno de ' + teamName(kicking) + ' estaba en el turno ' + Math.min(kt,6) + ' — ambos equipos mueven su ficha de turno un espacio hacia ' + (delta<0 ? 'ATRÁS' : 'DELANTE') + ' (' + teamName('A') + ' ' + Math.min(state.turns.A,6) + '/6, ' + teamName('B') + ' ' + Math.min(state.turns.B,6) + '/6).');
      renderScoreboard();
      finishKickoffEvent();
      return;
    }
    case 4: {
      const d3 = Math.floor(Math.random()*3)+1;
      const n = d3 + 1;
      log('🛡️ DEFENSA ATENTA: ' + teamName(kicking) + ' tira 1D3 = ' + d3 + ' → puede mover hasta ' + n + ' jugadores Desmarcados una casilla.');
      if(!players.some(p=>kickoffBoardEligible(p, kicking))){
        log('🛡️ No hay ningún jugador Desmarcado de ' + teamName(kicking) + ' que pueda moverse.');
        finishKickoffEvent();
        return;
      }
      kickoffEvt = { phase:'board', d1:kickoffEvt.d1, d2:kickoffEvt.d2, sum, kind:'alert', n, moved:[], sel:-1, team:kicking, title:'DEFENSA ATENTA' };
      renderKickoffEvent(); renderPitch(); broadcastState();
      return;
    }
    case 5: {
      const inHalf = !kickoffPendingOOBAfterEvent && ball.row!==null && kickoffReceiverHalfCell(ball.row, ball.col);
      const free = ball.row!==null && !occupiedBy(ball.row, ball.col);
      const cands = players.filter(p=>kickoffBoardEligible(p, receiving));
      if(!inHalf){
        log('⬆️ PATADA ALTA: el balón no va a caer en el campo de ' + teamName(receiving) + ' (zona central, campo rival o fuera) — no se coloca ningún jugador.');
        finishKickoffEvent();
        return;
      }
      if(!free){
        log('⬆️ PATADA ALTA: la casilla donde va a caer el balón ya está ocupada — no se coloca ningún jugador.');
        finishKickoffEvent();
        return;
      }
      if(!cands.length){
        log('⬆️ PATADA ALTA: no hay ningún jugador Desmarcado de ' + teamName(receiving) + ' que pueda colocarse.');
        finishKickoffEvent();
        return;
      }
      kickoffEvt = { phase:'board', d1:kickoffEvt.d1, d2:kickoffEvt.d2, sum, kind:'high', n:1, moved:[], sel:-1 };
      renderKickoffEvent(); renderPitch(); broadcastState();
      return;
    }
    case 6: {
      const r = {};
      ['A','B'].forEach(t=>{ const die = Math.floor(Math.random()*6)+1; const ch = getCheerleaders(t); r[t] = { die, ch, total: die+ch }; });
      log('📣 LOS HINCHAS ANIMAN: ' + teamName('A') + ' D6=' + r.A.die + ' + ' + r.A.ch + ' animadora(s) = ' + r.A.total + ' | ' + teamName('B') + ' D6=' + r.B.die + ' + ' + r.B.ch + ' animadora(s) = ' + r.B.total + '.');
      if(r.A.total===r.B.total){
        cheerBonus = { A:'pending', B:'pending' };
        log('📣 Empate: ambos equipos recibirán +1 de apoyo ofensivo en el primer Placaje de su siguiente turno.');
      } else {
        const w = r.A.total>r.B.total ? 'A' : 'B';
        cheerBonus = { A:'none', B:'none' }; cheerBonus[w] = 'pending';
        log('📣 ' + teamName(w) + ' gana la tirada: +1 de apoyo ofensivo adicional en su primera acción de Placaje del siguiente turno (Placaje normal o dentro de Penetración).');
      }
      finishKickoffEvent();
      return;
    }
    case 7: {
      const d = dualRoll(getAssistants);
      log('🧠 ENTRENADOR BRILLANTE: ' + teamName('A') + ' D6=' + d.r.A.die + ' + ' + d.r.A.ex + ' ayudante(s) = ' + d.r.A.total + ' | ' + teamName('B') + ' D6=' + d.r.B.die + ' + ' + d.r.B.ex + ' ayudante(s) = ' + d.r.B.total + '.');
      d.high.forEach(t=>{
        teamFreeRR[t] = teamRerollsLeft[t] || 0;
        teamRerollsLeft[t] = (teamRerollsLeft[t] || 0) + 1;
        log('🧠 ' + teamName(t) + ' obtiene una Segunda oportunidad GRATUITA para esta entrada (si no la usa antes del final de la entrada, se pierde). Segundas oportunidades: ' + teamRerollsLeft[t] + '.');
      });
      renderStaffPanels();
      finishKickoffEvent();
      return;
    }
    case 8: {
      const ev = kickoffEvt;
      const kind = ev.wk || weatherKindFromSum(rollDieN(6)+rollDieN(6));
      preMatch.weather = kind; applyWeatherField(kind);
      log('🌦️ CLIMA CAMBIANTE: nueva tirada de clima ' + ev.wa + ' + ' + ev.wb + ' = ' + (ev.wa+ev.wb) + ' → ' + WEATHER_TABLE[kind].name + '. ' + WEATHER_TABLE[kind].desc);
      if(typeof renderPreMatchBadges==='function') renderPreMatchBadges();
      renderScoreboard();
      if(kind==='perfecto'){
        if(kickoffPendingOOBAfterEvent || ball.row===null){
          log('🌦️ Clima perfecto: el balón ya iba a salir del campo, no se escora.');
        } else {
          let out = false;
          for(let i=1;i<=3 && !out;i++){
            const dir = rollDieN(8), off = kickoffDirOffset(dir);
            const nr = ball.row + off.dr, nc = ball.col + off.dc;
            if(nr<0||nr>=ROWS||nc<0||nc>=COLS){
              log('🌦️ Clima perfecto — escora ' + i + '/3: D8=' + dir + ' → el balón sale del campo.');
              out = true;
            } else {
              ball.row = nr; ball.col = nc;
              log('🌦️ Clima perfecto — escora ' + i + '/3: D8=' + dir + ' → casilla (fila ' + (nr+1) + ', col ' + (nc+1) + ').');
            }
          }
          kickoffLandingOverride = out ? { r:-1, c:-1 } : { r:ball.row, c:ball.col };
          log('🌦️ Las 3 escoras sustituyen al rebote final: el balón cae al suelo.');
          renderPitch();
        }
      }
      finishKickoffEvent();
      return;
    }
    case 9: {
      const d3 = rollDieN(3), n = d3 + 1;
      log('🛡️ ANTICIPACIÓN: ' + teamName(receiving) + ' tira 1D3 = ' + d3 + ' → puede mover hasta ' + n + ' jugadores Desmarcados una casilla.');
      if(!players.some(p=>kickoffBoardEligible(p, receiving))){
        log('🛡️ No hay ningún jugador Desmarcado de ' + teamName(receiving) + ' que pueda moverse.');
        finishKickoffEvent();
        return;
      }
      kickoffEvt = { phase:'board', d1:kickoffEvt.d1, d2:kickoffEvt.d2, sum, kind:'alert', n, moved:[], sel:-1, team:receiving, title:'ANTICIPACIÓN' };
      renderKickoffEvent(); renderPitch(); broadcastState();
      return;
    }
    case 10: {
      const d3 = rollDieN(3), n = d3 + 1;
      log('⚡ ¡A LA CARGA!: ' + teamName(kicking) + ' tira 1D3 = ' + d3 + ' → hasta ' + n + ' jugadores Desmarcados pueden activarse (Movimiento gratuito; uno puede hacer Penetración).');
      if(!players.some(p=>kickoffBoardEligible(p, kicking))){
        log('⚡ No hay ningún jugador Desmarcado de ' + teamName(kicking) + ' que pueda activarse.');
        finishKickoffEvent();
        return;
      }
      kickoffEvt = { phase:'charge', d1:kickoffEvt.d1, d2:kickoffEvt.d2, sum, kind:'', n, moved:[], activated:[], sel:-1, prevActive: state.active || '' };
      state.active = kicking;
      blitzUsedByTeam[kicking] = false;
      selected = null; declaredAction = null;
      renderKickoffEvent(); renderPitch(); renderScoreboard(); broadcastState();
      return;
    }
    case 11: {
      const d = dualRoll(()=>0);
      log('🤢 INDIGESTIÓN: ' + teamName('A') + ' D6=' + d.r.A.total + ' | ' + teamName('B') + ' D6=' + d.r.B.total + (d.tie ? ' (empate: afecta a ambos).' : '.'));
      d.low.forEach(t=>{
        const p = randomOnPitch(t);
        if(!p){ log('🤢 ' + teamName(t) + ' no tiene jugadores sobre el campo.'); return; }
        const die = rollDieN(6);
        if(die===1){
          p.onPitch = false; p.row = null; p.col = null; p.indigestOut = true;
          if(ball.carrierId===p.id) ball.carrierId = null;
          log('🤢 ' + p.name + ' (' + teamName(t) + ') tira D6 = 1: evacuación forzosa. Va a Reservas y no puede desplegarse en esta entrada (el equipo empieza con un jugador menos).');
        } else {
          if(!p.indigestOrig) p.indigestOrig = { ma: p.ma, av: p.av };
          p.ma = Math.max(1, (parseInt(p.ma,10)||1) - 1);
          p.remainingMove = Math.min(p.remainingMove ?? p.ma, p.ma);
          const avN = parseInt(String(p.av), 10);
          if(!isNaN(avN)) p.av = Math.max(2, avN - 1) + '+';
          log('🤢 ' + p.name + ' (' + teamName(t) + ') tira D6 = ' + die + ': el aperitivo le sienta mal — MV ' + p.indigestOrig.ma + '→' + p.ma + ' y AR ' + p.indigestOrig.av + '→' + p.av + ' durante esta entrada.');
        }
      });
      renderRosters(); renderPitch();
      finishKickoffEvent();
      return;
    }
    case 12: {
      const d = dualRoll(t=>getFanFactor(t).value || 0);
      log('📢 INVASIÓN DE CAMPO: ' + teamName('A') + ' D6=' + d.r.A.die + ' + ' + d.r.A.ex + ' (hinchas) = ' + d.r.A.total + ' | ' + teamName('B') + ' D6=' + d.r.B.die + ' + ' + d.r.B.ex + ' (hinchas) = ' + d.r.B.total + (d.tie ? ' (empate: afecta a ambos).' : '.'));
      d.low.forEach(t=>{
        const p = randomOnPitch(t);
        if(!p){ log('📢 ' + teamName(t) + ' no tiene jugadores sobre el campo.'); return; }
        p.condition = 'aturdido'; p.rooted = false;
        if(ball.carrierId===p.id){ ball.carrierId = null; ball.row = p.row; ball.col = p.col; }
        log('📢 Los aficionados invaden el campo: ' + p.name + ' (' + teamName(t) + ') queda Tumbado y Aturdido.');
      });
      renderRosters(); renderPitch();
      finishKickoffEvent();
      return;
    }
    default:
      log('🎲 Resultado ' + sum + ' del evento de patada: aplicad su efecto manualmente (aún no automatizado).');
      finishKickoffEvent();
      return;
  }
}

function continueAfterKickoffEvent(){
  kickoffEvt = null;
  renderKickoffEvent();
  if(kickoffPendingOOBAfterEvent){
    kickoffPendingOOBAfterEvent = false;
    finishKickoffAsFreeCatch();
    return;
  }
  if(kickoffLandingOverride){
    const lo = kickoffLandingOverride; kickoffLandingOverride = null;
    kickoffBounceStep = 2; kickoffDistance = 1;
    resolveKickoffBounce(lo.r, lo.c);
    return;
  }
  const occ = occupiedBy(ball.row, ball.col);
  if(occ && occ.condition==='standing'){
    log('🏈 El balón cae sobre ' + occ.name + ' tras el primer rebote — intenta atraparlo antes del rebote final.');
    pendingDriveStart = kickoffReceivingTeam;
    kickoffTargetRow = null; kickoffTargetCol = null; // el saque ya terminó: quitar la marca de casilla objetivo
    openCatchModal(occ);
    return;
  }
  startKickoffBounce(2);
}

function kickoffDirOffset(n){
  const map = {
    1:{dr:-1,dc:-1}, 2:{dr:-1,dc:0}, 3:{dr:-1,dc:1},
    4:{dr:0,dc:-1},                  5:{dr:0,dc:1},
    6:{dr:1,dc:-1},  7:{dr:1,dc:0},  8:{dr:1,dc:1}
  };
  return map[n];
}

function startKickoffBounce(step){
  kickoffBounceStep = step;
  const dirRoll = Math.floor(Math.random()*8)+1;
  const offset = kickoffDirOffset(dirRoll);
  if(step===1){
    kickoffDistance = Math.floor(Math.random()*6)+1;
    log('🎲 Patada inicial: D8=' + dirRoll + ', D6=' + kickoffDistance + ' casilla(s).');
  } else {
    kickoffDistance = 1;
    log('🎲 Rebote final: D8=' + dirRoll + '.');
  }
  resolveKickoffBounce(ball.row + offset.dr, ball.col + offset.dc);
}

function rollKickoffDistanceDie(){
  const r = Math.floor(Math.random()*6)+1;
  kickoffDistance = r;
  document.getElementById('kickoffDistDie').textContent = r;
  log('🎲 Distancia del rebote (D6): ' + r + ' casillas.');
  broadcastState();
}

function rollKickoffDirDie(){
  const r = Math.floor(Math.random()*8)+1;
  document.getElementById('kickoffDirDie').textContent = r;
  log('🎲 Dirección del rebote (D8): ' + r);
  broadcastState();
}

function rollBounceDirDie(){
  const r = Math.floor(Math.random()*8)+1;
  document.getElementById('bounceDirDie').textContent = r;
  log('🎲 Dirección del rebote (D8): ' + r);
  broadcastState();
}

function isValidKickoffBounceCell(r,c){
  if(!kickoffBounceStep) return false;
  if(ball.row===null) return false;
  const dist = Math.max(Math.abs(ball.row-r), Math.abs(ball.col-c));
  return dist===1 && r>=0 && r<ROWS && c>=0 && c<COLS;
}

function kickoffOutOfBounds(){
  if(!kickoffBounceStep) return;
  log('🌀 El balón sale del campo durante el saque — recepción libre.');
  document.getElementById('kickoffPanel').style.display = 'none';
  kickoffBounceStep = 0;
  finishKickoffAsFreeCatch();
}

function resolveKickoffBounce(r,c){
  const step = kickoffBounceStep;
  kickoffBounceStep = 0;
  document.getElementById('kickoffPanel').style.display = 'none';

  let finalR = r, finalC = c;
  if(step===1){
    const dr = r - ball.row, dc = c - ball.col;
    const dist = kickoffDistance || 1;
    finalR = ball.row + dr*dist;
    finalC = ball.col + dc*dist;
  }

  const outOfBounds = (finalR<0 || finalR>=ROWS || finalC<0 || finalC>=COLS);
  let inKickerHalf = false;
  if(!outOfBounds){
    ball.row = finalR; ball.col = finalC;
    inKickerHalf = kickoffKickingTeam==='A' ? (finalC>=1 && finalC<=LOS_A) : (finalC>=LOS_B && finalC<=COLS-2);
  }
  renderPitch();
  broadcastState();

  if(step===1){
    if(outOfBounds){
      log('🌀 El primer rebote sale del campo — se completa igualmente el evento de patada, y después recepción libre.');
      kickoffPendingOOBAfterEvent = true;
    } else if(inKickerHalf){
      log('🏈 El primer rebote acaba en el campo de ' + teamName(kickoffKickingTeam) + ' — se completa el evento de patada, y después recepción libre.');
      kickoffPendingOOBAfterEvent = true;
    } else {
      kickoffPendingOOBAfterEvent = false;
    }
    showKickoffEvent();
    return;
  }

  // segundo rebote
  if(outOfBounds){
    log('🌀 El balón sale del campo tras el rebote final — recepción libre.');
    finishKickoffAsFreeCatch();
    return;
  }
  if(inKickerHalf){
    log('🏈 El balón acaba en el campo de ' + teamName(kickoffKickingTeam) + ' — recepción libre.');
    finishKickoffAsFreeCatch();
    return;
  }

  pendingDriveStart = kickoffReceivingTeam;
  kickoffTargetRow = null; kickoffTargetCol = null;
  const occ = occupiedBy(finalR, finalC);
  if(occ && occ.condition==='standing'){
    openCatchModal(occ, true);
  } else if(!occ && offerHeroicReception(finalR, finalC, 'kickoff', {})){
    // el flujo continúa cuando el Entrenador decida (attemptHeroicReception / declineHeroicReception)
  } else {
    log('🏈 El balón queda en el campo tras el saque.');
    checkDriveStartAfterBounce();
  }
}

function finishKickoffAsFreeCatch(){
  kickoffBounceStep = 0;
  kickoffTargetRow = null; kickoffTargetCol = null;
  document.getElementById('kickoffPanel').style.display = 'none';
  freeCatchTeam = kickoffReceivingTeam;
  document.getElementById('freeCatchPanel').style.display = 'block';
  document.getElementById('freeCatchText').textContent = 'Recepción libre para ' + teamName(freeCatchTeam) + ': click en vuestro jugador en pie para asignarle el balón.';
  renderPitch();
  updateStatus('Recepción libre: elegid jugador.');
  broadcastState();
}

function assignFreeCatch(playerId){
  const p = players.find(x=>x.id===playerId);
  if(!p || p.team!==freeCatchTeam || !p.onPitch || p.condition!=='standing') return;
  ball.carrierId = p.id;
  const receiving = kickoffReceivingTeam;
  freeCatchTeam = null;
  document.getElementById('freeCatchPanel').style.display = 'none';
  log('🏈 Recepción libre asignada a ' + p.name + '.');
  renderPitch(); renderRosters();
  broadcastState();
  pendingDriveStart = receiving;
  checkTouchdown(p);
  if(!pendingTD) checkDriveStartAfterBounce();
}

// ---------- Dodge / Armor ----------
function countOpponentTackleZones(r,c,team){
  return players.filter(p2 => p2.onPitch && p2.team!==team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-r), Math.abs(p2.col-c))===1).length;
}

function countDodgeTackleZones(r,c,team){
  // Como countOpponentTackleZones, pero un jugador con Canijo no cuenta como zona de marcaje para esquivas rivales.
  return players.filter(p2 => p2.onPitch && p2.team!==team && p2.condition==='standing' &&
    !playerHasSkill(p2, 'canijo', 'puny') &&
    Math.max(Math.abs(p2.row-r), Math.abs(p2.col-c))===1).length;
}

function opponentTackleZonePlayers(r,c,team){
  return players.filter(p2 => p2.onPitch && p2.team!==team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-r), Math.abs(p2.col-c))===1);
}

function checkActionButtons(prefix, success, p){
  const resultEl = document.getElementById(prefix+'ResultText');
  resultEl.textContent = success ? '✅ CONSEGUIDO' : '❌ FALLADO';
  resultEl.className = 'check-result ' + (success ? 'ok' : 'fail');
  document.getElementById(prefix+'RollBtn').style.display = 'none';
  const actionRow = document.getElementById(prefix+'ActionRow');
  actionRow.innerHTML = '';
  actionRow.style.display = 'flex';

  const resolveFn = prefix==='dodge' ? resolveDodge : prefix==='gfi' ? resolveGfi : prefix==='secureBall' ? resolveSecureBall : resolveCatch;

  if(success){
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = '➡️ Continuar';
    btn.onclick = ()=> resolveFn(true);
    actionRow.appendChild(btn);
    return;
  }

  const usedFlag = prefix==='dodge' ? dodgeRerollUsed : prefix==='gfi' ? gfiRerollUsed : prefix==='secureBall' ? secureBallRerollUsed : catchRerollUsed;
  if(!usedFlag){
    const hasDodgeSkill = prefix==='dodge' && playerHasSkill(p, 'esquiva', 'dodge') && !p.dodgeSkillUsedThisTurn && !dodgeBlockedByDefensiveTackle(p);
    const isAtraparCatch = prefix==='catch' && pendingCatch && pendingCatch.useAtraparSkill;
    const hasCatchSkill = prefix==='catch' && !p.catchSkillUsedThisTurn &&
      (isAtraparCatch ? playerHasSkill(p, 'atrapar', 'catch') : playerHasSkill(p, 'manos seguras', 'sure hands'));
    // Nota: Manos Seguras NUNCA ofrece repetición gratis para Asegurar Balón — solo para recoger el balón del suelo.
    // Atrapar es la habilidad correcta para recibir una Entrega de Balón (y, más adelante, un Pase).
    const skillLabel = isAtraparCatch ? 'Atrapar' : 'Manos Seguras';
    const hasFreeSkillReroll = hasDodgeSkill || hasCatchSkill;
    if(hasFreeSkillReroll){
      const btn = document.createElement('button');
      btn.textContent = prefix==='dodge' ? '🔁 Usar Esquivar (repite gratis)' : ('🔁 Usar ' + skillLabel + ' (repite gratis)');
      btn.onclick = ()=> useCheckReroll(prefix, true);
      actionRow.appendChild(btn);
    } else if((teamRerollsLeft[p.team] || 0) > 0){
      const btn = document.createElement('button');
      btn.textContent = '🔄 Usar Reroll (quedan ' + teamRerollsLeft[p.team] + ')';
      btn.onclick = ()=> useCheckReroll(prefix, false);
      actionRow.appendChild(btn);
    }
    if(hasProfesional(p) && !p.proRerollUsedThisTurn && selected===p.id){
      const btn = document.createElement('button');
      btn.textContent = '🎓 Usar Profesional (3+ para poder repetir)';
      btn.onclick = ()=> useProReroll(prefix);
      actionRow.appendChild(btn);
    }
    if(prefix==='catch' && playerHasSkill(p, 'veterano', 'veteran') && !p.veteranoUsedThisMatch){
      const btn = document.createElement('button');
      btn.textContent = '⭐ Usar Veterano (repite, 1 vez/partido)';
      btn.onclick = ()=> useVeteranoReroll(prefix);
      actionRow.appendChild(btn);
    }
  }

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'danger';
  acceptBtn.textContent = '➡️ Continuar (fallado)';
  acceptBtn.onclick = ()=> resolveFn(false);
  actionRow.appendChild(acceptBtn);
}

function useProReroll(prefix){
  const pending = prefix==='dodge' ? pendingDodge : prefix==='gfi' ? pendingGfi : prefix==='secureBall' ? pendingSecureBall : pendingCatch;
  if(!pending) return;
  const p = players.find(x=>x.id===pending.playerId);
  if(!p) return;
  p.proRerollUsedThisTurn = true; // tras intentar usarla, no se puede usar ningún otro tipo de repetición en esa misma tirada
  const proRoll = Math.floor(Math.random()*6)+1;
  if(prefix==='dodge') dodgeRerollUsed = true;
  else if(prefix==='gfi') gfiRerollUsed = true;
  else if(prefix==='secureBall') secureBallRerollUsed = true;
  else catchRerollUsed = true;

  if(proRoll>=3){
    log('🎓 ' + p.name + ' usa Profesional: tirada ' + proRoll + ' (3+) — puede repetir el dado.');
    pending.lastSuccess = undefined;
    document.getElementById(prefix+'ActionRow').style.display = 'none';
    document.getElementById(prefix+'RollBtn').style.display = 'block';
    document.getElementById(prefix+'ResultText').textContent = '';
    document.getElementById(prefix+'ResultText').className = 'check-result';
    document.getElementById(prefix+'Die').textContent = '–';
    broadcastState();
  } else {
    log('🎓 ' + p.name + ' intenta usar Profesional: tirada ' + proRoll + ' (1-2) — NO puede repetir. Habilidad gastada.');
    checkActionButtons(prefix, pending.lastSuccess, p);
    const proFailEl = document.getElementById(prefix+'ResultText');
    if(proFailEl){ proFailEl.innerHTML = proFailEl.textContent + '<br><span style="color:#ff4b3e;font-weight:700;">❌ Tirada Profesional fallada</span>'; }
  }
}

function useCheckReroll(prefix, isSkill){
  const pending = prefix==='dodge' ? pendingDodge : prefix==='gfi' ? pendingGfi : prefix==='secureBall' ? pendingSecureBall : pendingCatch;
  if(!pending) return;
  const p = players.find(x=>x.id===pending.playerId);
  if(!p) return;
  if(prefix==='dodge') dodgeRerollUsed = true;
  else if(prefix==='gfi') gfiRerollUsed = true;
  else if(prefix==='secureBall') secureBallRerollUsed = true;
  else catchRerollUsed = true;
  if(!isSkill){
    if(captainSavesReroll(p.team)){
      log('🔄 ' + teamName(p.team) + ' repite la tirada sin gastar reroll (Capitán) — siguen ' + teamRerollsLeft[p.team] + '.');
    } else {
      teamRerollsLeft[p.team] = Math.max(0, (teamRerollsLeft[p.team]||0) - 1);
      log('🔄 ' + teamName(p.team) + ' gasta un reroll — quedan ' + teamRerollsLeft[p.team] + '.');
    }
    renderStaffPanels();
    if(lonerBlocksReroll(p)){
      checkActionButtons(prefix, pending.lastSuccess, p);
      broadcastState();
      return;
    }
  } else if(prefix==='dodge'){
    p.dodgeSkillUsedThisTurn = true;
    log('🔁 ' + p.name + ' repite gratis con su habilidad Esquivar (ya no podrá volver a usarla este turno).');
  } else {
    p.catchSkillUsedThisTurn = true;
    const usedSkillLabel = (prefix==='catch' && pendingCatch && pendingCatch.useAtraparSkill) ? 'Atrapar' : 'Manos Seguras';
    log('🔁 ' + p.name + ' repite gratis con su habilidad ' + usedSkillLabel + ' (ya no podrá volver a usarla este turno).');
  }
  pending.lastSuccess = undefined;
  document.getElementById(prefix+'ActionRow').style.display = 'none';
  document.getElementById(prefix+'RollBtn').style.display = 'block';
  document.getElementById(prefix+'ResultText').textContent = '';
  document.getElementById(prefix+'ResultText').className = 'check-result';
  document.getElementById(prefix+'Die').textContent = '–';
  broadcastState();
}

function useVeteranoReroll(prefix){
  const pending = prefix==='dodge' ? pendingDodge : prefix==='gfi' ? pendingGfi : prefix==='secureBall' ? pendingSecureBall : pendingCatch;
  if(!pending) return;
  const p = players.find(x=>x.id===pending.playerId);
  if(!p) return;
  if(prefix==='dodge') dodgeRerollUsed = true;
  else if(prefix==='gfi') gfiRerollUsed = true;
  else if(prefix==='secureBall') secureBallRerollUsed = true;
  else catchRerollUsed = true;
  p.veteranoUsedThisMatch = true; renderScoreboard();
  log('⭐ ' + p.name + ' repite la tirada usando VETERANO (1 vez por partido).');
  pending.lastSuccess = undefined;
  document.getElementById(prefix+'ActionRow').style.display = 'none';
  document.getElementById(prefix+'RollBtn').style.display = 'block';
  document.getElementById(prefix+'ResultText').textContent = '';
  document.getElementById(prefix+'ResultText').className = 'check-result';
  document.getElementById(prefix+'Die').textContent = '–';
  broadcastState();
}

// PLACAJE DEFENSIVO: un rival con esta habilidad marcando la casilla de origen anula la habilidad Esquivar del que esquiva.
function defensiveTacklersAt(p){
  return opponentTackleZonePlayers(p.row, p.col, p.team).filter(o=>playerHasSkill(o, 'placaje defensivo', 'defensive tackle'));
}
function dodgeBlockedByDefensiveTackle(p){ return defensiveTacklersAt(p).length>0; }
// PLACAJE HEROICO: rivales en pie con la habilidad que marcan la casilla de origen.
function heroicTacklersAt(p){
  return opponentTackleZonePlayers(p.row, p.col, p.team).filter(o=>playerHasSkill(o, 'placaje heroico', 'heroic tackle'));
}
let pendingHeroicTackle = null; // { candidateIds:[...] } — el entrenador rival decide si usa Placaje heroico tras la esquiva
function renderHeroicTackleModal(){
  const m = document.getElementById('heroicTackleModal');
  if(!m) return;
  if(!pendingHeroicTackle || !pendingDodge){ m.classList.remove('show'); return; }
  const dodger = players.find(x=>x.id===pendingDodge.playerId);
  const lastDie = pendingDodge.lastDie;
  const newTarget = pendingDodge.target + 2;
  const wouldFail = !(lastDie===6 || (lastDie!==1 && lastDie>=newTarget));
  document.getElementById('heroicTackleText').textContent = (dodger ? dodger.name : 'El rival') + ' ha superado su esquiva (tirada ' + lastDie + ', necesitaba ' + pendingDodge.target + '+). ¿Algún rival usa PLACAJE HEROICO? Aplica −2 a esa tirada (pasaría a necesitar ' + newTarget + '+, ' + (wouldFail ? 'FALLARÍA' : 'seguiría superándola') + ') y el placador queda Tumbado en la casilla que deja vacante. Solo uno puede usarlo.';
  const box = document.getElementById('heroicTackleBtns');
  box.innerHTML = '';
  pendingHeroicTackle.candidateIds.forEach(id=>{
    const h = players.find(x=>x.id===id);
    if(!h) return;
    const b = document.createElement('button');
    b.className = 'primary';
    b.textContent = '⚔️ #' + h.num + ' ' + h.name + ' usa Placaje heroico';
    b.onclick = ()=> heroicTackleChoose(id);
    box.appendChild(b);
  });
  const no = document.createElement('button');
  no.textContent = 'No usarlo';
  no.onclick = ()=> heroicTackleChoose(null);
  box.appendChild(no);
  m.classList.add('show');
}
function heroicTackleChoose(id){
  if(!pendingHeroicTackle || !pendingDodge) { pendingHeroicTackle = null; renderHeroicTackleModal(); return; }
  pendingHeroicTackle = null;
  pendingDodge.heroicAsked = true;
  renderHeroicTackleModal();
  const dodger = players.find(x=>x.id===pendingDodge.playerId);
  let success = true;
  if(id!==null){
    const h = players.find(x=>x.id===id);
    pendingDodge.heroicId = id;
    const nt = pendingDodge.target + 2;
    const r = pendingDodge.lastDie;
    success = (r===6) || (r!==1 && r>=nt);
    log('⚔️ ' + (h ? h.name : 'Un rival') + ' usa PLACAJE HEROICO: −2 a la esquiva de ' + (dodger ? dodger.name : 'su rival') + ' (tirada ' + r + ', ahora necesita ' + nt + '+) → ' + (success ? 'la supera igualmente' : 'FALLA') + '. ' + (h ? h.name : 'El placador') + ' queda Tumbado en la casilla vacante.');
  } else {
    log('⚔️ Nadie usa Placaje heroico.');
  }
  resolveDodge(success);
}
function applyHeroicTackleFall(heroId, vacR, vacC){
  const h = players.find(x=>x.id===heroId);
  if(!h) return;
  const hadBall = ball.carrierId===h.id;
  h.row = vacR; h.col = vacC;
  h.condition = 'tumbado'; h.rooted = false;
  renderRosters(); renderPitch(); renderSelInfo();
  if(hadBall) queueBallDropIfCarrier(h.id, vacR, vacC);
}

function openDodgeModal(p, toR, toC, fromGfi){
  const hasEscurridizo = playerHasSkill(p, 'escurridizo', 'diving tackle immune', 'slippery');
  const hasCanijo = playerHasSkill(p, 'canijo', 'puny');
  const tz = hasEscurridizo ? 0 : countDodgeTackleZones(toR, toC, p.team);
  const canijoBonus = hasCanijo ? 1 : 0;
  const tailers = prehensileTailersAt(p);
  const tailPenalty = tailers.length ? 1 : 0;
  const target = parseAgTarget(p.ag) + tz - canijoBonus + tailPenalty;
  pendingDodge = { playerId:p.id, toR, toC, fromGfi: !!fromGfi, target, baseTarget: target, breakTackle: false, btCommitted: false, baseText: '', lastDie: null, heroicAsked: false, heroicId: null };
  dodgeRerollUsed = false;
  const defTk = defensiveTacklersAt(p);
  const msg = (fromGfi
    ? `${p.name} ha superado "a por ellos" pero esa casilla también sale de una zona de marcaje rival. `
    : `${p.name} sale de una zona de marcaje rival. `)
    + `Necesita ${target}+ (AG${p.ag ?? '?'}${hasEscurridizo ? ', Escurridizo ignora el marcaje' : ' + ' + tz + ' zona(s) de marcaje en destino'}${hasCanijo ? ', -1 por Canijo' : ''}${tailPenalty ? ', +1 por Cola prensil de ' + tailers[0].name : ''}). Tirad D6.`
    + (defTk.length && playerHasSkill(p, 'esquiva', 'dodge') ? ' ⛔ PLACAJE DEFENSIVO de ' + defTk.map(o=>o.name).join(', ') + ': no puede usar Esquivar.' : '');
  pendingDodge.baseText = msg;
  document.getElementById('dodgeText').textContent = msg;
  document.getElementById('dodgeDie').textContent = '–';
  document.getElementById('dodgeResultText').textContent = '';
  document.getElementById('dodgeResultText').className = 'check-result';
  document.getElementById('dodgeRollBtn').style.display = 'block';
  document.getElementById('dodgeActionRow').style.display = 'none';
  document.getElementById('dodgeActionRow').innerHTML = '';
  document.getElementById('dodgeModal').classList.add('show');
  refreshDodgeBreakTackle();
  broadcastState();
}

// ABRIRSE PASO: una vez por turno, al esquivar, +1 (Fuerza ≤3), +2 (Fuerza 4) o +3 (Fuerza ≥5) a la tirada de Agilidad.
function breakTackleBonusFor(p){
  const st = parseInt(p.st, 10);
  if(isNaN(st) || st<=3) return 1;
  return st===4 ? 2 : 3;
}
function refreshDodgeBreakTackle(){
  const btn = document.getElementById('dodgeBreakTackleBtn');
  if(!btn) return;
  const pd = pendingDodge;
  const p = pd ? players.find(x=>x.id===pd.playerId) : null;
  const canUse = !!(p && pd && !pd.btCommitted && (pd.lastSuccess===undefined) && playerHasSkill(p, 'abrirse paso', 'break tackle') && !p.breakTackleUsedThisTurn);
  btn.style.display = canUse ? 'block' : 'none';
  if(canUse){
    const b = breakTackleBonusFor(p);
    btn.textContent = pd.breakTackle ? '✖ Quitar Abrirse paso (no se gasta si no tiras con él)' : ('💪 ¿Usar Abrirse paso? +' + b + ' a esta esquiva (Fuerza ' + (p.st ?? '?') + '). Solo se gasta si lo activas y tiras — 1 vez por turno');
  }
}
function toggleBreakTackle(){
  if(!pendingDodge || pendingDodge.btCommitted) return;
  const p = players.find(x=>x.id===pendingDodge.playerId);
  if(!p || p.breakTackleUsedThisTurn || !playerHasSkill(p, 'abrirse paso', 'break tackle')) return;
  pendingDodge.breakTackle = !pendingDodge.breakTackle;
  const bonus = pendingDodge.breakTackle ? breakTackleBonusFor(p) : 0;
  pendingDodge.target = Math.max(2, pendingDodge.baseTarget - bonus);
  document.getElementById('dodgeText').textContent = (pendingDodge.baseText || '') + (bonus ? ' ✚ Abrirse paso: +' + bonus + ' (Fuerza ' + (p.st ?? '?') + ') → necesita ' + pendingDodge.target + '+.' : '');
  refreshDodgeBreakTackle();
  broadcastState();
}

function rollDodgeDie(){
  if(!pendingDodge) return;
  const r = Math.floor(Math.random()*6)+1;
  document.getElementById('dodgeDie').textContent = r;
  const p = players.find(x=>x.id===pendingDodge.playerId);
  if(!pendingDodge.btCommitted){
    pendingDodge.btCommitted = true;
    if(pendingDodge.breakTackle && p){
      p.breakTackleUsedThisTurn = true;
      log('💪 ' + p.name + ' usa Abrirse paso: +' + breakTackleBonusFor(p) + ' a la esquiva (ya no podrá usarlo este turno).');
    }
    refreshDodgeBreakTackle();
  }
  const success = r===6 ? true : (r===1 ? false : r>=pendingDodge.target);
  pendingDodge.lastSuccess = success;
  pendingDodge.lastDie = r;
  log('🎲 Esquiva: tirada ' + r + ' (necesitaba ' + pendingDodge.target + '+) → ' + (success?'CONSEGUIDO':'FALLADO'));
  checkActionButtons('dodge', success, p);
  broadcastState();
}

function resolveDodge(success){
  if(!pendingDodge) return;
  if(success && !pendingDodge.heroicAsked && pendingDodge.lastDie!==null){
    const dp = players.find(x=>x.id===pendingDodge.playerId);
    const cands = dp ? heroicTacklersAt(dp) : [];
    if(cands.length){
      pendingHeroicTackle = { candidateIds: cands.map(o=>o.id) };
      document.getElementById('dodgeModal').classList.remove('show');
      renderHeroicTackleModal();
      broadcastState();
      return;
    }
  }
  const { playerId, toR, toC, fromGfi, heroicId } = pendingDodge;
  const p = players.find(x=>x.id===playerId);
  const fromR = p ? p.row : null, fromC = p ? p.col : null;
  document.getElementById('dodgeModal').classList.remove('show');
  pendingDodge = null;
  if(!p){ broadcastState(); return; }

  if(success){
    completeStep(p, toR, toC, fromGfi ? 'none' : 'normal');
    if(heroicId) applyHeroicTackleFall(heroicId, fromR, fromC);
  } else if(checkEquilibrioFirme(p) && !heroicId){
    completeStep(p, toR, toC, fromGfi ? 'none' : 'normal');
  } else {
    p.row = toR; p.col = toC;
    p.condition = 'tumbado'; p.rooted = false;
    p.activated = true;
    selected = null;
    renderRosters(); renderPitch(); renderSelInfo();
    log('💥 ' + p.name + ' falla la esquiva y cae al suelo.');
    queueBallDropIfCarrier(p.id, toR, toC);
    const llaveCandidates = opponentTackleZonePlayers(fromR, fromC, p.team).filter(op => playerHasSkill(op, 'llave de brazo', 'arm bar'));
    if(llaveCandidates.length>0){
      llaveDeBrazoMap[p.id] = llaveCandidates[0].id;
      log('💪 ' + llaveCandidates[0].name + ' puede usar Llave de Brazo contra ' + p.name + '.');
    }
    if(heroicId) applyHeroicTackleFall(heroicId, fromR, fromC);
    broadcastState();
    pendingTurnoverAfterResolve = true;
    openArmorModal(p);
  }
}

function openGfiModal(p, toR, toC, chainDodge, blockDefenderId, stabDefenderId){
  pendingGfi = { playerId:p.id, toR, toC, chainDodge: !!chainDodge, blockDefenderId: blockDefenderId || null, stabDefenderId: stabDefenderId || null };
  gfiRerollUsed = false;
  const attempt = (p.gfiUsed ?? 0) + 1;
  const gfiNeed = gfiTargetFor(p);
  const gfiWx = (weatherKind()==='ventisca' ? ' (-1 por Ventisca)' : '') + (prayerFlag(p.team==='A'?'B':'A','topos') ? ' (-1 por Topos bajo el campo)' : '');
  let msg = `${p.name} intenta "a por ellos" — casilla extra ${attempt}/${maxGfiFor(p)}. Necesita ${gfiNeed}+${gfiWx}${gfiNeed===2 ? ' (solo falla con un 1)' : ''}. Tirad D6.`;
  if(blockDefenderId){
    msg = `${p.name} ya no le queda MA para el placaje del Blitz — tirad D6 "a por ellos" para intentarlo igualmente (necesita ${gfiNeed}+${gfiWx}).`;
  } else if(stabDefenderId){
    msg = `${p.name} ya no le queda MA para el Apuñalar del Blitz — tirad D6 "a por ellos" para intentarlo igualmente (necesita ${gfiNeed}+${gfiWx}).`;
  } else if(chainDodge){
    msg += ' Esa casilla también sale de una zona de marcaje: si supera esto, tocará esquivar justo después.';
  }
  document.getElementById('gfiText').textContent = msg;
  document.getElementById('gfiDie').textContent = '–';
  document.getElementById('gfiResultText').textContent = '';
  document.getElementById('gfiResultText').className = 'check-result';
  document.getElementById('gfiRollBtn').style.display = 'block';
  document.getElementById('gfiActionRow').style.display = 'none';
  document.getElementById('gfiActionRow').innerHTML = '';
  document.getElementById('gfiModal').classList.add('show');
  broadcastState();
}

function rollGfiDie(){
  if(!pendingGfi) return;
  const r = Math.floor(Math.random()*6)+1;
  document.getElementById('gfiDie').textContent = r;
  const p = players.find(x=>x.id===pendingGfi.playerId);
  const success = r >= gfiTargetFor(p);
  pendingGfi.lastSuccess = success;
  log('🎲 A por ellos: tirada ' + r + ' → ' + (success?'CONSEGUIDO':'FALLADO'));
  checkActionButtons('gfi', success, p);
  broadcastState();
}

function resolveGfi(success){
  if(!pendingGfi) return;
  const { playerId, toR, toC, chainDodge, blockDefenderId, stabDefenderId } = pendingGfi;
  const p = players.find(x=>x.id===playerId);
  document.getElementById('gfiModal').classList.remove('show');
  pendingGfi = null;
  if(!p){ broadcastState(); return; }

  if(success || checkEquilibrioFirme(p)){
    if(blockDefenderId){
      p.gfiUsed = (p.gfiUsed ?? 0) + 1;
      const defender = players.find(x=>x.id===blockDefenderId);
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
      if(defender){ proceedToBlockDice(p, defender, true); }
      return;
    }
    if(stabDefenderId){
      p.gfiUsed = (p.gfiUsed ?? 0) + 1;
      const defender = players.find(x=>x.id===stabDefenderId);
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
      if(defender){ startApunalarOn(p, defender); }
      return;
    }
    if(chainDodge){
      p.gfiUsed = (p.gfiUsed ?? 0) + 1;
      renderRosters(); renderSelInfo();
      broadcastState();
      openDodgeModal(p, toR, toC, true);
    } else {
      completeStep(p, toR, toC, 'gfi');
    }
  } else {
    p.gfiUsed = (p.gfiUsed ?? 0) + 1;
    p.row = toR; p.col = toC;
    p.condition = 'tumbado'; p.rooted = false;
    p.activated = true;
    selected = null;
    renderRosters(); renderPitch(); renderSelInfo();
    log('💥 ' + p.name + ' falla "a por ellos" y cae al suelo.');
    queueBallDropIfCarrier(p.id, toR, toC);
    broadcastState();
    pendingTurnoverAfterResolve = true;
    openArmorModal(p);
  }
}

function openArmorModal(p){
  armorForPlayer = p.id;
  crowdPushMode = false;
  document.getElementById('armorText').textContent = `Tirando armadura a ${p.name} con AV ${p.av ?? '(sin dato)'}.`;
  const garrasAttackerId0 = golpeMortiferoMap[p.id];
  const garrasAttacker0 = garrasAttackerId0 ? players.find(x=>x.id===garrasAttackerId0) : null;
  document.getElementById('garrasWarning').style.display = (garrasAttacker0 && playerHasSkill(garrasAttacker0, 'garras', 'claws')) ? 'block' : 'none';
  document.getElementById('armorRollBtn').style.display = 'block';
  document.getElementById('armorDie1').textContent='–';
  document.getElementById('armorDie2').textContent='–';
  document.getElementById('armorSum').textContent='Suma: –';
  document.getElementById('armorPassRow').style.display='none';
  const armorNoBtn0 = document.getElementById('armorNoBtn');
  if(armorNoBtn0) armorNoBtn0.textContent = 'NO — sigue tumbado';
  document.getElementById('injuryBlock').style.display='none';
  document.getElementById('injuryDie1').textContent='–';
  document.getElementById('injuryDie2').textContent='–';
  document.getElementById('injurySum').textContent='Suma: –';
  document.getElementById('armorModal').classList.add('show');
  broadcastState();
}

function openInjuryDirect(p){
  if(p && p.frog){ armorForPlayer = p.id; frogAutoInjury(p); return; }
  armorForPlayer = p.id;
  crowdPushMode = true;
  document.getElementById('armorText').textContent = `${p.name} sale del campo empujado — tirada de heridas directa (sin armadura).`;
  document.getElementById('armorRollBtn').style.display = 'none';
  document.getElementById('armorDie1').textContent='–';
  document.getElementById('armorDie2').textContent='–';
  document.getElementById('armorSum').textContent='(sin tirada de armadura)';
  document.getElementById('armorPassRow').style.display='none';
  document.getElementById('injuryBlock').style.display='block';
  document.getElementById('cabezaDuraWarning').style.display = playerHasSkill(p, 'cabeza dura', 'thick skull') ? 'block' : 'none';
  document.getElementById('escurridizoWarning').style.display = playerHasSkill(p, 'escurridizo', 'diving tackle immune', 'slippery') ? 'block' : 'none';
  document.getElementById('injuryDie1').textContent='–';
  document.getElementById('injuryDie2').textContent='–';
  document.getElementById('injurySum').textContent='Suma: –';
  document.getElementById('armorModal').classList.add('show');
  broadcastState();
}

function rollArmor(){
  const d1=Math.floor(Math.random()*6)+1, d2=Math.floor(Math.random()*6)+1;
  const sum = d1+d2;
  document.getElementById('armorDie1').textContent=d1;
  document.getElementById('armorDie2').textContent=d2;
  const p = players.find(x=>x.id===armorForPlayer);

  const isApunalarRoll = pendingApunalarContext && pendingApunalarContext.targetId===armorForPlayer;
  const armorNoBtn = document.getElementById('armorNoBtn');
  if(armorNoBtn){
    armorNoBtn.textContent = isApunalarRoll ? 'NO — sigue en pie' : 'NO — sigue tumbado';
  }
  if(isApunalarRoll){
    document.getElementById('armorSum').textContent = 'Suma: ' + sum + ' (Apuñalar — sin modificadores posibles)';
    log('🔪 Armadura de Apuñalar (' + (p?p.name:'?') + '): ' + d1 + ' + ' + d2 + ' = ' + sum + ' — sin modificadores.');
    document.getElementById('armorPassRow').style.display='block';
    broadcastState();
    return;
  }

  if(p && armorBonusMap[p.id]){
    const bm = armorBonusMap[p.id];
    document.getElementById('armorSum').textContent = 'Suma: ' + sum + ' +' + bm.mod + ' (Bola de fuego) = ' + (sum + bm.mod);
    log('🎲 Armadura (' + p.name + '): ' + d1 + ' + ' + d2 + ' = ' + sum + ' +' + bm.mod + ' (Bola de fuego) = ' + (sum + bm.mod));
    document.getElementById('armorPassRow').style.display = 'block';
    broadcastState();
    return;
  }
  const isFoulRoll = pendingFoulContext && pendingFoulContext.targetId===armorForPlayer;
  if(isFoulRoll && d1===d2){
    pendingFoulContext.doubleDetected = true;
    log('⚠️ Doble natural (' + d1 + '-' + d1 + ') en la tirada de Armadura de la Falta — el que ha cometido la falta será Expulsado al terminar esta acción.');
  }
  if(isFoulRoll && pendingFoulContext.modifier!==0){
    const mSign = pendingFoulContext.modifier>0 ? '+' : '';
    document.getElementById('armorSum').textContent = 'Suma: ' + sum + ' ' + mSign + pendingFoulContext.modifier + ' (apoyos de Falta) = ' + (sum+pendingFoulContext.modifier);
    log('🎲 Armadura (Falta a ' + (p?p.name:'?') + '): ' + d1 + ' + ' + d2 + ' = ' + sum + ' ' + mSign + pendingFoulContext.modifier + ' = ' + (sum+pendingFoulContext.modifier));
  } else {
    document.getElementById('armorSum').textContent='Suma: '+sum;
    log('🎲 Armadura (' + (p?p.name:'?') + '): ' + d1 + ' + ' + d2 + ' = ' + sum);
  }

  const garrasAttackerId = p ? golpeMortiferoMap[p.id] : null;
  const garrasAttacker = garrasAttackerId ? players.find(x=>x.id===garrasAttackerId) : null;
  golpeMortiferoUsedOnArmor = false;
  if(p && garrasAttacker && playerHasSkill(garrasAttacker, 'garras', 'claws') && sum>=8){
    log('🩸 Garras de ' + garrasAttacker.name + ': resultado natural ' + sum + ' (8+) — la Armadura se rompe siempre, sea cual sea su AV.');
    armorResult(true);
    return;
  }

  const gmAttackerId = p ? golpeMortiferoMap[p.id] : null;
  const gmAttacker = gmAttackerId ? players.find(x=>x.id===gmAttackerId) : null;
  if(p && gmAttacker && playerHasSkill(gmAttacker, 'golpe mortífero', 'golpe mortifero', 'mighty blow')){
    const target = parseAvTarget(p.av);
    const naturallyBroken = sum >= target;
    const breaksWithBonus = (sum+1) >= target;
    if(!naturallyBroken && breaksWithBonus){
      golpeMortiferoUsedOnArmor = true;
      document.getElementById('armorSum').textContent = 'Suma: ' + sum + ' +1 (Golpe Mortífero de ' + gmAttacker.name + ') = ' + (sum+1);
      log('💀 Golpe Mortífero de ' + gmAttacker.name + ' aplicado en Armadura: ' + sum + '+1 = ' + (sum+1) + ' — ROTA.');
      armorResult(true);
      return;
    }
  }

  const llaveAttackerId = p ? llaveDeBrazoMap[p.id] : null;
  const llaveAttacker = llaveAttackerId ? players.find(x=>x.id===llaveAttackerId) : null;
  llaveDeBrazoUsedOnArmor = false;
  if(p && llaveAttacker && playerHasSkill(llaveAttacker, 'llave de brazo', 'arm bar')){
    const target = parseAvTarget(p.av);
    const naturallyBroken = sum >= target;
    const breaksWithBonus = (sum+1) >= target;
    if(!naturallyBroken && breaksWithBonus){
      llaveDeBrazoUsedOnArmor = true;
      document.getElementById('armorSum').textContent = 'Suma: ' + sum + ' +1 (Llave de Brazo de ' + llaveAttacker.name + ') = ' + (sum+1);
      log('💪 Llave de Brazo de ' + llaveAttacker.name + ' aplicado en Armadura: ' + sum + '+1 = ' + (sum+1) + ' — ROTA.');
      armorResult(true);
      return;
    }
  }
  document.getElementById('armorPassRow').style.display='block';
  broadcastState();
}

function frogAutoInjury(p){
  log('🐸 ' + p.name + ' es una Rana: no hay tirada de Heridas, sufre automáticamente Magullado (no se puede usar Apotecario).');
  applyInjuryOutcome(p, 'injured');
  crowdPushMode = false;
  renderRosters(); renderPitch(); renderSelInfo();
  closeArmorModal();
  broadcastState();
}
function showInjuryBlockAfterArmorBroken(p){
  if(p && p.frog){ document.getElementById('armorPassRow').style.display='none'; frogAutoInjury(p); return; }
  document.getElementById('regenRow').style.display='none';
  document.getElementById('injuryBlock').style.display='block';
  document.getElementById('cabezaDuraWarning').style.display = playerHasSkill(p, 'cabeza dura', 'thick skull') ? 'block' : 'none';
  document.getElementById('escurridizoWarning').style.display = playerHasSkill(p, 'escurridizo', 'diving tackle immune', 'slippery') ? 'block' : 'none';
  log('🛡️ Armadura ROTA' + (p?(' — '+p.name):'') + '. Tirad heridas.');
  broadcastState();
}

function armorResult(broken){
  const p = players.find(x=>x.id===armorForPlayer);
  if(broken && pendingFoulContext && p && pendingFoulContext.targetId===p.id){ pendingFoulContext.armorBroken = true; }
  if(broken){
    document.getElementById('armorPassRow').style.display='none';
    showInjuryBlockAfterArmorBroken(p);
  } else {
    const isApunalarRoll = p && pendingApunalarContext && pendingApunalarContext.targetId===p.id;
    if(p && !isApunalarRoll){
      const wasAlreadyDown = (pendingFoulContext && pendingFoulContext.targetId===p.id && (p.condition==='tumbado' || p.condition==='aturdido')) || (armorBonusMap[p.id] && armorBonusMap[p.id].keep);
      if(!wasAlreadyDown) p.condition = 'tumbado';
      p.rooted = false;
    }
    log('🛡️ Armadura aguanta' + (p?(' — '+p.name+(isApunalarRoll ? ', sigue en pie (Apuñalar no lo tumba).' : '.')):'.'));
    renderRosters(); renderPitch(); renderSelInfo();
    closeArmorModal();
  }
  broadcastState();
}

let pendingRegenInjuryKind = null; // kind pendiente de aplicar si la Regeneración (tras Heridas) falla

function openRegenAfterInjury(p, kind){
  pendingRegenInjuryKind = kind;
  regenHelperOpen = false; regenRerolled = false;
  document.getElementById('injuryBlock').style.display = 'none';
  document.getElementById('regenDie').textContent = '–';
  document.getElementById('regenResultText').textContent = '';
  document.getElementById('regenResultText').className = 'check-result';
  document.getElementById('regenRollBtn').style.display = 'block';
  document.getElementById('regenRow').style.display = 'block';
  log('🛡️ Resultado de Heridas confirmado — ' + p.name + ' tiene Regeneración, tira 1D6 antes de aplicar la lesión.');
  broadcastState();
}

let regenHelperOpen = false;     // modal de regeneración esperando decisión: ¿repetir con Ayudante de la morgue / Médico de la peste?
let regenRerolled = false;
function regenHelpersAvailable(team){
  return ['morgue','plague'].filter(k=> incCount(team,k) - ((teamUsedRes[team]||{})[k]||0) > 0);
}
function renderRegenHelper(){
  const row = document.getElementById('regenHelperRow');
  if(!row) return;
  const p = players.find(x=>x.id===armorForPlayer);
  row.style.display = (regenHelperOpen && p) ? 'block' : 'none';
  if(!(regenHelperOpen && p)) return;
  const names = { morgue:'Ayudante de la morgue', plague:'Médico de la peste' };
  document.getElementById('regenHelperText').textContent = 'La Regeneración de ' + p.name + ' ha fallado. ' + teamName(p.team) + ' puede repetirla una vez con un ayudante (se gasta el uso del partido).';
  const box = document.getElementById('regenHelperBtns');
  box.innerHTML = '';
  regenHelpersAvailable(p.team).forEach(k=>{
    const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Repetir con ' + names[k]; b.onclick = ()=>regenUseHelper(k); box.appendChild(b);
  });
  const no = document.createElement('button'); no.textContent = 'No repetir'; no.onclick = regenDeclineHelper; box.appendChild(no);
}
function regenFinish(p, success){
  setTimeout(()=>{
    if(success){
      resolveRegenerationSuccess();
    } else {
      if(!regenRerolled && p && regenHelpersAvailable(p.team).length){
        regenHelperOpen = true; renderRegenHelper(); broadcastState();
        return;
      }
      regenApplyFailure(p);
    }
  }, 700);
}
function regenApplyFailure(p){
  regenHelperOpen = false; renderRegenHelper();
  const kind = pendingRegenInjuryKind;
  pendingRegenInjuryKind = null;
  document.getElementById('regenRow').style.display = 'none';
  applyInjuryOutcome(p, kind);
  crowdPushMode = false;
  renderRosters(); renderPitch(); renderSelInfo();
  closeArmorModal();
  broadcastState();
}
function regenRoll(p, tag){
  const roll = Math.floor(Math.random()*6)+1;
  document.getElementById('regenDie').textContent = roll;
  document.getElementById('regenRollBtn').style.display = 'none';
  const success = roll>=4;
  const resEl = document.getElementById('regenResultText');
  resEl.textContent = success ? '✅ ¡SE REGENERA!' : '❌ No se regenera';
  resEl.className = 'check-result ' + (success ? 'ok' : 'fail');
  log('🎲 Regeneración' + (tag||'') + ' de ' + (p?p.name:'?') + ': ' + roll + (success ? ' (4+) — se regenera, la Lesión se ignora y pasa a Reservas.' : ' (1-3) — sufre la Lesión con normalidad.'));
  broadcastState();
  regenFinish(p, success);
}
function rollRegenDie(){
  const p = players.find(x=>x.id===armorForPlayer);
  regenRerolled = false;
  regenRoll(p, '');
}
function regenUseHelper(key){
  const p = players.find(x=>x.id===armorForPlayer);
  if(!p || !regenHelpersAvailable(p.team).includes(key)) return;
  teamUsedRes[p.team] = Object.assign({}, teamUsedRes[p.team] || {});
  teamUsedRes[p.team][key] = (teamUsedRes[p.team][key] || 0) + 1;
  const nm = key==='morgue' ? 'Ayudante de la morgue' : 'Médico de la peste';
  log('🧰 ' + teamName(p.team) + ' usa su ' + nm + ' para repetir la Regeneración de ' + p.name + '.');
  regenHelperOpen = false; regenRerolled = true;
  renderRegenHelper(); renderResourceIcons();
  regenRoll(p, ' (repetida con ' + nm + ')');
}
function regenDeclineHelper(){
  const p = players.find(x=>x.id===armorForPlayer);
  regenHelperOpen = false; regenRerolled = true; renderRegenHelper();
  regenApplyFailure(p);
}

function resolveRegenerationSuccess(){
  const p = players.find(x=>x.id===armorForPlayer);
  document.getElementById('regenRow').style.display = 'none';
  pendingRegenInjuryKind = null;
  if(p){
    p.onPitch = false; p.row = null; p.col = null; p.condition = 'standing'; p.rooted = false;
    if(ball.carrierId===p.id) ball.carrierId = null;
    log('🔁 ' + p.name + ' se REGENERA — la Lesión se ignora, vuelve a la zona de Reservas de su equipo.');
  }
  renderRosters(); renderPitch(); renderSelInfo();
  closeArmorModal();
}

function rollInjury(){
  const d1=Math.floor(Math.random()*6)+1, d2=Math.floor(Math.random()*6)+1;
  const sum = d1+d2;
  const p = players.find(x=>x.id===armorForPlayer);
  const isFoulRoll = pendingFoulContext && pendingFoulContext.targetId===armorForPlayer;
  if(isFoulRoll && d1===d2 && !pendingFoulContext.doubleDetected){
    pendingFoulContext.doubleDetected = true;
    log('⚠️ Doble natural (' + d1 + '-' + d1 + ') en la tirada de Heridas de la Falta — el que ha cometido la falta será Expulsado al terminar esta acción.');
  }
  const gmAttackerId = p ? golpeMortiferoMap[p.id] : null;
  const gmAttacker = gmAttackerId ? players.find(x=>x.id===gmAttackerId) : null;
  const gmForInjury = p && !golpeMortiferoUsedOnArmor && gmAttacker && playerHasSkill(gmAttacker, 'golpe mortífero', 'golpe mortifero', 'mighty blow');
  const llaveAttackerId = p ? llaveDeBrazoMap[p.id] : null;
  const llaveAttacker = llaveAttackerId ? players.find(x=>x.id===llaveAttackerId) : null;
  const llaveForInjury = p && !gmForInjury && !llaveDeBrazoUsedOnArmor && llaveAttacker && playerHasSkill(llaveAttacker, 'llave de brazo', 'arm bar');
  document.getElementById('injuryDie1').textContent=d1;
  document.getElementById('injuryDie2').textContent=d2;
  const injBonuses = [];
  if(gmForInjury) injBonuses.push('Golpe Mortífero de ' + gmAttacker.name);
  else if(llaveForInjury) injBonuses.push('Llave de Brazo de ' + llaveAttacker.name);
  if(p && playerHasSkill(p, 'descomposicion', 'descomposición', 'decay')) injBonuses.push('Descomposición de ' + p.name);
  if(injBonuses.length){
    const bonusTxt = injBonuses.map(t=>'+1 (' + t + ')').join(' ');
    document.getElementById('injurySum').textContent = 'Suma: ' + sum + ' ' + bonusTxt + ' = ' + (sum + injBonuses.length);
    log('🎲 Heridas (' + (p?p.name:'?') + '): ' + d1 + ' + ' + d2 + ' = ' + sum + ' ' + injBonuses.map(t=>'+1 ' + t).join(' ') + ' = ' + (sum + injBonuses.length));
  } else {
    document.getElementById('injurySum').textContent='Suma: '+sum;
    log('🎲 Heridas (' + (p?p.name:'?') + '): ' + d1 + ' + ' + d2 + ' = ' + sum);
  }
  broadcastState();
}

function applyInjuryOutcome(p, kind){
  if(!p) return;
  if(kind==='aturdido'){
    if(crowdPushMode){
      p.condition='standing';
      log('🌀 ' + p.name + ' vuelve al banquillo tras salir del campo, sin lesión.');
    } else {
      p.condition='aturdido';
      log('🤕 ' + p.name + ' queda ATURDIDO.');
    }
  } else if(kind==='ko'){
    p.condition='ko';
    p.onPitch=false; p.row=null; p.col=null;
    if(ball.carrierId===p.id) ball.carrierId=null;
    log('😵 ' + p.name + ' queda INCONSCIENTE' + (crowdPushMode ? ' tras salir del campo.' : ' y sale del campo.'));
  } else if(kind==='injured'){
    p.condition='injured';
    p.onPitch=false; p.row=null; p.col=null;
    if(ball.carrierId===p.id) ball.carrierId=null;
    log('🚑 ' + p.name + ' queda HERIDO (leve) — no puede seguir jugando este partido.');
  } else if(kind==='injuredGrave'){
    p.condition='injuredGrave';
    p.onPitch=false; p.row=null; p.col=null;
    if(ball.carrierId===p.id) ball.carrierId=null;
    log('🚑 ' + p.name + ' sufre una HERIDA GRAVE — fuera del partido.');
  } else if(kind==='dead'){
    p.condition='dead';
    p.onPitch=false; p.row=null; p.col=null;
    if(ball.carrierId===p.id) ball.carrierId=null;
    log('☠️ ' + p.name + ' ha MUERTO.');
  }
}

function chooseInjury(kind){
  const p = players.find(x=>x.id===armorForPlayer);
  const isCasualtyResult = (kind==='injured' || kind==='injuredGrave' || kind==='dead'); // resultado 10/11/12
  if(p && isCasualtyResult && playerHasSkill(p, 'regeneración', 'regeneracion', 'regenerate')){
    openRegenAfterInjury(p, kind);
    return;
  }
  applyInjuryOutcome(p, kind);
  crowdPushMode = false;
  renderRosters(); renderPitch(); renderSelInfo();
  closeArmorModal();
  broadcastState();
}

function queueBallDropIfCarrier(playerId, r, c, exitR, exitC){
  if(ball.carrierId === playerId){
    pendingBallDrop = {
      playerId, r, c,
      exitR: (exitR!==undefined ? exitR : null),
      exitC: (exitC!==undefined ? exitC : null)
    };
  }
}

function closeArmorModal(){
  const resolvedPlayerId = armorForPlayer;
  document.getElementById('armorModal').classList.remove('show');
  document.getElementById('garrasWarning').style.display = 'none';
  document.getElementById('regenRow').style.display = 'none';
  armorForPlayer = null;
  golpeMortiferoUsedOnArmor = false;
  if(resolvedPlayerId!==null) delete golpeMortiferoMap[resolvedPlayerId];
  llaveDeBrazoUsedOnArmor = false;
  if(resolvedPlayerId!==null) delete llaveDeBrazoMap[resolvedPlayerId];
  if(resolvedPlayerId!==null) delete armorBonusMap[resolvedPlayerId];
  if(pendingApunalarContext && pendingApunalarContext.targetId===resolvedPlayerId){
    pendingApunalarContext = null;
  }
  broadcastState();
  if(pendingArmorQueue && pendingArmorQueue.length>0){
    processNextArmorInQueue();
    return;
  }
  if(pendingBallDrop){
    const info = pendingBallDrop;
    pendingBallDrop = null;
    ball.carrierId = null;
    ball.row = info.r; ball.col = info.c;
    renderPitch();
    broadcastState();
    if(info.exitR!==null && info.exitR!==undefined && info.exitC!==null && info.exitC!==undefined){
      log('🏈 El balón sale del campo junto con su portador — el Público lo devuelve.');
      resolveThrowIn(info.exitR, info.exitC, info.r, info.c, 0);
    } else {
      log('🏈 Se le cae el balón.');
      const dirRoll = Math.floor(Math.random()*8)+1;
      const off = kickoffDirOffset(dirRoll);
      log('🎲 Rebote: D8=' + dirRoll + '.');
      const nr = info.r+off.dr, nc = info.c+off.dc;
      if(nr<0 || nr>=ROWS || nc<0 || nc>=COLS){
        log('🏈 El balón sale del campo al rebotar — el Público lo devuelve.');
        resolveThrowIn(nr, nc, info.r, info.c, 0);
      } else {
        resolveBounce(nr, nc);
      }
    }
  }
  if(pendingTurnoverAfterResolve){
    pendingTurnoverAfterResolve = false;
    autoTurnoverThenEndTurn();
    return;
  }
  if(pendingFoulContext && pendingFoulContext.targetId===resolvedPlayerId){
    const ctx = pendingFoulContext;
    pendingFoulContext = null;
    const fouler = players.find(x=>x.id===ctx.foulerId);
    const escr = ctx.armorBroken && fouler && prayerFlag(fouler.team==='A' ? 'B' : 'A', 'escrutinio');
    if(ctx.doubleDetected){
      if(fouler){
        if(ctx.ajuste && !escr){
          log('🟨 AJUSTE DE CUENTAS: ' + fouler.name + ' saca doble natural pero no puede ser Expulsado. Cambio de turno igualmente.');
          autoTurnoverThenEndTurn();
        } else if(ctx.ajuste && escr){ expelEscrutinio(fouler); }
        else startRefereeArgument(fouler);
      }
    } else if(escr){ expelEscrutinio(fouler); }
  }
}

// ---------- KO recovery, at the start of each new drive ----------
let koQueue = [];
let pendingKo = null;

function startKoRecoveryFlow(){
  koQueue = players.filter(p=>p.condition==='ko').map(p=>p.id);
  processNextKo();
}

function processNextKo(){
  if(koQueue.length===0){ pendingKo=null; broadcastState(); return; }
  const id = koQueue.shift();
  const p = players.find(x=>x.id===id);
  if(!p || p.condition!=='ko'){ processNextKo(); return; }
  pendingKo = id;
  document.getElementById('koText').textContent = `Recuperación de ${p.name} (${teamName(p.team)}). Tirad D6 y decidid.` + ((teamInc[p.team] && teamInc[p.team].keg>0) ? ' 🍺 +' + teamInc[p.team].keg + ' a la tirada por Barril(es) de cerveza Estrella Blitzer.' : '');
  document.getElementById('koDie').textContent = '–';
  document.getElementById('koModal').classList.add('show');
  broadcastState();
}

function rollKoDie(){
  const r = Math.floor(Math.random()*6)+1;
  document.getElementById('koDie').textContent = r;
  log('🎲 Recuperación: tirada ' + r);
  broadcastState();
}

function resolveKo(recovered){
  const p = players.find(x=>x.id===pendingKo);
  document.getElementById('koModal').classList.remove('show');
  if(p){
    if(recovered){
      p.condition='standing';
      log('✅ ' + p.name + ' se recupera y vuelve a estar disponible.');
    } else {
      log('😵 ' + p.name + ' sigue inconsciente.');
    }
  }
  pendingKo = null;
  renderRosters();
  broadcastState();
  processNextKo();
}

// ---------- Turns ----------
function isHalfComplete(team){
  const other = team==='A' ? 'B':'A';
  return state.turns[team]>=6 && state.turns[other]>=6;
}

function beginTurn(team){
  kickoffTargetRow = null; kickoffTargetCol = null; // seguridad: la marca del saque nunca debe sobrevivir al inicio de un turno
  state.turns[team]++;
  state.active = team;
  { const other = team==='A' ? 'B' : 'A';
    if(cheerBonus[other]==='active') cheerBonus[other] = 'none';   // su turno terminó sin usarlo
    if(cheerBonus[team]==='pending') cheerBonus[team] = 'active'; }
  blitzUsedByTeam[team] = false;
  secureBallUsedByTeam[team] = false;
  handoffUsedByTeam[team] = false;
  foulUsedByTeam[team] = false;
  passUsedByTeam[team] = false;
  secureBallActivePlayer = null;
  players.filter(p=>p.team===team).forEach(p=>{
    p.activated = false;
    p.remainingMove = p.ma;
    p.gfiUsed = 0;
    p.blockedThisActivation = false;
    p.dodgeSkillUsedThisTurn = false;
    p.proRerollUsedThisTurn = false;
    p.justStoodThisActivation = false;
    p.catchSkillUsedThisTurn = false;
    p.passSkillUsedThisTurn = false;
    p.breakTackleUsedThisTurn = false;
  });
  renderScoreboard(); renderRosters(); renderPitch();
  updateStatus('Turno de ' + teamName(team));
  broadcastState();
}

function resetBoardForNewDrive(){
  despIdopajeAtDriveEnd();
  frogRestoreAll();
  players.forEach(p=>{
    if(p.indigestOrig){ p.ma = p.indigestOrig.ma; p.av = p.indigestOrig.av; p.indigestOrig = null; }
    p.indigestOut = false;
    p.onPitch=false; p.row=null; p.col=null; p.activated=false;
    if(p.condition==='tumbado' || p.condition==='aturdido'){ p.condition='standing'; }
    p.remainingMove=p.ma; p.gfiUsed=0; p.blockedThisActivation=false;
    p.rooted = false;
  });
  ball = { carrierId: null, row: null, col: null };
  ballBounceActive = false;
  kickoffTargetRow = null; kickoffTargetCol = null;
  pendingCatch = null;
  pendingBallDrop = null;
  pendingDriveStart = null;
  document.getElementById('ballBouncePanel').style.display = 'none';
  selected=null; placing=null;
  blitzUsedByTeam = { A:false, B:false };
  blitzActivePlayer = null;
  blockTargeting = null;
  activeBlock = null;
  pendingArmorQueue = [];
  pendingPush = null;
  chainPushStack = [];
  pendingFollowUp = null;
  crowdPushMode = false;
  document.getElementById('pushControlPanel').style.display = 'none';
  pendingKickPlacement = null;
  kickoffBounceStep = 0;
  kickoffKickingTeam = null;
  kickoffReceivingTeam = null;
  kickoffDistance = 1;
  freeCatchTeam = null;
  document.getElementById('kickPlacementPanel').style.display = 'none';
  document.getElementById('kickoffPanel').style.display = 'none';
  kickoffEvt = null; renderKickoffEvent();
  document.getElementById('freeCatchPanel').style.display = 'none';
}

function confirmTD(){
  document.getElementById('tdModal').classList.remove('show');
  const scoringTeam = pendingTD.team;
  const scoreEl = document.getElementById(scoringTeam==='A' ? 'scoreA':'scoreB');
  scoreEl.textContent = parseInt(scoreEl.textContent) + 1;
  log('🏆 ¡TOUCHDOWN! ' + teamName(scoringTeam) + ' — ' + pendingTD.name);

  const halfOver = isHalfComplete(scoringTeam);
  applyHeatAtDriveEnd();
  resetBoardForNewDrive();
  phase='setup';
  document.getElementById('kickSelect').value = scoringTeam;
  showSetupPanel();

  if(halfOver){
    addNewHalfButton();
    updateStatus('¡Mitad terminada tras el touchdown! Pulsad "Empezar Mitad 2".');
  } else {
    updateStatus('Nueva entrada: fase de colocación.');
    startKoRecoveryFlow();
  }
  renderScoreboard(); renderRosters(); renderPitch();
  pendingTD = null;
  broadcastState();
}

function showTurnoverOverlay(){
  document.getElementById('turnoverOverlay').classList.add('show');
  broadcastState();
}

function hideTurnoverOverlay(){
  document.getElementById('turnoverOverlay').classList.remove('show');
  broadcastState();
}

function autoTurnoverThenEndTurn(){
  if(kickoffEvt && kickoffEvt.phase==='charge'){
    log('🛑 Un jugador se ha Caído o ha sido Derribado: la Carga termina.');
    endCharge();
    return;
  }
  showTurnoverOverlay();
  endTurn();
}

function endTurn(){
  if(kickoffEvt && kickoffEvt.phase==='charge'){ endCharge(); return; }
  if(phase!=='live'){
    alert('Terminad de colocar y pulsad "Iniciar Entrada" primero.');
    return;
  }
  const finishing = state.active;
  ownTurnChanged[finishing] = true;
  escenaCatch = { A:false, B:false };

  players.filter(p=>p.team===finishing && p.condition==='aturdido').forEach(p=>{
    p.condition = 'tumbado'; p.rooted = false;
    log('🔄 ' + p.name + ' se da la vuelta (Aturdido → Tumbado) al final del turno.');
  });

  if(isHalfComplete(finishing)){
    if(state.half<2) applyHeatAtDriveEnd();
    resetBoardForNewDrive();
    phase='setup';
    if(state.half >= 2){
      showMatchEndModal();
      renderScoreboard(); renderRosters(); renderPitch();
      broadcastState();
      return;
    }
    showSetupPanel();
    addNewHalfButton();
    updateStatus('¡Mitad terminada! Colocad y pulsad "Empezar Mitad 2".');
    renderScoreboard(); renderRosters(); renderPitch();
    broadcastState();
    return;
  }
  const other = finishing==='A' ? 'B':'A';
  if(wizardGapNeeded()){ wizardSt = { mode:'gap', next:other, team:'' }; renderWizard(); broadcastState(); return; }
  beginTurn(other);
}

function showMatchEndModal(){
  const scoreA = parseInt(document.getElementById('scoreA').textContent, 10) || 0;
  const scoreB = parseInt(document.getElementById('scoreB').textContent, 10) || 0;
  let resultText;
  if(scoreA > scoreB) resultText = '🏆 ¡' + teamName('A') + ' gana ' + scoreA + ' - ' + scoreB + '!';
  else if(scoreB > scoreA) resultText = '🏆 ¡' + teamName('B') + ' gana ' + scoreB + ' - ' + scoreA + '!';
  else resultText = '🤝 ¡Empate a ' + scoreA + '!';
  document.getElementById('matchEndText').textContent = resultText;
  document.getElementById('matchEndModal').classList.add('show');
  log('🏁 Fin del partido — ' + resultText);
  broadcastState();
}

function startSecondHalf(){
  state.half=2; state.turns={A:0,B:0};
  players.forEach(p=>{ p.activated=false; });
  const existingBtn = document.getElementById('newHalfBtn');
  if(existingBtn) existingBtn.remove();
  if(firstHalfKickingTeam){
    const swapped = firstHalfKickingTeam==='A' ? 'B' : 'A';
    const sel = document.getElementById('kickSelect');
    sel.value = swapped;
    sel.disabled = true;
    onKickChangeQuiet();
    log('🔄 Mitad 2: patea automáticamente ' + teamName(swapped) + ' (equipo receptor de la 1ª mitad).');
  }
  renderScoreboard();
  resetRerollsForNewHalf();
  updateStatus('¡Comienza la Mitad 2! Colocad y pulsad "Iniciar Entrada".');
  broadcastState();
  startKoRecoveryFlow();
}

function showHalfTimeOverlay(){
  document.getElementById('halfTimeOverlay').classList.add('show');
  broadcastState();
}

function hideHalfTimeOverlay(){
  document.getElementById('halfTimeOverlay').classList.remove('show');
  broadcastState();
  startSecondHalf();
}

function addNewHalfButton(){
  showHalfTimeOverlay();
}

function resetActivations(){
  players.filter(p=>p.team===state.active).forEach(p=>{ p.activated=false; p.remainingMove=p.ma; p.gfiUsed=0; });
  renderRosters(); renderPitch();
  log('Activaciones reiniciadas manualmente (mismo turno).');
  broadcastState();
}

function applyTeamColorAccents(){
  try{ updateColorChoiceButtons(); }catch(e){}
  const dotA = document.getElementById('turnDotA');
  const dotB = document.getElementById('turnDotB');
  if(dotA) dotA.style.background = tokenColorFor({ team:'A' });
  if(dotB) dotB.style.background = tokenColorFor({ team:'B' });
  const benchA = document.querySelector('#benchColA .team-wide-panel');
  const benchB = document.querySelector('#benchColB .team-wide-panel');
  if(benchA) benchA.style.borderColor = tokenColorFor({ team:'A' });
  if(benchB) benchB.style.borderColor = tokenColorFor({ team:'B' });
  const nameA = document.getElementById('teamAName');
  const nameB = document.getElementById('teamBName');
  if(nameA) nameA.style.borderColor = tokenColorFor({ team:'A' });
  if(nameB) nameB.style.borderColor = tokenColorFor({ team:'B' });
}

function renderScoreboard(){
  document.getElementById('sbNameA').textContent = teamName('A');
  document.getElementById('sbNameB').textContent = teamName('B');
  document.getElementById('sbRaceA').textContent = teamRace.A || '';
  document.getElementById('sbRaceB').textContent = teamRace.B || '';
  const vetA = document.getElementById('sbVeteranoA');
  const vetB = document.getElementById('sbVeteranoB');
  [['A',vetA],['B',vetB]].forEach(([t,el])=>{
    if(!el) return;
    const vets = players.filter(p=>p.team===t && playerHasSkill(p, 'veterano', 'veteran'));
    el.style.display = vets.length ? 'flex' : 'none';
    const avail = vets.some(p=>!p.veteranoUsedThisMatch);
    el.classList.toggle('used', !avail);
    el.title = avail ? 'Veterano disponible' : 'Veterano usado';
  });
  ['A','B'].forEach(t=>{
    const el = document.getElementById('sbBribe'+t);
    if(!el) return;
    const st = teamBribe[t] || 'none';
    el.style.display = st==='none' ? 'none' : 'flex';
    el.classList.toggle('used', st==='used');
    el.title = st==='used' ? 'Soborno usado' : 'Soborno disponible (clic para marcarlo como usado)';
  });
  renderResourceIcons();
  document.getElementById('halfNum').textContent = state.half;
  document.getElementById('turnA').textContent = Math.min(state.turns.A,6);
  document.getElementById('turnB').textContent = Math.min(state.turns.B,6);
  applyTeamColorAccents();
  const flag = document.getElementById('activeFlag');
  const endTurnBtn = document.getElementById('endTurnBtn');
  if(phase==='setup'){
    flag.textContent = 'COLOCACIÓN';
    flag.classList.add('setup-flag');
    flag.style.background = '';
    flag.style.color = '';
    if(endTurnBtn){ endTurnBtn.style.background = ''; endTurnBtn.style.color = ''; }
  } else {
    flag.textContent = 'TURNO ' + teamName(state.active).toUpperCase();
    flag.classList.remove('setup-flag');
    const activeColor = tokenColorFor({ team: state.active });
    flag.style.background = activeColor;
    flag.style.color = textColorFor({ team: state.active });
    if(endTurnBtn){
      endTurnBtn.style.background = activeColor;
      endTurnBtn.style.color = textColorFor({ team: state.active });
    }
  }
}

document.getElementById('teamAName').addEventListener('input', ()=>{ renderScoreboard(); onKickChangeQuiet(); updateKickSelectLabels(); broadcastState(); });
document.getElementById('teamBName').addEventListener('input', ()=>{ renderScoreboard(); onKickChangeQuiet(); updateKickSelectLabels(); broadcastState(); });

// ---------- Dice (free-standing rollers) ----------
const BLOCK_FACES = ['ATACANTE CAE','AMBOS CAEN','EMPUJÓN','EMPUJÓN','DESEQUILIBRADO','POW (DEFENSOR CAE)'];
const BLOCK_ICONS = ['💀','💀💥','➡️','➡️','💢','💥'];
const BLOCK_OUTCOME_KINDS = ['attackerDown','bothDown','push','push','stumble','pow'];
const BLOCK_ICON_IMAGES = [
  'icons/attacker-down.png',
  'icons/both-down.png',
  'icons/push.png',
  'icons/push.png',
  'icons/stumble.png',
  'icons/pow.png'
];

function rollBlock(n){
  const el = document.getElementById('blockResult');
  el.innerHTML='';
  let results=[];
  for(let i=0;i<n;i++){
    const idx = Math.floor(Math.random()*6);
    results.push(BLOCK_FACES[idx]);
    const d = document.createElement('div');
    d.className='block-face';
    d.innerHTML = blockFaceHtml(idx);
    el.appendChild(d);
  }
  log('🎲 Bloqueo x'+n+': ' + results.join(' / '));
  broadcastState();
}

function rollGeneric(sides, count){
  const label = document.getElementById('d6label').value.trim();
  const results = [];
  for(let i=0;i<count;i++){ results.push(Math.floor(Math.random()*sides)+1); }
  const el = document.getElementById('genericResult');
  el.innerHTML='';
  results.forEach(r=>{
    const d = document.createElement('div');
    d.className='block-face';
    d.style.minWidth='42px';
    d.style.fontSize='16px';
    d.textContent = r;
    el.appendChild(d);
  });
  const sumText = count>1 ? ' (suma ' + results.reduce((a,b)=>a+b,0) + ')' : '';
  log('🎲 ' + count + 'd' + sides + (label?(' ('+label+')'):'') + ': ' + results.join(', ') + sumText);
  broadcastState();
}

// ---------- Save / Load ----------
function downloadSaveFile(){
  const snap = snapshotState();
  const blob = new Blob([JSON.stringify(snap, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
  a.download = 'bb-sevens-partida-' + stamp + '.json';
  a.click();
  URL.revokeObjectURL(url);
  log('💾 Copia de seguridad descargada.');
}

function loadSaveFile(inputEl){
  const file = inputEl.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    let data;
    try{ data = JSON.parse(e.target.result); }
    catch(err){ alert('El archivo no es una partida válida.'); return; }
    applyRemoteState(data);
    log('📂 Partida cargada desde archivo.');
    updateStatus('Partida cargada desde archivo.');
  };
  reader.readAsText(file);
  inputEl.value = '';
}

function checkForAutosave(){
  let saved = null;
  try{ saved = localStorage.getItem(SAVE_KEY); }catch(e){}
  if(!saved) return;
  let data;
  try{ data = JSON.parse(saved); }catch(e){ return; }
  if(!data || !data.players || data.players.length===0) return;
  document.getElementById('resumeModal').classList.add('show');
  window._pendingResumeData = data;
}

function resumeAutosave(){
  const data = window._pendingResumeData;
  document.getElementById('resumeModal').classList.remove('show');
  if(data){
    applyRemoteState(data);
    log('▶️ Partida recuperada automáticamente.');
    updateStatus('Partida recuperada.');
  }
  window._pendingResumeData = null;
}

function discardAutosave(){
  document.getElementById('resumeModal').classList.remove('show');
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  window._pendingResumeData = null;
}

// init
renderRosters();
renderPitch();
renderScoreboard();
showSetupPanel();
checkForAutosave();
loadFieldOptions();

function loadFieldOptions(){
  fetch('field/fields.json')
    .then(res => {
      if(!res.ok) throw new Error('field/fields.json no encontrado (código ' + res.status + ')');
      return res.text();
    })
    .then(text => {
      let list;
      try{ list = JSON.parse(text); }
      catch(e){ throw new Error('field/fields.json no es un JSON válido: ' + e.message); }
      if(!Array.isArray(list)) throw new Error('field/fields.json debe ser una lista [ ... ]');
      const sel = document.getElementById('pitchBgSelect');
      let added = 0;
      list.forEach(entry => {
        if(!entry || !entry.value || !entry.label) return;
        if(entry.value === '') return; // "Clásico" ya está como opción fija
        const opt = document.createElement('option');
        opt.value = entry.value;
        opt.textContent = entry.label;
        sel.appendChild(opt);
        added++;
      });
      if(added>0) log('🖼️ ' + added + ' campo(s) extra cargados desde field/fields.json.');
    })
    .catch(err => {
      log('⚠️ No se pudieron cargar campos extra: ' + err.message);
    });
}

// ---------- Cancelar la tirada/acción pendiente de un modal concreto ----------
function cancelActiveModal(modalId){
  document.getElementById(modalId).classList.remove('show');
  switch(modalId){
    case 'dodgeModal':
      pendingDodge = null; dodgeRerollUsed = false;
      log('❌ Chequeo de Esquivar cancelado manualmente.');
      break;
    case 'gfiModal':
      pendingGfi = null; gfiRerollUsed = false;
      log('❌ Chequeo de "A por ellos" cancelado manualmente.');
      break;
    case 'catchModal':
      pendingCatch = null; catchRerollUsed = false;
      log('❌ Chequeo de recogida de balón cancelado manualmente.');
      break;
    case 'secureBallModal':
      pendingSecureBall = null; secureBallRerollUsed = false;
      log('❌ Asegurar Balón cancelado manualmente.');
      break;
    case 'blockModal':
      activeBlock = null; blockTargeting = null; blockDiceRolled = false; currentBlockDiceIndices = [];
      log('❌ Placaje cancelado manualmente.');
      break;
    case 'traitCheckModal':
      pendingTraitCheck = null;
      log('❌ Chequeo de rasgo cancelado manualmente.');
      break;
    case 'animosityModal': {
      const a = pendingAnimosity; pendingAnimosity = null;
      if(a && a.kind==='pass'){ pendingPassTargetSelection = { passerId: a.playerId }; }
      log('❌ Tirada de Animosidad cancelada manualmente.');
      break;
    }
    case 'hailMaryModal': {
      const h = pendingHailMaryChoice; pendingHailMaryChoice = null;
      if(h){ pendingPassTargetSelection = { passerId: h.passerId }; }
      log('❌ Elección de Pase a lo loco cancelada manualmente.');
      break;
    }
    case 'armorModal':
      regenHelperOpen = false;
      armorForPlayer = null; pendingArmorQueue = [];
      log('❌ Tirada de armadura cancelada manualmente.');
      break;
    case 'jumpUpModal':
      pendingJumpUpCheck = null;
      log('❌ Levantarse de un salto y placar cancelado manualmente.');
      break;
    case 'followUpModal':
      pendingFollowUp = null;
      log('❌ Movimiento de impulso cancelado manualmente.');
      break;
    case 'preMatchModal':
      preMatch.open = false;
      break;
    case 'provocarModal':
      provocarChoose(false);
      break;
    case 'heroicTackleModal':
      heroicTackleChoose(null);
      break;
    case 'insigModal':
      insignificanteCancel();
      break;
    case 'kickoffEventModal':
      // El evento de patada es obligatorio: la ✕ solo oculta la ventana un momento; se reabre al refrescar el estado.
      break;
    case 'leagueMismatchModal':
      pendingLeagueMismatch = null;
      log('❌ Carga de equipo cancelada manualmente.');
      break;
    default:
      // Modales puramente informativos (aviso de línea, fin de partida, partida guardada, touchdown, KO...): basta con cerrarlos.
      break;
  }
  renderPitch(); renderRosters(); renderSelInfo();
  broadcastState();
}

// ---------- Borde del modal con el color del equipo que tira / decide ----------
function modalActorTeam(id){
  const other = t=>t==='A' ? 'B' : 'A';
  const act = state.active;
  const pteam = pid=>{ const p = players.find(x=>x.id===pid); return p ? p.team : null; };
  switch(id){
    case 'preMatchModal': {
      const ii = preMatch && preMatch.inc;
      if(preMatch && preMatch.step==='inducements' && ii && (ii.sub==='buyHigh' || ii.sub==='buyLow') && ii.high) return ii.sub==='buyHigh' ? ii.high : other(ii.high);
      return null;
    }
    case 'infoModal': case 'losWarningModal': case 'matchEndModal': case 'resumeModal':
    case 'leagueMismatchModal': case 'insigModal': case 'kickoffEventModal':
      return null;   // neutros: sin color de equipo
    case 'tdModal': return pendingTD ? pendingTD.team : act;
    case 'koModal': return pendingKo!=null ? pteam(pendingKo) : null;
    case 'catchModal': return pendingCatch ? pteam(pendingCatch.playerId) : act;
    case 'interceptModal': return pendingInterceptionRoll ? pteam(pendingInterceptionRoll.interceptorId) : other(act);
    case 'provocarModal': return pendingProvocarChoice ? pteam(pendingProvocarChoice.defenderId) : other(act);
    case 'heroicTackleModal': return other(act);
    case 'jumpUpModal': return pendingJumpUpCheck!=null ? pteam(pendingJumpUpCheck) : act;
    case 'forcejearModal': {
      if(!pendingForcejearChoice) return act;
      const at = players.find(x=>x.id===pendingForcejearChoice.attackerId);
      return (at && playerHasSkill(at, 'forcejear', 'wrestle')) ? at.team : other(at ? at.team : act);
    }
    case 'blockModal': {
      // quien ELIGE el dado (el banner de la modal lo indica); si no hay elección, quien tira (el atacante)
      const ban = document.getElementById('blockChooserBanner');
      if(ban && ban.style.background){
        const tmp = document.createElement('div');
        for(const t of ['A','B']){ tmp.style.background = tokenColorFor({ team:t }); if(tmp.style.background===ban.style.background) return t; }
      }
      return act;
    }
    default: return act;
  }
}
function tintModal(back){
  const modal = back.querySelector('.modal');
  if(!modal) return;
  if(!back.classList.contains('show')){ return; }
  const team = modalActorTeam(back.id);
  if(!team){ modal.removeAttribute('data-tint'); modal.removeAttribute('data-actor'); return; }
  modal.style.setProperty('--modal-team', tokenColorFor({ team }));
  modal.style.setProperty('--modal-team-text', textColorFor({ team }));
  modal.setAttribute('data-tint', '1');
  modal.setAttribute('data-actor', (back.id==='preMatchModal' ? 'COMPRA: ' : 'TIRA / DECIDE: ') + teamName(team).toUpperCase());
}
function setupModalTint(){
  const mo = new MutationObserver(ms=>ms.forEach(m=>{ const b = m.target; if(b.classList && b.classList.contains('show')) tintModal(b); }));
  document.querySelectorAll('.modal-back').forEach(b=>mo.observe(b, { attributes:true, attributeFilter:['class'] }));
}
try{ setupModalTint(); }catch(e){}

// ---------- Botón de cerrar + arrastre para TODOS los modales ----------
function setupModalEnhancements(){
  document.querySelectorAll('.modal-back').forEach(back=>{
    const modal = back.querySelector('.modal');
    if(!modal || modal.dataset.enhanced) return;
    modal.dataset.enhanced = '1';

    const closeBtn = document.createElement('div');
    closeBtn.className = 'modal-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Cancelar esta tirada/acción';
    closeBtn.onclick = (e)=>{ e.stopPropagation(); cancelActiveModal(back.id); };
    modal.appendChild(closeBtn);

    const handle = document.createElement('div');
    handle.className = 'modal-drag-handle';
    handle.title = 'Mantener pulsado y arrastrar para mover';
    modal.appendChild(handle);

    let dragging = false, offsetX = 0, offsetY = 0;

    const startDrag = (clientX, clientY)=>{
      const rect = modal.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      modal.style.position = 'fixed';
      modal.style.margin = '0';
      modal.style.left = rect.left + 'px';
      modal.style.top = rect.top + 'px';
      dragging = true;
    };
    const moveDrag = (clientX, clientY)=>{
      if(!dragging) return;
      const maxLeft = window.innerWidth - modal.offsetWidth - 4;
      const maxTop = window.innerHeight - modal.offsetHeight - 4;
      modal.style.left = Math.max(4, Math.min(maxLeft, clientX - offsetX)) + 'px';
      modal.style.top = Math.max(4, Math.min(maxTop, clientY - offsetY)) + 'px';
    };
    const stopDrag = ()=>{ dragging = false; };

    handle.addEventListener('mousedown', (e)=>{ e.preventDefault(); e.stopPropagation(); startDrag(e.clientX, e.clientY); });
    document.addEventListener('mousemove', (e)=>{ if(dragging) moveDrag(e.clientX, e.clientY); });
    document.addEventListener('mouseup', stopDrag);

    handle.addEventListener('touchstart', (e)=>{ e.stopPropagation(); const t=e.touches[0]; startDrag(t.clientX, t.clientY); }, { passive:true });
    document.addEventListener('touchmove', (e)=>{ if(dragging){ const t=e.touches[0]; moveDrag(t.clientX, t.clientY); } }, { passive:true });
    document.addEventListener('touchend', stopDrag);

    // En cuanto este modal se cierra (por cualquier vía: cancelar, resolver la acción, etc.),
    // se olvida la posición arrastrada para que la próxima vez vuelva a salir centrado.
    const posObserver = new MutationObserver(()=>{
      if(!back.classList.contains('show')){
        modal.style.position = '';
        modal.style.left = '';
        modal.style.top = '';
        modal.style.margin = '';
      }
    });
    posObserver.observe(back, { attributes:true, attributeFilter:['class'] });
  });
}
document.addEventListener('DOMContentLoaded', setupModalEnhancements);
if(document.readyState==='complete' || document.readyState==='interactive'){ setupModalEnhancements(); }

try{ loadRosterIndex(); }catch(e){}
try{ applyBoardView(); setSwitch('wfSw', weatherFieldAuto); updateTackleZonesButtons(); updateColorChoiceButtons(); setSwitch('colorsSw', customColorsEnabled); }catch(e){}
// Dados de 6 caras: los cuadros de dado muestran el icono dadoN.png (el texto se conserva, solo se oculta por CSS vía data-d6)
(function(){
  const ids = ['kickoffDistDie','dodgeDie','gfiDie','animosityDie','armorDie1','armorDie2','regenDie','injuryDie1','injuryDie2','koDie','traitCheckDie','catchDie','jumpUpDie','interceptDie','passDie','secureBallDie','keDie1','keDie2'];
  const upd = el=>{ if(!el) return; const t = (el.textContent||'').trim(); if(/^[1-6]$/.test(t)) el.setAttribute('data-d6', t); else el.removeAttribute('data-d6'); };
  try{
    const mo = new MutationObserver(ms=>ms.forEach(m=>upd(m.target.nodeType===1 ? m.target : m.target.parentElement)));
    ids.forEach(id=>{ const el = document.getElementById(id); if(el){ upd(el); mo.observe(el, { childList:true, characterData:true, subtree:true }); } });
  }catch(e){}
})();
window.APP_JS_VERSION = 'A_V70'; // ← sube este número cada vez que edites app.js

(function showVersionBadge(){
  const wVersion = document.documentElement.dataset.wVersion || 'W_?';
  const aVersion = window.APP_JS_VERSION || 'A_?';
  let sVersion = 'S_?';
  try{
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--css-version');
    if(raw) sVersion = raw.trim().replace(/^["']|["']$/g, '');
  }catch(e){}
  const badge = document.getElementById('versionBadge');
  if(badge) badge.textContent = wVersion + ' ' + aVersion + ' ' + sVersion;
})();
