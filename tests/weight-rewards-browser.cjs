'use strict';
// Local UI integration checks. APIs and workout counts are synthetic fixtures;
// no production service, actual camera, pose model, or hosted reward is used.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,webkit}=require('/workspace/Target-challenge/node_modules/playwright');
const root=path.resolve(__dirname,'..'),artifact=process.env.WEIGHT_QA_ARTIFACT||'/workspace/artifacts/weight-historical-rewards';
const A={id:'00000000-0000-4000-8000-000000000001',name:'Workout A'};
const B={id:'00000000-0000-4000-8000-000000000002',name:'Workout B'};
const walletA={memberId:A.id,weightIncome:1234567000,totalIncome:9999999999990,balance:9999999998990};
const walletB={memberId:B.id,weightIncome:23000,totalIncome:987000,balance:900000};
const trainingKey=id=>'weight.training.v1:'+id;
const pendingKey=(id,sessionId)=>'weight.rewards.v1:'+id+':'+sessionId;
const importKey=id=>'weight.rewards.import.v1:'+id;
const history=[{id:'historic-no-backfill',reps:15,bestStreak:8,durationSec:80,endedAt:'2026-11-18T10:00:00.000Z'}];
const historical130=[
 {id:'historical-workout-080',reps:80,bestStreak:40,durationSec:600,endedAt:'2026-11-18T10:00:00.000Z'},
 {id:'historical-workout-050',reps:50,bestStreak:20,durationSec:400,endedAt:'2026-11-18T09:00:00.000Z'}
];
const beforeCatchup={memberId:A.id,weightIncome:0,totalIncome:25000,balance:20000};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let checks=0;
function eq(actual,expected,message){assert.deepEqual(actual,expected,message);checks++;}
function ok(value,message){assert.ok(value,message);checks++;}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function environment(browser,origin,{member=A,viewport={width:320,height:568},statusFailure=false,holdStatus=false,seedPending=null,rewardFailure=false,holdReward=false,seedHistory=history,imported=true,initialWallet=null,alreadyPaid=null,storageFailureSessionId=null,historyReadFailure=null}={}){
 const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();
 const state={member,statusFailure,holdStatus,statusRequests:[],rewardRequests:[],heldStatuses:[],heldRewards:[],holdReward,rewardFailure,committed:new Map(),wallets:new Map([[A.id,{...walletA}],[B.id,{...walletB}]]),errors:[],external:[],allRequests:[]};
 if(seedPending)state.wallets.set(A.id,{memberId:A.id,weightIncome:1000,totalIncome:10000,balance:9000});
 if(initialWallet)state.wallets.set(A.id,{...initialWallet});
 if(alreadyPaid)state.committed.set(A.id+':'+alreadyPaid.sessionId,{expectedMemberId:A.id,...alreadyPaid});
 page.on('pageerror',e=>state.errors.push(e.message));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  state.allRequests.push({url:request.url(),method:request.method()});
  if(url.origin!==origin){state.external.push(request.url());return route.abort();}
  if(url.pathname==='/api/kgs'){
   if(request.method()==='POST'){
    const input=request.postDataJSON();
    state.member=input.action==='logout'?null:(input.attendanceNumber==='2'?B:A);
   }
   return route.fulfill({json:{member:state.member}});
  }
  if(url.pathname==='/api/leaderboard')return route.fulfill({json:request.method()==='POST'?{ok:true}:{entries:[],optedIn:false}});
  if(url.pathname==='/api/earnings'){
   const authenticated=state.member;
   if(request.method()==='GET'){
    state.statusRequests.push(authenticated?.id??null);
    if(state.holdStatus){state.heldStatuses.push({route,member:authenticated});return;}
    if(!authenticated)return route.fulfill({status:401,json:{error:'ログインしてください。'}});
    return route.fulfill({status:state.statusFailure?503:200,json:state.statusFailure?{error:'同期できません。'}:state.wallets.get(authenticated.id)});
   }
   const input=request.postDataJSON();
   state.rewardRequests.push({authenticated:authenticated?.id??null,input});
   if(!authenticated)return route.fulfill({status:401,json:{error:'ログインしてください。'}});
   if(input.expectedMemberId!==authenticated.id)return route.fulfill({status:401,json:{code:'ACCOUNT_CHANGED',error:'アカウントが変わりました。'}});
   const receiptKey=authenticated.id+':'+input.sessionId,old=state.committed.get(receiptKey),wallet=state.wallets.get(authenticated.id);
   if(!old){wallet.weightIncome+=input.reps*1000;wallet.totalIncome+=input.reps*1000;wallet.balance+=input.reps*1000;state.committed.set(receiptKey,{...input});}
   const payload={...wallet,sessionId:input.sessionId,reps:input.reps,creditedAmount:input.reps*1000,replayed:!!old};
   if(state.holdReward){state.heldRewards.push({route,payload});return;}
   return route.fulfill({status:state.rewardFailure?503:200,json:state.rewardFailure?{error:'応答が届きませんでした。'}:payload});
  }
  return route.continue();
 });
 await context.addInitScript(({A,B,seedHistory,seedPending,imported,storageFailureSessionId,historyReadFailure})=>{
  if(!sessionStorage.getItem('fixture-initialized')){
   localStorage.setItem('weight.training.v1:'+A.id,JSON.stringify(seedHistory));
   localStorage.setItem('weight.training.v1:'+B.id,JSON.stringify([]));
   if(imported)for(const owner of[A.id,B.id])localStorage.setItem('weight.rewards.import.v1:'+owner,'complete');
   if(seedPending)localStorage.setItem('weight.rewards.v1:'+seedPending.owner+':'+seedPending.sessionId,JSON.stringify({sessionId:seedPending.sessionId,reps:seedPending.reps}));
   sessionStorage.setItem('fixture-initialized','yes');
  }
  window.__storageFailureSessionId=storageFailureSessionId;
  window.__historyReadFailure=historyReadFailure;
  const originalGet=Storage.prototype.getItem;
  Storage.prototype.getItem=function(key){
   if(key==='weight.training.v1:'+A.id&&window.__historyReadFailure){
    if(window.__historyReadFailure==='throw')throw new DOMException('Synthetic blocked history read','SecurityError');
    return window.__historyReadFailure==='json'?'{':'{}';
   }
   return originalGet.call(this,key);
  };
  const originalSet=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(key.startsWith('weight.rewards.v1:')&&window.__storageFailureSessionId&&key.endsWith(':'+window.__storageFailureSessionId))throw new DOMException('Synthetic storage quota','QuotaExceededError');
   return originalSet.call(this,key,value);
  };
  window.__cameraStarts=0;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.__cameraStarts++;throw Error('Camera must not start in reward UI test');}}});
 },{A,B,seedHistory,seedPending,imported,storageFailureSessionId,historyReadFailure});
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 return {context,page,state};
}

