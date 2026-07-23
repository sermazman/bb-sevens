const COLS = 20, ROWS = 11;
const LOS_A = 6, LOS_B = 13;
const teamColorHex = { A: '#c0392b', B: '#2a6fb0' };

let players = [];
let nextId = 1;
let ball = { carrierId: null };
let selected = null;   // token selected during LIVE phase (for movement)
let placing = null;    // player id currently being placed/repositioned (SETUP phase)
let phase = 'setup';   // 'setup' | 'live'
let pendingTD = null;
let state = { half: 1, active: 'A', turns: { A: 0, B: 0 } };

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
      broadcastState(); // sync the host's current setup to the guest
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
    else if(data.type==='dice') applyRemoteDice(data.kind, data.payload);
  });
  conn.on('close', ()=> updateConnStatus('Conexión cerrada.', false));
}

function snapshotState(){
  return {
    players, ball, phase, state, pendingTD, nextId,
    teamAName: document.getElementById('teamAName').value,
    teamBName: document.getElementById('teamBName').value,
    kickSelectValue: document.getElementById('kickSelect').value,
    showHalfBtn: !!document.getElementById('newHalfBtn'),
    statusMsg: document.getElementById('statusLine').textContent
  };
}

function broadcastState(){
  if(applyingRemote) return;
  if(conn && conn.open){ conn.send({ type:'state', payload: snapshotState() }); }
}

function applyRemoteState(payload){
  applyingRemote = true;
  players = payload.players;
  ball = payload.ball;
  phase = payload.phase;
  state = payload.state;
  pendingTD = payload.pendingTD;
  nextId = payload.nextId;
  document.getElementById('teamAName').value = payload.teamAName;
  document.getElementById('teamBName').value = payload.teamBName;
  document.getElementById('kickSelect').value = payload.kickSelectValue;

  if(phase==='setup'){ showSetupPanel(); } else { document.getElementById('setupPanel').style.display='none'; }
  const existingBtn = document.getElementById('newHalfBtn');
  if(payload.showHalfBtn && !existingBtn){ addNewHalfButton(true); }
  if(!payload.showHalfBtn && existingBtn){ existingBtn.remove(); }

  if(pendingTD){
    document.getElementById('tdText').textContent = `${teamName(pendingTD.team)} anota con ${pendingTD.name}!`;
    document.getElementById('tdModal').classList.add('show');
  } else {
    document.getElementById('tdModal').classList.remove('show');
  }

  renderRosters(); renderPitch(); renderScoreboard();
  if(payload.statusMsg) updateStatus(payload.statusMsg);
  applyingRemote = false;
}

function sendDice(kind, payload){
  if(conn && conn.open){ conn.send({ type:'dice', kind, payload }); }
}

function applyRemoteDice(kind, payload){
  if(kind==='block') renderBlockResult(payload.results);
  else if(kind==='d6') renderD6(payload.r, payload.label);
  else if(kind==='pass') renderPassResult(payload.r, payload.target);
}

// ---------- Basic helpers ----------
function teamName(t){ return t==='A' ? document.getElementById('teamAName').value : document.getElementById('teamBName').value; }
function log(msg){
  const h = document.getElementById('hist');
  const d = document.createElement('div');
  d.textContent = msg;
  h.prepend(d);
}
function updateStatus(msg){ document.getElementById('statusLine').textContent = msg; }

// ---------- Roster management ----------
function openAddPlayer(team){
  const num = prompt('Número de dorsal:');
  if(num === null) return;
  const name = prompt('Nombre (opcional):') || ('Jugador ' + num);
  const ma = parseFloat(prompt('Movimiento (MA):', '6')) || 6;
  players.push({ id: nextId++, team, num, name, ma, row:null, col:null, activated:false, onPitch:false });
  renderRosters();
  broadcastState();
}

