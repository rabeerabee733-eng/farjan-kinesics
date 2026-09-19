const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const STORAGE_KEY='farjan_v2_state';
const defaultState={
  profile:null,
  world:'sea',
  points:0,
  sessions:[],
  plan:{game:'balance',rounds:5,hold:3,note:''},
  settings:{voice:true}
};
let state=loadState();
let activeGame='balance', camera=null, pose=null, cameraActive=false, paused=false, demoMode=false;
let holdStart=null, roundLocked=false, sessionRounds=0, sessionScore=0, sessionStart=0, timerHandle=null, frameGood=0, lastResultId=null, selectedRating=0;

const GAME_CONFIG={
 balance:{title:'الحجلة الخليجية',type:'التوازن',icon:'⚖️',mission:'ارفع قدمًا واحدة',desc:'حافظ على توازنك لمدة {hold} ثوانٍ.',rounds:5,hold:3,metric1:'زاوية الركبة اليسرى',metric2:'زاوية الركبة اليمنى'},
 pearl:{title:'جمع اللؤلؤ',type:'الوصول والانحناء',icon:'🦪',mission:'انحنِ واجمع اللؤلؤ',desc:'اثنِ الركبتين وانخفض ضمن نطاق مريح ثم عد للوقوف.',rounds:6,hold:1.2,metric1:'متوسط زاوية الركبتين',metric2:'موضع اليد للأسفل'},
 sail:{title:'رفع الشراع',type:'حركة الذراعين',icon:'⛵',mission:'ارفع الشراع',desc:'ارفع كلتا اليدين فوق مستوى الكتفين وثبّت الوضعية.',rounds:5,hold:2,metric1:'اليد اليسرى فوق الكتف',metric2:'اليد اليمنى فوق الكتف'}
};

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    return {
      ...defaultState,
      ...saved,
      plan:{...defaultState.plan,...(saved.plan||{})},
      settings:{...defaultState.settings,...(saved.settings||{})}
    };
  }catch{return {...defaultState}}
}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function toast(msg){const t=$('#toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200)}
function speak(text){
  if(!state.settings?.voice || !('speechSynthesis' in window) || !text) return;
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang='ar-SA'; u.rate=.98; u.pitch=1.07; u.volume=1;
    const voices=window.speechSynthesis.getVoices?.()||[];
    const arVoice=voices.find(v=>/^ar/i.test(v.lang)); if(arVoice) u.voice=arVoice;
    window.speechSynthesis.speak(u);
  }catch{}
}
function syncVoiceButtons(){
  const label=state.settings.voice?'🔊 التعزيز الصوتي: مفعّل':'🔇 التعزيز الصوتي: متوقف';
  const shortLabel=state.settings.voice?'🔊 الصوت مفعّل':'🔇 الصوت متوقف';
  if($('#voiceToggleBtn')) $('#voiceToggleBtn').textContent=label;
  if($('#playVoiceToggleBtn')) $('#playVoiceToggleBtn').textContent=shortLabel;
}
function toggleVoice(){state.settings.voice=!state.settings.voice; saveState(); syncVoiceButtons(); toast(state.settings.voice?'تم تفعيل التعزيز الصوتي':'تم إيقاف التعزيز الصوتي'); if(state.settings.voice) speak('تم تفعيل التعزيز الصوتي');}
function route(name){
  $$('.page').forEach(p=>p.classList.remove('active')); const p=$(`#page-${name}`); if(!p)return;
  p.classList.add('active'); window.scrollTo({top:0,behavior:'instant'});
  if(name==='dashboard')renderDashboard();
  if(name==='games')renderPoints();
  if(name==='reports')renderReports();
  if(name==='therapist')renderTherapist();
  syncVoiceButtons();
}
function bindRoutes(){
  $$('[data-route]').forEach(el=>el.addEventListener('click',()=>{
    const r=el.dataset.route;
    if((r==='dashboard'||r==='games'||r==='reports'||r==='therapist')&&!state.profile){route('onboarding');toast('أنشئ ملف الطفل أولًا');return}
    route(r)
  }));
  $$('[data-scroll]').forEach(el=>el.addEventListener('click',()=>{$(`#${el.dataset.scroll}`)?.scrollIntoView({behavior:'smooth'}); if(window.innerWidth<761) $('.topnav')?.classList.remove('open')}));
}
function goalLabel(v){return {balance:'تعزيز التوازن',upper:'رفع ومد الذراعين',mobility:'الحركة والوصول',general:'نشاط حركي عام'}[v]||'نشاط حركي'}
function progressData(){
  const sessions=state.sessions.length, points=state.points;
  const percent=Math.min(100, Math.round((sessions*12)+(points/8)));
  const level=percent<34?'المستوى الأول':percent<67?'المستوى الثاني':'المستوى الثالث';
  const hint=sessions?`تم تسجيل ${sessions} جلسة، واستحق الطفل ${points} نقطة حتى الآن.`:'ابدأ أول جلسة لعرض مستوى التقدم.';
  return {percent,level,hint};
}
function encouragementForRating(rate){return ['','نحتاج دعماً أكبر في الجلسة القادمة.','بداية طيبة، ونستمر بالتدرج.','أداء جيد ومشجع.','ممتاز، استجابة جميلة من الطفل.','رائع جدًا، جلسة موفقة وممتعة!'][rate]||''}

$('#menuBtn')?.addEventListener('click',()=>$('.topnav').classList.toggle('open'));
$('#watchDemoBtn')?.addEventListener('click',()=>$('#demoModal').classList.remove('hidden'));
$('#closeDemoModal')?.addEventListener('click',()=>$('#demoModal').classList.add('hidden'));
$('#demoStartBtn')?.addEventListener('click',()=>$('#demoModal').classList.add('hidden'));
$('#voiceToggleBtn')?.addEventListener('click',toggleVoice);
$('#playVoiceToggleBtn')?.addEventListener('click',toggleVoice);

$('#childForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  state.profile={name:$('#childName').value.trim(),age:$('#childAge').value,goal:$('#childGoal').value,level:$('#childLevel').value,created:new Date().toISOString()};
  saveState(); route('safety'); speak('تم حفظ ملف الطفل، ننتقل الآن إلى فحص الأمان');
});
$$('.safe-check').forEach(c=>c.addEventListener('change',()=>{$('#safetyNext').disabled=!$$('.safe-check').every(x=>x.checked)}));
$('#safetyNext')?.addEventListener('click',()=>{route('worlds'); speak('اختر الآن عالم الفريج المناسب للطفل');});
$$('.world-card').forEach(c=>c.addEventListener('click',()=>{$$('.world-card').forEach(x=>x.classList.remove('selected')); c.classList.add('selected'); state.world=c.dataset.world; saveState()}));
$('#finishOnboarding')?.addEventListener('click',()=>{saveState(); route('dashboard'); toast('تم إنشاء ملف الطفل'); speak('أحسنت، تم إعداد الملف بنجاح');});

