"use strict";
/* A separate Qur'an reader, modeled after the user's Quran_V14 APK.
   Text and QCF4 fonts are obtained from the public QCF4 source, never regenerated. */
window.QuranStationsReader = (() => {
  const KEY="quran-stations-reader-v1", DB="QuranStationsMushafV1", FONT_CACHE="quran-stations-fonts-v1";
  const PAGE_BASE="https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/main/pages/";
  const FONT_BASE="https://cdn.jsdelivr.net/gh/MohamadHajjRabee/quran-qcf4@main/fonts-woff2/";
  const TOTAL=604, MAX_SAVED=150;
  const $=sel=>document.querySelector(sel);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const arabic=n=>String(n).replace(/\d/g,n=>"٠١٢٣٤٥٦٧٨٩"[Number(n)]);
  const clamp=n=>Math.max(1,Math.min(TOTAL,Number(n)||1));
  const pad=n=>String(n).padStart(3,"0");
  const validMode=x=>x==="spread"?"spread":"single";
  const clean=x=>{
    const base={page:1,mode:"single",color:"",marks:{},similars:[],bookmarks:[]};
    if(!x||typeof x!=="object")return base;
    base.page=clamp(x.page);base.mode=validMode(x.mode);
    base.color=["","yellow","green","blue","pink","erase"].includes(x.color)?x.color:"";
    if(x.marks&&typeof x.marks==="object")for(const [k,v] of Object.entries(x.marks)){
      if(/^\d{1,3}:\d{1,2}:\d{1,3}$/.test(k)&&["yellow","green","blue","pink"].includes(v))base.marks[k]=v;
    }
    if(Array.isArray(x.similars))base.similars=x.similars.slice(0,MAX_SAVED).filter(item=>item&&/^\d{1,3}:\d{1,3}$/.test(item.first)&&/^\d{1,3}:\d{1,3}$/.test(item.second)).map(item=>({
      first:item.first,second:item.second,text:String(item.text||"").slice(0,260),other:String(item.other||"").slice(0,260),
      note:String(item.note||"").slice(0,400),firstPage:clamp(item.firstPage),secondPage:clamp(item.secondPage)
    }));
    if(Array.isArray(x.bookmarks))base.bookmarks=[...new Set(x.bookmarks.filter(n=>Number.isInteger(n)&&n>=1&&n<=604))].slice(0,100);
    return base;
  };
  let state=clean((()=>{try{return JSON.parse(localStorage.getItem(KEY));}catch{return null}})());
  const memo=new Map(),pending=new Map(),fontPromises=new Map();
  let currentToken=0,selected=null,shown=new Map(),matches=[],downloading=false,cancelDownload=false,turnDirection="";
  const notify=s=>{const box=$("#toast");if(box){box.textContent=s;box.classList.add("show");setTimeout(()=>box.classList.remove("show"),2800);}};
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{notify("تعذّر حفظ علامات المصحف؛ صدّر نسخة احتياطية.");}}
  const backup=()=>JSON.parse(JSON.stringify(state));
  function restore(v){state=clean(v);save();}
  function openDB(){return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window))return reject(Error("IndexedDB not supported"));
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("pages"))request.result.createObjectStore("pages");};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });}
  async function dbGet(key){
    try{const db=await openDB();return await new Promise(resolve=>{
      const tx=db.transaction("pages","readonly"),q=tx.objectStore("pages").get(key);
      q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>resolve(null);tx.oncomplete=()=>db.close();tx.onerror=()=>db.close();
    });}catch{return null;}
  }
  async function dbPut(key,value){
    try{const db=await openDB();return await new Promise(resolve=>{
      const tx=db.transaction("pages","readwrite");tx.objectStore("pages").put(value,key);
      tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{db.close();resolve(false)};
    });}catch{return false;}
  }
  async function allCached(){
    try{const db=await openDB();return await new Promise(resolve=>{
      const tx=db.transaction("pages"),request=tx.objectStore("pages").getAll();
      request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([]);
      tx.oncomplete=()=>db.close();tx.onerror=()=>db.close();
    });}catch{return [];}
  }
  function validatePage(x,n) {
    return x&&x.page===n&&Array.isArray(x.lines)&&x.lines.length>0&&x.lines.every(line=>Array.isArray(line.words));
  }
  async function getPage(n){
    n=clamp(n);if(memo.has(n))return memo.get(n);if(pending.has(n))return pending.get(n);
    const work=(async()=>{
      let cached=await dbGet(n);if(validatePage(cached,n)){memo.set(n,cached);return cached;}
      const url=PAGE_BASE+pad(n)+".json",r=await fetch(url,{mode:"cors"});
      if(!r.ok)throw Error("تعذر تحميل صفحة "+n);
      const data=await r.json();if(!validatePage(data,n))throw Error("بيانات صفحة غير صالحة");
      memo.set(n,data);await dbPut(n,data);return data;
    })();
    pending.set(n,work);try{return await work;}finally{pending.delete(n);}
  }
  function fontURL(name){return FONT_BASE+(name==="QCF4_QBSML"?"QCF4_QBSML.woff2":name+"_W.woff2");}
  async function loadFont(name){
    if(fontPromises.has(name))return fontPromises.get(name);
    const promise=(async()=>{
      if(!/^QCF4_(?:QBSML|Hafs_\d{2})$/.test(name))throw Error("اسم خط غير معروف");
      const url=fontURL(name);let response;
      try{
        if("caches" in window){const cache=await caches.open(FONT_CACHE);response=await cache.match(url);}
        if(!response){response=await fetch(url,{mode:"cors"});if(!response.ok)throw Error("font download");
          if("caches" in window){try{const cache=await caches.open(FONT_CACHE);await cache.put(url,response.clone());}catch{}}
        }
        const buffer=await response.arrayBuffer();if(!buffer.byteLength)throw Error("font empty");
        const face=new FontFace(name,buffer);await face.load();document.fonts.add(face);return true;
      }catch(e){fontPromises.delete(name);throw Error("تعذّر تحميل خط المصحف "+name);}
    })();
    fontPromises.set(name,promise);return promise;
  }
  function pageNumbers(){
    let p=state.page;
    if(state.mode==="spread"){
      // In the right-to-left Arabic book, the lower number occupies the RIGHT leaf.
      // Group [1,2], [3,4], ... so next spread increases by two pages.
      p=(p%2===0)?p-1:p;
      return [p,Math.min(TOTAL,p+1)];
    }
    return [p];
  }
  function spreadStart(n){const p=clamp(n);return p%2===0?p-1:p;}
  const stationOf=n=>Math.min(87,Math.floor((n-1)/7)+1);
  // Leaf turns change the reader only: do NOT replace #app, change scroll or trigger hashchange.
  function replacePageAddress(){
    const target="#mushaf/"+state.page;
    if(location.hash===target)return;
    try{window.history.replaceState(window.history.state,"",target);}
    catch{location.hash=target;}
  }
  function syncNav(){
    const pages=pageNumbers(),counter=$("#readerCounter"),input=$("#readerPage");
    if(counter)counter.textContent="الصفحة "+pages.map(arabic).join("–")+" من ٦٠٤";
    if(input)input.value=String(state.page);
    const prevBtn=document.querySelector('[data-reader="prev"]'),nextBtn=document.querySelector('[data-reader="next"]');
    if(prevBtn)prevBtn.disabled=state.page<=1;
    if(nextBtn)nextBtn.disabled=Math.max(...pages)>=604;
  }
  function pageJump(n){
    state.page=state.mode==="spread"?spreadStart(clamp(n)):clamp(n);
    save();replacePageAddress();syncNav();mount();
  }
  function showTools(open){
    const panel=$("#readerToolbox"),toggle=$("#readerToolsToggle");
    if(panel)panel.hidden=!open;
    if(toggle){toggle.setAttribute("aria-expanded",String(open));toggle.setAttribute("aria-label",open?"إخفاء أدوات المصحف":"إظهار أدوات المصحف");}
  }
  function next(){turnDirection="forward";pageJump(Math.min(604,state.page+(state.mode==="spread"?2:1)));}
  function prev(){turnDirection="back";pageJump(Math.max(1,state.page-(state.mode==="spread"?2:1)));}
  function view(){
    const deep=location.hash.match(/^#mushaf\/(\d{1,3})$/);
    if(deep){state.page=clamp(Number(deep[1]));if(state.mode==="spread")state.page=spreadStart(state.page);save();}
    const pages=pageNumbers(),isDouble=state.mode==="spread";
    return '<div class="reader-screen" id="readerScreen">'+
      '<div class="reader-toolbar card flat">'+
      '<div class="reader-nav-row"><button class="reader-action reader-exit" type="button" data-reader="exit" title="الخروج من المصحف" aria-label="الخروج إلى المحطات">↩</button><button class="button button-outline" type="button" data-reader="prev" '+(state.page<=1?'disabled':'')+'>السابقة <span aria-hidden="true">→</span></button>'+
      '<div class="reader-counter" id="readerCounter">الصفحة '+pages.map(arabic).join("–")+' من ٦٠٤</div>'+
      '<button class="button button-primary" type="button" data-reader="next" '+(Math.max(...pages)>=604?'disabled':'')+'><span aria-hidden="true">←</span> التالية</button><button class="reader-action reader-toggle" type="button" data-reader="toolsToggle" id="readerToolsToggle" aria-label="إظهار أدوات المصحف" aria-expanded="false">☷</button></div>'+
      '<div class="reader-toolbox" id="readerToolbox" hidden><div class="reader-tools">'+
      '<div class="reader-modes" role="group" aria-label="طريقة عرض المصحف"><button class="reader-mode '+(!isDouble?'active':'')+'" type="button" data-reader="mode:single">صفحة واحدة</button><button class="reader-mode '+(isDouble?'active':'')+'" type="button" data-reader="mode:spread">صفحتان متقابلتان</button></div>'+
      '<div class="reader-jump"><label for="readerPage">الصفحة</label><input id="readerPage" type="number" inputmode="numeric" min="1" max="604" value="'+state.page+'"><button type="button" class="button button-primary" data-reader="jump">انتقال</button></div>'+
      '<button type="button" class="button button-outline" data-reader="station">محطة هذه الصفحة</button><button type="button" class="button button-quiet" data-reader="extras">المتشابهات وتنزيل الصفحات</button></div>'+
      '<div class="reader-colors"><strong>العلامات الشفافة:</strong>'+
      [['',"اختيار آية"],["yellow","أصفر"],["green","أخضر"],["blue","أزرق"],["pink","وردي"],["erase","محو"]].map(([v,label])=>'<button type="button" class="reader-color '+(state.color===v?'active':'')+' '+(v||'normal')+'" data-reader="color:'+v+'" aria-pressed="'+(state.color===v)+'">'+label+'</button>').join("")+
      '<button type="button" class="button button-quiet reader-bookmark" data-reader="bookmark">☆ حفظ موضع القراءة</button></div>'+
      '<div class="reader-note">للتقدم: <b>اسحب من اليمين إلى اليسار</b>، وللرجوع اسحب بالعكس. وفي وضع الصفحتين تظهر الصفحة الأقل رقمًا على <b>اليمين</b>.</div>'+ 
      '<div class="reader-bookmarks" id="readerBookmarks">'+bookmarksHTML()+'</div></div></div>'+
      '<div class="reader-book '+(isDouble?'reader-spread':'reader-single')+'" id="readerBook" aria-live="polite" aria-label="صفحات المصحف" dir="rtl"><div class="reader-loading">جارٍ تحميل الصفحات مع الخط الأصلي للمصحف...</div></div>'+
      '</div><div class="reader-extras" id="readerExtras">'+
      '<section class="card reader-selection" id="readerSelection" hidden></section>'+
      '<section class="card reader-similar"><div class="title-row"><h2 class="section-title">المتشابهات والمواضع</h2><span class="chip">'+arabic(state.similars.length)+' محفوظة</span></div><div id="readerSimilarSaved">'+savedHTML()+'</div></section>'+
      '<section class="card reader-offline"><h2 class="section-title">القراءة دون إنترنت</h2><p class="hint">الصفحات التي فتحتها تُحفظ محليًا. يمكنك تنزيل صفحات المصحف والخطوط كاملة مسبقًا، ويستغرق ذلك حسب الاتصال. لا تتضمن العلامات أي تعديل على نص القرآن.</p><div class="button-row">'+
      '<button type="button" class="button button-outline" data-reader="download" id="readerDownload">تنزيل المصحف كاملًا للاستخدام دون إنترنت</button>'+
      '<button type="button" class="button button-danger" data-reader="stop" id="readerStop" hidden>إيقاف التنزيل</button></div><p class="hint" role="status" id="readerDownloadStatus"></p>'+
      '<div class="reader-credits">مصدر صفحات المصحف وخط QCF4: <a href="https://github.com/MohamadHajjRabee/quran-qcf4" rel="noopener noreferrer" target="_blank">QCF4 / مصحف المدينة ١٤٤١هـ</a>؛ البيانات JSON بترخيص MIT، والخطوط للاستخدام في عرض القرآن. يحتاج التنزيل الأول إلى الإنترنت.</div></section>'+ '</div>';
  }
  function bookmarksHTML(){
    if(!state.bookmarks.length)return '<span class="hint">مواضع محفوظة: لا يوجد</span>';
    return '<span class="hint">مواضع محفوظة:</span> '+state.bookmarks.slice(-15).map(n=>
      '<button type="button" class="reader-bookmark-link" data-reader="goBookmark:'+n+'">ص '+arabic(n)+'</button>'
    ).join(" ")+
      '<button type="button" class="reader-bookmark-link" data-reader="clearBookmarks">حذف المواضع</button>';
  }
  function savedHTML(){
    if(!state.similars.length)return '<p class="hint">اختر آية داخل المصحف ثم اضغط «البحث عن متشابهاتها» ثم «حفظ المقارنة». ستظهر المقارنات هنا.</p>';
    return state.similars.slice(0,40).map((x,i)=>'<div class="reader-saved-item"><div><b>'+esc(x.first)+' ↔ '+esc(x.second)+'</b><p>'+esc(x.text)+'<span class="reader-vs"> ↔ </span>'+esc(x.other)+'</p>'+(x.note?'<p class="hint">'+esc(x.note)+'</p>':'')+'</div><div class="button-row"><button class="button button-outline" data-reader="savedPage:'+i+'">فتح</button><button class="button button-danger" data-reader="editSimilar:'+i+'">ملاحظة</button><button class="button button-danger" data-reader="deleteSimilar:'+i+'">حذف</button></div></div>').join("");
  }
  function wordMarkup(w,p,li,wi){
    const id=p+":"+li+":"+wi;
    const isWord=w.type==="word", font=/^QCF4_(?:QBSML|Hafs_\d{2})$/.test(w.font||"")?w.font:"QCF4_QBSML";
    const cls=w.type==="surah_header"?"reader-surah":w.type==="bismillah"?"reader-bismillah":w.type==="quarter"?"reader-quarter":"reader-word";
    return '<span class="'+cls+(isWord?' reader-clickable':'')+'" data-word-id="'+id+'" data-verse="'+esc(w.verse_key||"")+'" data-text="'+esc(w.text||"")+'"'+(state.marks[id]?' data-mark="'+state.marks[id]+'"':'')+' style="font-family:'+font+'">'+esc(w.char||"")+'</span>';
  }
  function sheetMarkup(p,d){
    return '<article class="reader-sheet" data-page="'+p+'"><div class="reader-page-label">'+(d.surahs||[]).map(s=>esc(s.name_arabic||"")).join(" · ")+'</div>'+
      '<div class="reader-lines">'+d.lines.map((l,li)=>'<div class="reader-line"><div class="reader-line-inner">'+l.words.map((w,wi)=>wordMarkup(w,p,li,wi)).join("")+'</div></div>').join("")+'</div>'+
      '<div class="reader-page-footer">'+arabic(p)+'</div></article>';
  }
  async function mount(){
    const book=$("#readerBook");if(!book)return;
    const token=++currentToken,pages=pageNumbers();shown.clear();selected=null;const pane=$("#readerSelection");if(pane)pane.hidden=true;
    book.innerHTML='<div class="reader-loading">جارٍ تحميل صفحات المصحف...</div>';
    try{
      const data=await Promise.all(pages.map(getPage));
      if(token!==currentToken||!$("#readerBook"))return;
      const names=[...new Set(data.flatMap(x=>x.lines.flatMap(l=>l.words.map(w=>w.font))).filter(Boolean))];
      await Promise.all(names.map(loadFont));
      if(token!==currentToken||!$("#readerBook"))return;
      data.forEach((d,i)=>shown.set(pages[i],d));
      book.innerHTML=data.map((d,i)=>sheetMarkup(pages[i],d)).join("");
      book.classList.remove("reader-turn-forward","reader-turn-back");
      if(turnDirection)book.classList.add(turnDirection==="forward"?"reader-turn-forward":"reader-turn-back");turnDirection="";
      await document.fonts.ready;
      if(token!==currentToken||!$("#readerBook"))return;
      fitLines();
    }catch(e){
      if(token!==currentToken||!$("#readerBook"))return;
      book.innerHTML='<div class="reader-loading reader-error"><b>تعذر عرض صفحة المصحف بدقة.</b><p>'+esc(e.message||"اتصل بالإنترنت وحاول مجددًا.")+'</p><button type="button" class="button button-outline" data-reader="retry">إعادة المحاولة</button><p class="hint">لن أستبدل نص المصحف بتخمين أو صفحات غير مطابقة.</p></div>';
    }
  }
  function fitLines(){
    document.querySelectorAll("#readerBook .reader-line").forEach(row=>{
      const inner=row.querySelector(".reader-line-inner");if(!inner)return;
      inner.style.transform="none";
      const available=row.clientWidth-4,width=inner.scrollWidth,scale=Math.min(1,available/Math.max(1,width));
      inner.style.transform="scale("+scale+")";
    });
  }
  function normalize(t){return String(t||"").normalize("NFKC").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,"").replace(/[إأآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^ء-ي ]/g," ").replace(/\s+/g," ").trim();}
  const collect=(d)=>{const verses=new Map();d.lines.forEach(line=>line.words.forEach(w=>{
    if(w.verse_key&&w.type==="word")verses.set(w.verse_key,(verses.get(w.verse_key)||[]).concat(w.text||""));
  }));return verses;};
  function label(k){const parts=k.split(":").map(Number);const name=window.QURAN_SURAH_NAMES?.[parts[0]-1]||"سورة "+arabic(parts[0]);return name+"، آية "+arabic(parts[1]);}
  function selectVerse(k,p){
    selected={key:k,page:p,text:""};
    const parts=[];
    for(const d of shown.values()){const map=collect(d);if(map.has(k))parts.push(...map.get(k));}
    selected.text=parts.join(" ");
    document.querySelectorAll("#readerBook [data-verse]").forEach(x=>x.classList.toggle("reader-selected",x.dataset.verse===k));
    const panel=$("#readerSelection");if(!panel)return;
    panel.hidden=false;
    panel.innerHTML='<div class="title-row"><h2 class="section-title">'+esc(label(k))+'</h2><button type="button" class="button button-outline" data-reader="closeSelection">إغلاق</button></div><p class="reader-verse-text">'+esc(selected.text)+'</p>'+
      '<div class="button-row"><button type="button" class="button button-primary" data-reader="searchSimilar">البحث عن متشابهات الآية</button><button type="button" class="button button-outline" data-reader="copyVerse">نسخ النص</button></div><p class="hint">قد تمتد الآية إلى صفحة غير معروضة؛ البحث الكامل يتحسن بعد تنزيل المصحف كله.</p><div id="readerMatches"></div>';
  }
  function score(a,b){
    const x=normalize(a).split(" ").filter(Boolean),y=normalize(b).split(" ").filter(Boolean);if(x.length<2||y.length<2)return 0;
    const bag=new Set(y);const common=x.filter(z=>bag.has(z)).length;
    const bi=arr=>arr.slice(0,-1).map((v,i)=>v+" "+arr[i+1]);
    const pairs=new Set(bi(y));const consecutive=bi(x).filter(z=>pairs.has(z)).length;
    return Math.min(100,common/Math.max(x.length,y.length)*65+consecutive/Math.max(1,x.length-1)*35);
  }
  async function findSimilar(){
    const panel=$("#readerMatches");if(!panel||!selected)return;
    panel.innerHTML='<p class="hint">جارٍ البحث في صفحات المصحف التي نزلتها...</p>';
    const cache=await allCached(),data=new Map(cache.map(d=>[d.page,d]));
    for(const [p,d] of shown)data.set(p,d);
    const vers=new Map();
    for(const [p,d] of [...data].sort((a,b)=>a[0]-b[0])){
      for(const [k,words] of collect(d)){
        const v=vers.get(k)||{key:k,page:p,text:""};
        v.text+=(v.text?" ":"")+words.join(" ");vers.set(k,v);
      }
    }
    const base=vers.get(selected.key);
    if(!base){panel.innerHTML='<p class="hint">تعذّر العثور على الآية المختارة.</p>';return;}
    selected.text=base.text;
    matches=[...vers.values()].filter(x=>x.key!==selected.key).map(x=>({...x,score:score(base.text,x.text)}))
      .filter(x=>x.score>=28).sort((a,b)=>b.score-a.score).slice(0,30);
    panel.innerHTML='<p class="hint">تم البحث في '+arabic(data.size)+' من ٦٠٤ صفحة محفوظة. درجات التشابه تقديرية وليست تفسيرًا، والنتائج غير شاملة حتى تنزيل المصحف كاملًا.</p>'+
    (matches.length?matches.map((x,i)=>'<div class="reader-match"><b>'+esc(label(x.key))+' · صفحة '+arabic(x.page)+' · '+arabic(Math.round(x.score))+'٪ تشابه</b><p>'+esc(x.text)+'</p><div class="button-row"><button class="button button-outline" data-reader="matchPage:'+i+'">افتح الموضع</button><button class="button button-primary" data-reader="saveSimilar:'+i+'">حفظ المقارنة</button></div></div>').join(""):'<p class="hint">لا تظهر مواضع متشابهة قوية ضمن الصفحات المتاحة حاليًا.</p>');
  }
  function saveSimilar(i){
    const x=matches[i];if(!selected||!x)return;
    if(state.similars.some(y=>y.first===selected.key&&y.second===x.key))return notify("هذه المقارنة محفوظة بالفعل.");
    const compare={first:selected.key,second:x.key,text:selected.text,other:x.text,note:"",firstPage:selected.page,secondPage:x.page};
    state.similars.unshift(compare);state.similars=state.similars.slice(0,MAX_SAVED);save();
    const target=$("#readerSimilarSaved");if(target)target.innerHTML=savedHTML();
    notify("حُفظت الآيتان المتشابهتان.");
  }
  async function downloadAll(){
    if(downloading)return;downloading=true;cancelDownload=false;const btn=$("#readerDownload"),stop=$("#readerStop"),status=$("#readerDownloadStatus");
    if(btn)btn.disabled=true;if(stop)stop.hidden=false;
    let done=0,fail=0;
    const queue=Array.from({length:TOTAL},(_,i)=>i+1);
    async function worker(){
      while(queue.length&&!cancelDownload){
        const n=queue.shift();
        try{await getPage(n);done++}catch{fail++}
        if(status&&(done+fail)%8===0)status.textContent="صفحات المصحف: "+arabic(done+fail)+" / ٦٠٤ · نجاح "+arabic(done)+" · تعذر "+arabic(fail);
      }
    }
    await Promise.all(Array.from({length:4},worker));
    if(!cancelDownload) {
      if(status)status.textContent="جاري حفظ خطوط المصحف للاستخدام دون إنترنت...";
      for(let i=1;i<=47&&!cancelDownload;i++){try{await loadFont("QCF4_Hafs_"+String(i).padStart(2,"0"));}catch{fail++;}}
      if(!cancelDownload)try{await loadFont("QCF4_QBSML");}catch{fail++;}
    }
    if(status)status.textContent=cancelDownload?"توقف التنزيل. ستبقى الصفحات التي حُفظت.":fail?"انتهت المحاولة مع "+arabic(fail)+" تعذر تحميل؛ اضغط تنزيل مجددًا لإكمال الناقص.":"اكتمل تنزيل صفحات المصحف والخطوط. يمكن القراءة دون إنترنت في هذا المتصفح.";
    downloading=false;if(btn)btn.disabled=false;if(stop)stop.hidden=true;
  }
  function marksClick(word){
    if(!word.classList.contains("reader-clickable"))return;
    const id=word.dataset.wordId,verse=word.dataset.verse,kind=state.color;
    if(kind){
      if(kind==="erase"||state.marks[id]===kind){delete state.marks[id];word.removeAttribute("data-mark");}
      else{state.marks[id]=kind;word.dataset.mark=kind;}save();return;
    }
    if(verse)selectVerse(verse,Number(word.closest("[data-page]")?.dataset.page||state.page));
  }
  function jumpFromStation(id){const p=(Number(id)-1)*7+1;pageJump(p);}
  function onClick(e){
    const word=e.target.closest("#readerBook [data-word-id]");
    if(word){marksClick(word);return;}
    const btn=e.target.closest("[data-reader]");if(!btn)return;
    const action=btn.dataset.reader;
    if(!$("#readerBook"))return;
    if(action==="exit"){location.hash="stations";return;}
    if(action==="toolsToggle"){const panel=$("#readerToolbox");showTools(panel?panel.hidden:false);return;}
    if(action==="extras"){showTools(false);const extra=$("#readerExtras");if(extra&&extra.scrollIntoView)extra.scrollIntoView({behavior:"smooth",block:"start"});return;}
    if(action==="prev")return prev();
    if(action==="next")return next();
    if(action==="retry")return mount();
    if(action==="jump")return pageJump($("#readerPage")?.value||1);
    if(action==="station")return location.hash="station/"+stationOf(state.page);
    if(action==="closeSelection"){const p=$("#readerSelection");if(p)p.hidden=true;selected=null;return;}
    if(action==="copyVerse"){if(selected&&navigator.clipboard?.writeText)navigator.clipboard.writeText(selected.text).then(()=>notify("نُسخ نص الآية المعروضة.")).catch(()=>notify("تعذر النسخ."));return;}
    if(action==="searchSimilar")return findSimilar();
    if(action==="bookmark"){if(!state.bookmarks.includes(state.page))state.bookmarks.push(state.page);save();const area=$("#readerBookmarks");if(area)area.innerHTML=bookmarksHTML();notify("تم حفظ موضع القراءة.");return;}
    if(action.startsWith("goBookmark:")){pageJump(Number(action.split(":")[1]));return;}
    if(action==="clearBookmarks"){if(!confirm("حذف قائمة مواضع القراءة المحفوظة؟"))return;state.bookmarks=[];save();const area=$("#readerBookmarks");if(area)area.innerHTML=bookmarksHTML();return;}
    if(action==="download")return downloadAll();
    if(action==="stop"){cancelDownload=true;return;}
    if(action.startsWith("mode:")){
      state.mode=validMode(action.split(":")[1]);
      state.page=state.mode==="spread"?spreadStart(state.page):state.page;
      save();replacePageAddress();
      const book=$("#readerBook");
      if(book){book.classList.toggle("reader-spread",state.mode==="spread");book.classList.toggle("reader-single",state.mode!=="spread");}
      document.querySelectorAll(".reader-mode").forEach(btn=>btn.classList.toggle("active",btn.dataset.reader==="mode:"+state.mode));
      showTools(false);syncNav();mount();return;
    }
    if(action.startsWith("color:")){
      state.color=action.slice(6);save();
      document.querySelectorAll(".reader-color").forEach(b=>{const active=b.dataset.reader==="color:"+state.color;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
      showTools(false);return;
    }
    if(action.startsWith("matchPage:")){const m=matches[Number(action.split(":")[1])];if(m)pageJump(m.page);return;}
    if(action.startsWith("saveSimilar:"))return saveSimilar(Number(action.split(":")[1]));
    if(action.startsWith("savedPage:")){const m=state.similars[Number(action.split(":")[1])];if(m)pageJump(m.secondPage);return;}
    if(action.startsWith("editSimilar:")){const i=Number(action.split(":")[1]),m=state.similars[i];if(!m)return;const note=prompt("ملاحظة تفرّق بها بين الموضعين المتشابهين:",m.note);if(note===null)return;m.note=note.trim().slice(0,400);save();const box=$("#readerSimilarSaved");if(box)box.innerHTML=savedHTML();return;}
    if(action.startsWith("deleteSimilar:")){const i=Number(action.split(":")[1]);if(!Number.isInteger(i)||!state.similars[i])return;if(!confirm("حذف هذه المقارنة فقط؟"))return;state.similars.splice(i,1);save();const box=$("#readerSimilarSaved");if(box)box.innerHTML=savedHTML();return;}
  }
  let startTouch=null;
  document.addEventListener("touchstart",e=>{
    if(!e.target.closest("#readerBook")||e.touches.length!==1)return;
    startTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};
  },{passive:true});
  document.addEventListener("touchend",e=>{
    if(!startTouch||!e.target.closest("#readerBook")){startTouch=null;return;}
    const dx=e.changedTouches[0].clientX-startTouch.x,dy=e.changedTouches[0].clientY-startTouch.y;
    startTouch=null;if(Math.abs(dx)<62||Math.abs(dx)<Math.abs(dy)*1.5)return;
    // The reading direction is RTL: a swipe LEFT advances.
    if(dx<0)next();else prev();
  },{passive:true});
  window.addEventListener("keydown",e=>{
    if(!$("#readerBook")||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||""))return;
    if(e.key==="ArrowLeft"){e.preventDefault();next();}
    if(e.key==="ArrowRight"){e.preventDefault();prev();}
  });
  window.addEventListener("resize",()=>{if($("#readerBook"))requestAnimationFrame(fitLines);});
  document.addEventListener("click",onClick);
  return {view,mount,backup,restore,openFromStation:jumpFromStation,setPage:pageJump};
})();