function quickFill(team){
  for(let i=1;i<=7;i++){
    players.push({ id: nextId++, team, num:i, name:'Jugador '+i, ma:6, row:null, col:null, activated:false, onPitch:false });
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
    data.players.forEach(pd=>{
      players.push({
        id: nextId++, team,
        num: pd.num ?? '?',
        name: pd.name || ('Jugador ' + (pd.num ?? '')),
        ma: pd.ma || 6,
        st: pd.st, ag: pd.ag, pa: pd.pa, av: pd.av,
        position: pd.position || null,
        skills: pd.skills || [],
        row:null, col:null, activated:false, onPitch:false
      });
    });
    renderRosters(); renderScoreboard();
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
  const data = { teamName: teamName(team), players: list };
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
    players.filter(p=>p.team===team).forEach(p=>{
      const div = document.createElement('div');
      div.className = 'roster-item' + (p.onPitch ? ' on-pitch' : '') + (placing===p.id ? ' picking':'');
      const posTag = p.position ? `<span style="color:#8a7d64; font-size:10.5px;">${p.position}</span>` : '';
      div.innerHTML = `<span class="num" style="background:${teamColorHex[team]}">${p.num}</span>
        <span>${p.name}</span>${posTag}
        <span class="mono" style="color:#a99b7f; font-size:11px;">MA${p.ma}</span>
        <button class="rm-btn" title="Eliminar" onclick="removePlayer(${p.id}, event)">✕</button>`;
      div.onclick = (e)=>{
        if(e.target.classList.contains('rm-btn')) return;
        if(!p.onPitch){ placeOnPitch(p.id); }
        else if(phase==='live'){ selectPlayerLive(p.id); }
      };
      el.appendChild(div);
    });
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
  p.onPitch=false; p.row=null; p.col=null;
  if(ball.carrierId===p.id){ ball.carrierId=null; }
  selected=null;
  renderRosters(); renderPitch(); renderSelInfo();
  broadcastState();
}

// ---------- Setup / placement (pre-turn) ----------
function placeOnPitch(id){
  if(phase!=='setup'){
    alert('Solo se puede colocar/mover jugadores desde el banquillo durante la Fase de colocación (antes del drive, o justo después de un ensayo).');
    return;
  }
  placing = id;
  const p = players.find(x=>x.id===id);
  renderRosters(); renderPitch();
  updateStatus('Click en una casilla dorada de vuestra mitad para colocar a ' + p.name + '.');
}

function isLegalSetupCell(team, r, c){
  if(c===0 || c===COLS-1) return false; // no end zone during setup
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
  const k = document.getElementById('kickSelect').value;
  const rcv = k==='A' ? 'B':'A';
  document.getElementById('setupHint').textContent = 'Recibe: ' + teamName(rcv);
  broadcastState();
}

function startDrive(){
  const kicking = document.getElementById('kickSelect').value;
  const receiving = kicking==='A' ? 'B':'A';
  phase='live';
  placing=null; selected=null;
  document.getElementById('setupPanel').style.display='none';
  beginTurn(receiving);
}

function showSetupPanel(){
  document.getElementById('setupPanel').style.display='block';
  onKickChangeQuiet();
}
function onKickChangeQuiet(){
  const k = document.getElementById('kickSelect').value;
  const rcv = k==='A' ? 'B':'A';
  document.getElementById('setupHint').textContent = 'Recibe: ' + teamName(rcv);
}

// ---------- Pitch rendering ----------
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

function inReach(p,r,c){
  if(p.row===null) return true;
  const dist = Math.max(Math.abs(p.row-r), Math.abs(p.col-c));
  return dist<=p.ma && p.team===state.active && !p.activated;
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

      let highlightable = false;
      if(phase==='live' && selected!==null){
        const p = players.find(x=>x.id===selected);
        if(p && inReach(p,r,c) && !occupiedBy(r,c)) highlightable = true;
      } else if(phase==='setup' && placing!==null){
        const p = players.find(x=>x.id===placing);
        if(p && isLegalSetupCell(p.team,r,c)) highlightable = true;
      }
      if(highlightable) cell.classList.add('reachable');

      cell.onclick = ()=> cellClicked(r,c);

      const occ = posMap[r+'_'+c];
      if(occ){
        const t = document.createElement('div');
        t.className = 'token' + (occ.id===selected?' selected':'') + (occ.activated?' activated':'');
        t.style.background = teamColorHex[occ.team];
        t.textContent = occ.num;
        t.title = occ.name + ' (MA ' + occ.ma + ')';
        if(ball.carrierId===occ.id){
          const dot = document.createElement('div');
          dot.className='carrier-dot';
          t.appendChild(dot);
        }
        t.onclick=(e)=>{ e.stopPropagation(); tokenClicked(occ.id); };
        cell.appendChild(t);
      }

      pitch.appendChild(cell);
    }
  }
}