function renderPoints(){['dashboardPoints','gamesPoints'].forEach(id=>{const el=$('#'+id); if(el) el.textContent=state.points})}
function renderDashboard(){
  renderPoints(); syncVoiceButtons();
  const p=state.profile||{};
  if($('#welcomeName')) $('#welcomeName').textContent=p.name?`مرحبًا ${p.name} 👋`:'مرحبًا 👋';
  if($('#todayMission')) $('#todayMission').textContent=state.plan?.game?`مهمتك: ${GAME_CONFIG[state.plan.game].title}`:'جاهز للعب اليوم؟';
  if($('#sessionCountMini')) $('#sessionCountMini').textContent=state.sessions.length?`${state.sessions.length} جلسة مسجلة`:'لا جلسات بعد';
  if($('#treasureCount')) $('#treasureCount').textContent=`${Math.floor(state.points/50)} مكافآت`;
  if($('#planNoteView')) $('#planNoteView').textContent=state.plan?.note?.trim()||'لا توجد ملاحظة محفوظة بعد.';
  const pr=progressData();
  if($('#overallProgressBar')) $('#overallProgressBar').style.width=`${pr.percent}%`;
  if($('#overallProgressText')) $('#overallProgressText').textContent=`${pr.percent}%`;
  if($('#overallProgressTitle')) $('#overallProgressTitle').textContent=pr.level;
  if($('#progressTitle')) $('#progressTitle').textContent=pr.level;
  if($('#overallProgressHint')) $('#overallProgressHint').textContent=pr.hint;

  const s=state.sessions[0];
  if(!s){$('#lastSessionEmpty')?.classList.remove('hidden'); $('#lastSessionStats')?.classList.add('hidden'); return}
  $('#lastSessionEmpty')?.classList.add('hidden'); const box=$('#lastSessionStats'); if(box){box.classList.remove('hidden'); box.innerHTML=[['اللعبة',s.title],['المدة',fmtDuration(s.duration)],['المهام',`${s.rounds}/${s.targetRounds}`],['النقاط',s.points]].map(x=>`<article><small>${x[0]}</small><b>${x[1]}</b></article>`).join('')}
}
$('#treasureBtn')?.addEventListener('click',()=>toast(`لديك ${Math.floor(state.points/50)} مكافآت مفتوحة في النسخة التجريبية`));
$('#resetDataBtn')?.addEventListener('click',()=>{if(confirm('هل تريد حذف ملف الطفل والجلسات المحفوظة على هذا الجهاز؟')){localStorage.removeItem(STORAGE_KEY); state={...defaultState}; route('landing'); toast('تمت إعادة الضبط')}});

