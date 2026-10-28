"use strict";
(function () {
  const KEY = "quran-stations-v1";
  const TOTAL_PAGES = 604, BLOCK_PAGES = 7, TOTAL_STATIONS = 87, TOTAL_DAYS = 90;
  const THEMES = Array.isArray(window.QURAN_STATIONS_THEMES) ? window.QURAN_STATIONS_THEMES : [];
  if (THEMES.length !== TOTAL_STATIONS) throw new Error("تعذر تحميل أسماء المحطات وأسباب تسميتها");
  const NAMES = THEMES.map(theme => theme.name);
  const SURAH_NAMES = Array.isArray(window.QURAN_SURAH_NAMES) ? window.QURAN_SURAH_NAMES : [];
  const REVIEW_LABELS = ["بعد يوم","بعد أسبوع","بعد شهر","مراجعة شهرية"];
  const $ = (selector) => document.querySelector(selector);
  const app = $("#app");
  const arabicNum = (n) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const pad = (n) => String(n).padStart(2,"0");
  const isoToday = () => {const d = new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());};
  const validISO = (s) => {if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false; const d=new Date(s+"T12:00:00");return Number.isFinite(d.getTime()) && d.getFullYear()===Number(s.slice(0,4))&&d.getMonth()+1===Number(s.slice(5,7))&&d.getDate()===Number(s.slice(8,10));};
  const addDays = (iso, days) => {const [y,m,d] = iso.split("-").map(Number);const value = new Date(y,m-1,d+days,12);return value.getFullYear()+"-"+pad(value.getMonth()+1)+"-"+pad(value.getDate());};
  const diffDays = (start, end) => Math.round((Date.parse(end+"T12:00:00")-Date.parse(start+"T12:00:00"))/86400000);
  const dateLabel = (iso) => iso ? new Date(iso+"T12:00:00").toLocaleDateString("ar-SA-u-ca-gregory",{day:"numeric",month:"short",year:"numeric"}) : "—";
  const pageStart = (id) => (id - 1) * BLOCK_PAGES + 1;
  const pageEnd = (id) => Math.min(id * BLOCK_PAGES, TOTAL_PAGES);
  const pageCount = (id) => pageEnd(id) - pageStart(id) + 1;
  const rangeLabel = (id) => "ص " + arabicNum(pageStart(id)) + "–" + arabicNum(pageEnd(id));
  const defaultQuestion = (id) => THEMES[id-1].question;
  const defaultReason = (id) => THEMES[id-1].reason;
  const anchorOf = (id) => THEMES[id-1].anchor;
  const anchorLabel = (id) => {
    const [surah,ayah] = anchorOf(id).split(":").map(Number);
    return (SURAH_NAMES[surah-1] || "السورة "+arabicNum(surah)) + "، الآية " + arabicNum(ayah);
  };
  const defaultData = () => ({version:1,startOn:"",calendarTime:"17:00",theme:"light",custom:{},entries:{}});
  function cleanData(input) {
    if (!input || typeof input !== "object" || !Array.isArray(NAMES) || NAMES.length !== TOTAL_STATIONS) throw Error("تعذر التحقق من البيانات");
    const obj = defaultData();
    obj.startOn = validISO(input.startOn) ? input.startOn : "";
    obj.calendarTime = typeof input.calendarTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.calendarTime) ? input.calendarTime : "17:00";
    obj.theme = input.theme === "dark" ? "dark" : "light";
    if (input.custom && typeof input.custom === "object") {
      for (let i=1;i<=TOTAL_STATIONS;i++) {
        const c = input.custom[i];
        if (c && typeof c === "object") obj.custom[i] = {name:typeof c.name==="string" ? c.name.slice(0,75) : "",question:typeof c.question==="string" ? c.question.slice(0,350) : "",reason:typeof c.reason==="string" ? c.reason.slice(0,700) : ""};
      }
    }
    if (input.entries && typeof input.entries === "object") {
      for (let i=1;i<=TOTAL_STATIONS;i++) {
        const e = input.entries[i]; if (!e || typeof e !== "object") continue;
        const status = Math.min(3,Math.max(0,Number.isInteger(e.status) ? e.status : 0));
        const reviews = Array.isArray(e.reviews) ? e.reviews.filter(validISO).slice(0,100) : [];
        obj.entries[i] = {read: e.read===true,status:status,masteredAt:status===3 && validISO(e.masteredAt)?e.masteredAt:"",reviews:status===3?reviews:[],note:typeof e.note==="string"?e.note.slice(0,3000):""};
      }
    }
    return obj;
  }
  let data;
  try {data = cleanData(JSON.parse(localStorage.getItem(KEY) || "null") || defaultData());} catch(e) {data = defaultData();}
  let searchTerm = "", listFilter = "all", editingId = 1, toastTimer = null;
  function save() {try {localStorage.setItem(KEY,JSON.stringify(data));return true;}catch(e){notify("تعذر حفظ البيانات على هذا المتصفح؛ صدّر نسخة احتياطية.");return false;}}
  function entry(id) {
    if (!data.entries[id]) data.entries[id] = {read:false,status:0,masteredAt:"",reviews:[],note:""};
    return data.entries[id];
  }
  function nameOf(id) {return (data.custom[id] && data.custom[id].name) || NAMES[id-1];}
  function userChangedName(id) {return nameOf(id) !== NAMES[id-1];}
  function personalReason(id) {return (data.custom[id] && data.custom[id].reason) || "";}
  function reasonOf(id) {return personalReason(id) || defaultReason(id);}
  function questionOf(id) {return data.custom[id] && Object.prototype.hasOwnProperty.call(data.custom[id],"question") ? data.custom[id].question : defaultQuestion(id);}
  function readPages() {let x=0;for(let i=1;i<=TOTAL_STATIONS;i++)if(entry(i).read)x+=pageCount(i);return x;}
  function memorizedPages() {let x=0;for(let i=1;i<=TOTAL_STATIONS;i++)if(entry(i).status>=1)x+=pageCount(i);return x;}
  function masteredPages() {let x=0;for(let i=1;i<=TOTAL_STATIONS;i++)if(entry(i).status===3)x+=pageCount(i);return x;}
  function masteredStations(){let n=0;for(let i=1;i<=TOTAL_STATIONS;i++) if(entry(i).status===3)n++;return n;}
  function pendingStation(){for(let i=1;i<=TOTAL_STATIONS;i++)if(entry(i).status<3)return i;return TOTAL_STATIONS;}
  function dayNumber(){if(!data.startOn)return 0;return diffDays(data.startOn,isoToday())+1;}
  function reviewed(id){
    const e=entry(id);if(e.status!==3)return null;
    const base = (e.reviews.length ? e.reviews[e.reviews.length-1] : e.masteredAt) || isoToday();
    const gap = e.reviews.length===0?1:e.reviews.length===1?7:30;
    return {due:addDays(base,gap),count:e.reviews.length,next:REVIEW_LABELS[Math.min(e.reviews.length,3)]};
  }
  function dueStations(){const list=[];const today=isoToday();for(let i=1;i<=TOTAL_STATIONS;i++){const r=reviewed(i);if(r && r.due<=today)list.push({id:i,...r});}return list.sort((a,b)=>a.due.localeCompare(b.due));}
  function statusLabel(status) {return ["لم أبدأ","حفظت","سمّعت","أتقنت"][status];}
  function statusChip(status) {return '<span class="chip '+(status===3?"success":status===0?"muted":status===2?"gold":"")+'">'+esc(statusLabel(status))+"</span>";}
  function progressLine(label,count,total,kind) {
    const pct=Math.max(0,Math.min(100,Math.round(count/total*100)));
    return '<div class="progress-line"><strong>'+esc(label)+'</strong><span>'+arabicNum(count)+' / '+arabicNum(total)+' · '+arabicNum(pct)+'٪</span></div><div class="progress-track"><div class="progress-fill '+(kind||"")+'" style="width:'+pct+'%"></div></div>';
  }
  function button(text,action,extra) {return '<button type="button" class="button '+(extra||"button-outline")+'" data-action="'+action+'">'+text+'</button>';}
  function stat(value,label){return '<div class="stat-card"><strong>'+arabicNum(value)+'</strong><span>'+label+'</span></div>';}
  function notify(s) {const el=$("#toast");el.textContent=s;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3300);}
  function route(){
    const hash=decodeURIComponent(location.hash.slice(1));
    if(hash.startsWith("station/")) {
      const id=Number(hash.split("/")[1]);
      if(Number.isInteger(id)&&id>=1&&id<=TOTAL_STATIONS)return {view:"station",id};
    }
    return {view:["home","stations","reviews","settings"].includes(hash)?hash:"home",id:null};
  }
  function go(view,id) {const h=view==="station"?"station/"+id:view;if(location.hash==="#"+h)render();else location.hash=h;window.scrollTo(0,0);}
  function heroContent() {
    const day=dayNumber(), idx=pendingStation(), finished=masteredStations()===TOTAL_STATIONS;
    let headline = "كل صفحة خطوة إلى الإتقان", text = "سبع صفحات لكل محطة، ووقت مخصص للتسميع والمراجعة. ابدأ من حيث أنت، وثبّت ما تحفظ.";
    if(finished){headline="بارك الله في إنجازك";text="أتممت إتقان المحطات المسجلة. واصل المراجعة الدورية حتى يثبت الحفظ.";}
    else if(day>=88&&day<=90){headline="أيام التثبيت الثلاثة";text="وصلت إلى أيام المراجعة الختامية في الجدول. لا تنس إكمال المحطات التي ما زالت تحتاج إلى تسميع أو إتقان.";}
    else if(day>90){headline="المدة انتهت، والحفظ مستمر";text="انقضى الجدول الزمني، لكن المحطات غير المتقنة لا تسقط. أكمل على وتيرتك وثبّت محفوظك.";}
    else if(day>0){headline="اليوم "+arabicNum(day)+" من رحلتك";text="المحطة المجدولة: "+(day<=87 ? nameOf(day)+" · "+rangeLabel(day) : "أيام المراجعة")+". ويمكنك استكمال أي محطة سابقة.";}
    return '<section class="hero"><div class="kicker">بسم الله الرحمن الرحيم</div><h1>'+esc(headline)+'</h1><p>'+esc(text)+'</p><div class="button-row hero-cta">'+(data.startOn?"":button("ابدأ الخطة من اليوم","start","button-inverse"))+button(finished?"انتقل للمراجعات":"استكمل المحطة "+arabicNum(idx),finished?"openReviews":"jump:"+idx,"button-inverse")+'</div>'+(data.startOn?'<small>بدأت في '+dateLabel(data.startOn)+' · '+(day<=0?'لم تبدأ أيام الخطة بعد':day<=90?'اليوم '+arabicNum(day)+' / ٩٠':'بعد انتهاء التسعين يومًا')+'</small>':'<small>اختر موعد البداية من الإعدادات إن أردت البدء لاحقًا.</small>')+'</section>';
  }
  function home() {
    const current = pendingStation(), done = masteredStations(), due=dueStations(), d=dayNumber();
    const dateNote = data.startOn && d>=1 && d<=87 && current<d ? '<div class="banner warning">يوجد تأخر عن الجدول الزمني. الأولوية لإتقان المحطة المتبقية، وليس لتسجيل الأيام فقط.</div>':"";
    let scheduled = "";
    if(data.startOn && d>=1 && d<=87) scheduled = '<div class="list-row"><div><span class="label">ورد اليوم وفق التقويم</span><strong>'+arabicNum(d)+' · '+esc(nameOf(d))+'</strong><span class="small subtle">'+rangeLabel(d)+'</span></div>'+button("افتح","jump:"+d,"button-outline")+'</div>';
    else if(data.startOn && d>=88 && d<=90) scheduled = '<div class="list-row"><div><span class="label">ورد اليوم وفق التقويم</span><strong>مراجعة اليوم '+arabicNum(d-87)+' من ٣</strong><span class="small subtle">'+(d===88?"محطات ١–٢٩":d===89?"محطات ٣٠–٥٨":"محطات ٥٩–٨٧")+'</span></div>'+button("المراجعات","openReviews","button-outline")+'</div>';
    return '<div class="stack">'+heroContent()+
     '<section><div class="title-row"><h2 class="section-title">حصيلة الحفظ</h2><span class="chip">'+arabicNum(done)+' من ٨٧ محطة متقنة</span></div><div class="grid-3">'+stat(readPages(),"صفحة قرأتها")+stat(memorizedPages(),"صفحة سجلت حفظها")+stat(masteredPages(),"صفحة أتقنتها")+'</div></section>'+
     '<section class="grid-2"><div class="card"><h2 class="section-title">التقدم الحقيقي</h2>'+progressLine("الإتقان",masteredPages(),TOTAL_PAGES)+progressLine("الحفظ الأولي",memorizedPages(),TOTAL_PAGES,"gold")+'<p class="hint" style="margin:17px 0 0">الإتقان لا يُحتسب بمجرد فتح المصحف أو قراءة الصفحات.</p>'+dateNote+'</div>'+
     '<div class="card"><div class="title-row"><h2 class="section-title">المحطة التالية</h2><span class="day-badge">رقم '+arabicNum(current)+'</span></div><div class="station-big"><div><h2>'+esc(nameOf(current))+'</h2><span class="subtle">'+rangeLabel(current)+' · '+arabicNum(pageCount(current))+' صفحات</span></div><div class="station-number">'+arabicNum(current)+'</div></div><div class="eyebrow-row">'+statusChip(entry(current).status)+'<span class="chip gold">سؤال تدبر اختياري</span></div>'+button("فتح المحطة والتسميع","jump:"+current,"button button-primary".replace("button ",""))+'</div></section>'+
     '<section class="grid-2"><div class="card"><div class="title-row"><h2 class="section-title">البرنامج الزمني</h2>'+button("عرض جميع المحطات","openStations","button-outline")+'</div><div class="list-row"><div><span class="label">أيام المحطات</span><strong>١–٨٧</strong></div><span class="chip">٧ صفحات غالبًا</span></div><div class="list-row"><div><span class="label">أيام المراجعة</span><strong>٨٨–٩٠</strong></div><span class="chip gold">٣ أيام</span></div>'+scheduled+'</div>'+
     '<div class="card"><div class="title-row"><h2 class="section-title">المراجعات المستحقة</h2><span class="chip '+(due.length?'gold':'')+'">'+arabicNum(due.length)+' محطة</span></div>'+(due.length?due.slice(0,3).map(r=>'<div class="list-row"><div><strong>'+esc(nameOf(r.id))+'</strong><span class="small subtle">'+rangeLabel(r.id)+' · الاستحقاق '+dateLabel(r.due)+'</span></div>'+button("راجع","jump:"+r.id,"button-outline")+'</div>').join(""):'<p class="subtle small">لا توجد مراجعات مستحقة اليوم. تبدأ المراجعات بعد تسجيل إتقان أول محطة.</p>')+button("فتح جدول المراجعة","openReviews","button-quiet")+'</div></section>'+
     '<div class="tip"><strong>قاعدة عملية:</strong> إذا تعثر الحفظ، أعطِ التسميع والإتقان أولوية على السباق مع الأيام التسعين. هذه خطة مرنة وليست معيارًا إلزاميًا.</div></div>';
  }
  function stationCard(id) {
    const e=entry(id);
    return '<button type="button" class="station-item" data-action="jump:'+id+'"><span class="num">المحطة '+arabicNum(id)+'</span><strong>'+esc(nameOf(id))+'</strong><div class="bottom"><span>'+rangeLabel(id)+'</span>'+statusChip(e.status)+'</div></button>';
  }
  function filteredIds() {
    const q=searchTerm.trim().toLowerCase();
    const results=[];
    for(let id=1;id<=TOTAL_STATIONS;id++){
      const e=entry(id);
      if(listFilter==="unstarted" && (e.status!==0 || e.read))continue;
      if(listFilter==="progress" && !((e.status>0&&e.status<3)||(e.read&&e.status===0)))continue;
      if(listFilter==="mastered"&&e.status!==3)continue;
      if(listFilter==="due"&&!dueStations().some(r=>r.id===id))continue;
      const hay=[nameOf(id),String(id),String(pageStart(id)),String(pageEnd(id))].join(" ").toLowerCase();
      if(q && !hay.includes(q) && !arabicNum(id).includes(q))continue;
      results.push(id);
    }
    return results;
  }
  function listGrid(){const ids=filteredIds();return ids.length?'<div class="station-list">'+ids.map(stationCard).join("")+'</div>':'<div class="empty"><strong>لا توجد محطات مطابقة</strong>جرّب تغيير البحث أو تصفية النتائج.</div>';}
  function stations(){
    return '<div class="page-heading"><p class="kicker">٨٧ محطة · مصحف المدينة ٦٠٤ صفحات</p><h1>فهرس المحطات</h1><p>اختر أي محطة لتسميعها أو تعديل اسمها أو تسجيل تقدمك. كل محطة سبع صفحات متتالية باستثناء الأخيرة.</p></div>'+
      '<label class="field-label" for="searchStations">ابحث بالاسم أو الرقم أو رقم الصفحة</label><div class="searchbar"><input id="searchStations" type="search" autocomplete="off" placeholder="مثال: الإضاءة أو ٤٢" value="'+esc(searchTerm)+'"></div>'+
      '<div class="filters">'+[["all","الكل"],["unstarted","لم أبدأ"],["progress","قيد الحفظ"],["mastered","متقنة"],["due","مراجعة مستحقة"]].map(x=>'<button class="filter-btn '+(listFilter===x[0]?"active":"")+'" type="button" data-action="filter:'+x[0]+'">'+x[1]+'</button>').join("")+'</div>'+
      '<div class="title-row" style="margin-bottom:14px"><span class="small subtle" id="resultCount">'+arabicNum(filteredIds().length)+' محطة</span>'+button("طباعة الفهرس","print","button-outline")+'</div><div id="stationResults">'+listGrid()+'</div>';
  }
  function station(id){
    const e=entry(id), rev=reviewed(id), today=isoToday();
    const prev=id>1?button("السابق","jump:"+(id-1),"button-outline"):"";
    const next=id<TOTAL_STATIONS?button("التالي","jump:"+(id+1),"button-outline"):"";
    const external='https://quran.com/ar/page/'+pageStart(id);
    const endExternal='https://quran.com/ar/page/'+pageEnd(id);
    const steps=[["0","لم أبدأ"],["1","حفظت"],["2","سمّعت"],["3","أتقنت"]].map((it)=>'<button type="button" data-action="status:'+id+':'+it[0]+'" aria-pressed="'+(e.status===Number(it[0])?"true":"false")+'" class="step '+(e.status===Number(it[0])?"active":"")+'">'+it[1]+'</button>').join("");
    const revHTML=e.status===3?'<div class="list-row"><div><strong>المراجعة القادمة: '+dateLabel(rev.due)+'</strong><span class="small subtle">'+rev.next+' · أُنجز '+arabicNum(rev.count)+' مراجعات</span></div>'+button("تمت المراجعة","review:"+id,"button-primary")+'</div>':'<p class="small subtle">سيتفعل جدول مراجعة بعد يوم ثم أسبوع ثم شهر عندما تسجل «أتقنت».</p>';
    return '<div class="page-heading"><div class="button-row">'+button("← فهرس المحطات","openStations","button-outline")+'<span class="chip">المحطة '+arabicNum(id)+' / ٨٧</span></div></div>'+
      '<div class="grid-2"><div class="stack"><div class="card"><div class="detail-head"><div><div class="kicker">المحطة '+arabicNum(id)+' · اليوم '+arabicNum(id)+' من الخطة</div><h2>'+esc(nameOf(id))+'</h2><span class="subtle">'+rangeLabel(id)+' · '+arabicNum(pageCount(id))+' '+(pageCount(id)===2?"صفحتان":"صفحات")+'</span></div><div class="station-number">'+arabicNum(id)+'</div></div><div class="button-row" style="margin-top:18px">'+button("تعديل الاسم وسبب التسمية","edit:"+id,"button-quiet")+'<a class="button button-outline" href="'+external+'" target="_blank" rel="noopener noreferrer">فتح أول صفحة ↗</a><a class="button button-outline" href="'+endExternal+'" target="_blank" rel="noopener noreferrer">آخر صفحة ↗</a></div><p class="hint" style="margin:13px 0 0">فتح المصحف عبر Quran.com يحتاج إلى اتصال بالإنترنت. سجلات الحفظ تعمل محليًا دون إنترنت.</p></div>'+
      '<div class="card"><h2 class="section-title">تقييم المحطة</h2><label class="check-row"><input type="checkbox" data-read="'+id+'" '+(e.read?"checked":"")+'> قرأت صفحات المحطة</label><div class="divider"></div><div class="label" style="margin-bottom:10px">مرحلة الحفظ والتسميع والإتقان</div><div class="step-grid">'+steps+'</div><p class="hint" style="margin:13px 0 0">اختر المرحلة التي أنجزتها فعليًا؛ يمكن تعديلها لاحقًا دون فقد ملاحظاتك.</p></div></div>'+
      '<div class="stack"><div class="card"><h2 class="section-title">مفتاح التذكر والتدبر</h2>'+
      '<div class="detail-text question"><div class="label">سؤال تدبر يساعد على الحفظ</div><p>'+esc(questionOf(id) || "سؤال التدبر معطّل لهذه المحطة. يمكنك إضافته من زر تخصيص المحطة.")+'</p>'+
      '<div class="divider"></div><div class="label">ملاحظة سؤال التدبر · '+(personalReason(id)?"سبب اختيارك للاسم":userChangedName(id)?"سبب الاسم المقترح «"+esc(NAMES[id-1])+"»":"سبب اختيار اسم «"+esc(NAMES[id-1])+"»")+'</div><p>'+esc(reasonOf(id))+'</p>'+
      '<a class="verse-source" href="https://quran.com/ar/'+esc(anchorOf(id).replace(":","/"))+'" target="_blank" rel="noopener noreferrer">الآية المرجعية: '+esc(anchorLabel(id))+' ↗</a>'+
      (userChangedName(id)&&!personalReason(id)?'<p class="hint">غيّرت اسم المحطة؛ هذا السبب يشرح الاسم المقترح فقط. يمكنك إدخال سبب اسمك الخاص من زر التعديل.</p>':'')+
      '<p class="hint">الاسم للتذكر والتدبر، وليس اسمًا بديلًا للسورة أو تفسيرًا شاملًا لجميع الآيات.</p></div><label class="field-label" for="stationNotes">ملاحظاتي على الحفظ والمواضع المتشابهة</label><textarea id="stationNotes" class="mini-notes" rows="5" maxlength="3000" placeholder="مثال: بداية الصفحة الرابعة، أو آية تتشابه مع موضع سابق...">'+esc(e.note)+'</textarea>'+button("حفظ الملاحظة","saveNotes:"+id,"button-primary")+'</div>'+
      '<div class="card"><h2 class="section-title">المراجعة المتباعدة</h2>'+revHTML+'</div><div class="card"><div class="title-row"><h2 class="section-title">التنقل</h2><span class="chip gold">'+arabicNum(Math.round(id/TOTAL_STATIONS*100))+'٪ من ترتيب المصحف</span></div><div class="button-row">'+prev+next+'</div></div></div></div>';
  }
  function reviews(){
    const today=isoToday(), pending=dueStations(), upcoming=[];
    for(let id=1;id<=TOTAL_STATIONS;id++){const r=reviewed(id);if(r&&r.due>today)upcoming.push({id,...r});}
    upcoming.sort((a,b)=>a.due.localeCompare(b.due));
    const revRow=(r,overdue)=>'<div class="list-row"><div><div class="eyebrow-row"><strong>'+esc(nameOf(r.id))+'</strong>'+(overdue?'<span class="chip gold">مستحقة</span>':'')+'</div><span class="small subtle">'+rangeLabel(r.id)+' · '+dateLabel(r.due)+' · '+r.next+'</span></div><div class="button-row">'+button("فتح","jump:"+r.id,"button-outline")+(overdue?button("راجعت","review:"+r.id,"button-primary"):"")+'</div></div>';
    return '<div class="page-heading"><p class="kicker">التثبيت أساس الإتقان</p><h1>مراجعات الحفظ</h1><p>بعد تسجيل «أتقنت» تبدأ المراجعة بعد يوم، ثم بعد سبعة أيام من المراجعة السابقة، ثم بعد ثلاثين يومًا، وبعدها شهريًا. لا تُسجل مراجعة لم تقم بها.</p></div>'+
      '<div class="grid-3" style="margin-bottom:20px">'+stat(pending.length,"مراجعة مستحقة")+stat(upcoming.length,"مراجعة قادمة")+stat(masteredStations(),"محطة متقنة")+'</div>'+
      '<div class="grid-2"><div class="card"><h2 class="section-title">المستحقة الآن</h2>'+(pending.length?pending.map(r=>revRow(r,true)).join(""):'<div class="empty"><strong>لا توجد مراجعات مستحقة</strong>أحسنت. راجع ما حفظته ولو لم يظهر هنا تنبيه.</div>')+'</div><div class="card"><h2 class="section-title">القادمة</h2>'+(upcoming.length?upcoming.slice(0,25).map(r=>revRow(r,false)).join(""):'<div class="empty"><strong>لا توجد مواعيد قادمة</strong>سيظهر الموعد بعد إتقان محطة.</div>')+'</div></div>'+
      '<div class="tip" style="margin-top:18px"><strong>أيام ٨٨–٩٠:</strong> مراجعة عامة للمحطات ١–٢٩، ثم ٣٠–٥٨، ثم ٥٩–٨٧. هذا تقسيم تنظيمي كثيف؛ إن احتاج الحفظ وقتًا أطول فمدّد المراجعة.</div>';
  }
  function settings(){
    return '<div class="page-heading"><p class="kicker">بياناتك تحت سيطرتك</p><h1>إعدادات الخطة</h1><p>البيانات محفوظة في هذا المتصفح على هذا الجهاز. لا حساب، لا مزامنة تلقائية، ولا تعديل لبرنامج القرآن القديم.</p></div><div class="grid-2"><div class="card">'+
     '<div class="setting-block"><h3>موعد البداية</h3><p class="hint">يمكن تغييره دون مسح ما حفظته؛ تتغير فقط التواريخ المجدولة.</p><form id="dateForm" class="date-row"><div class="field-wrap"><label class="field-label" for="startDate">تاريخ اليوم الأول</label><input type="date" id="startDate" value="'+esc(data.startOn)+'"></div><button class="button button-primary" type="submit">حفظ التاريخ</button></form></div>'+
     '<div class="setting-block"><h3>إضافة الخطة إلى التقويم</h3><p class="hint">ملف تقويم ICS يضم ٩٠ يومًا. التنبيه يُضبط في تطبيق التقويم بعد الاستيراد بحسب دعمه.</p><label class="field-label" for="calendarTime">وقت جلسة الحفظ اليومي</label><input id="calendarTime" type="time" value="'+esc(data.calendarTime)+'"><div class="button-row">'+button("تحديث الوقت","saveTime","button-quiet")+button("تصدير خطة التقويم","calendar","button-outline")+'</div></div>'+
     '<div class="setting-block"><h3>المظهر</h3><p class="hint">التبديل بين الوضعين الفاتح والداكن.</p>'+button("تبديل الوضع الليلي / النهاري","theme","button-outline")+'</div></div><div class="card">'+
     '<div class="setting-block"><h3>النسخة الاحتياطية</h3><p class="hint">النسخة الاحتياطية تشمل الأسماء المخصصة وسجلات القراءة والحفظ والتسميع والإتقان والملاحظات والمراجعة والتاريخ. احتفظ بها خارج المتصفح.</p><div class="button-row">'+button("تنزيل نسخة JSON","export","button-primary")+'<label class="button button-outline" for="backupFile" role="button">استيراد نسخة</label><input type="file" id="backupFile" accept="application/json,.json" hidden></div></div>'+
     '<div class="setting-block"><h3>الطباعة</h3><p class="hint">لعرض قائمة جميع المحطات، اختر الفهرس ثم «طباعة الفهرس».</p>'+button("الانتقال للفهرس","openStations","button-outline")+'</div>'+
     '<div class="setting-block"><h3>مسح بيانات التطبيق</h3><p class="hint">يمسح تقدم هذا المتصفح فقط بعد التأكيد. لا يؤثر على المستودع أو أي تطبيق آخر.</p>'+button("مسح سجلاتي من هذا الجهاز","reset","button-danger")+'</div></div></div>'+
     '<div class="banner"><strong>مهم:</strong> حذف بيانات الموقع أو تغيير المتصفح قد يفقد تقدمك. صدّر النسخة الاحتياطية بانتظام. الروابط إلى المصحف تحتاج إنترنت، أما تسجيل المحطات والمراجعات فيعمل دون اتصال بعد تحميل التطبيق.</div>';
  }
  function render(){
    const r=route();
    app.innerHTML=r.view==="home"?home():r.view==="stations"?stations():r.view==="station"?station(r.id):r.view==="reviews"?reviews():settings();
    document.documentElement.dataset.theme=data.theme;
    const themeButton=$("#themeButton");themeButton.textContent=data.theme==="dark"?"☼":"☾";
    document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.view === (r.view==="station"?"stations":r.view)));
    document.title=(r.view==="station"?nameOf(r.id)+" | ":"")+"المحطات القرآنية";
  }
  function setStatus(id,level){
    if(level<0||level>3)return;
    const e=entry(id), old=e.status;e.status=level;
    if(level===3&&old!==3){e.masteredAt=isoToday();e.reviews=[];}
    if(level!==3){e.masteredAt="";e.reviews=[];}
    save();render();
    notify(level===3?"تم تسجيل إتقان المحطة. بارك الله فيك.":"حُدثت مرحلة المحطة إلى: "+statusLabel(level));
  }
  function markReview(id){
    const e=entry(id), r=reviewed(id);
    if(!r)return notify("أتقن المحطة أولًا لتفعيل المراجعة.");
    if(!confirm("هل راجعت محطة «"+nameOf(id)+"» بالفعل اليوم؟"))return;
    e.reviews.push(isoToday());save();render();notify("تم تسجيل المراجعة التالية.");
  }
  function openEditor(id){
    editingId=id;$("#stationName").value=nameOf(id);$("#stationQuestion").value=questionOf(id);$("#stationReason").value=personalReason(id);
    const dialog=$("#editDialog");if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
    $("#stationName").focus();
  }
  function closeEditor(){const dialog=$("#editDialog");if(dialog.open&&typeof dialog.close==="function")dialog.close();else dialog.removeAttribute("open");}
  function download(name,text,mime) {
    const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function calendar(){
    if(!data.startOn)return notify("حدد تاريخ بداية الخطة أولًا.");
    const text=(s)=>String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
    const time=data.calendarTime.replace(":","")+"00";
    let h=Number(data.calendarTime.slice(0,2)),m=Number(data.calendarTime.slice(3,5));const endH=pad((h+Math.floor((m+30)/60))%24),endM=pad((m+30)%60);
    let lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Quran Stations//AR","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:المحطات القرآنية"];
    for(let i=1;i<=TOTAL_DAYS;i++){
      const eventDate=addDays(data.startOn,i-1),date=eventDate.replaceAll("-"),endDate=addDays(eventDate,h===23&&m>=30?1:0).replaceAll("-");
      const title=i<=TOTAL_STATIONS?"محطة "+arabicNum(i)+" - "+nameOf(i):"مراجعة شاملة - اليوم "+arabicNum(i-TOTAL_STATIONS);
      const detail=i<=TOTAL_STATIONS?rangeLabel(i)+" - حفظ وتسميع وإتقان":"مراجعة الجزء "+arabicNum(i-TOTAL_STATIONS)+" من ٣";
      lines.push("BEGIN:VEVENT","UID:quran-station-"+i+"-"+data.startOn+"@quran-stations","DTSTAMP:"+isoToday().replaceAll("-","")+"T090000Z",
        "DTSTART:"+date+"T"+time,"DTEND:"+endDate+"T"+endH+endM+"00","SUMMARY:"+text(title),"DESCRIPTION:"+text(detail),
        "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+text(title),"TRIGGER:-PT30M","END:VALARM","END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    download("quran-stations-90-days.ics",lines.join("\r\n"),"text/calendar;charset=utf-8");notify("تم إعداد ملف التقويم. افتحه في تطبيق تقويم يدعم ICS.");
  }
  async function importBackup(file) {
    if(!file)return;
    if(file.size>1024*1024){notify("الملف كبير بصورة غير معتادة.");return;}
    try {
      const candidate=JSON.parse(await file.text());
      if(!candidate||candidate.version!==1||!candidate.entries||!candidate.custom)throw Error("تنسيق غير مطابق");
      const parsed=cleanData(candidate);
      if(!confirm("سيتم استبدال بيانات هذا المتصفح بالبيانات المستوردة. هل تريد المتابعة؟"))return;
      data=parsed;save();go("home");render();notify("استُعيدت النسخة الاحتياطية بنجاح.");
    }catch(e){notify("فشل الاستيراد: ملف غير صالح أو غير متوافق.");}
    finally {const fileInput=$("#backupFile");if(fileInput)fileInput.value="";}
  }
  document.addEventListener("click",function (event){
    const nav=event.target.closest("[data-view]");if(nav){go(nav.dataset.view);return;}
    const btn=event.target.closest("[data-action]");if(!btn)return;
    const action=btn.dataset.action;
    if(action==="theme"){data.theme=data.theme==="dark"?"light":"dark";save();render();return;}
    if(action==="start"){if(data.startOn&&!confirm("هل تريد إعادة بداية الخطة إلى اليوم؟"))return;data.startOn=isoToday();save();render();notify("بدأت الخطة من اليوم.");return;}
    if(action==="openStations"){go("stations");return;}
    if(action==="openReviews"){go("reviews");return;}
    if(action==="print"){window.print();return;}
    if(action==="closeEditor"){closeEditor();return;}
    if(action==="restoreDefault"){$("#stationName").value=NAMES[editingId-1];$("#stationQuestion").value=defaultQuestion(editingId);$("#stationReason").value="";return;}
    if(action==="export"){download("quran-stations-backup-"+isoToday()+".json",JSON.stringify(data,null,2),"application/json;charset=utf-8");notify("تم تنزيل النسخة الاحتياطية.");return;}
    if(action==="calendar"){calendar();return;}
    if(action==="saveTime"){const time=$("#calendarTime").value;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return notify("الوقت غير صالح.");data.calendarTime=time;save();notify("تم تحديث وقت التقويم.");return;}
    if(action==="reset"){
      if(!confirm("تحذير: سيمسح هذا جميع أسماء المحطات المخصصة وتقدم الحفظ والمراجعة والملاحظات. هل تريد المتابعة؟"))return;
      if(!confirm("تأكيد أخير: هل نبدأ ببيانات فارغة؟"))return;
      const theme=data.theme;data=defaultData();data.theme=theme;save();go("home");render();notify("تم مسح البيانات المحلية فقط.");return;
    }
    if(action.startsWith("filter:")){listFilter=action.split(":")[1];render();return;}
    if(action.startsWith("jump:")){go("station",Number(action.split(":")[1]));return;}
    if(action.startsWith("edit:")){openEditor(Number(action.split(":")[1]));return;}
    if(action.startsWith("review:")){markReview(Number(action.split(":")[1]));return;}
    if(action.startsWith("status:")){const parts=action.split(":");setStatus(Number(parts[1]),Number(parts[2]));return;}
    if(action.startsWith("saveNotes:")){const id=Number(action.split(":")[1]);entry(id).note=$("#stationNotes").value.slice(0,3000);save();notify("حُفظت ملاحظات المحطة على هذا الجهاز.");return;}
  });
  document.addEventListener("change",function(e){
    if(e.target.matches("[data-read]")){const id=Number(e.target.dataset.read);entry(id).read=e.target.checked;save();render();notify("تحدث سجل القراءة.");}
    if(e.target.id==="backupFile")importBackup(e.target.files[0]);
  });
  document.addEventListener("input",function(e){
    if(e.target.id==="searchStations"){searchTerm=e.target.value;$("#stationResults").innerHTML=listGrid();$("#resultCount").textContent=arabicNum(filteredIds().length)+" محطة";}
  });
  document.addEventListener("submit",function(e){
    if(e.target.id==="editForm"){
      e.preventDefault();const name=$("#stationName").value.trim(),question=$("#stationQuestion").value.trim(),reason=$("#stationReason").value.trim();
      if(!name){notify("أدخل اسم المحطة.");return;}
      data.custom[editingId]={name,question,reason};save();closeEditor();render();notify("تم حفظ الاسم وسبب التسمية وسؤال التدبر.");return;
    }
    if(e.target.id==="dateForm"){
      e.preventDefault();const value=$("#startDate").value;
      if(value && !validISO(value))return notify("تاريخ غير صالح.");
      data.startOn=value;save();render();notify("تم تحديث موعد بداية الخطة.");return;
    }
  });
  window.addEventListener("hashchange",render);
  render();
  if("serviceWorker" in navigator && location.protocol==="https:")window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
})();