(() => {
  const canvas = document.querySelector('#scene');
  const ctx = canvas.getContext('2d');
  const frame = document.querySelector('#worldFrame');
  const ui = {
    intro: document.querySelector('#intro'), story: document.querySelector('#storyModal'), board: document.querySelector('#boardModal'), profile: document.querySelector('#profileModal'),
    account: document.querySelector('#accountModal'), neighbors: document.querySelector('#neighborsModal'), toast: document.querySelector('#toast'), nearby: document.querySelector('#nearby'), nearbyText: document.querySelector('#nearbyText'), mood: document.querySelector('#mood')
  };
  const keySet = new Set();
  let width = 0, height = 0, dpr = 1, now = 0, previous = 0, walking = 0, near = null, activeStory = null, activePhoto = '', playerName = '';
  let audio = null, soundOn = false, messageTimer = null;
  const backend = window.StreetBackend;
  let avatarColor = '#e28b68', remotePlayers = [], emoteBubbles = [], serverMode = false, friends = new Set(), blocked = new Set(), weather = 'clear';
  try { avatarColor = localStorage.getItem('nar-avatar') || avatarColor; friends = new Set(JSON.parse(localStorage.getItem('nar-friends') || '[]')); } catch {}
  const dailyEvents = [
    ['Axşam çay süfrəsi','19:00 · Çay evinin qabağı'], ['Köhnə kitab mübadiləsi','18:30 · Nar gülünün qapısı'],
    ['Radio istəyi','20:00 · Usta Əlinin dükanı'], ['Küçə şəkil gəzintisi','17:45 · Küçənin başı'],
    ['Qonşuların salamı','19:15 · Hamının divarı'], ['Fənər işıqları','20:30 · Küçənin ortası'], ['Bazar günü söhbəti','18:00 · Çay evinin qabağı']
  ];
  try { playerName = localStorage.getItem('nar-player') || ''; } catch {}
  const player = { x: -.12, depth: .78 };
  const memories = [
    { x: -.53, depth: .42, title: 'Qırmızı sap', place: 'NAR GÜLÜNÜN QAPISI', text: 'Gül dükanının sahibi hər axşam qapının dəstəyinə qırmızı sap bağlayır. “Evdən gec qayıdanlar yolu tanısın”, deyir. Sapı götür: fənərin ilk işığı buradadır.', collected: false, hue: '#f28b72' },
    { x: .55, depth: .61, title: 'Köhnə radio', place: 'RADİO TƏMİRÇİSİ', text: 'Usta Əli radioları təmir edəndə səsləri də düzəltdiyini deyir. Bu balaca radio illərdir eyni mahnını gözləyir. Bir az qulaq as — ikinci işıq melodiyanın içindədir.', collected: false, hue: '#e9b86a' },
    { x: -.18, depth: .88, title: 'İsti çay', place: 'ÇAY EVİNİN PİLLƏKƏNİ', text: 'Günün son stəkanı həmişə qapının ağzında unudulur. Heç kimin tələsmədiyi bu küçədə son işıq da səni gözləyir.', collected: false, hue: '#b9e8bb' }
  ];
  const board = { x: .08, depth: .54, name: 'Hamının divarı', kind: 'board' };
  const neighbor = { x: .61, depth: .34, name: 'Rəna', line: 'İşıqlar yananda bu küçə ev kimi olur.', kind: 'neighbor' };
  const key = 'nar-memories-board';
  let posts = [
    { by: 'Rəna', text: 'Fənərlər sönsə də, pəncərəmdə bir şam saxlayıram.' },
    { by: 'Əli usta', text: 'Köhnə radiomda axşam üçün mahnı var. Qapım açıqdır.' }
  ];
  try { const stored = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(stored)) posts = stored; } catch {}
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;

  function project(x, depth) {
    const d = clamp(depth, 0, 1), perspective = .035 + .43 * d;
    return { x: width / 2 + x * width * perspective, y: height * .15 + d * height * .83, scale: .38 + d * .78, halfRoad: width * perspective };
  }
  function polygon(points, fill, stroke = '', lineWidth = 1) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }
  function rectangle(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function resize() {
    const r = frame.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); width = r.width; height = r.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  function drawSky() {
    const localHour = new Date(Date.now() + 4 * 60 * 60 * 1000).getUTCHours();
    const night = localHour < 6 || localHour >= 21, dawn = localHour >= 6 && localHour < 9, daytime = localHour >= 9 && localHour < 17;
    const sky = ctx.createLinearGradient(0, 0, 0, height * .69);
    if (night) { sky.addColorStop(0, '#151b35'); sky.addColorStop(.55, '#444265'); sky.addColorStop(1, '#b17078'); }
    else if (dawn) { sky.addColorStop(0, '#686b89'); sky.addColorStop(.5, '#d28779'); sky.addColorStop(1, '#f2c17d'); }
    else if (daytime) { sky.addColorStop(0, '#83a7ad'); sky.addColorStop(.58, '#c8c5aa'); sky.addColorStop(1, '#e8bd8d'); }
    else { sky.addColorStop(0, '#282543'); sky.addColorStop(.43, '#67506e'); sky.addColorStop(.78, '#d48b76'); sky.addColorStop(1, '#edb079'); }
    rectangle(0, 0, width, height, sky);
    // A soft apricot dusk sun, tucked behind the roofs.
    ctx.globalAlpha = .65; ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(width * .73, height * .26, Math.min(width, height) * .09, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    polygon([[0,height*.32],[width*.1,height*.25],[width*.2,height*.30],[width*.3,height*.21],[width*.42,height*.29],[width*.55,height*.23],[width*.68,height*.30],[width*.82,height*.21],[width,height*.28],[width,height*.52],[0,height*.52]], '#3d3957');
    if(night||dawn)for (let i = 0; i < 34; i++) { const x = ((i * 131 + 17) % 997) / 997 * width, y = ((i * 53 + 11) % 191) / 191 * height * .3; rectangle(x, y, 2, 2, i % 3 ? '#f5d8ab' : '#c5bad7'); }
  }
  function lamp(side, depth, lit) {
    const p = project(side * .88, depth), s = p.scale, h = 27 * s;
    rectangle(p.x - s, p.y - h, 2 * s, h, '#40384a');
    rectangle(p.x - 5*s, p.y - h - 3*s, 10*s, 4*s, '#40384a');
    rectangle(p.x - 4*s, p.y - h - 2*s, 8*s, 3*s, lit ? '#ffd887' : '#8d8290');
    if (lit) { const glow = ctx.createRadialGradient(p.x, p.y - h, 1, p.x, p.y - h, 37*s); glow.addColorStop(0, '#ffdf9d55'); glow.addColorStop(1, '#ffdf9d00'); ctx.fillStyle = glow; ctx.fillRect(p.x - 40*s, p.y - h - 40*s, 80*s, 80*s); }
  }
  function building(side, index) {
    const d = .07 + index * .15, end = Math.min(.99, d + .24), a = project(side * .78, d), b = project(side * .78, end), c = project(side * 2.05, end), e = project(side * 2.05, d);
    const roofA = height * (.105 + d * .045), roofB = height * (.105 + end * .045);
    const colors = ['#a75f67','#cc805c','#87739a','#d39b65','#738b84','#b87062'];
    // Sidewalk and shop front.
    polygon([[a.x,a.y],[e.x,e.y],[c.x,c.y],[b.x,b.y]], '#a99588');
    polygon([[a.x,a.y-roofA],[e.x,e.y-roofA*1.18],[c.x,c.y-roofB*1.18],[b.x,b.y-roofB]], colors[index % colors.length]);
    polygon([[a.x,a.y-roofA],[e.x,e.y-roofA*1.18],[e.x,e.y-roofA*1.18+5],[a.x,a.y-roofA+5]], '#493c55');
    // Windows follow the street depth and glow warmly against the evening.
    const facadeWidth = Math.abs(e.x - a.x);
    for (let col = 1; col <= 3; col++) {
      const wx = a.x + (e.x - a.x) * col / 4, wy = a.y - roofA * .72, ww = Math.max(4, facadeWidth * .11), wh = Math.max(5, height * (.028 + d * .014));
      rectangle(wx - ww/2 - 2, wy - 2, ww + 4, wh + 5, '#563f54'); rectangle(wx - ww/2, wy, ww, wh, '#f5c97e');
      rectangle(wx - ww/2, wy + wh*.62, ww, 2, '#83575b'); rectangle(wx - 1, wy, 2, wh, '#83575b');
    }
    // Doors, awning, and little pixel sign.
    const doorX = a.x + (e.x - a.x) * .84, doorW = Math.max(7, facadeWidth * .14), doorH = Math.max(10, height * (.055 + d * .018));
    rectangle(doorX-doorW/2, a.y-doorH, doorW, doorH, '#41364a'); rectangle(doorX-doorW/2+2, a.y-doorH+3, doorW-4, doorH-3, '#8e665c'); rectangle(doorX+doorW*.2, a.y-doorH*.48, 2, 2, '#f3ce7d');
    const signX = a.x + (e.x-a.x)*.5, signY = a.y-roofA*.2, signW=Math.max(18,facadeWidth*.45), signH=Math.max(7,height*.025);
    rectangle(signX-signW/2,signY-signH/2,signW,signH,index%2?'#f2c777':'#c3dca4');
    ctx.fillStyle='#47384e';ctx.font=`bold ${Math.max(5,5+d*4)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(['NAR GÜLÜ','RADİO','ÇAY EVİ','KİTAB','DƏRZİ','DÜKAN'][index],signX,signY);
    // Roof edge and striped awning.
    polygon([[a.x,a.y-roofA],[e.x,e.y-roofA*1.18],[e.x,e.y-roofA*1.18+4],[a.x,a.y-roofA+4]], '#564359');
    const awnY = b.y-roofB*.36, awnW=Math.abs(c.x-b.x)*.58, awnX=b.x+(c.x-b.x)*.7;
    rectangle(awnX-awnW/2,awnY,awnW,Math.max(3,height*.014),index%2?'#e28a71':'#f1cb78');
  }
  function road() {
    const farL=project(-1,0),farR=project(1,0),nearL=project(-1,1),nearR=project(1,1);
    polygon([[0,height*.36],[farL.x,farL.y],[nearL.x,nearL.y],[0,height]], '#877b80');
    polygon([[width,height*.36],[farR.x,farR.y],[nearR.x,nearR.y],[width,height]], '#81747b');
    polygon([[farL.x,farL.y],[farR.x,farR.y],[nearR.x,nearR.y],[nearL.x,nearL.y]], '#494852');
    for (const side of [-1,1]) {
      const a=project(side*.8,0),b=project(side*.8,1);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='#e4b78e';ctx.lineWidth=Math.max(2,width*.004);ctx.stroke();
    }
    for (let i=0;i<8;i++){const p=project(0,.11+i*.115),len=height*(.009+p.scale*.012);rectangle(p.x-len/2,p.y,len,Math.max(2,len*.27),'#d6b991');}
    // Cross-street paving joints add a tactile pixel-art rhythm.
    for(let i=1;i<6;i++){const d=i*.15,l=project(-.8,d),r=project(.8,d);ctx.beginPath();ctx.moveTo(l.x,l.y);ctx.lineTo(r.x,r.y);ctx.strokeStyle='#ffffff0c';ctx.lineWidth=1;ctx.stroke();}
  }
  function drawMemory(item) {
    if(item.collected){const p=project(item.x,item.depth);ctx.globalAlpha=.45;rectangle(p.x-3,p.y-2,6,3,'#f6dfad');ctx.globalAlpha=1;return;}
    const p=project(item.x,item.depth),s=p.scale,hover=Math.sin(now/450+item.depth*8)*3*s;
    const glow=ctx.createRadialGradient(p.x,p.y-22*s+hover,1,p.x,p.y-22*s+hover,25*s);glow.addColorStop(0,item.hue+'aa');glow.addColorStop(1,item.hue+'00');ctx.fillStyle=glow;ctx.fillRect(p.x-28*s,p.y-50*s,56*s,56*s);
    ctx.fillStyle='#372f43';ctx.beginPath();ctx.ellipse(p.x,p.y-22*s+hover,7*s,4*s,0,0,Math.PI*2);ctx.fill();
    rectangle(p.x-3*s,p.y-31*s+hover,6*s,8*s,item.hue);rectangle(p.x-2*s,p.y-34*s+hover,4*s,3*s,'#fff0c5');
    ctx.fillStyle='#fff0c5';ctx.font=`${Math.max(8,9*s)}px monospace`;ctx.textAlign='center';ctx.fillText('✦',p.x,p.y-40*s+hover);
  }
  function drawBoard() {
    const p=project(board.x,board.depth),s=p.scale;
    rectangle(p.x-16*s,p.y-54*s,32*s,32*s,'#493c54');rectangle(p.x-13*s,p.y-51*s,26*s,25*s,'#d9b775');
    rectangle(p.x-10*s,p.y-48*s,20*s,2*s,'#785267');rectangle(p.x-9*s,p.y-43*s,17*s,2*s,'#a86568');rectangle(p.x-10*s,p.y-38*s,19*s,2*s,'#647b6d');
    rectangle(p.x-2*s,p.y-22*s,4*s,22*s,'#493c54');
  }
  function drawNeighbor() {
    const p=project(neighbor.x,neighbor.depth),s=p.scale,bob=Math.sin(now/380)*1.2*s;
    rectangle(p.x-3*s,p.y-14*s+bob,3*s,13*s,'#373246');rectangle(p.x+1*s,p.y-14*s+bob,3*s,13*s,'#373246');
    rectangle(p.x-6*s,p.y-29*s+bob,12*s,16*s,'#8eb8a0');rectangle(p.x-4*s,p.y-39*s+bob,8*s,10*s,'#d9a27d');rectangle(p.x-5*s,p.y-41*s+bob,10*s,5*s,'#4a3448');
    if(near===neighbor){rectangle(p.x-17*s,p.y-58*s,34*s,13*s,'#f3e7cc');ctx.fillStyle='#4d4256';ctx.font=`${Math.max(6,6*s)}px monospace`;ctx.textAlign='center';ctx.fillText('salam!',p.x,p.y-49*s);}
  }
  function drawPlayer() {
    const p=project(player.x,player.depth),s=.55+p.scale*.5,bob=keySet.size?Math.sin(walking*13)*2*s:Math.sin(now/520)*.6*s;
    ctx.fillStyle='#16172a66';ctx.beginPath();ctx.ellipse(p.x,p.y-2*s,12*s,4*s,0,0,Math.PI*2);ctx.fill();
    const stride=keySet.size?Math.sin(walking*13)*2*s:0;
    rectangle(p.x-5*s,p.y-17*s+bob,4*s,15*s+stride,'#363043');rectangle(p.x+1*s,p.y-17*s+bob,4*s,15*s-stride,'#363043');
    rectangle(p.x-7*s,p.y-38*s+bob,14*s,22*s,avatarColor);rectangle(p.x-6*s,p.y-50*s+bob,12*s,13*s,'#403349');rectangle(p.x-7*s,p.y-47*s+bob,14*s,6*s,'#403349');rectangle(p.x-5*s,p.y-48*s+bob,10*s,9*s,'#e8b98d');
    // Bright scarf keeps the small avatar readable against the road.
    rectangle(p.x-7*s,p.y-31*s+bob,14*s,4*s,'#f4ce73');rectangle(p.x+4*s,p.y-29*s+bob,3*s,7*s,'#f4ce73');
    if(playerName){ctx.font=`bold ${Math.max(8,9*s)}px system-ui`;ctx.textAlign='center';ctx.fillStyle='#fff5df';ctx.shadowColor='#302641';ctx.shadowBlur=4;ctx.fillText(playerName,p.x,p.y-55*s+bob);ctx.shadowBlur=0;}const ownEmote=emoteBubbles.find(b=>b.user_id==='self'&&now-b.time<1700);if(ownEmote){ctx.font='20px system-ui';ctx.textAlign='center';ctx.fillText(ownEmote.icon,p.x,p.y-66*s+bob);}
  }
  function drawParticles() {
    for(let i=0;i<18;i++){const x=(i*97+Math.sin(now/1200+i)*13)%width,y=(i*61+now*(.006+i%3*.002))%(height*.72);ctx.globalAlpha=.18+((i*7)%6)*.07;rectangle(x,y,2,2,i%3?'#ffdfa8':'#d6e5bf');}ctx.globalAlpha=1;
    if(weather==='rain'){ctx.strokeStyle='#d8e9ff55';ctx.lineWidth=1;for(let i=0;i<54;i++){const x=(i*71+now*.12)%width,y=(i*97+now*.34)%(height*.9);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+10);ctx.stroke();}}
  }
  function drawRemotePlayer(other) {
    const p=project(Number(other.renderX??other.x)||0,Number(other.renderDepth??other.depth)||.7),s=.55+p.scale*.5;
    ctx.fillStyle='#17172b66';ctx.beginPath();ctx.ellipse(p.x,p.y-2*s,11*s,4*s,0,0,Math.PI*2);ctx.fill();
    rectangle(p.x-5*s,p.y-17*s,4*s,15*s,'#383244');rectangle(p.x+1*s,p.y-17*s,4*s,15*s,'#383244');
    rectangle(p.x-7*s,p.y-38*s,14*s,22*s,other.avatar||'#78a9c1');rectangle(p.x-6*s,p.y-50*s,12*s,13*s,'#403349');rectangle(p.x-5*s,p.y-48*s,10*s,9*s,'#e8b98d');
    ctx.fillStyle='#fff4dc';ctx.font=`bold ${Math.max(8,9*s)}px system-ui`;ctx.textAlign='center';ctx.shadowColor='#27223b';ctx.shadowBlur=4;ctx.fillText(other.name||'Qonşu',p.x,p.y-55*s);ctx.shadowBlur=0;
    const emote=emoteBubbles.find(b=>b.user_id===other.user_id&&now-b.time<1700);if(emote){ctx.font='20px system-ui';ctx.fillText(emote.icon,p.x,p.y-65*s);}
  }
  function draw() {
    if(!width||!height)return;
    ctx.clearRect(0,0,width,height);drawSky();road();
    // Draw façades, street furniture, and people in depth order; avatar and memories stay fixed in world space.
    for(let i=0;i<6;i++){building(-1,i);building(1,i);lamp(-1,.1+i*.16,i<2||memories.filter(m=>m.collected).length>=i);lamp(1,.17+i*.16,i<1||memories.filter(m=>m.collected).length>=i-1);}
    const objects=[...memories.map(m=>({d:m.depth,paint:()=>drawMemory(m)})),{d:board.depth,paint:drawBoard},{d:neighbor.depth,paint:drawNeighbor},...remotePlayers.filter(p=>!blocked.has(p.user_id)).map(p=>({d:Number(p.depth)||.7,paint:()=>drawRemotePlayer(p)})),{d:player.depth,paint:drawPlayer}].sort((a,b)=>a.d-b.d);objects.forEach(o=>o.paint());drawParticles();
    emoteBubbles=emoteBubbles.filter(b=>now-b.time<1700);
    const candidates=[...memories.filter(m=>!m.collected).map(m=>({object:m,d:Math.hypot((m.x-player.x)*.85,(m.depth-player.depth)*.95),label:m.title})),{object:board,d:Math.hypot((board.x-player.x)*.85,(board.depth-player.depth)*.95),label:'Hamının divarı'}, {object:neighbor,d:Math.hypot((neighbor.x-player.x)*.85,(neighbor.depth-player.depth)*.95),label:'Rəna ilə danış'}].sort((a,b)=>a.d-b.d);
    near=candidates[0]?.d<.19?candidates[0].object:null;
    ui.nearby.classList.toggle('show',!!near&&ui.intro.classList.contains('hidden'));
    ui.nearby.style.pointerEvents=near&&ui.intro.classList.contains('hidden')?'auto':'none';
    if(near){const label=near.kind==='board'?'Divara qeyd qoy':near.kind==='neighbor'?'Rəna ilə danış':`Xatirə tap: ${near.title}`;ui.nearbyText.textContent=label;}
    const count=memories.filter(m=>m.collected).length;document.querySelector('#questCount').textContent=`${count} / 3 İŞIQ`;document.querySelector('#questFill').style.width=`${count/3*100}%`;
    ui.mood.innerHTML=count===3?'KÜÇƏ İŞIQLANDI <i>✦</i> BU AXŞAM SƏNİNDİR':near?'YAXINLIQDA BİR HEKAYƏ VAR <i>✦</i> E BAS':'AXŞAM SAKİTDİR <i>✦</i> BİR AZ GƏZ';
  }
  function frameLoop(time) {
    now=time;const dt=Math.min((time-previous)/1000,.04);previous=time;
    const dx=(keySet.has('right')?1:0)-(keySet.has('left')?1:0),dy=(keySet.has('down')?1:0)-(keySet.has('up')?1:0);
    if(dx||dy){const len=Math.hypot(dx,dy);player.x=clamp(player.x+dx/len*.72*dt,-.72,.72);player.depth=clamp(player.depth+dy/len*.57*dt,.06,.96);walking+=dt;}let remoteAnimating=false;for(const other of remotePlayers){const tx=Number(other.x)||0,td=Number(other.depth)||.7;if(other.renderX===undefined){other.renderX=tx;other.renderDepth=td;}const ease=Math.min(1,dt*14);other.renderX+=(tx-other.renderX)*ease;other.renderDepth+=(td-other.renderDepth)*ease;if(Math.abs(tx-other.renderX)>.002||Math.abs(td-other.renderDepth)>.002)remoteAnimating=true;}
    if(serverMode)backend.move({x:player.x,depth:player.depth,name:playerName,avatar:avatarColor});
    if(dx||dy||remoteAnimating||Math.floor(now/140)!==Math.floor((now-dt*1000)/140))draw();
    requestAnimationFrame(frameLoop);
  }
  function toast(message){const el=ui.toast;el.textContent=message;el.classList.add('show');clearTimeout(messageTimer);messageTimer=setTimeout(()=>el.classList.remove('show'),2100);}
  function chime(){if(!soundOn)return;try{audio=audio||new AudioContext();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(660,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(990,audio.currentTime+.16);gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.32);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.32);}catch{}}
  function showStory(item){activeStory=item;document.querySelector('#storyLabel').textContent=item.place;document.querySelector('#storyTitle').textContent=item.title;document.querySelector('#storyText').textContent=item.text;document.querySelector('#storyAction').textContent=item.collected?'Xatirə artıq səndədir ✓':'Xatirəni götür ✦';ui.story.classList.remove('hidden');}
  function interact(){
    if(!near){toast('Yaxınlıqda bir yerə çatanda E düyməsi görünəcək.');return;}
    if(near.kind==='board'){renderPosts();ui.board.classList.remove('hidden');return;}
    if(near.kind==='neighbor'){toast('Rəna: “İşıqlar yananda bu küçə ev kimi olur.”');return;}
    showStory(near);
  }
  function renderPosts(){const list=document.querySelector('#boardPosts');list.replaceChildren();if(!posts.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Divar hələ boşdur. İlk salamı sən yaza bilərsən.';list.append(empty);return;}posts.slice(0,12).forEach(post=>{const card=document.createElement('article');card.className='post-card';const by=document.createElement('span');by.className='post-author';by.textContent=post.display_name||post.by||'Qonşu';card.append(by);if(post.body||post.text){const copy=document.createElement('div');copy.textContent=post.body||post.text;card.append(copy);}if(post.image_url||post.image){const img=document.createElement('img');img.src=post.image_url||post.image;img.alt='Küçə lövhəsindəki şəkil';img.loading='lazy';card.append(img);}const actions=document.createElement('div');actions.className='post-actions';const like=document.createElement('button');like.className='text-button';like.textContent=`♡ ${post.like_count||0}`;like.onclick=async()=>{if(!serverMode){post.like_count=(post.like_count||0)+1;like.textContent=`♡ ${post.like_count}`;return;}try{const liked=await backend.toggleLike(post.id);post.like_count=Math.max(0,(post.like_count||0)+(liked?1:-1));like.textContent=`${liked?'♥':'♡'} ${post.like_count}`;toast(liked?'Bəyəndiyin qeydə əlavə edildi.':'Bəyənmə geri götürüldü.');}catch{toast('Reaksiyanı göndərmək mümkün olmadı.');}};actions.append(like);if(post.id&&serverMode){const report=document.createElement('button');report.className='text-button';report.textContent='Şikayət et';report.onclick=async()=>{const reason=prompt('Şikayətin səbəbini yaz:');if(!reason)return;try{await backend.report('post',post.id,reason);toast('Şikayət moderasiya üçün göndərildi.');}catch{toast('Şikayəti göndərmək alınmadı.');}};actions.append(report);}card.append(actions);list.append(card);});}
  function updatePresenceUI(){const count=remotePlayers.filter(p=>!blocked.has(p.user_id)).length+1;document.querySelector('#peopleCount').textContent=String(count);const card=document.querySelector('#playersCard'),list=document.querySelector('#playerList'),neighbors=document.querySelector('#neighborsList');card.classList.toggle('hidden',!serverMode);list.replaceChildren();neighbors.replaceChildren();const people=remotePlayers.filter(p=>p.user_id&&!blocked.has(p.user_id));if(!people.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=serverMode?'Hazırda küçədə başqa sakin yoxdur.':'Canlı sakinləri görmək üçün hesaba daxil ol.';neighbors.append(empty);}people.forEach(p=>{const row=document.createElement('div');row.className='neighbor-row';const name=document.createElement('span');name.textContent=p.name||'Qonşu';const actions=document.createElement('div');actions.className='neighbor-actions';const friend=document.createElement('button');friend.className='secondary';friend.textContent=friends.has(p.user_id)?'Dostdur ✓':'Dost et';friend.onclick=async()=>{try{await backend.addFriend(p.user_id);friends.add(p.user_id);localStorage.setItem('nar-friends',JSON.stringify([...friends]));friend.textContent='Dostdur ✓';toast('Dostların siyahısına əlavə edildi.');}catch{toast('Dost əlavə etmək mümkün olmadı.');}};const block=document.createElement('button');block.className='text-button';block.textContent='Blokla';block.onclick=async()=>{if(!confirm(`${p.name||'Bu sakini'} bloklayaq?`))return;try{await backend.block(p.user_id);blocked.add(p.user_id);updatePresenceUI();draw();toast('Sakin bloklandı.');}catch{toast('Bloklamaq mümkün olmadı.');}};actions.append(friend,block);row.append(name,actions);neighbors.append(row);const badge=document.createElement('span');badge.textContent=p.name||'Qonşu';list.append(badge);});}
  function setLocalDemoMode(){serverMode=false;document.querySelector('#connectionDot').classList.remove('connected');document.querySelector('#connectionLabel').textContent='yalnız bu cihazda';document.querySelector('#backendNote').textContent=backend.configured?'Qonaq girişi ilə canlı küçəyə qoşulursan.':'Canlı multiplayer üçün server layihəsi qoşulmalıdır.';updatePresenceUI();}
  async function startWorld(){if(!backend.configured){setLocalDemoMode();return;}try{let result=await backend.connect();if(!result.session){setLocalDemoMode();document.querySelector('#backendNote').textContent='Canlı küçəyə qoşulmaq üçün hesab yarat və ya daxil ol.';return;}if(result.session){await connectSession();return;}setLocalDemoMode();}catch(error){setLocalDemoMode();document.querySelector('#backendNote').textContent='Canlı küçəyə qoşulmaq alınmadı. Hesab yaratmaqla yenidən yoxla.';toast('Canlı serverə qoşulmaq alınmadı. Sınaq rejimi açıqdır.');}}
  let connecting=false;async function connectSession(){if(backend.signedIn||connecting)return;connecting=true;try{const user=await backend.connectWorld(playerName||'Qonşu',avatarColor,authChanged);if(!user)return;serverMode=true;document.querySelector('#connectionDot').classList.add('connected');document.querySelector('#connectionLabel').textContent='canlı küçə';backend.onPlayers(players=>{const old=new Map(remotePlayers.map(p=>[p.user_id,p]));remotePlayers=players.map(p=>{const previous=old.get(p.user_id);return {...p,renderX:previous?.renderX??(Number(p.x)||0),renderDepth:previous?.renderDepth??(Number(p.depth)||.7)};});updatePresenceUI();draw();});backend.onEmote(payload=>{emoteBubbles.push({...payload,time:performance.now()});draw();});backend.onPosts(data=>{posts=data;renderPosts();});blocked=new Set(await backend.getBlocks());friends=new Set(await backend.getFriends());localStorage.setItem('nar-friends',JSON.stringify([...friends]));document.querySelector('#boardPrivacy').textContent='Canlı küçənin ümumi divarı · paylaşım hamıya görünür.';updatePresenceUI();document.querySelector('#signOutButton').classList.remove('hidden');document.querySelector('#accountButton').classList.add('hidden');toast('Canlı küçəyə qoşuldun.');}finally{connecting=false;}}
  async function authChanged(event,session){if(event==='SIGNED_OUT'||!session){serverMode=false;remotePlayers=[];setLocalDemoMode();document.querySelector('#signOutButton').classList.add('hidden');document.querySelector('#accountButton').classList.remove('hidden');return;}try{await connectSession();}catch{toast('Hesab açıldı, amma küçəyə qoşulmaq alınmadı.');}}
  function updateDailyWorld(){const bakuNow=new Date(Date.now()+4*60*60*1000),day=Math.floor(Date.UTC(bakuNow.getUTCFullYear(),bakuNow.getUTCMonth(),bakuNow.getUTCDate())/86400000);const event=dailyEvents[(day+2)%dailyEvents.length];document.querySelector('#eventTitle').textContent=event[0];document.querySelector('#eventTime').textContent=event[1];document.querySelector('#worldTime').textContent=`BAKI · ${String(bakuNow.getUTCHours()).padStart(2,'0')}:${String(bakuNow.getUTCMinutes()).padStart(2,'0')} · GÜN ${String(day%30+1).padStart(2,'0')}`;weather=day%4===2?'rain':'clear';document.querySelector('#weatherButton').innerHTML=weather==='rain'?'☂ <span>YAĞIŞ</span>':'☾ <span>AXŞAM</span>';}
  function resizeImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const ratio=Math.min(1,800/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*ratio);c.height=Math.round(img.height*ratio);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',.76));};img.onerror=()=>{URL.revokeObjectURL(url);reject();};img.src=url;});}
  function keyboard(e,down){const map={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'},dir=map[e.key];if(dir){e.preventDefault();down?keySet.add(dir):keySet.delete(dir);}}
  window.addEventListener('keydown',e=>{const modalOpen=[...document.querySelectorAll('.modal')].some(m=>!m.classList.contains('hidden'));if(!modalOpen)keyboard(e,true);if(e.key?.toLowerCase()==='e'&&!modalOpen)interact();if(e.key==='Escape')document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));});window.addEventListener('keyup',e=>keyboard(e,false));window.addEventListener('blur',()=>keySet.clear());
  document.querySelectorAll('[data-dir]').forEach(btn=>{const dir=btn.dataset.dir;btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);keySet.add(dir);});['pointerup','pointercancel','lostpointercapture'].forEach(type=>btn.addEventListener(type,()=>keySet.delete(dir)));});
  document.querySelector('#joinForm').addEventListener('submit',e=>{e.preventDefault();playerName=document.querySelector('#nickname').value.trim();if(!playerName)return;try{localStorage.setItem('nar-player',playerName);}catch{}document.querySelector('#profileName').textContent=playerName.toLocaleUpperCase('az');ui.intro.classList.add('hidden');toast('Xoş gəldin. Üç xatirə küçəni işıqlandıracaq.');if(serverMode){backend.move({name:playerName,avatar:avatarColor});backend.syncProfile(playerName,avatarColor).catch(()=>{});}});
  if(playerName){ui.intro.classList.add('hidden');document.querySelector('#profileName').textContent=playerName.toLocaleUpperCase('az');}else ui.intro.classList.remove('hidden');
  document.querySelector('#profileButton').onclick=()=>{document.querySelector('#profileInput').value=playerName;ui.profile.classList.remove('hidden');};document.querySelector('#saveProfile').onclick=async()=>{const n=document.querySelector('#profileInput').value.trim();if(!n)return;playerName=n;try{localStorage.setItem('nar-player',n);localStorage.setItem('nar-avatar',avatarColor);}catch{}document.querySelector('#profileName').textContent=n.toLocaleUpperCase('az');ui.profile.classList.add('hidden');if(serverMode)try{await backend.syncProfile(playerName,avatarColor);}catch{toast('Profil saxlanmadı.');}draw();};
  document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{avatarColor=button.dataset.color;document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('selected',b===button));draw();}));
  document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>btn.closest('.modal').classList.add('hidden'));
  ui.nearby.addEventListener('click',interact);
  document.querySelector('#storyAction').onclick=()=>{if(!activeStory)return;if(!activeStory.collected){activeStory.collected=true;try{localStorage.setItem('nar-lights',JSON.stringify(memories.map(m=>m.collected)));}catch{}chime();toast(memories.every(m=>m.collected)?'Üç işıq da yandı. Bu küçənin axşamı sənindir.':'Bir xatirə, bir işıq. Küçə bir az da isindi.');}ui.story.classList.add('hidden');draw();};
  try{const saved=JSON.parse(localStorage.getItem('nar-lights')||'[]');if(Array.isArray(saved))memories.forEach((m,i)=>m.collected=!!saved[i]);}catch{}
  document.querySelector('#postImage').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{activePhoto=await resizeImage(file);document.querySelector('#imageName').textContent=file.name;}catch{toast('Şəkli oxumaq mümkün olmadı.');}});
  document.querySelector('#postForm').addEventListener('submit',async e=>{e.preventDefault();const text=document.querySelector('#postText').value.trim();if(!text&&!activePhoto){toast('Bir söz yaz və ya şəkil əlavə et.');return;}if(serverMode){try{const file=activePhoto?await (await fetch(activePhoto)).blob():null;await backend.createPost(text,file,playerName||'Qonşu');document.querySelector('#postText').value='';document.querySelector('#postImage').value='';document.querySelector('#imageName').textContent='Şəkil seçilməyib';activePhoto='';document.querySelector('#boardPrivacy').textContent='Bu qeyd canlı küçənin divarında görünür.';toast('Qeyd küçənin divarında paylaşıldı.');}catch(error){toast(error.message||'Paylaşım alınmadı.');}return;}posts.unshift({by:playerName||'Qonaq',text,image:activePhoto});try{localStorage.setItem(key,JSON.stringify(posts));}catch{posts.shift();toast('Yaddaş doludur. Daha kiçik şəkil seç.');return;}document.querySelector('#postText').value='';document.querySelector('#postImage').value='';document.querySelector('#imageName').textContent='Şəkil seçilməyib';activePhoto='';renderPosts();toast('Sözün bu cihazda küçənin divarına düşdü.');});
  let accountMode='signup';function setAccountMode(mode){accountMode=mode;document.querySelector('#accountTitle').textContent=mode==='signup'?'Hesab yarat':'Hesaba daxil ol';document.querySelector('#accountSubmit').innerHTML=mode==='signup'?'Hesab yarat <span>↗</span>':'Daxil ol <span>↗</span>';document.querySelector('#switchAccount').textContent=mode==='signup'?'Artıq hesabın var? Daxil ol':'Yeni hesab yarat';document.querySelector('#acceptRules').closest('label').classList.toggle('hidden',mode!=='signup');document.querySelector('#acceptRules').required=mode==='signup';}
  document.querySelector('#accountButton').onclick=()=>{ui.profile.classList.add('hidden');setAccountMode('signup');ui.account.classList.remove('hidden');};document.querySelector('#switchAccount').onclick=()=>setAccountMode(accountMode==='signup'?'signin':'signup');
  document.querySelector('#accountForm').addEventListener('submit',async e=>{e.preventDefault();if(!backend.configured){toast('Canlı hesabı aktivləşdirmək üçün server hələ qoşulmayıb.');return;}const email=document.querySelector('#accountEmail').value.trim(),password=document.querySelector('#accountPassword').value;if(!playerName){playerName=document.querySelector('#nickname').value.trim()||'Qonşu';}try{const result=accountMode==='signup'?await backend.signUp(email,password,playerName):await backend.signIn(email,password);if(result.session){await connectSession();ui.account.classList.add('hidden');ui.intro.classList.add('hidden');}else{toast('E-poçtuna təsdiq linki göndərildi. Təsdiqlədikdən sonra daxil ol.');document.querySelector('#backendNote').textContent='E-poçtu təsdiqlədikdən sonra bu pəncərədən daxil ol.';}}catch(error){toast(error.message||'Hesaba daxil olmaq alınmadı.');}});
  document.querySelector('#signOutButton').onclick=async()=>{try{await backend.signOut();document.querySelector('#profileModal').classList.add('hidden');toast('Hesabdan çıxdın.');}catch{toast('Hesabdan çıxmaq alınmadı.');}};
  document.querySelector('#neighborsButton').onclick=()=>{updatePresenceUI();ui.neighbors.classList.remove('hidden');};document.querySelector('#inviteButton').onclick=async()=>{const share={title:'Axşam işıqları',text:'Nar Çiçəyi küçəsində mənə qoşul!',url:location.href};try{if(navigator.share)await navigator.share(share);else{await navigator.clipboard.writeText(share.url);toast('Dəvət linki köçürüldü.');}}catch{}};
  document.querySelectorAll('[data-emote]').forEach(button=>button.onclick=()=>{const icon=button.dataset.emote;emoteBubbles.push({user_id:'self',icon,time:performance.now()});if(serverMode)backend.emote(icon);draw();});
  let reminderEnabled=false,lastReminderDay='';document.querySelector('#notifyButton').onclick=async()=>{if(!('Notification'in window)){toast('Bu brauzer bildirişləri dəstəkləmir.');return;}const permission=await Notification.requestPermission();if(permission!=='granted'){toast('Bildiriş icazəsi verilmədi.');return;}reminderEnabled=!reminderEnabled;document.querySelector('#notifyButton').textContent=reminderEnabled?'Axşam xatırlatması aktivdir ✓':'Xəbərdarlıqları aktivləşdir';toast(reminderEnabled?'Bu cihazda, oyun açıq olanda axşam xatırladacağıq.':'Xatırlatma söndürüldü.');};setInterval(()=>{if(!reminderEnabled||Notification.permission!=='granted')return;const d=new Date(Date.now()+4*60*60*1000),day=d.toISOString().slice(0,10);if(d.getUTCHours()===18&&d.getUTCMinutes()===45&&lastReminderDay!==day){lastReminderDay=day;new Notification('Axşam işıqları',{body:'Nar Çiçəyi küçəsində axşam tədbiri başlayır.',icon:'./icon.svg'});}},30000);
  document.querySelector('#rulesLink').onclick=()=>document.querySelector('#rulesModal').classList.remove('hidden');
  document.querySelector('#weatherButton').onclick=()=>toast(weather==='rain'?'Bu gün küçədə yüngül yağış var.':'Bu gün küçə quru və sakitdir.');
  document.querySelector('#soundButton').onclick=async()=>{soundOn=!soundOn;const b=document.querySelector('#soundButton');b.classList.toggle('on',soundOn);b.querySelector('b').textContent=soundOn?'ON':'OFF';if(soundOn){try{audio=audio||new AudioContext();await audio.resume();chime();}catch{}}};
  new ResizeObserver(resize).observe(frame);resize();if(!playerName)ui.intro.classList.remove('hidden');updateDailyWorld();renderPosts();setLocalDemoMode();startWorld();requestAnimationFrame(frameLoop);
  if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./src/sw.js').catch(()=>{});
})();