function cellClicked(r,c){
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
    updateStatus('Jugador colocado. Seguid colocando o pulsad "Iniciar Drive".');
    broadcastState();
    return;
  }

  // live phase movement
  if(selected!==null){
    const p = players.find(x=>x.id===selected);
    if(p && inReach(p,r,c) && !occupiedBy(r,c)){
      p.row=r; p.col=c;
      p.activated=true;
      if(ball.carrierId===p.id){ checkTouchdown(p); }
      selected=null;
      renderRosters(); renderPitch(); renderSelInfo();
      broadcastState();
      return;
    }
  }
  selected=null; renderPitch(); renderSelInfo();
}

function tokenClicked(id){
  const p = players.find(x=>x.id===id);
  if(!p) return;

  if(phase==='setup'){
    // pick up for repositioning
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
  if(p.activated){
    updateStatus(p.name + ' ya se ha activado este turno.');
    return;
  }
  selected = (selected===id) ? null : id;
  renderPitch(); renderSelInfo();
}

function selectPlayerLive(id){
  if(phase!=='live') return;
  tokenClicked(id);
}

function renderSelInfo(){
  const el = document.getElementById('selInfo');
  if(selected===null){ el.textContent='Ninguno'; return; }
  const p = players.find(x=>x.id===selected);
  if(!p){ el.textContent='Ninguno'; return; }
  el.innerHTML = `${p.name} · #${p.num} · Equipo ${teamName(p.team)} · MA ${p.ma}${ball.carrierId===p.id?' · 🏈 lleva el balón':''}`;
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

function checkTouchdown(p){
  if(ball.carrierId!==p.id) return;
  if(p.col===0 || p.col===COLS-1){
    pendingTD = { team: p.team, name: p.name };
    document.getElementById('tdText').textContent = `${teamName(p.team)} anota con ${p.name}!`;
    document.getElementById('tdModal').classList.add('show');
  }
}

function isHalfComplete(team){
  const other = team==='A' ? 'B':'A';
  return state.turns[team]>=6 && state.turns[other]>=6;
}

function beginTurn(team){
  state.turns[team]++;
  state.active = team;
  players.filter(p=>p.team===team).forEach(p=>p.activated=false);
  renderScoreboard(); renderRosters(); renderPitch();
  updateStatus('Turno de ' + teamName(team));
  broadcastState();
}

function resetBoardForNewDrive(){
  players.forEach(p=>{ p.onPitch=false; p.row=null; p.col=null; p.activated=false; });
  ball = { carrierId: null };
  selected=null; placing=null;
}

function confirmTD(){
  document.getElementById('tdModal').classList.remove('show');
  const scoringTeam = pendingTD.team;
  const scoreEl = document.getElementById(scoringTeam==='A' ? 'scoreA':'scoreB');
  scoreEl.textContent = parseInt(scoreEl.textContent) + 1;
  log('🏆 ¡ENSAYO! ' + teamName(scoringTeam) + ' — ' + pendingTD.name);

  const halfOver = isHalfComplete(scoringTeam);
  resetBoardForNewDrive();
  phase='setup';
  document.getElementById('kickSelect').value = scoringTeam; // scoring team kicks off next
  showSetupPanel();

  if(halfOver){
    addNewHalfButton();
    updateStatus('¡Mitad terminada tras el ensayo! Pulsad "Empezar Mitad 2".');
  } else {
    updateStatus('Nuevo drive: fase de colocación.');
  }
  renderScoreboard(); renderRosters(); renderPitch();
  pendingTD = null;
  broadcastState();
}

// ---------- Turns ----------
function endTurn(){
  if(phase!=='live'){
    alert('Terminad de colocar y pulsad "Iniciar Drive" primero.');
    return;
  }
  const finishing = state.active;

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

function addNewHalfButton(silent){
  if(document.getElementById('newHalfBtn')) return;
  const btn = document.createElement('button');
  btn.id='newHalfBtn'; btn.className='full primary'; btn.textContent='Empezar Mitad 2';
  btn.style.marginTop='8px';
  btn.onclick = ()=>{
    state.half=2; state.turns={A:0,B:0};
    players.forEach(p=>p.activated=false);
    btn.remove();
    renderScoreboard();
    updateStatus('¡Comienza la Mitad 2! Colocad y pulsad "Iniciar Drive".');
    broadcastState();
  };
  document.getElementById('setupPanel').appendChild(btn);
}

function resetActivations(){
  players.filter(p=>p.team===state.active).forEach(p=>p.activated=false);
  renderRosters(); renderPitch();
  log('Activaciones reiniciadas manualmente (mismo turno).');
  broadcastState();
}

function renderScoreboard(){
  document.getElementById('sbNameA').textContent = teamName('A');
  document.getElementById('sbNameB').textContent = teamName('B');
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

document.getElementById('teamAName').addEventListener('input', ()=>{ renderScoreboard(); onKickChangeQuiet(); broadcastState(); });
document.getElementById('teamBName').addEventListener('input', ()=>{ renderScoreboard(); onKickChangeQuiet(); broadcastState(); });

// ---------- Dice ----------
const BLOCK_FACES = ['ATACANTE\nCAE','AMBOS\nCAEN','EMPUJE','EMPUJE','TAMBALEO','DEFENSOR\nCAE (POW)'];

function renderBlockResult(results){
  const el = document.getElementById('blockResult');
  el.innerHTML='';
  results.forEach(idx=>{
    const d = document.createElement('div');
    d.className='block-face';
    d.innerHTML = BLOCK_FACES[idx].replace('\n','<br>');
    el.appendChild(d);
  });
  log('🎲 Bloqueo x'+results.length+': ' + results.map(i=>BLOCK_FACES[i].replace('\n',' ')).join(' / '));
}

function rollBlock(n){
  const results = [];
  for(let i=0;i<n;i++) results.push(Math.floor(Math.random()*6));
  renderBlockResult(results);
  sendDice('block', { results });
}

function renderD6(r, label){
  document.getElementById('d6out').innerHTML = `<div class="die-face">${r}</div><div style="font-size:12px; color:#a99b7f;">${label?label+' — resultado':'Resultado'}: <b style="color:var(--paper)">${r}</b></div>`;
  log('🎲 D6' + (label?(' ('+label+')'):'') + ': ' + r);
}

function rollD6(){
  const r = Math.floor(Math.random()*6)+1;
  const label = document.getElementById('d6label').value.trim();
  renderD6(r, label);
  sendDice('d6', { r, label });
}

function renderPassResult(r, target){
  let result, color;
  if(r===6){ result='PRECISO'; color='var(--good)'; }
  else if(r===1){ result='FUMBLE'; color='var(--bad)'; }
  else if(r>=target){ result='PRECISO'; color='var(--good)'; }
  else { result='IMPRECISO'; color='var(--gold)'; }
  document.getElementById('passOut').innerHTML = `<div class="die-face">${r}</div><div style="font-size:13px;">Objetivo ${target}+ → <b style="color:${color}">${result}</b></div>`;
  log('🎲 Pase (obj. '+target+'+): tirada ' + r + ' → ' + result);
}

function rollPass(){
  const target = parseInt(document.getElementById('paTarget').value)||3;
  const r = Math.floor(Math.random()*6)+1;
  renderPassResult(r, target);
  sendDice('pass', { r, target });
}

// init
renderRosters();
renderPitch();
renderScoreboard();
showSetupPanel();