async function settings(page){await page.getByRole('button',{name:'設定',exact:true}).click();}
async function values(page){return page.locator('.earnings-values dd').allTextContents();}
async function loaded(page){await page.waitForFunction(()=>document.querySelector('.earnings-values dd')?.textContent!=='—轟'&&document.querySelector('.earnings-section')?.getAttribute('aria-busy')==='false');}
async function layout(page){const value=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));ok(value.scrollWidth<=value.width&&value.bodyWidth<=value.width,'settings including large balances fit viewport width');}
async function noCamera(page,state){eq(await page.evaluate(()=>window.__cameraStarts),0,'reward settings never start camera');eq(state.external,[],'no external requests');eq(state.errors,[],'no uncaught browser errors');}
async function syntheticWorkout(page,reps){
 await page.getByRole('button',{name:'チャレンジ',exact:true}).click();
 await page.getByRole('button',{name:'計測する',exact:false}).click();
 await page.evaluate(async reps=>{
  const {PushupCounter}=await import('/src/counter.ts');
  const {RepStreakTracker}=await import('/src/rep-streak.ts');
  const snapshot=PushupCounter.prototype.snapshot,streakSnapshot=RepStreakTracker.prototype.snapshot;
  PushupCounter.prototype.snapshot=function(){return {...snapshot.call(this),count:reps};};
  RepStreakTracker.prototype.snapshot=function(){return {...streakSnapshot.call(this),bestStreak:reps};};
 },reps);
 await page.getByRole('button',{name:'終了して保存',exact:true}).click();
}

