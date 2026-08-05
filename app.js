const COLS = 20, ROWS = 11;
const LOS_A = 6, LOS_B = 13;
const teamColorHex = { A: '#c0392b', B: '#2a6fb0' };

let players = [];
let nextId = 1;
let ball = { carrierId: null, row: null, col: null };
let ballBounceActive = false;
let pendingCatch = null;
let pendingBallDrop = null;
let pendingDriveStart = null;
let selected = null;   // token selected during LIVE phase (for movement)
let placing = null;    // player id currently being placed/repositioned (SETUP phase)
let phase = 'setup';   // 'setup' | 'live'
let pendingTD = null;
let pendingDodge = null; // { playerId, toR, toC }
let pendingGfi = null;   // { playerId, toR, toC }
let dodgeRerollUsed = false;
let gfiRerollUsed = false;
let armorForPlayer = null; // player id currently being armor-rolled
let state = { half: 1, active: 'A', turns: { A: 0, B: 0 } };
let teamRace = { A: '', B: '' };
let openingKickoffDone = false;
let firstHalfKickingTeam = null;
let pitchBackgroundUrl = null;
let pitchBackgroundExact = false;
let teamStaff = { A: null, B: null };
let teamRerollsLeft = { A: 0, B: 0 };

function renderStaffPanels(){
  ['A','B'].forEach(team=>{
    const panel = document.getElementById('staffPanel'+team);
    if(!panel) return;
    const staff = teamStaff[team];
    if(!staff){
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';
    const rerollCountEl = document.getElementById('staffRerollCount'+team);
    if(rerollCountEl){
      const max = (staff.rerolls && typeof staff.rerolls.count === 'number') ? staff.rerolls.count : 0;
      rerollCountEl.textContent = teamRerollsLeft[team] + '/' + max;
    }
  });
}

function adjustReroll(team, delta){
  const staff = teamStaff[team];
  if(!staff || !staff.rerolls) return;
  const max = typeof staff.rerolls.count === 'number' ? staff.rerolls.count : 0;
  teamRerollsLeft[team] = Math.max(0, (teamRerollsLeft[team] || 0) + delta);
  log((delta<0 ? '🔄 Reroll usado' : '↩️ Reroll añadido') + ' — ' + teamName(team) + ': ' + teamRerollsLeft[team] + '/' + max + '.');
  renderStaffPanels();
  broadcastState();
}

function resetRerollsForNewHalf(){
  ['A','B'].forEach(team=>{
    const staff = teamStaff[team];
    if(staff && staff.rerolls && typeof staff.rerolls.count === 'number'){
      teamRerollsLeft[team] = staff.rerolls.count;
    }
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
let teamTextColor = { A: 'auto', B: 'auto' };
let customColorsEnabled = true;
function tokenColorFor(p){
  return (customColorsEnabled && teamCustomColor[p.team]) ? teamCustomColor[p.team] : teamColorHex[p.team];
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
  const override = teamTextColor[p.team];
  if(override==='white') return '#fff';
  if(override==='black') return '#161311';
  if(override && override.startsWith('#')) return override;
  return contrastTextColor(tokenColorFor(p));
}
function setCustomColors(v){
  customColorsEnabled = v;
  document.getElementById('colorsOnBtn').classList.toggle('active', v);
  document.getElementById('colorsOffBtn').classList.toggle('active', !v);
  renderRosters(); renderPitch();
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
let blitzActivePlayer = null;
let blockTargeting = null;   // attacker id currently choosing an adjacent target
let activeBlock = null;      // { attackerId, defenderId, isBlitz }
let blockDiceRolled = false;
let pendingArmorQueue = [];
let pendingPush = null;      // { attackerId, defenderId, kind, isBlitz }
let pendingFollowUp = null;  // { attackerId, defenderId, vacatedR, vacatedC, fallKind, isBlitz, directInjuryPlayerId }
let crowdPushMode = false;

// ---------- Remote play (PeerJS) ----------
let peer = null;
let conn = null;
let applyingRemote = false;

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

function hostRoom(){
  const code = generateCode();
  peer = new Peer('bb7-' + code);
  peer.on('open', ()=>{
    document.getElementById('connControls').style.display='none';
    document.getElementById('roomCodeBox').style.display='block';
    document.getElementById('roomCodeText').textContent = code;
    updateConnStatus('Sala creada. Esperando al rival...', false);
  });
  peer.on('connection', c=>{
    conn = c;
    setupConnHandlers();
    conn.on('open', ()=>{
      updateConnStatus('✅ Conectado — sala ' + code, true);
      broadcastState();
    });
  });
  peer.on('error', err=>{
    updateConnStatus('Error: ' + err.type + ' (probad recargar y crear otra sala)', false);
  });
}

function joinRoom(){
  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  if(!code){ alert('Escribe el código de la sala.'); return; }
  peer = new Peer();
  peer.on('open', ()=>{
    conn = peer.connect('bb7-' + code);
    setupConnHandlers();
    conn.on('open', ()=>{
      document.getElementById('connControls').style.display='none';
      updateConnStatus('✅ Conectado — sala ' + code, true);
    });
  });
  peer.on('error', err=>{
    updateConnStatus('Error: ' + err.type + ' (revisa el código)', false);
  });
}

function setupConnHandlers(){
  conn.on('data', data=>{
    if(data.type==='state') applyRemoteState(data.payload);
  });
  conn.on('close', ()=> updateConnStatus('Conexión cerrada.', false));
}

function snapshotState(){
  return {
    players, ball, phase, state, pendingTD, pendingDodge, pendingGfi, armorForPlayer, nextId,
    koQueue, pendingKo, teamRace, customColorsEnabled, teamCustomColor, teamTextColor, openingKickoffDone, firstHalfKickingTeam, pitchBackgroundUrl, pitchBackgroundExact, teamStaff, teamRerollsLeft, kickoffPendingOOBAfterEvent,
    ballBounceActive, pendingCatch, pendingBallDrop, pendingDriveStart,
    pendingKickPlacement, kickoffBounceStep, kickoffKickingTeam, kickoffReceivingTeam, freeCatchTeam, placingBallFree,
    blitzUsedByTeam, blitzActivePlayer, blockTargeting, activeBlock, pendingArmorQueue, pendingPush, pendingFollowUp, chainPushStack,
    teamAName: document.getElementById('teamAName').value,
    teamBName: document.getElementById('teamBName').value,
    kickSelectValue: document.getElementById('kickSelect').value,
    showHalfBtn: !!document.getElementById('newHalfBtn'),
    statusMsg: document.getElementById('statusLine').textContent,
    dodgeModalOpen: document.getElementById('dodgeModal').classList.contains('show'),
    dodgeText: document.getElementById('dodgeText').textContent,
    dodgeDieText: document.getElementById('dodgeDie').textContent,
    dodgeRerollUsed,
    gfiModalOpen: document.getElementById('gfiModal').classList.contains('show'),
    gfiText: document.getElementById('gfiText').textContent,
    gfiDieText: document.getElementById('gfiDie').textContent,
    gfiRerollUsed,
    armorModalOpen: document.getElementById('armorModal').classList.contains('show'),
    armorText: document.getElementById('armorText').textContent,
    armorDie1: document.getElementById('armorDie1').textContent,
    armorDie2: document.getElementById('armorDie2').textContent,
    armorSum: document.getElementById('armorSum').textContent,
    armorPassRowVisible: document.getElementById('armorPassRow').style.display==='block',
    armorRollBtnVisible: document.getElementById('armorRollBtn').style.display!=='none',
    crowdPushMode,
    injuryBlockVisible: document.getElementById('injuryBlock').style.display==='block',
    injuryDie1: document.getElementById('injuryDie1').textContent,
    injuryDie2: document.getElementById('injuryDie2').textContent,
    injurySum: document.getElementById('injurySum').textContent,
    koModalOpen: document.getElementById('koModal').classList.contains('show'),
    koText: document.getElementById('koText').textContent,
    koDieText: document.getElementById('koDie').textContent,
    blockModalOpen: document.getElementById('blockModal').classList.contains('show'),
    blockText: document.getElementById('blockText').textContent,
    blockDiceAreaHtml: document.getElementById('blockDiceArea').innerHTML,
    blockOutcomeRowVisible: document.getElementById('blockOutcomeRow').classList.contains('active'),
    blockDiceRolled,
    followUpModalOpen: document.getElementById('followUpModal').classList.contains('show'),
    followUpText: document.getElementById('followUpText').textContent,
    catchModalOpen: document.getElementById('catchModal').classList.contains('show'),
    catchText: document.getElementById('catchText').textContent,
    catchDieText: document.getElementById('catchDie').textContent,
    pendingJumpUpCheck,
    jumpUpModalOpen: document.getElementById('jumpUpModal').classList.contains('show'),
    jumpUpText: document.getElementById('jumpUpText').textContent,
    jumpUpDieText: document.getElementById('jumpUpDie').textContent,
    kickPlacementText: document.getElementById('kickPlacementText').textContent,
    kickoffStepText: document.getElementById('kickoffStepText').textContent,
    kickoffEventPanelVisible: document.getElementById('kickoffEventPanel').style.display==='block',
    kickoffDistRowVisible: document.getElementById('kickoffDistRow').style.display!=='none',
    kickoffDistance,
    kickoffEventDie1Text: document.getElementById('kickoffEventDie1').textContent,
    kickoffEventDie2Text: document.getElementById('kickoffEventDie2').textContent,
    kickoffEventSumText: document.getElementById('kickoffEventSum').textContent,
    kickoffDirDieText: document.getElementById('kickoffDirDie').textContent,
    kickoffDistDieText: document.getElementById('kickoffDistDie').textContent,
    bounceDirDieText: document.getElementById('bounceDirDie').textContent,
    freeCatchText: document.getElementById('freeCatchText').textContent
  };
}

const SAVE_KEY = 'bbsevens_autosave_v1';

function broadcastState(){
  if(applyingRemote) return;
  const snap = snapshotState();
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(snap)); }catch(e){}
  if(conn && conn.open){ conn.send({ type:'state', payload: snap }); }
}

function applyRemoteState(payload){
  applyingRemote = true;
  players = payload.players;
  ball = payload.ball;
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
  openingKickoffDone = !!payload.openingKickoffDone;
  firstHalfKickingTeam = payload.firstHalfKickingTeam || null;
  document.getElementById('kickSelect').disabled = openingKickoffDone;
  setPitchBackground(payload.pitchBackgroundUrl || null, !!payload.pitchBackgroundExact);
  teamStaff = payload.teamStaff || { A:null, B:null };
  teamRerollsLeft = payload.teamRerollsLeft || { A:0, B:0 };
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
  document.getElementById('colorsOnBtn').classList.toggle('active', customColorsEnabled);
  document.getElementById('colorsOffBtn').classList.toggle('active', !customColorsEnabled);
  ballBounceActive = !!payload.ballBounceActive;
  pendingCatch = payload.pendingCatch;
  pendingBallDrop = payload.pendingBallDrop;
  pendingDriveStart = payload.pendingDriveStart;
  pendingKickPlacement = payload.pendingKickPlacement;
  kickoffBounceStep = payload.kickoffBounceStep || 0;
  kickoffKickingTeam = payload.kickoffKickingTeam;
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
  nextId = payload.nextId;
  document.getElementById('teamAName').value = payload.teamAName;
  document.getElementById('teamBName').value = payload.teamBName;
  document.getElementById('kickSelect').value = payload.kickSelectValue;

  if(phase==='setup'){ showSetupPanel(); } else { document.getElementById('setupPanel').style.display='none'; }
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
  document.getElementById('armorRollBtn').style.display = (payload.armorRollBtnVisible===false) ? 'none' : 'block';
  crowdPushMode = !!payload.crowdPushMode;
  document.getElementById('injuryBlock').style.display = payload.injuryBlockVisible ? 'block' : 'none';
  document.getElementById('injuryDie1').textContent = payload.injuryDie1 || '–';
  document.getElementById('injuryDie2').textContent = payload.injuryDie2 || '–';
  document.getElementById('injurySum').textContent = payload.injurySum || 'Suma: –';
  document.getElementById('armorModal').classList.toggle('show', !!payload.armorModalOpen);

  document.getElementById('koText').textContent = payload.koText || '';
  document.getElementById('koDie').textContent = payload.koDieText || '–';
  document.getElementById('koModal').classList.toggle('show', !!payload.koModalOpen);
  document.getElementById('pushControlPanel').style.display = payload.pendingPush ? 'block' : 'none';
  if(payload.pendingPush){
    const pd = players.find(x=>x.id===payload.pendingPush.defenderId);
    document.getElementById('pushControlText').textContent = 'Elegid casilla de destino para ' + (pd?pd.name:'el jugador') + ', o si sale de banda:';
  }

  document.getElementById('blockText').textContent = payload.blockText || '';
  document.getElementById('blockDiceArea').innerHTML = payload.blockDiceAreaHtml || '';
  document.getElementById('blockOutcomeRow').classList.toggle('active', !!payload.blockOutcomeRowVisible);
  blockDiceRolled = !!payload.blockDiceRolled;
  document.getElementById('blockModal').classList.toggle('show', !!payload.blockModalOpen);

  document.getElementById('followUpText').textContent = payload.followUpText || '';
  document.getElementById('followUpModal').classList.toggle('show', !!payload.followUpModalOpen);

  document.getElementById('catchText').textContent = payload.catchText || '';
  document.getElementById('catchDie').textContent = payload.catchDieText || '–';
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
  document.getElementById('kickoffEventPanel').style.display = payload.kickoffEventPanelVisible ? 'block' : 'none';
  document.getElementById('kickoffDistRow').style.display = payload.kickoffDistRowVisible ? 'flex' : 'none';
  kickoffDistance = payload.kickoffDistance || 1;
  document.getElementById('kickoffEventDie1').textContent = payload.kickoffEventDie1Text || '–';
  document.getElementById('kickoffEventDie2').textContent = payload.kickoffEventDie2Text || '–';
  document.getElementById('kickoffEventSum').textContent = payload.kickoffEventSumText || 'Suma: –';
  document.getElementById('kickoffDirDie').textContent = payload.kickoffDirDieText || '–';
  document.getElementById('kickoffDistDie').textContent = payload.kickoffDistDieText || '–';

  document.getElementById('freeCatchPanel').style.display = payload.freeCatchTeam ? 'block' : 'none';
  document.getElementById('freeCatchText').textContent = payload.freeCatchText || '';

  renderRosters(); renderPitch(); renderScoreboard(); renderSelInfo(); updateKickSelectLabels();
  if(payload.statusMsg) updateStatus(payload.statusMsg);
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
function log(msg){
  const h = document.getElementById('hist');
  const d = document.createElement('div');
  d.textContent = msg;
  h.prepend(d);
}
function updateStatus(msg){ document.getElementById('statusLine').textContent = msg; }
function anyModalOpen(){
  return document.getElementById('tdModal').classList.contains('show') ||
         document.getElementById('dodgeModal').classList.contains('show') ||
         document.getElementById('gfiModal').classList.contains('show') ||
         document.getElementById('armorModal').classList.contains('show') ||
         document.getElementById('koModal').classList.contains('show') ||
         document.getElementById('blockModal').classList.contains('show') ||
         document.getElementById('followUpModal').classList.contains('show') ||
         document.getElementById('catchModal').classList.contains('show') ||
         document.getElementById('resumeModal').classList.contains('show') ||
         document.getElementById('losWarningModal').classList.contains('show') ||
         document.getElementById('jumpUpModal').classList.contains('show');
}

// ---------- Roster management ----------
function openAddPlayer(team){
  const num = prompt('Número de dorsal:');
  if(num === null) return;
  const name = prompt('Nombre (opcional):') || ('Jugador ' + num);
  const ma = parseFloat(prompt('Movimiento (MA):', '6')) || 6;
  players.push({ id: nextId++, team, num, name, ma, remainingMove: ma, gfiUsed:0, condition:'standing', blockedThisActivation:false, freePushOverride:false, row:null, col:null, activated:false, onPitch:false });
  renderRosters();
  broadcastState();
}

function quickFill(team){
  for(let i=1;i<=7;i++){
    players.push({ id: nextId++, team, num:i, name:'Jugador '+i, ma:6, remainingMove:6, gfiUsed:0, condition:'standing', blockedThisActivation:false, freePushOverride:false, row:null, col:null, activated:false, onPitch:false });
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
    if(!data.players || !Array.isArray(data.players)){ alert('El JSON debe tener un array "players".'); return; }
    if(data.teamName){
      document.getElementById(team==='A' ? 'teamAName':'teamBName').value = data.teamName;
    }
    teamRace[team] = data.race || '';
    if(data.color){
      teamCustomColor[team] = data.color;
      if(!customColorsEnabled){ setCustomColors(true); }
    }
    if(data.textColor){
      teamTextColor[team] = data.textColor;
    }
    if(data.staff){
      teamStaff[team] = data.staff;
      teamRerollsLeft[team] = (data.staff.rerolls && typeof data.staff.rerolls.count === 'number') ? data.staff.rerolls.count : 0;
    }
    data.players.forEach(pd=>{
      const ma = pd.ma || 6;
      players.push({
        id: nextId++, team,
        num: pd.num ?? '?',
        name: pd.name || ('Jugador ' + (pd.num ?? '')),
        ma, remainingMove: ma, gfiUsed:0, condition:'standing', blockedThisActivation:false, freePushOverride:false,
        st: pd.st, ag: pd.ag, pa: pd.pa, av: pd.av,
        position: pd.position || null,
        skills: pd.skills || [],
        row:null, col:null, activated:false, onPitch:false
      });
    });
    renderRosters(); renderScoreboard(); renderPitch(); updateKickSelectLabels();
    log('📁 Equipo cargado para ' + teamName(team) + ': ' + data.players.length + ' jugadores.');
    updateStatus('Equipo importado.');
    broadcastState();
  };
  reader.readAsText(file);
  inputEl.value = '';
}

function exportTeam(team){
  const list = players.filter(p=>p.team===team).map(p=>({
    num:p.num, name:p.name, ma:p.ma,
    st:p.st, ag:p.ag, pa:p.pa, av:p.av,
    position:p.position, skills:p.skills
  }));
  const data = { teamName: teamName(team), race: teamRace[team] || '', color: teamCustomColor[team] || null, textColor: teamTextColor[team] || 'auto', players: list };
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
  ['A','B'].forEach(team=>{
    const el = document.getElementById('roster'+team);
    el.innerHTML='';
    const retired = ['ko','injured','injuredGrave','dead'];
    players.filter(p=>p.team===team && !retired.includes(p.condition)).forEach(p=>{
      const div = document.createElement('div');
      div.className = 'roster-item' + (p.onPitch ? ' on-pitch' : '') + (placing===p.id ? ' picking':'');
      const posText = p.position || 'Sin posición';
      const condTag = p.condition==='tumbado' ? `<span class="downed-tag">TUMBADO</span>`
                     : p.condition==='aturdido' ? `<span class="downed-tag">ATURDIDO</span>`
                     : p.condition==='despistado' ? `<span class="downed-tag">DESPISTADO</span>` : '';
      const skillsText = (p.skills && p.skills.length) ? p.skills.join(', ') : 'Sin habilidades';
      div.innerHTML = `
        <div class="ri-row1">
          <span class="num" style="background:${tokenColorFor(p)}; color:${textColorFor(p)}">${p.num}</span>
          <span class="pname">${p.name}</span>
          <span class="pos">${posText}</span>
          ${condTag}
          <button class="rm-btn" title="Eliminar" onclick="removePlayer(${p.id}, event)">✕</button>
        </div>
        <div class="ri-row2 mono">MA ${p.ma ?? '-'} · ST ${p.st ?? '-'} · AG ${p.ag ?? '-'} · PA ${p.pa ?? '-'} · AV ${p.av ?? '-'}</div>
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
}

function renderReserveZone(){
  ['A','B'].forEach(team=>{
    const listEl = document.getElementById('casualtyList'+team);
    const header = document.getElementById('reserveHeader'+team);
    if(header) header.textContent = '🩹 ' + teamName(team) + ' — bajas';
    if(!listEl) return;
    const casualties = players.filter(p=>p.team===team &&
      (p.condition==='ko' || p.condition==='injured' || p.condition==='injuredGrave' || p.condition==='dead'));
    if(!casualties.length){
      listEl.innerHTML = '<span class="small-note">Ninguna</span>';
      return;
    }
    listEl.innerHTML = casualties.map(p=>{
      let badgeClass, badgeChar, extraLabel;
      if(p.condition==='ko'){ badgeClass='ko'; badgeChar='★'; extraLabel='INCONSCIENTE'; }
      else if(p.condition==='dead'){ badgeClass='dead'; badgeChar='✚'; extraLabel='MUERTO'; }
      else if(p.condition==='injuredGrave'){ badgeClass='grave'; badgeChar='✚'; extraLabel='HERIDA GRAVE'; }
      else { badgeClass='light'; badgeChar='✚'; extraLabel='HERIDO (LEVE)'; }
      const title = playerTooltipText(p, extraLabel).replace(/"/g,'&quot;');
      return `<div class="chip-wrap" title="${title}">
        <div class="token-chip" style="background:${tokenColorFor(p)}; color:${textColorFor(p)}">${p.num}</div>
        <div class="casualty-badge ${badgeClass}">${badgeChar}</div>
      </div>`;
    }).join('');
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

function handleRecoveryButton(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p) return;
  if(p.condition==='tumbado'){ standUp(); }
}

function knockDown(){
  if(selected===null){ alert('Selecciona primero un jugador en el campo.'); return; }
  const p = players.find(x=>x.id===selected);
  if(!p || !p.onPitch){ alert('El jugador debe estar en el campo.'); return; }
  if(p.condition!=='standing'){ alert('Ese jugador ya está en el suelo.'); return; }
  p.condition = 'tumbado';
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

// ---------- Setup / placement (pre-turn) ----------
function placeOnPitch(id){
  if(phase!=='setup'){
    alert('Solo se puede colocar/mover jugadores desde el banquillo durante la Fase de colocación (antes de la entrada, o justo después de un touchdown).');
    return;
  }
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
  const problems = checkLosMinimums();
  if(problems.length){
    const lines = problems.map(pr => `${teamName(pr.team)}: solo ${pr.count} de 3 jugadores mínimos en su línea de scrimmage (casillas centrales).`);
    document.getElementById('losWarningText').innerHTML = lines.join('<br>');
    document.getElementById('losWarningModal').classList.add('show');
    return;
  }
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
  const pitch = document.getElementById('pitch');
  pitch.innerHTML='';
  const posMap = {};
  players.filter(p=>p.onPitch).forEach(p=> posMap[p.row+'_'+p.col]=p );

  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = document.createElement('div');
      cell.className = cellClass(r,c);
      if(customColorsEnabled){
        if(c===0 && teamCustomColor.A){
          const base = teamCustomColor.A, dark = shadeColor(base, -20);
          cell.style.background = `repeating-linear-gradient(135deg, ${base}, ${base} 6px, ${dark} 6px, ${dark} 12px)`;
        } else if(c===COLS-1 && teamCustomColor.B){
          const base = teamCustomColor.B, dark = shadeColor(base, -20);
          cell.style.background = `repeating-linear-gradient(135deg, ${base}, ${base} 6px, ${dark} 6px, ${dark} 12px)`;
        }
      }

      let highlightable = false;
      let highlightGfi = false;
      let highlightBounce = false;
      let highlightKickZone = false;
      let highlightPush = false;
      let highlightPushFree = false;
      if(pendingKickPlacement){
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
      } else if(phase==='live' && selected!==null){
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
      if(highlightBounce && ball.row!==null){
        const num = bounceDirectionNumber(ball.row, ball.col, r, c);
        if(num) cell.dataset.bnum = num;
      }

      cell.onclick = ()=> cellClicked(r,c);

      const occ = posMap[r+'_'+c];
      if(occ){
        const t = document.createElement('div');
        const condClass = occ.condition==='tumbado' ? ' tumbado' : occ.condition==='aturdido' ? ' aturdido' : occ.condition==='despistado' ? ' despistado' : '';
        const targetClass = isValidBlockTarget(occ.id) ? ' block-target' : '';
        const freeCatchClass = (freeCatchTeam===occ.team && occ.onPitch && occ.condition==='standing') ? ' free-catch-target' : '';
        const showActivated = occ.activated && phase==='live' && occ.team===state.active;
        t.className = 'token' + (occ.id===selected?' selected':'') + (showActivated?' activated':'') + condClass + targetClass + freeCatchClass;
        t.style.background = tokenColorFor(occ);
        t.style.color = textColorFor(occ);
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
          t.appendChild(dot);
        }
        t.onclick=(e)=>{ e.stopPropagation(); tokenClicked(occ.id); };
        cell.appendChild(t);
      }

      if(ball.carrierId===null && ball.row===r && ball.col===c){
        const looseBall = document.createElement('div');
        looseBall.className = 'loose-ball';
        looseBall.textContent = '🏈';
        looseBall.title = 'Balón suelto';
        cell.appendChild(looseBall);
      }

      pitch.appendChild(cell);
    }
  }

  renderPushGhosts(pitch);
  renderEndzoneLabels(pitch);
}

function renderEndzoneLabels(pitch){
  if(!customColorsEnabled) return;
  ['A','B'].forEach(team=>{
    if(!teamCustomColor[team]) return;
    const col = team==='A' ? 0 : COLS-1;
    const label = document.createElement('div');
    label.className = 'endzone-label' + (team==='B' ? ' endzone-label-flip' : '');
    label.style.left = (col*35) + 'px';
    label.style.height = (ROWS*35-1) + 'px';
    label.textContent = teamName(team);
    label.style.color = textColorFor({ team });
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
    ghost.onclick = (e)=>{ e.stopPropagation(); pushOutOfBounds(); };
    pitch.appendChild(ghost);
  });
}

function handlePitchRightClick(e){
  e.preventDefault();
  if(phase==='live' && selected!==null && !anyModalOpen()){
    endActivation(selected);
  }
  return false;
}

function endActivation(id){
  const p = players.find(x=>x.id===id);
  if(!p) return;
  p.activated = true;
  selected = null;
  renderPitch(); renderRosters(); renderSelInfo();
  updateStatus(p.name + ' termina su activación.');
  broadcastState();
}

function cellClicked(r,c){
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
    p.onPitch=true; p.row=r; p.col=c;
    placing=null;
    renderRosters(); renderPitch();
    updateStatus('Jugador colocado. Seguid colocando o pulsad "Iniciar Entrada".');
    broadcastState();
    return;
  }

  // live phase — step by step movement
  if(selected!==null){
    const p = players.find(x=>x.id===selected);
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
  p.row=r; p.col=c;
  if(consume==='gfi'){ p.gfiUsed = (p.gfiUsed ?? 0) + 1; }
  else if(consume==='normal'){ p.remainingMove = Math.max(0, (p.remainingMove ?? p.ma) - 1); }
  // consume==='none' → already accounted for by a prior chained check
  if(ball.carrierId===p.id){ checkTouchdown(p); }
  if(moveMode(p)===null || pendingTD){
    p.activated = true;
    selected = null;
  }
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
  if(ball.carrierId===null && ball.row===r && ball.col===c && p.condition==='standing'){
    openCatchModal(p);
  }
}

function tokenClicked(id){
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
  if(selected!==null && phase==='live' && !anyModalOpen()){
    const attacker = players.find(x=>x.id===selected);
    const target = players.find(x=>x.id===id);
    if(attacker && target && attacker.team===state.active && attacker.condition==='standing' &&
       !attacker.activated && !attacker.blockedThisActivation &&
       target.team!==attacker.team && target.onPitch && target.condition==='standing' &&
       Math.max(Math.abs(attacker.row-target.row), Math.abs(attacker.col-target.col))===1){
      blockTargeting = attacker.id;
      chooseBlockTarget(id);
      return;
    }
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
  if(selected!==null && selected!==id){
    const prev = players.find(x=>x.id===selected);
    if(prev && prev.condition==='standing' && !prev.activated &&
       (((prev.remainingMove ?? prev.ma) < prev.ma) || (prev.gfiUsed ?? 0) > 0)){
      prev.activated = true;
      log('⏹️ ' + prev.name + ' termina su activación (se movió y se cambió de jugador).');
    }
  }
  selected = (selected===id) ? null : id;
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
}

function selectPlayerLive(id){
  if(phase!=='live') return;
  tokenClicked(id);
}

function renderSelInfo(){
  const el = document.getElementById('selInfo');
  const btn = document.getElementById('recoveryBtn');
  const blockBtn = document.getElementById('blockBtn');
  const blitzBtn = document.getElementById('blitzBtn');
  const despBtn = document.getElementById('despistadoBtn');
  const freePushBtn = document.getElementById('freePushBtn');
  const jumpUpBtn = document.getElementById('jumpUpBtn');
  if(selected===null){
    el.innerHTML = 'Ninguno';
    btn.style.display = 'none';
    blockBtn.style.display = 'none';
    blitzBtn.style.display = 'none';
    despBtn.style.display = 'none';
    freePushBtn.style.display = 'none';
    jumpUpBtn.style.display = 'none';
    return;
  }
  const p = players.find(x=>x.id===selected);
  if(!p){
    el.innerHTML = 'Ninguno';
    btn.style.display = 'none';
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
  el.innerHTML = `
    <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${p.name} <span style="color:#a99b7f; font-weight:400;">#${p.num} · ${teamName(p.team)}</span></div>
    <div style="color:#a99b7f; font-size:11.5px; margin-bottom:4px;">${p.position || 'Sin posición'}</div>
    <div class="mono" style="margin-bottom:4px;">MA ${p.ma} (restante ${p.remainingMove ?? p.ma}) · ST ${p.st ?? '-'} · AG ${p.ag ?? '-'} · PA ${p.pa ?? '-'} · AV ${p.av ?? '-'}</div>
    <div style="font-size:11.5px; font-style:italic; color:#8a7d64; margin-bottom:4px;">${skillsText}</div>
    <div>${(p.gfiUsed??0)>0?'A por ellos '+p.gfiUsed+'/'+maxGfiFor(p):''}${condLabel}${blitzLabel}${freePushLabel}${ball.carrierId===p.id?' · 🏈 lleva el balón':''}</div>`;

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

  if(p.condition==='aturdido'){
    btn.style.display = 'none';
  } else if(p.condition==='tumbado'){
    btn.textContent = '🧍 Levantar (marcar de pie)';
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
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
  if(blitzUsedByTeam[p.team]){ alert('Este equipo ya ha usado su Blitz este turno.'); return; }
  blitzUsedByTeam[p.team] = true;
  blitzActivePlayer = p.id;
  log('⚡ ' + p.name + ' declara BLITZ.');
  renderSelInfo();
  broadcastState();
}

// ---------- Block/Placaje targeting ----------
function isValidBlockTarget(defenderId){
  if(blockTargeting===null) return false;
  const attacker = players.find(x=>x.id===blockTargeting);
  const defender = players.find(x=>x.id===defenderId);
  if(!attacker || !defender) return false;
  return defender.onPitch && defender.team!==attacker.team && defender.condition==='standing' &&
    Math.max(Math.abs(defender.row-attacker.row), Math.abs(defender.col-attacker.col))===1;
}

function startBlockTargeting(){
  if(selected===null) return;
  const p = players.find(x=>x.id===selected);
  if(!p || p.condition!=='standing' || p.team!==state.active || p.activated || p.blockedThisActivation) return;
  const hasTarget = players.some(p2 => p2.onPitch && p2.team!==p.team && p2.condition==='standing' &&
    Math.max(Math.abs(p2.row-p.row), Math.abs(p2.col-p.col))===1);
  if(!hasTarget){ alert('No hay rivales en pie adyacentes.'); return; }
  document.getElementById('blockDiceArea').innerHTML = '';
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
  const attacker = players.find(x=>x.id===blockTargeting);
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

function proceedToBlockDice(attacker, defender, isBlitzHit){
  activeBlock = { attackerId: attacker.id, defenderId: defender.id, isBlitz: !!isBlitzHit };
  blockDiceRolled = false;
  document.getElementById('blockText').textContent = `${attacker.name} placa a ${defender.name} (${teamName(defender.team)}).`;
  document.getElementById('blockDiceArea').innerHTML = '';
  document.getElementById('blockOutcomeRow').classList.remove('active');
  document.getElementById('blockModal').classList.add('show');
  broadcastState();
}

function blockFaceHtml(idx){
  return `<img class="block-icon-img" src="${BLOCK_ICON_IMAGES[idx]}" alt="${BLOCK_FACES[idx]}" title="${BLOCK_FACES[idx]}" onerror="this.outerHTML='<div class=&quot;block-icon&quot;>${BLOCK_ICONS[idx]}</div>'">`;
}

function rollBlockDiceModal(n){
  const el = document.getElementById('blockDiceArea');
  el.innerHTML = '';
  const results = [];
  for(let i=0;i<n;i++){ results.push(Math.floor(Math.random()*6)); }
  results.forEach(idx=>{
    const d = document.createElement('div');
    d.className = 'block-face';
    d.innerHTML = blockFaceHtml(idx);
    el.appendChild(d);
  });
  document.getElementById('blockOutcomeRow').classList.add('active');
  blockDiceRolled = true;
  log('🎲 Placaje x' + n + ': ' + results.map(i=>BLOCK_FACES[i]).join(' / '));
  broadcastState();
}

function applyBlockOutcome(kind){
  if(!activeBlock) return;
  if(!blockDiceRolled){ alert('Tirad primero los dados de placaje.'); return; }
  const attacker = players.find(x=>x.id===activeBlock.attackerId);
  const defender = players.find(x=>x.id===activeBlock.defenderId);
  const isBlitz = activeBlock.isBlitz;
  document.getElementById('blockModal').classList.remove('show');
  activeBlock = null;
  if(!attacker || !defender){ broadcastState(); return; }

  attacker.blockedThisActivation = true;

  if(kind==='attackerDown'){
    attacker.condition = 'tumbado';
    attacker.activated = true;
    selected = null;
    log('👊 ' + attacker.name + ' (atacante) cae.');
    queueBallDropIfCarrier(attacker.id, attacker.row, attacker.col);
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    openArmorModal(attacker);
    return;
  }

  if(kind==='bothDown'){
    attacker.condition = 'tumbado';
    defender.condition = 'tumbado';
    attacker.activated = true;
    selected = null;
    log('👊 Ambos caen: ' + attacker.name + ' y ' + defender.name + '.');
    queueBallDropIfCarrier(attacker.id, attacker.row, attacker.col);
    queueBallDropIfCarrier(defender.id, defender.row, defender.col);
    renderRosters(); renderPitch(); renderSelInfo();
    broadcastState();
    pendingArmorQueue = [defender.id, attacker.id];
    processNextArmorInQueue();
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
  chainPushStack = [];
  const offsets = computePushOffsets(attacker.row, attacker.col, defender.row, defender.col);
  pendingPush = { attackerId: attacker.id, defenderId: defender.id, kind, isBlitz, offsets, freePush: !!attacker.freePushOverride };
  document.getElementById('pushControlPanel').style.display = 'block';
  document.getElementById('pushControlText').textContent = attacker.freePushOverride
    ? 'Empuje libre activado: elegid cualquiera de las 8 casillas adyacentes para ' + defender.name + '.'
    : 'Elegid una de las 3 casillas resaltadas para ' + defender.name + ' (según la dirección del placaje) — puede empujar en cadena si hay otro jugador ahí.';
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
  if(freePush){
    const list = [];
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
      if(dr===0 && dc===0) continue;
      list.push({ row: mover.row+dr, col: mover.col+dc });
    }
    return list;
  }
  const raw = offsets.map(o=>({ row: mover.row+o.dr, col: mover.col+o.dc }));
  const isOccupied = t => (t.row>=0 && t.row<ROWS && t.col>=0 && t.col<COLS) && !!occupiedBy(t.row, t.col);
  const hasFreeOption = raw.some(t => !isOccupied(t));
  if(hasFreeOption){
    return raw.filter(t => !isOccupied(t));
  }
  return raw; // las 3 ocupadas: empuje en cadena forzoso, cualquiera es válida
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

  pendingFollowUp = {
    attackerId: rootInfo.attackerId, defenderId: original.playerId,
    vacatedR: original.fromR, vacatedC: original.fromC,
    fallKind: (rootInfo.kind==='stumble' || rootInfo.kind==='pow') ? rootInfo.kind : null,
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
    document.getElementById('followUpText').textContent = `¿${attacker.name} avanza a la casilla que deja libre ${originalPlayer.name}?`;
    document.getElementById('followUpModal').classList.add('show');
    broadcastState();
  } else {
    finishPushSequence(pendingFollowUp);
  }
}

function pushOutOfBounds(){
  if(!pendingPush) return;
  const info = pendingPush;
  pendingPush = null;
  document.getElementById('pushControlPanel').style.display = 'none';
  const mover = players.find(x=>x.id===info.defenderId);
  if(!mover){ chainPushStack=[]; renderPitch(); broadcastState(); return; }

  const fromR = mover.row, fromC = mover.col;
  queueBallDropIfCarrier(mover.id, fromR, fromC);
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
    if(attacker) openCatchModal(attacker);
  }
}

function playerHasSkill(p, ...keywords){
  if(!p || !p.skills) return false;
  const lower = p.skills.map(s => (s||'').toLowerCase());
  return keywords.some(k => lower.some(s => s.includes(k)));
}

function parseAgTarget(agStr){
  const n = parseInt(agStr, 10);
  return isNaN(n) ? 4 : n;
}

function finishPushSequence(info){
  if(!info) return;
  const attacker = players.find(x=>x.id===info.attackerId);

  if(info.directInjuryPlayerId){
    const defender = players.find(x=>x.id===info.directInjuryPlayerId);
    if(defender){ openInjuryDirect(defender); }
  } else if(info.fallKind){
    const defender = players.find(x=>x.id===info.defenderId);
    if(defender){
      defender.condition = 'tumbado';
      log('💥 ' + defender.name + (info.fallKind==='pow' ? ' cae (POW).' : ' cae (desequilibrado).'));
      queueBallDropIfCarrier(defender.id, defender.row, defender.col);
      renderRosters(); renderPitch();
      broadcastState();
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
    openCatchModal(occ);
  } else {
    log('🏈 El balón bota sobre ' + occ.name + ' (' + occ.condition + ') y sigue botando.');
    startBallBounce();
  }
}

function openCatchModal(p){
  pendingCatch = p.id;
  document.getElementById('catchText').textContent = `${p.name} intenta recoger el balón. Tirad D6 (AG ${p.ag ?? '-'}) y decidid.`;
  document.getElementById('catchDie').textContent = '–';
  document.getElementById('catchModal').classList.add('show');
  broadcastState();
}

function rollCatchDie(){
  const r = Math.floor(Math.random()*6)+1;
  document.getElementById('catchDie').textContent = r;
  log('🎲 Recoger balón: tirada ' + r);
  broadcastState();
}

function resolveCatch(success){
  const p = players.find(x=>x.id===pendingCatch);
  document.getElementById('catchModal').classList.remove('show');
  pendingCatch = null;
  if(p && success){
    ball.carrierId = p.id;
    log('🏈 ' + p.name + ' recoge el balón.');
    renderPitch(); renderRosters();
    broadcastState();
    checkTouchdown(p);
    if(!pendingTD) checkDriveStartAfterBounce();
  } else if(p){
    log('🏈 ' + p.name + ' falla la recogida — el balón sigue botando.');
    broadcastState();
    startBallBounce();
  } else {
    broadcastState();
  }
}

function checkDriveStartAfterBounce(){
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
let kickoffReceivingTeam = null;
let kickoffDistance = 1;
let kickoffPendingOOBAfterEvent = false;
let freeCatchTeam = null;

function beginKickPlacement(kicking, receiving){
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
  kickoffKickingTeam = info.kickingTeam;
  kickoffReceivingTeam = info.receivingTeam;
  log('🏈 Saque colocado por ' + teamName(info.kickingTeam) + '.');
  renderPitch();
  broadcastState();
  startKickoffBounce(1);
}

function showKickoffEvent(){
  document.getElementById('kickoffEventPanel').style.display = 'block';
  document.getElementById('kickoffEventDie1').textContent = '–';
  document.getElementById('kickoffEventDie2').textContent = '–';
  document.getElementById('kickoffEventSum').textContent = 'Suma: –';
  updateStatus('Evento de patada inicial: tirad 2D6 y aplicad el resultado de vuestra tabla.');
  broadcastState();
}

function rollKickoffEvent2D6(){
  const d1 = Math.floor(Math.random()*6)+1, d2 = Math.floor(Math.random()*6)+1;
  document.getElementById('kickoffEventDie1').textContent = d1;
  document.getElementById('kickoffEventDie2').textContent = d2;
  document.getElementById('kickoffEventSum').textContent = 'Suma: ' + (d1+d2);
  log('🎲 Evento de patada inicial (2D6): ' + d1 + ' + ' + d2 + ' = ' + (d1+d2) + ' (aplicad el resultado de vuestra tabla).');
  broadcastState();
}

function continueAfterKickoffEvent(){
  document.getElementById('kickoffEventPanel').style.display = 'none';
  if(kickoffPendingOOBAfterEvent){
    kickoffPendingOOBAfterEvent = false;
    finishKickoffAsFreeCatch();
    return;
  }
  startKickoffBounce(2);
}

function startKickoffBounce(step){
  kickoffBounceStep = step;
  if(step===1) kickoffDistance = 1;
  document.getElementById('kickoffPanel').style.display = 'block';
  document.getElementById('kickoffEventPanel').style.display = 'none';
  document.getElementById('kickoffDistRow').style.display = step===1 ? 'flex' : 'none';
  document.getElementById('kickoffDirDie').textContent = '–';
  document.getElementById('kickoffDistDie').textContent = '–';
  document.getElementById('kickoffStepText').textContent = step===1
    ? 'Patada inicial: tirad 1D8 (dirección) y 1D6 (nº de casillas). Elegid la casilla numerada (1-8: 1-2-3 arriba, 4-balón-5 en medio, 6-7-8 abajo), o "Fuera del campo".'
    : 'Rebote final: tirad 1D8 y elegid la casilla numerada (1-8), o "Fuera del campo".';
  renderPitch();
  broadcastState();
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
  const occ = occupiedBy(finalR, finalC);
  if(occ && occ.condition==='standing'){
    openCatchModal(occ);
  } else {
    log('🏈 El balón queda en el campo tras el saque.');
    checkDriveStartAfterBounce();
  }
}

function finishKickoffAsFreeCatch(){
  kickoffBounceStep = 0;
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

function checkActionButtons(prefix, success, p){
  const resultEl = document.getElementById(prefix+'ResultText');
  resultEl.textContent = success ? '✅ CONSEGUIDO' : '❌ FALLADO';
  resultEl.className = 'check-result ' + (success ? 'ok' : 'fail');
  document.getElementById(prefix+'RollBtn').style.display = 'none';
  const actionRow = document.getElementById(prefix+'ActionRow');
  actionRow.innerHTML = '';
  actionRow.style.display = 'flex';

  const resolveFn = prefix==='dodge' ? resolveDodge : resolveGfi;

  if(success){
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = '➡️ Continuar';
    btn.onclick = ()=> resolveFn(true);
    actionRow.appendChild(btn);
    return;
  }

  const usedFlag = prefix==='dodge' ? dodgeRerollUsed : gfiRerollUsed;
  if(!usedFlag){
    const hasDodgeSkill = prefix==='dodge' && playerHasSkill(p, 'esquiva', 'dodge');
    if(hasDodgeSkill){
      const btn = document.createElement('button');
      btn.textContent = '🔁 Usar Esquivar (repite gratis)';
      btn.onclick = ()=> useCheckReroll(prefix, true);
      actionRow.appendChild(btn);
    } else if((teamRerollsLeft[p.team] || 0) > 0){
      const btn = document.createElement('button');
      btn.textContent = '🔄 Usar Reroll (quedan ' + teamRerollsLeft[p.team] + ')';
      btn.onclick = ()=> useCheckReroll(prefix, false);
      actionRow.appendChild(btn);
    }
  }

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'danger';
  acceptBtn.textContent = '➡️ Continuar (fallado)';
  acceptBtn.onclick = ()=> resolveFn(false);
  actionRow.appendChild(acceptBtn);
}

function useCheckReroll(prefix, isSkill){
  const pending = prefix==='dodge' ? pendingDodge : pendingGfi;
  if(!pending) return;
  const p = players.find(x=>x.id===pending.playerId);
  if(!p) return;
  if(prefix==='dodge') dodgeRerollUsed = true; else gfiRerollUsed = true;
  if(!isSkill){
    teamRerollsLeft[p.team] = Math.max(0, (teamRerollsLeft[p.team]||0) - 1);
    log('🔄 ' + teamName(p.team) + ' gasta un reroll — quedan ' + teamRerollsLeft[p.team] + '.');
    renderStaffPanels();
  } else {
    log('🔁 ' + p.name + ' repite gratis con su habilidad Esquivar.');
  }
  pending.lastSuccess = undefined;
  document.getElementById(prefix+'ActionRow').style.display = 'none';
  document.getElementById(prefix+'RollBtn').style.display = 'block';
  document.getElementById(prefix+'ResultText').textContent = '';
  document.getElementById(prefix+'ResultText').className = 'check-result';
  document.getElementById(prefix+'Die').textContent = '–';
  broadcastState();
}

function openDodgeModal(p, toR, toC, fromGfi){
  const tz = countOpponentTackleZones(toR, toC, p.team);
  const target = parseAgTarget(p.ag) + tz;
  pendingDodge = { playerId:p.id, toR, toC, fromGfi: !!fromGfi, target };
  dodgeRerollUsed = false;
  const msg = (fromGfi
    ? `${p.name} ha superado "a por ellos" pero esa casilla también sale de una zona de marcaje rival. `
    : `${p.name} sale de una zona de marcaje rival. `)
    + `Necesita ${target}+ (AG${p.ag ?? '?'} + ${tz} zona(s) de marcaje en destino). Tirad D6.`;
  document.getElementById('dodgeText').textContent = msg;
  document.getElementById('dodgeDie').textContent = '–';
  document.getElementById('dodgeResultText').textContent = '';
  document.getElementById('dodgeResultText').className = 'check-result';
  document.getElementById('dodgeRollBtn').style.display = 'block';
  document.getElementById('dodgeActionRow').style.display = 'none';
  document.getElementById('dodgeActionRow').innerHTML = '';
  document.getElementById('dodgeModal').classList.add('show');
  broadcastState();
}

function rollDodgeDie(){
  if(!pendingDodge) return;
  const r = Math.floor(Math.random()*6)+1;
  document.getElementById('dodgeDie').textContent = r;
  const p = players.find(x=>x.id===pendingDodge.playerId);
  const success = r===6 ? true : (r===1 ? false : r>=pendingDodge.target);
  pendingDodge.lastSuccess = success;
  log('🎲 Esquiva: tirada ' + r + ' (necesitaba ' + pendingDodge.target + '+) → ' + (success?'CONSEGUIDO':'FALLADO'));
  checkActionButtons('dodge', success, p);
  broadcastState();
}

function resolveDodge(success){
  if(!pendingDodge) return;
  const { playerId, toR, toC, fromGfi } = pendingDodge;
  const p = players.find(x=>x.id===playerId);
  document.getElementById('dodgeModal').classList.remove('show');
  pendingDodge = null;
  if(!p){ broadcastState(); return; }

  if(success){
    completeStep(p, toR, toC, fromGfi ? 'none' : 'normal');
  } else {
    p.row = toR; p.col = toC;
    p.condition = 'tumbado';
    p.activated = true;
    selected = null;
    renderRosters(); renderPitch(); renderSelInfo();
    log('💥 ' + p.name + ' falla la esquiva y cae al suelo.');
    queueBallDropIfCarrier(p.id, toR, toC);
    broadcastState();
    openArmorModal(p);
  }
}

function openGfiModal(p, toR, toC, chainDodge, blockDefenderId){
  pendingGfi = { playerId:p.id, toR, toC, chainDodge: !!chainDodge, blockDefenderId: blockDefenderId || null };
  gfiRerollUsed = false;
  const attempt = (p.gfiUsed ?? 0) + 1;
  let msg = `${p.name} intenta "a por ellos" — casilla extra ${attempt}/${maxGfiFor(p)}. Necesita 2+ (solo falla con un 1). Tirad D6.`;
  if(blockDefenderId){
    msg = `${p.name} ya no le queda MA para el placaje del Blitz — tirad D6 "a por ellos" para intentarlo igualmente (necesita 2+).`;
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
  const success = r>=2;
  pendingGfi.lastSuccess = success;
  log('🎲 A por ellos: tirada ' + r + ' → ' + (success?'CONSEGUIDO':'FALLADO'));
  checkActionButtons('gfi', success, p);
  broadcastState();
}

function resolveGfi(success){
  if(!pendingGfi) return;
  const { playerId, toR, toC, chainDodge, blockDefenderId } = pendingGfi;
  const p = players.find(x=>x.id===playerId);
  document.getElementById('gfiModal').classList.remove('show');
  pendingGfi = null;
  if(!p){ broadcastState(); return; }

  if(success){
    if(blockDefenderId){
      p.gfiUsed = (p.gfiUsed ?? 0) + 1;
      const defender = players.find(x=>x.id===blockDefenderId);
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
      if(defender){ proceedToBlockDice(p, defender, true); }
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
    p.condition = 'tumbado';
    p.activated = true;
    selected = null;
    renderRosters(); renderPitch(); renderSelInfo();
    log('💥 ' + p.name + ' falla "a por ellos" y cae al suelo.');
    queueBallDropIfCarrier(p.id, toR, toC);
    broadcastState();
    openArmorModal(p);
  }
}

function openArmorModal(p){
  armorForPlayer = p.id;
  crowdPushMode = false;
  document.getElementById('armorText').textContent = `Tirando armadura a ${p.name} con AV ${p.av ?? '(sin dato)'}.`;
  document.getElementById('armorRollBtn').style.display = 'block';
  document.getElementById('armorDie1').textContent='–';
  document.getElementById('armorDie2').textContent='–';
  document.getElementById('armorSum').textContent='Suma: –';
  document.getElementById('armorPassRow').style.display='none';
  document.getElementById('injuryBlock').style.display='none';
  document.getElementById('injuryDie1').textContent='–';
  document.getElementById('injuryDie2').textContent='–';
  document.getElementById('injurySum').textContent='Suma: –';
  document.getElementById('armorModal').classList.add('show');
  broadcastState();
}

function openInjuryDirect(p){
  armorForPlayer = p.id;
  crowdPushMode = true;
  document.getElementById('armorText').textContent = `${p.name} sale del campo empujado — tirada de heridas directa (sin armadura).`;
  document.getElementById('armorRollBtn').style.display = 'none';
  document.getElementById('armorDie1').textContent='–';
  document.getElementById('armorDie2').textContent='–';
  document.getElementById('armorSum').textContent='(sin tirada de armadura)';
  document.getElementById('armorPassRow').style.display='none';
  document.getElementById('injuryBlock').style.display='block';
  document.getElementById('injuryDie1').textContent='–';
  document.getElementById('injuryDie2').textContent='–';
  document.getElementById('injurySum').textContent='Suma: –';
  document.getElementById('armorModal').classList.add('show');
  broadcastState();
}

function rollArmor(){
  const d1=Math.floor(Math.random()*6)+1, d2=Math.floor(Math.random()*6)+1;
  document.getElementById('armorDie1').textContent=d1;
  document.getElementById('armorDie2').textContent=d2;
  document.getElementById('armorSum').textContent='Suma: '+(d1+d2);
  document.getElementById('armorPassRow').style.display='block';
  const p = players.find(x=>x.id===armorForPlayer);
  log('🎲 Armadura (' + (p?p.name:'?') + '): ' + d1 + ' + ' + d2 + ' = ' + (d1+d2));
  broadcastState();
}

function armorResult(broken){
  const p = players.find(x=>x.id===armorForPlayer);
  if(broken){
    document.getElementById('armorPassRow').style.display='none';
    document.getElementById('injuryBlock').style.display='block';
    log('🛡️ Armadura ROTA' + (p?(' — '+p.name):'') + '. Tirad heridas.');
  } else {
    if(p){ p.condition='tumbado'; }
    log('🛡️ Armadura aguanta' + (p?(' — '+p.name+' sigue tumbado.'):'.'));
    renderRosters(); renderPitch(); renderSelInfo();
    closeArmorModal();
  }
  broadcastState();
}

function rollInjury(){
  const d1=Math.floor(Math.random()*6)+1, d2=Math.floor(Math.random()*6)+1;
  document.getElementById('injuryDie1').textContent=d1;
  document.getElementById('injuryDie2').textContent=d2;
  document.getElementById('injurySum').textContent='Suma: '+(d1+d2);
  const p = players.find(x=>x.id===armorForPlayer);
  log('🎲 Heridas (' + (p?p.name:'?') + '): ' + d1 + ' + ' + d2 + ' = ' + (d1+d2));
  broadcastState();
}

function chooseInjury(kind){
  const p = players.find(x=>x.id===armorForPlayer);
  if(p){
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
  crowdPushMode = false;
  renderRosters(); renderPitch(); renderSelInfo();
  closeArmorModal();
  broadcastState();
}

function queueBallDropIfCarrier(playerId, r, c){
  if(ball.carrierId === playerId){
    pendingBallDrop = { playerId, r, c };
  }
}

function closeArmorModal(){
  document.getElementById('armorModal').classList.remove('show');
  armorForPlayer = null;
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
    log('🏈 Se le cae el balón.');
    renderPitch();
    broadcastState();
    startBallBounce();
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
  document.getElementById('koText').textContent = `Recuperación de ${p.name} (${teamName(p.team)}). Tirad D6 y decidid.`;
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
  state.turns[team]++;
  state.active = team;
  blitzUsedByTeam[team] = false;
  players.filter(p=>p.team===team).forEach(p=>{
    p.activated = false;
    p.remainingMove = p.ma;
    p.gfiUsed = 0;
    p.blockedThisActivation = false;
  });
  renderScoreboard(); renderRosters(); renderPitch();
  updateStatus('Turno de ' + teamName(team));
  broadcastState();
}

function resetBoardForNewDrive(){
  players.forEach(p=>{
    p.onPitch=false; p.row=null; p.col=null; p.activated=false;
    if(p.condition==='tumbado' || p.condition==='aturdido'){ p.condition='standing'; }
    p.remainingMove=p.ma; p.gfiUsed=0; p.blockedThisActivation=false;
  });
  ball = { carrierId: null, row: null, col: null };
  ballBounceActive = false;
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
  document.getElementById('kickoffEventPanel').style.display = 'none';
  document.getElementById('freeCatchPanel').style.display = 'none';
}

function confirmTD(){
  document.getElementById('tdModal').classList.remove('show');
  const scoringTeam = pendingTD.team;
  const scoreEl = document.getElementById(scoringTeam==='A' ? 'scoreA':'scoreB');
  scoreEl.textContent = parseInt(scoreEl.textContent) + 1;
  log('🏆 ¡TOUCHDOWN! ' + teamName(scoringTeam) + ' — ' + pendingTD.name);

  const halfOver = isHalfComplete(scoringTeam);
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

function endTurn(){
  if(phase!=='live'){
    alert('Terminad de colocar y pulsad "Iniciar Entrada" primero.');
    return;
  }
  const finishing = state.active;

  players.filter(p=>p.team===finishing && p.condition==='aturdido').forEach(p=>{
    p.condition = 'tumbado';
    log('🔄 ' + p.name + ' se da la vuelta (Aturdido → Tumbado) al final del turno.');
  });

  if(isHalfComplete(finishing)){
    resetBoardForNewDrive();
    phase='setup';
    showSetupPanel();
    addNewHalfButton();
    updateStatus('¡Mitad terminada! Colocad y pulsad "Empezar Mitad 2".');
    renderScoreboard(); renderRosters(); renderPitch();
    broadcastState();
    return;
  }
  const other = finishing==='A' ? 'B':'A';
  beginTurn(other);
}

function addNewHalfButton(){
  if(document.getElementById('newHalfBtn')) return;
  const btn = document.createElement('button');
  btn.id='newHalfBtn'; btn.className='full primary'; btn.textContent='Empezar Mitad 2';
  btn.style.marginTop='8px';
  btn.onclick = ()=>{
    state.half=2; state.turns={A:0,B:0};
    players.forEach(p=>{ p.activated=false; });
    btn.remove();
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
  };
  document.getElementById('setupPanel').appendChild(btn);
}

function resetActivations(){
  players.filter(p=>p.team===state.active).forEach(p=>{ p.activated=false; p.remainingMove=p.ma; p.gfiUsed=0; });
  renderRosters(); renderPitch();
  log('Activaciones reiniciadas manualmente (mismo turno).');
  broadcastState();
}

function renderScoreboard(){
  document.getElementById('sbNameA').textContent = teamName('A');
  document.getElementById('sbNameB').textContent = teamName('B');
  document.getElementById('sbRaceA').textContent = teamRace.A || '';
  document.getElementById('sbRaceB').textContent = teamRace.B || '';
  document.getElementById('halfNum').textContent = state.half;
  document.getElementById('turnA').textContent = Math.min(state.turns.A,6);
  document.getElementById('turnB').textContent = Math.min(state.turns.B,6);
  const flag = document.getElementById('activeFlag');
  if(phase==='setup'){
    flag.textContent = 'COLOCACIÓN';
    flag.classList.add('setup-flag');
  } else {
    flag.textContent = 'TURNO ' + teamName(state.active).toUpperCase();
    flag.classList.remove('setup-flag');
  }
}

document.getElementById('teamAName').addEventListener('input', ()=>{ renderScoreboard(); onKickChangeQuiet(); updateKickSelectLabels(); broadcastState(); });
document.getElementById('teamBName').addEventListener('input', ()=>{ renderScoreboard(); onKickChangeQuiet(); updateKickSelectLabels(); broadcastState(); });

// ---------- Dice (free-standing rollers) ----------
const BLOCK_FACES = ['ATACANTE CAE','AMBOS CAEN','EMPUJÓN','EMPUJÓN','DESEQUILIBRADO','POW (DEFENSOR CAE)'];
const BLOCK_ICONS = ['💀','💀💥','➡️','➡️','💢','💥'];
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
}

function rollPass(){
  const target = parseInt(document.getElementById('paTarget').value)||3;
  const r = Math.floor(Math.random()*6)+1;
  let result, color;
  if(r===6){ result='PRECISO'; color='var(--good)'; }
  else if(r===1){ result='FUMBLE'; color='var(--bad)'; }
  else if(r>=target){ result='PRECISO'; color='var(--good)'; }
  else { result='IMPRECISO'; color='var(--gold)'; }
  document.getElementById('passOut').innerHTML = `<div class="die-face">${r}</div><div style="font-size:13px;">Objetivo ${target}+ → <b style="color:${color}">${result}</b></div>`;
  log('🎲 Pase (obj. '+target+'+): tirada ' + r + ' → ' + result);
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