$$('.game-start').forEach(b=>b.addEventListener('click',()=>startGame(b.dataset.game)));
function startGame(game){activeGame=game; sessionRounds=0; sessionScore=0; holdStart=null; roundLocked=false; demoMode=false; cameraActive=false; paused=false; frameGood=0; setupPlayUI(); route('play'); speak(`سنبدأ الآن لعبة ${GAME_CONFIG[game].title}`)}
function setupPlayUI(){
  const cfg={...GAME_CONFIG[activeGame]}; if(state.plan?.game===activeGame){cfg.rounds=+state.plan.rounds||cfg.rounds; cfg.hold=+state.plan.hold||cfg.hold}
  window.currentCfg=cfg;
  $('#playGameType').textContent=cfg.type; $('#playTitle').textContent=cfg.title; $('#missionIcon').textContent=cfg.icon; $('#missionTitle').textContent=cfg.mission;
  $('#missionDesc').textContent=cfg.desc.replace('{hold}',cfg.hold); $('#holdTargetLabel').textContent=` / ${cfg.hold.toFixed(1)} ثانية`; $('#roundValue').textContent=`0 / ${cfg.rounds}`;
  $('#playScore').textContent='0'; $('#holdValue').textContent='0.0'; $('#holdProgress').style.width='0%'; $('#metric1Label').textContent=cfg.metric1; $('#metric2Label').textContent=cfg.metric2;
  $('#metric1').textContent='—'; $('#metric2').textContent='—'; $('#trackingConfidence').textContent='—'; $('#detected').textContent='بانتظار الكاميرا'; $('#feedbackBubble').textContent='استعد…'; $('#poseStatus').textContent='● الكاميرا متوقفة';
  $('#cameraOverlay').classList.remove('hide'); $('#simulateSuccessBtn').classList.add('hidden'); $('#pauseBtn').textContent='⏸ إيقاف مؤقت'; clearInterval(timerHandle); $('#sessionTimer').textContent='00:00';
  syncVoiceButtons();
}
function angle(a,b,c){const ab={x:a.x-b.x,y:a.y-b.y},cb={x:c.x-b.x,y:c.y-b.y}; const d=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y); if(!d)return 180; let cos=(ab.x*cb.x+ab.y*cb.y)/d; cos=Math.max(-1,Math.min(1,cos)); return Math.acos(cos)*180/Math.PI}
function visibilityOK(lm){const ids=[0,11,12,23,24,25,26,27,28]; return ids.every(i=>(lm[i].visibility??1)>.45)}
function beginTimer(){sessionStart=Date.now(); clearInterval(timerHandle); timerHandle=setInterval(()=>$('#sessionTimer').textContent=fmtDuration(Math.round((Date.now()-sessionStart)/1000)),1000)}
function resetHold(){holdStart=null; roundLocked=false; $('#holdValue').textContent='0.0'; $('#holdProgress').style.width='0%'}
function evaluatePose(lm){
  let good=false,m1='—',m2='—';
  if(activeGame==='balance'){
    const la=angle(lm[23],lm[25],lm[27]), ra=angle(lm[24],lm[26],lm[28]); m1=`${Math.round(la)}°`; m2=`${Math.round(ra)}°`; good=(la<150&&ra>158)||(ra<150&&la>158);
  } else if(activeGame==='pearl'){
    const la=angle(lm[23],lm[25],lm[27]), ra=angle(lm[24],lm[26],lm[28]), avg=(la+ra)/2; const wristY=Math.min(lm[15].y,lm[16].y), hipY=(lm[23].y+lm[24].y)/2; m1=`${Math.round(avg)}°`; m2=wristY>hipY?'نعم':'ليس بعد'; good=avg<145&&wristY>hipY;
  } else if(activeGame==='sail'){
    const left=lm[15].y<lm[11].y,right=lm[16].y<lm[12].y; m1=left?'نعم ✓':'لا'; m2=right?'نعم ✓':'لا'; good=left&&right;
  }
  $('#metric1').textContent=m1; $('#metric2').textContent=m2; return good;
}
function hintForGame(){return activeGame==='balance'?'ارفع قدمًا واحدة مع بقاء الأخرى ممتدة':activeGame==='pearl'?'انحنِ قليلًا ومد يدك للأسفل':'ارفع اليدين فوق مستوى الكتفين'}
function updateHold(good){
  const cfg=window.currentCfg; if(paused) return;
  if(good){
    if(!holdStart){holdStart=performance.now(); speak('ممتاز، استمر');}
    const secs=Math.min(cfg.hold,(performance.now()-holdStart)/1000); $('#holdValue').textContent=secs.toFixed(1); $('#holdProgress').style.width=`${secs/cfg.hold*100}%`; $('#feedbackBubble').textContent=secs<cfg.hold?'ممتاز… حافظ على الوضع':'أحسنت! ⭐';
    if(secs>=cfg.hold&&!roundLocked) scoreRound();
  } else {
    if(!roundLocked){holdStart=null; $('#holdValue').textContent='0.0'; $('#holdProgress').style.width='0%'}
    $('#feedbackBubble').textContent=hintForGame();
  }
}
function scoreRound(){
  roundLocked=true; sessionRounds++; sessionScore+=10; $('#roundValue').textContent=`${sessionRounds} / ${window.currentCfg.rounds}`; $('#playScore').textContent=sessionScore; if(navigator.vibrate) navigator.vibrate(80);
  speak(sessionRounds>=window.currentCfg.rounds?'رائع! أنهيت التحدي بنجاح':'أحسنت يا بطل، انتقل إلى الجولة التالية');
  if(sessionRounds>=window.currentCfg.rounds){setTimeout(finishGame,700)}
  else setTimeout(()=>{holdStart=null; roundLocked=false; $('#holdValue').textContent='0.0'; $('#holdProgress').style.width='0%'; $('#feedbackBubble').textContent='جاهز للجولة التالية؟'},900)
}
function initPose(){if(pose)return; pose=new Pose({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`}); pose.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:.55,minTrackingConfidence:.55}); pose.onResults(onResults)}
function onResults(results){
  const video=$('#video'), canvas=$('#canvas'), ctx=canvas.getContext('2d'); canvas.width=video.videoWidth||1280; canvas.height=video.videoHeight||720; ctx.clearRect(0,0,canvas.width,canvas.height);
  if(results.poseLandmarks){
    const lm=results.poseLandmarks; drawConnectors(ctx,lm,POSE_CONNECTIONS,{color:'#40d6a7',lineWidth:4}); drawLandmarks(ctx,lm,{color:'#ffe08d',lineWidth:2,radius:3});
    const ok=visibilityOK(lm); $('#detected').textContent=ok?'كامل ✓':'غير كامل'; $('#trackingConfidence').textContent=ok?'جيدة':'ضعيفة'; $('#poseStatus').textContent=ok?'● الجسم ظاهر':'● عدّل موضع الكاميرا'; $('#poseStatus').style.color=ok?'#b8f6d9':'#ffe4a8';
    if(ok){frameGood++; updateHold(evaluatePose(lm))} else {frameGood=0; resetHold(); $('#feedbackBubble').textContent='ابتعد قليلًا ليظهر الجسم كاملًا'}
  }else{$('#detected').textContent='لم يتم الاكتشاف'; $('#trackingConfidence').textContent='—'; $('#poseStatus').textContent='● ابحث عن الجسم'; resetHold()}
}
$('#startCameraBtn')?.addEventListener('click',async()=>{
  try{
    initPose(); cameraActive=true; demoMode=false; $('#cameraOverlay').classList.add('hide'); const video=$('#video');
    camera=new Camera(video,{onFrame:async()=>{if(cameraActive&&!paused) await pose.send({image:video})}, width:1280,height:720});
    await camera.start(); beginTimer(); $('#poseStatus').textContent='● جاري المعايرة'; $('#feedbackBubble').textContent='قف في المنتصف ليظهر جسمك كاملًا'; speak('قف في المنتصف ليظهر الجسم كاملًا ثم ابدأ الحركة');
  }catch(e){console.error(e); $('#cameraOverlay').classList.remove('hide'); toast('تعذر تشغيل الكاميرا. استخدم HTTPS وامنح إذن الكاميرا، أو جرّب وضع المحاكاة.')}
});
$('#demoModeBtn')?.addEventListener('click',()=>{demoMode=true; cameraActive=false; $('#cameraOverlay').classList.add('hide'); $('#simulateSuccessBtn').classList.remove('hidden'); $('#poseStatus').textContent='● وضع المحاكاة'; $('#detected').textContent='محاكاة'; $('#trackingConfidence').textContent='تجريبي'; beginTimer(); toast('تم تشغيل وضع المحاكاة'); speak('تم تشغيل وضع المحاكاة')});
$('#simulateSuccessBtn')?.addEventListener('click',()=>{if(roundLocked)return; holdStart=performance.now()-window.currentCfg.hold*1000; updateHold(true)});
$('#pauseBtn')?.addEventListener('click',()=>{paused=!paused; $('#pauseBtn').textContent=paused?'▶ متابعة':'⏸ إيقاف مؤقت'; $('#feedbackBubble').textContent=paused?'متوقف مؤقتًا':'تابع الحركة'; if(!paused) speak('تابع الحركة')});
$('#endGameBtn')?.addEventListener('click',()=>{if(confirm('إنهاء الجلسة الحالية؟')) finishGame(true)});
function stopCamera(){cameraActive=false; if(camera){try{camera.stop()}catch{} camera=null} clearInterval(timerHandle)}
function finishGame(cancelled=false){
  stopCamera(); const duration=sessionStart?Math.max(1,Math.round((Date.now()-sessionStart)/1000)):0;
  if(!cancelled||sessionRounds>0){
    const s={id:Date.now(),game:activeGame,title:window.currentCfg.title,date:new Date().toISOString(),duration,rounds:sessionRounds,targetRounds:window.currentCfg.rounds,points:sessionScore,mode:demoMode?'demo':'camera',rating:null,evalNote:''};
    state.sessions.unshift(s); state.sessions=state.sessions.slice(0,40); state.points+=sessionScore; saveState(); renderResult(s); route('result')
  }else{route('games'); return}
}
function renderResult(s){
  lastResultId=s.id; selectedRating=s.rating||0;
  $('#resultHeadline').textContent=`أحسنت ${state.profile?.name||''}!`;
  $('#resultSubtitle').textContent=s.rounds>=s.targetRounds?'أكملت التحدي بنجاح.':'تم حفظ تقدمك في هذه الجلسة.';
  $('#resultStats').innerHTML=[['⭐ النقاط',`+${s.points}`],['⏱ المدة',fmtDuration(s.duration)],['🎯 المهام',`${s.rounds}/${s.targetRounds}`]].map(x=>`<article><small>${x[0]}</small><b>${x[1]}</b></article>`).join('');
  $('#evalNote').value=s.evalNote||''; $('#evalSaveMsg').textContent='';
  $$('.rate-btn').forEach(btn=>btn.classList.toggle('active', +btn.dataset.rate===selectedRating));
  speak('أحسنت، انتهت الجلسة بنجاح');
}
function fmtDuration(sec){sec=Math.max(0,Math.round(sec||0)); const m=Math.floor(sec/60), s=sec%60; return m?`${m}:${String(s).padStart(2,'0')} د`:`${s} ث`}

$$('.rate-btn').forEach(btn=>btn.addEventListener('click',()=>{selectedRating=+btn.dataset.rate; $$('.rate-btn').forEach(x=>x.classList.toggle('active',x===btn)); speak(encouragementForRating(selectedRating))}));
$('#saveEvaluationBtn')?.addEventListener('click',()=>{
  if(!lastResultId){toast('لا توجد جلسة لتقييمها'); return}
  const idx=state.sessions.findIndex(s=>s.id===lastResultId); if(idx<0)return;
  state.sessions[idx].rating=selectedRating||null; state.sessions[idx].evalNote=$('#evalNote').value.trim(); saveState(); $('#evalSaveMsg').textContent='تم حفظ تقييم ولي الأمر.'; toast('تم حفظ التقييم'); if(selectedRating) speak(encouragementForRating(selectedRating));
});

function renderReports(){
  const sessions=state.sessions,totalTime=sessions.reduce((a,s)=>a+s.duration,0),rounds=sessions.reduce((a,s)=>a+s.rounds,0);
  $('#kpiSessions').textContent=sessions.length; $('#kpiTime').textContent=totalTime>=60?`${Math.round(totalTime/60)} د`:`${totalTime} ث`; $('#kpiRounds').textContent=rounds; $('#kpiPoints').textContent=state.points;
  const chart=$('#barChart');
  if(!sessions.length){chart.innerHTML='<div class="empty-state" style="width:100%">لا توجد بيانات بعد.</div>'}
  else{const last=[...sessions].slice(0,7).reverse(), max=Math.max(...last.map(s=>s.duration),60); chart.innerHTML=last.map((s,i)=>`<div class="bar" style="height:${Math.max(18,s.duration/max*180)}px"><b>${Math.round(s.duration/60*10)/10}د</b><span>${i+1}</span></div>`).join('')}
  const body=$('#sessionsBody');
  body.innerHTML=sessions.length?sessions.slice(0,12).map(s=>`<tr><td>${s.title}</td><td>${new Date(s.date).toLocaleDateString('ar-JO')}</td><td>${fmtDuration(s.duration)}</td><td>${s.rounds}/${s.targetRounds}</td><td>${s.points}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-cell">لا توجد جلسات محفوظة.</td></tr>';
  const rated=sessions.filter(s=>s.rating); const avg=rated.length?(rated.reduce((a,s)=>a+s.rating,0)/rated.length).toFixed(1):'—';
  $('#evalAverage').textContent=avg==='—'?avg:`${avg} / 5`;
  const note=[...sessions].find(s=>s.evalNote)?.evalNote||'لا توجد ملاحظات بعد.'; $('#lastEvalNote').textContent=note;
}
$('#exportReportBtn')?.addEventListener('click',()=>{const data={profile:state.profile,summary:{sessions:state.sessions.length,points:state.points},sessions:state.sessions}; const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`farjan-report-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); toast('تم تجهيز ملف التقرير')});

function renderTherapist(){
  const p=state.profile||{}; $('#therapistChildName').textContent=p.name||'الطفل'; $('#tName').textContent=p.name||'—'; $('#tMeta').textContent=p.age?`${p.age} سنوات • مستوى ${p.level}`:'—'; $('#tGoal').textContent=goalLabel(p.goal);
  $('#planGame').value=state.plan?.game||'balance'; $('#planRounds').value=state.plan?.rounds||5; $('#planHold').value=state.plan?.hold||3; $('#planRoundsValue').textContent=$('#planRounds').value; $('#planHoldValue').textContent=$('#planHold').value; $('#planNote').value=state.plan?.note||'';
  const box=$('#therapistSessions'); box.innerHTML=state.sessions.length?state.sessions.slice(0,5).map(s=>`<div class="mini-session"><div><b>${s.title}</b><small>${new Date(s.date).toLocaleDateString('ar-JO')}</small></div><span>${s.rounds}/${s.targetRounds}</span><b>+${s.points} ⭐</b></div>`).join(''):'<div class="empty-state">لا توجد جلسات بعد.</div>'
}
$('#planRounds')?.addEventListener('input',e=>$('#planRoundsValue').textContent=e.target.value);
$('#planHold')?.addEventListener('input',e=>$('#planHoldValue').textContent=e.target.value);
$('#savePlanBtn')?.addEventListener('click',()=>{state.plan={game:$('#planGame').value,rounds:+$('#planRounds').value,hold:+$('#planHold').value,note:$('#planNote').value.trim()}; saveState(); $('#planSaveMsg').textContent='تم حفظ الخطة بنجاح.'; setTimeout(()=>$('#planSaveMsg').textContent='',2200); toast('تم حفظ الخطة'); speak('تم حفظ الخطة العلاجية بنجاح')});

bindRoutes();
if(state.profile){$('#childName').value=state.profile.name||''; $('#childAge').value=state.profile.age||''; $('#childGoal').value=state.profile.goal||'balance'; $('#childLevel').value=state.profile.level||'1'}
syncVoiceButtons();
window.speechSynthesis?.getVoices?.();
window.addEventListener('beforeunload',stopCamera);