async function signIn(page,number){
 await page.getByRole('button',{name:'ログイン',exact:true}).first().click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('出席番号',{exact:true}).fill(String(number));
 await dialog.getByLabel('4桁PIN',{exact:true}).fill('0123');
 await dialog.getByRole('button',{name:'ログイン',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
}

async function main(){
 await fs.mkdir(artifact,{recursive:true});
 const {createServer}=await import(path.join(root,'node_modules/vite/dist/node/index.js'));
 const server=await createServer({root,configFile:path.join(root,'vite.config.ts'),server:{host:'127.0.0.1',port:0}});
 await server.listen();const origin=server.resolvedUrls.local[0].replace(/\/$/,''),results=[];
 try{for(const[engine,launcher]of Object.entries({chromium,webkit})){
  const browser=await launcher.launch({headless:true,executablePath:engine==='chromium'?'/usr/bin/chromium':'/workspace/scratch/webkit-runtime/pw-run.sh'});
  try{
   for(const viewport of[{width:320,height:568},{width:844,height:390}]){
    const at=checks,{context,page,state}=await environment(browser,origin,{viewport});
    try{
     await settings(page);await loaded(page);
     eq(await page.locator('.earnings-values dt').allTextContents(),['Weightで獲得','総所得'],'two independent income summaries');
     eq(await values(page),['1,234,567,000轟','9,999,999,999,990轟'],'large canonical income values, not local rep multiplication');
     ok((await page.locator('.earnings-heading').textContent()).includes('1回 1,000轟'),'per-rep conversion is visible');
     eq(state.rewardRequests,[],'already-imported history is never resubmitted by settings refresh');
     await layout(page);
     state.statusFailure=true;await page.getByRole('button',{name:'轟を更新',exact:true}).click();
     await page.locator('.earnings-error').waitFor();
     eq(await values(page),['1,234,567,000轟','9,999,999,999,990轟'],'failed refresh retains last confirmed balance');
     ok((await page.locator('.earnings-error').textContent()).includes('再試行'),'connection problem has retry guidance');
     state.statusFailure=false;state.wallets.get(A.id).weightIncome=1000;
     await page.getByRole('button',{name:'轟を更新',exact:true}).click();await loaded(page);
     eq(await values(page),['1,000轟','9,999,999,999,990轟'],'manual retry refreshes canonical amounts');
     eq(await page.locator('.earnings-error').count(),0,'successful retry clears error');
     await noCamera(page,state);
     await page.screenshot({path:path.join(artifact,`${engine}-${viewport.width}x${viewport.height}-settings.png`),fullPage:true});
     results.push({engine,viewport,case:'canonical-settings-refresh',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const at=checks,{context,page,state}=await environment(browser,origin,{holdStatus:true});
    try{
     await settings(page);await page.waitForFunction(()=>document.querySelector('.earnings-section')?.getAttribute('aria-busy')==='true');
     eq(await values(page),['—轟','—轟'],'unknown balances never display fake zero');
     ok(await page.getByRole('button',{name:'轟を更新',exact:true}).isDisabled(),'refresh disabled during same-account flight');
     ok((await page.locator('.earnings-note').first().textContent()).includes('取得中'),'initial loading status is visible');
     state.holdStatus=false;for(const held of state.heldStatuses.splice(0))await held.route.fulfill({json:state.wallets.get(held.member.id)});
     await loaded(page);eq(await values(page),['1,234,567,000轟','9,999,999,999,990轟'],'delayed initial load resolves once');
     await noCamera(page,state);results.push({engine,case:'initial-loading',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const at=checks,{context,page,state}=await environment(browser,origin,{statusFailure:true});
    try{
     await settings(page);await page.locator('.earnings-error').waitFor();
     eq(await values(page),['—轟','—轟'],'initial network failure leaves income unknown');
     state.statusFailure=false;await page.getByRole('button',{name:'轟を更新',exact:true}).click();await loaded(page);
     eq(await page.locator('.earnings-error').count(),0,'initial error can be recovered without reload');
     await noCamera(page,state);results.push({engine,case:'initial-error',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const at=checks,{context,page,state}=await environment(browser,origin,{member:null});
    try{
     await settings(page);await page.locator('.earnings-guest').waitFor();
     eq(state.statusRequests,[],'guests do not request private earnings');
     eq(state.rewardRequests,[],'guests do not claim rewards');
     eq(await page.locator('.earnings-values').count(),0,'guest cannot see another account balance');
     await page.locator('.earnings-guest button').click();await page.getByRole('dialog').waitFor();
     await page.getByRole('button',{name:'閉じる',exact:true}).click();
     await layout(page);await noCamera(page,state);results.push({engine,case:'guest',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const at=checks,{context,page,state}=await environment(browser,origin,{seedHistory:historical130,imported:false,initialWallet:beforeCatchup});
    try{
     await settings(page);await loaded(page);
     eq(await values(page),['130,000轟','155,000轟'],'130 previously saved authenticated reps award 130000, included in shared total');
     eq(state.committed.size,2,'one permanent receipt per original historical workout');
     eq(new Set(state.rewardRequests.map(row=>row.input.sessionId)),new Set(historical130.map(row=>row.id)),'historical import reuses original IDs');
     ok(state.rewardRequests.every(row=>row.input.expectedMemberId===A.id),'historic rewards stay bound to their original member');
     eq(await page.evaluate(key=>localStorage.getItem(key),importKey(A.id)),'complete','successful complete import writes durable member marker');
     eq(await page.evaluate(owner=>Object.keys(localStorage).filter(key=>key.startsWith('weight.rewards.v1:'+owner+':')),A.id),[],'all imported receipts acknowledged');
     const requestsAfterCatchup=state.rewardRequests.length;
     for(let i=0;i<2;i++){await page.reload({waitUntil:'domcontentloaded'});await settings(page);await loaded(page);}
     eq(await values(page),['130,000轟','155,000轟'],'repeated reload preserves exact paid total');
     eq(state.rewardRequests.length,requestsAfterCatchup,'completed migration does not resubmit history on reload');
     eq(state.committed.size,2,'repeated reload cannot pay historical workouts twice');
     eq((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),trainingKey(A.id))).reduce((sum,row)=>sum+row.reps,0),130,'reward catchup leaves exercise history intact');
     await noCamera(page,state);results.push({engine,case:'historical-130-catchup-repeat-reload',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const alreadyPaid={sessionId:historical130[0].id,reps:80};
    const at=checks,{context,page,state}=await environment(browser,origin,{seedHistory:historical130,imported:false,
     initialWallet:{memberId:A.id,weightIncome:80000,totalIncome:105000,balance:100000},alreadyPaid});
    try{
     await settings(page);await loaded(page);
     eq(await values(page),['130,000轟','155,000轟'],'historical receipt already paid80 plus unpaid50 reaches130000, not210000');
     eq(state.committed.size,2,'already-paid historical receipt is replayed without another commit');
     ok(state.rewardRequests.some(row=>row.input.sessionId===alreadyPaid.sessionId),'paid original ID was checked by authoritative receipt replay');
     eq(state.rewardRequests.length,2,'each historical record considered once in migration');
     await noCamera(page,state);results.push({engine,case:'historical-already-paid-replay',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const at=checks,{context,page,state}=await environment(browser,origin,{seedHistory:historical130,imported:false,
     initialWallet:beforeCatchup,storageFailureSessionId:historical130[1].id});
    try{
     await settings(page);await page.locator('.earnings-error').waitFor();
     eq(await page.evaluate(key=>localStorage.getItem(key),importKey(A.id)),null,'partial queue write cannot mark historical import complete');
     ok(await page.evaluate(key=>localStorage.getItem(key)!==null,pendingKey(A.id,historical130[0].id)),'first historical workout survives partial storage failure');
     eq(state.committed.size,0,'partial queue storage failure sends no unrecorded synthetic reward');
     await page.evaluate(()=>{window.__storageFailureSessionId=null;});
     await page.getByRole('button',{name:'轟を更新',exact:true}).click();await loaded(page);
     eq(await values(page),['130,000轟','155,000轟'],'retry recovers all130reps after partial local storage failure');
     eq(state.committed.size,2,'partially imported workout paid once after retry');
     eq(await page.evaluate(key=>localStorage.getItem(key),importKey(A.id)),'complete','only complete durable queue marks import done');
     eq(new Set(state.rewardRequests.map(row=>row.input.sessionId)),new Set(historical130.map(row=>row.id)),'partial retry preserves original session IDs');
     await noCamera(page,state);results.push({engine,case:'historical-partial-queue-recovery',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const at=checks,{context,page,state}=await environment(browser,origin,{member:B,seedHistory:historical130,imported:false,initialWallet:beforeCatchup});
    try{
     await settings(page);await loaded(page);eq(await values(page),['23,000轟','987,000轟'],'B does not inherit A historical earnings');
     eq(state.rewardRequests.length,0,'B login does not queue A history');
     eq(await page.evaluate(key=>localStorage.getItem(key),importKey(A.id)),null,'B login does not mark A history imported');
     await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.locator('.earnings-guest').waitFor();
     await signIn(page,1);await loaded(page);
     eq(await values(page),['130,000轟','155,000轟'],'returning A imports only its own130savedreps');
     eq(state.wallets.get(B.id),walletB,'A catchup leaves B wallet unchanged');
     ok(state.rewardRequests.every(row=>row.input.expectedMemberId===A.id),'historic catchup always asserts actual owning account');
     await noCamera(page,state);results.push({engine,case:'historical-account-isolation',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   for(const historyReadFailure of['throw','json','shape']){
    const at=checks,{context,page,state}=await environment(browser,origin,{seedHistory:historical130,imported:false,initialWallet:beforeCatchup,historyReadFailure});
    try{
     await settings(page);await page.locator('.earnings-error').waitFor();
     eq(await page.evaluate(key=>localStorage.getItem(key),importKey(A.id)),null,'unreadable history must not be marked as an empty completed import');
     eq(state.committed.size,0,'unreadable history cannot produce an invented credit');
     eq(state.rewardRequests.length,0,'history read failure stops before reward requests');
     await page.evaluate(()=>{window.__historyReadFailure=null;});
     await page.getByRole('button',{name:'轟を更新',exact:true}).click();await loaded(page);
     eq(await values(page),['130,000轟','155,000轟'],'restored historical read recovers all130reps rather than being skipped forever');
     eq(state.committed.size,2,'both restored original historical IDs paid once');
     eq(await page.evaluate(key=>localStorage.getItem(key),importKey(A.id)),'complete','restored successful read permits durable import completion');
     await noCamera(page,state);results.push({engine,case:'historical-read-failure-'+historyReadFailure,checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const pending={owner:A.id,sessionId:'lost-response-workout',reps:3};
    const at=checks,{context,page,state}=await environment(browser,origin,{seedPending:pending,rewardFailure:true});
    try{
     await settings(page);await page.locator('.earnings-error').waitFor();
     eq(state.committed.size,1,'uncertain response still commits only one mock receipt');
     eq(state.wallets.get(A.id).weightIncome,4000,'three repetitions credit 3000 exactly once');
     ok(await page.evaluate(key=>localStorage.getItem(key)!==null,pendingKey(A.id,pending.sessionId)),'failed response retains durable pending receipt');
     page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'削除',exact:true}).click();
     eq(await page.evaluate(key=>localStorage.getItem(key),trainingKey(A.id)),null,'local history was deleted');
     ok(await page.evaluate(key=>localStorage.getItem(key)!==null,pendingKey(A.id,pending.sessionId)),'deleting history does not delete unsettled rewards');
     state.rewardFailure=false;await page.reload({waitUntil:'domcontentloaded'});await settings(page);await loaded(page);
     eq(await values(page),['4,000轟','13,000轟'],'reloaded outbox replays lost response and displays confirmed totals');
     eq(state.committed.size,1,'retry/reload cannot create another credit');
     eq(await page.evaluate(key=>localStorage.getItem(key),pendingKey(A.id,pending.sessionId)),null,'successful matching receipt acknowledges only pending entry');
     ok(state.rewardRequests.length>=2,'exact workout receipt retried after lost response');
     ok(state.rewardRequests.every(r=>r.input.sessionId===pending.sessionId&&r.input.reps===3&&r.input.expectedMemberId===A.id),'retries preserve id, repetitions and original account');
     await noCamera(page,state);results.push({engine,case:'lost-response-reload-history-delete',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const at=checks,{context,page,state}=await environment(browser,origin);
    state.wallets.set(A.id,{memberId:A.id,weightIncome:1000,totalIncome:10000,balance:9000});
    try{
     await settings(page);await loaded(page);state.rewardFailure=true;
     await syntheticWorkout(page,2);await settings(page);await page.locator('.earnings-error').waitFor();
     const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),trainingKey(A.id));
     eq(saved.length,2,'normal finish handler saves new workout beside historical record');
     const workout=saved.find(row=>row.id!=='historic-no-backfill');eq(workout.reps,2,'finished workout reps are saved');
     eq(state.committed.size,1,'only new workout, not historical record, creates a credit');
     ok(state.rewardRequests.every(row=>row.input.sessionId===workout.id&&row.input.reps===2),'reward identity comes from actual finished record');
     ok(await page.evaluate(key=>localStorage.getItem(key)!==null,pendingKey(A.id,workout.id)),'failed new workout reward remains durable');
     state.rewardFailure=false;await page.getByRole('button',{name:'轟を更新',exact:true}).click();await loaded(page);
     eq(await values(page),['3,000轟','12,000轟'],'completed two-rep workout adds 2000 to both earnings and shared total');
     eq(await page.evaluate(key=>localStorage.getItem(key),pendingKey(A.id,workout.id)),null,'new workout queue acknowledged after receipt');
     eq(state.committed.size,1,'retry does not pay workout twice');
     await noCamera(page,state);results.push({engine,case:'finish-save-outbox',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const pending={owner:A.id,sessionId:'cross-tab-workout',reps:4};
    const at=checks,{context,page,state}=await environment(browser,origin,{member:null,seedPending:pending});
    try{
     await settings(page);await page.locator('.earnings-guest').waitFor();
     await signIn(page,1);await loaded(page);
     eq(state.committed.size,1,'original member can claim its own queued workout');
     // Simulate another tab changing the shared authentication cookie while
     // this page still renders A. A new pending receipt must never pay B.
     await page.evaluate(async({owner,record})=>{const m=await import('/src/earnings.ts');m.queueReward(owner,record);},{owner:A.id,record:{sessionId:'cross-tab-second-workout',reps:2}});
     state.member=B;await page.getByRole('button',{name:'轟を更新',exact:true}).click();await page.locator('.earnings-error').waitFor();
     eq(state.committed.size,1,'cross-tab cookie change does not mint a new credit');
     eq(state.wallets.get(B.id),walletB,'A workout never modifies B wallet');
     eq(await values(page),['—轟','—轟'],'identity mismatch clears stale private income values');
     ok(await page.evaluate(key=>localStorage.getItem(key)!==null,pendingKey(A.id,'cross-tab-second-workout')),'unpaid A workout retained for A to resume');
     ok(state.rewardRequests.at(-1).input.expectedMemberId===A.id&&state.rewardRequests.at(-1).authenticated===B.id,'old-tab request carries identity assertion that mock service rejects');
     await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.locator('.earnings-guest').waitFor();
     await signIn(page,2);await loaded(page);eq(await values(page),['23,000轟','987,000轟'],'new login displays only B canonical earnings');
     ok(await page.evaluate(key=>localStorage.getItem(key)!==null,pendingKey(A.id,'cross-tab-second-workout')),'B login does not acknowledge A queue');
     await noCamera(page,state);results.push({engine,case:'cross-tab-account-isolation',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const pending={owner:A.id,sessionId:'late-account-response',reps:4};
    const at=checks,{context,page,state}=await environment(browser,origin,{seedPending:pending,holdReward:true});
    try{
     await settings(page);
     for(let i=0;i<200&&!state.heldRewards.length;i++)await wait(20);
     eq(state.heldRewards.length,1,'original account credit is held in flight');
     await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.locator('.earnings-guest').waitFor();
     state.holdReward=false;await signIn(page,2);await loaded(page);
     eq(await values(page),['23,000轟','987,000轟'],'new member balance appears while old receipt is in flight');
     for(const held of state.heldRewards.splice(0))await held.route.fulfill({json:held.payload});
     await wait(100);
     eq(await values(page),['23,000轟','987,000轟'],'late A receipt never replaces B balance');
     ok(await page.evaluate(key=>localStorage.getItem(key)!==null,pendingKey(A.id,pending.sessionId)),'late old-account response does not acknowledge its inactive queue');
     await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.locator('.earnings-guest').waitFor();
     await signIn(page,1);await loaded(page);
     eq(await values(page),['5,000轟','14,000轟'],'returning original account safely replays its committed receipt');
     eq(state.committed.size,1,'account changes and late response still pay once');
     eq(await page.evaluate(key=>localStorage.getItem(key),pendingKey(A.id,pending.sessionId)),null,'original owner acknowledges only after confirmed replay');
     await noCamera(page,state);results.push({engine,case:'late-response-owner-change',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
   {
    const at=checks,{context,page,state}=await environment(browser,origin,{member:null});
    try{
     await syntheticWorkout(page,2);await settings(page);await page.locator('.earnings-guest').waitFor();
     const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('weight.training.v1:guest')||'[]'));
     eq(saved.length,1,'guest workout remains available locally');eq(saved[0].reps,2,'guest count saved accurately');
     eq(state.rewardRequests,[],'guest finished workout never attempts reward');
     eq(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('weight.rewards.v1:'))),[],'guest workout creates no transferable payout queue');
     await signIn(page,2);await loaded(page);
     eq(await values(page),['23,000轟','987,000轟'],'login does not turn guest workout into paid member workout');
     eq(state.rewardRequests,[],'login never backfills guest history');
     await noCamera(page,state);results.push({engine,case:'guest-finish-remains-local',checks:checks-at,passed:true});
    }finally{await context.close();}
   }
  }finally{await browser.close();}
 }}finally{await server.close();}
 const sourceHashes={};for(const file of['src/App.tsx','src/pages.tsx','src/styles.css','src/earnings.ts','src/useWeightEarnings.ts','src/training.ts','api/earnings.js','src/counter.ts','src/rep-streak.ts'])sourceHashes[file]=sha(await fs.readFile(path.join(root,file)));
 const report={passed:true,checkedAt:new Date().toISOString(),checks,results,sourceHashes,hostedRequests:0,acceptedHostedMutations:0,cameraStarted:false,poseInferenceTested:false,historical130CatchupCovered:true,workoutCountFixture:'Explicit synthetic runtime count/streak; real App finish/save/queue handlers'};
 await fs.writeFile(path.join(artifact,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks,cases:results.length,report:path.join(artifact,'browser-report.json')}));
}
main().catch(async error=>{await fs.mkdir(artifact,{recursive:true});await fs.writeFile(path.join(artifact,'browser-error.json'),JSON.stringify({passed:false,checks,error:error.stack},null,2)+'\n');console.error(error);process.exitCode=1;});
