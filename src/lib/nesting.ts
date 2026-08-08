// ================================================================
//  src/lib/nesting.ts — ядро розкрою DXF.
//  Це ПОРТ математики з діалогу «Розкрій DXF» таблиці-хаба
//  (NestingDialog.html): парсер DXF, обчислення периметра/врізок,
//  упаковка по полицях і щільна (true-shape) через растрові маски,
//  генерація DXF-розкладки, довідники цін і швидкостей різу.
//  Логіку навмисно збережено 1:1, щоб розрахунок у додатку і в
//  таблиці давав однаковий результат.
// ================================================================
/* eslint-disable */
// @ts-nocheck

var PRICE_TABLE={
  cm:{1:8,1.5:10,2:13,3:18,4:26,5:27,6:30,8:44,10:53.5,12:64,14:77,16:96,18:107,20:120,22:130,25:150,30:180,40:290,50:350,60:480,70:750,80:1300},
  nzAir:{1:8.2,1.5:10.5,2:15.2,3:29,4:55,5:78.4,6:91.6,8:114.4,10:162.8,12:202.4,14:250.8,16:270},
  nzN:{1:12.5,1.5:15,2:21,3:36,4:68.5,5:105,6:125,8:155,10:224,12:275,14:345,16:360,18:370,20:380,22:400,25:470,30:900,40:1150,50:1500,60:1800,70:3500,80:4500},
  al:{1:16,1.5:20,2:27,3:50,4:90,5:135,6:158,8:198,10:285,12:350}
};
/* Товщина/щільність із ключа групи + орієнтовні швидкості різу */
var SPEED_TABLE={1:9,1.5:7,2:5.5,3:3.5,4:2.8,5:2.2,6:1.8,8:1.4,10:1.1,12:0.9,14:0.75,16:0.6,18:0.5,20:0.45,22:0.4,25:0.35,30:0.25};

function dxfPairs(text){
  var lines=text.split(/\r\n|\r|\n/),out=[];
  for(var i=0;i+1<lines.length;i+=2){
    var c=parseInt(lines[i].trim(),10);
    if(isNaN(c))continue;
    out.push([c,lines[i+1],i]); // [code, value, lineIdx]
  }
  return out;
}
// Коди-вказівники/handle, які треба прибрати при вбудовуванні в блок
var STRIP={5:1,105:1,330:1,331:1,340:1,350:1,360:1};

function parseDxf(text){
  var pairs=dxfPairs(text);
  var lines=text.split(/\r\n|\r|\n/);
  // Межі секції ENTITIES
  var inEnt=false,entStart=-1,entEnd=-1;
  for(var i=0;i<pairs.length;i++){
    var p=pairs[i];
    if(p[0]===2&&p[1].trim()==='ENTITIES'&&i>0&&pairs[i-1][0]===0&&pairs[i-1][1].trim()==='SECTION'){inEnt=true;entStart=i+1;continue}
    if(inEnt&&p[0]===0&&p[1].trim()==='ENDSEC'){entEnd=i;break}
  }
  if(entStart<0)throw new Error('немає секції ENTITIES');
  if(entEnd<0)entEnd=pairs.length;

  var minX=1e18,minY=1e18,maxX=-1e18,maxY=-1e18;
  function pt(x,y){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
  var prims=[];var hasInsert=false;
  var i=entStart;
  var GEOM={LINE:1,CIRCLE:1,ARC:1,LWPOLYLINE:1,POLYLINE:1,VERTEX:1,SPLINE:1,ELLIPSE:1,SEQEND:1};
  var cleanLines=[]; // сирі рядки сутностей без handle-кодів

  while(i<entEnd){
    if(pairs[i][0]!==0){i++;continue}
    var type=pairs[i][1].trim();
    // Збираємо всі пари цієї сутності
    var j=i+1;var props=[];
    while(j<entEnd&&pairs[j][0]!==0){props.push(pairs[j]);j++}
    // Сирий текст (з фільтром службових кодів)
    var skip102=false;
    cleanLines.push('0');cleanLines.push(type);
    props.forEach(function(p){
      if(p[0]===102){skip102=!skip102;return}
      if(skip102)return;
      if(STRIP[p[0]])return;
      cleanLines.push(String(p[0]));cleanLines.push(p[1]);
    });
    // Геометрія
    if(type==='INSERT')hasInsert=true;
    if(GEOM[type]){
      var v={};props.forEach(function(p){ (v[p[0]]=v[p[0]]||[]).push(parseFloat(p[1])) });
      function g(c,k){return v[c]?v[c][k||0]:undefined}
      if(type==='LINE'){var x1=g(10),y1=g(20),x2=g(11),y2=g(21);
        if(x1!=null){pt(x1,y1);pt(x2,y2);prims.push({t:'l',x1:x1,y1:y1,x2:x2,y2:y2})}}
      else if(type==='CIRCLE'){var cx=g(10),cy=g(20),r=g(40);
        if(cx!=null){pt(cx-r,cy-r);pt(cx+r,cy+r);prims.push({t:'c',cx:cx,cy:cy,r:r})}}
      else if(type==='ARC'){var cx2=g(10),cy2=g(20),r2=g(40),a1=g(50),a2=g(51);
        if(cx2!=null){pt(cx2-r2,cy2-r2);pt(cx2+r2,cy2+r2);prims.push({t:'a',cx:cx2,cy:cy2,r:r2,a1:a1,a2:a2})}}
      else if(type==='LWPOLYLINE'){
        // Послідовний обхід: вершина = 10,20[,42 bulge] — вирівнювання
        // bulge з вершиною важливе для довжини різу (дуги!)
        var ptsArr=[],cur=null,closedFl=false;
        props.forEach(function(p){
          var c=p[0],val=parseFloat(p[1]);
          if(c===70)closedFl=(val&1)===1;
          else if(c===10){cur=[val,0,0];ptsArr.push(cur)}
          else if(c===20&&cur){cur[1]=val;pt(cur[0],cur[1])}
          else if(c===42&&cur){cur[2]=val}
        });
        if(ptsArr.length)prims.push({t:'p',pts:ptsArr,closed:closedFl});
      }
      else if(type==='SPLINE'){
        var xs=v[10]||[],ys=v[20]||[];var sp=[];
        for(var k=0;k<Math.min(xs.length,ys.length);k++){pt(xs[k],ys[k]);sp.push([xs[k],ys[k],0])}
        if(sp.length)prims.push({t:'p',pts:sp,closed:((g(70)||0)&1)===1,approx:true});
      }
      else if(type==='ELLIPSE'){var ecx=g(10),ecy=g(20),mx=g(11),my=g(21);
        if(ecx!=null){var mr=Math.sqrt(mx*mx+my*my);pt(ecx-mr,ecy-mr);pt(ecx+mr,ecy+mr);prims.push({t:'c',cx:ecx,cy:ecy,r:mr})}}
      else if(type==='POLYLINE'){
        prims.push({t:'p',pts:[],_poly:true,closed:((g(70)||0)&1)===1});
      }
      else if(type==='VERTEX'){var vx=g(10),vy=g(20),vb=g(42)||0;
        if(vx!=null){pt(vx,vy);
          var last=prims[prims.length-1];
          if(last&&last.t==='p'&&last._poly)last.pts.push([vx,vy,vb]);
          else prims.push({t:'p',pts:[[vx,vy,vb]],_poly:true});
        }}
    }
    i=j;
  }
  if(minX>maxX)throw new Error('не знайдено геометрії');
  var met=computeMetrics(prims);
  var hull=convexHull(samplePoints(prims));
  var optA=bestAngle(hull); // кут мінімального габариту
  var parsed={w:maxX-minX,h:maxY-minY,minX:minX,minY:minY,prims:prims,raw:cleanLines,hasInsert:hasInsert,
          cutLen:met.len,loops:met.loops,approx:met.approx,hull:hull,optAngle:optA};
  return parsed;
}

/* ═══ МІНІМАЛЬНИЙ ГАБАРИТ (rotating calipers) ═══
   Деталі, намальовані по діагоналі, дають "роздутий" прямокутний
   габарит — довертаємо кожну до кута з мінімальною площею габариту. */
function samplePoints(prims){
  var pts=[];
  function arcPts(cx,cy,r,a1,a2){
    var sweep=((a2-a1)%360+360)%360;if(sweep===0)sweep=360;
    var n=Math.max(4,Math.ceil(sweep/30));
    for(var i=0;i<=n;i++){var a=(a1+sweep*i/n)*Math.PI/180;pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}
  }
  prims.forEach(function(pr){
    if(pr.t==='l'){pts.push([pr.x1,pr.y1],[pr.x2,pr.y2])}
    else if(pr.t==='c'){arcPts(pr.cx,pr.cy,pr.r,0,360)}
    else if(pr.t==='a'){arcPts(pr.cx,pr.cy,pr.r,pr.a1,pr.a2)}
    else if(pr.t==='p'){
      for(var k=0;k<pr.pts.length;k++){
        pts.push([pr.pts[k][0],pr.pts[k][1]]);
        var b=pr.pts[k][2]||0;
        if(b&&k+1<pr.pts.length){ // семпл дуги bulge
          var x1=pr.pts[k][0],y1=pr.pts[k][1],x2=pr.pts[k+1][0],y2=pr.pts[k+1][1];
          var th=4*Math.atan(b);var chord=Math.hypot(x2-x1,y2-y1);
          if(chord>1e-9){
            var R=chord/(2*Math.sin(Math.abs(th)/2));
            var mx=(x1+x2)/2,my=(y1+y2)/2;
            var d=Math.sqrt(Math.max(0,R*R-chord*chord/4))*(th>0?1:-1);
            var nx=-(y2-y1)/chord,ny=(x2-x1)/chord;
            var ccx=mx+nx*d,ccy=my+ny*d;
            var sa=Math.atan2(y1-ccy,x1-ccx),tot=th;
            for(var s=1;s<6;s++){var a=sa+tot*s/6;pts.push([ccx+R*Math.cos(a),ccy+R*Math.sin(a)])}
          }
        }
      }
    }
  });
  return pts;
}
function convexHull(pts){
  if(pts.length<3)return pts.slice();
  pts=pts.slice().sort(function(a,b){return a[0]-b[0]||a[1]-b[1]});
  function cross(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])}
  var lo=[],up=[];
  pts.forEach(function(p){
    while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);});
  for(var i=pts.length-1;i>=0;i--){var p=pts[i];
    while(up.length>1&&cross(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
  lo.pop();up.pop();
  return lo.concat(up);
}
// Габарит оболонки під кутом angle (градуси): {w,h,rminX,rminY}
// (координати відносно базової точки B = minX/minY деталі)
function orientAt(parsed,angleDeg){
  var a=angleDeg*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
  var mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;
  var hull=parsed.hull.length?parsed.hull:[[parsed.minX,parsed.minY],[parsed.minX+parsed.w,parsed.minY+parsed.h]];
  hull.forEach(function(p){
    var dx=p[0]-parsed.minX,dy=p[1]-parsed.minY;
    var rx=dx*ca-dy*sa,ry=dx*sa+dy*ca;
    if(rx<mnx)mnx=rx;if(rx>mxx)mxx=rx;if(ry<mny)mny=ry;if(ry>mxy)mxy=ry;
  });
  return {angle:angleDeg,w:mxx-mnx,h:mxy-mny,rminX:mnx,rminY:mny};
}
function bestAngle(hull){
  if(hull.length<3)return 0;
  var best=0,bestArea=Infinity;
  for(var i=0;i<hull.length;i++){
    var p1=hull[i],p2=hull[(i+1)%hull.length];
    var ang=-Math.atan2(p2[1]-p1[1],p2[0]-p1[0])*180/Math.PI;
    var a=ang*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
    var mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;
    hull.forEach(function(p){
      var rx=p[0]*ca-p[1]*sa,ry=p[0]*sa+p[1]*ca;
      if(rx<mnx)mnx=rx;if(rx>mxx)mxx=rx;if(ry<mny)mny=ry;if(ry>mxy)mxy=ry;
    });
    var area=(mxx-mnx)*(mxy-mny);
    if(area<bestArea){bestArea=area;best=ang}
  }
  // нормалізуємо в [0..180)
  best=((best%180)+180)%180;
  return Math.round(best*100)/100;
}

/* ═══ МЕТРИКИ РІЗУ: довжина + кількість контурів (= точок врізки) ═══ */
function bulgeLen(x1,y1,x2,y2,b){
  var chord=Math.hypot(x2-x1,y2-y1);
  if(!b)return chord;
  var th=4*Math.atan(Math.abs(b));           // кут дуги
  var R=chord/(2*Math.sin(th/2));
  return R*th;
}
function computeMetrics(prims){
  var len=0,loops=0,approx=false;
  var open=[]; // відкриті шляхи: {a:[x,y], b:[x,y]}
  prims.forEach(function(pr){
    if(pr.t==='l'){len+=Math.hypot(pr.x2-pr.x1,pr.y2-pr.y1);open.push({a:[pr.x1,pr.y1],b:[pr.x2,pr.y2]})}
    else if(pr.t==='c'){len+=2*Math.PI*pr.r;loops++}
    else if(pr.t==='a'){
      var sweep=((pr.a2-pr.a1)%360+360)%360;if(sweep===0)sweep=360;
      len+=pr.r*sweep*Math.PI/180;
      var a1=pr.a1*Math.PI/180,a2=pr.a2*Math.PI/180;
      open.push({a:[pr.cx+pr.r*Math.cos(a1),pr.cy+pr.r*Math.sin(a1)],
                 b:[pr.cx+pr.r*Math.cos(a2),pr.cy+pr.r*Math.sin(a2)]});
    }
    else if(pr.t==='p'&&pr.pts.length>1){
      if(pr.approx)approx=true;
      for(var k=0;k<pr.pts.length-1;k++){
        len+=bulgeLen(pr.pts[k][0],pr.pts[k][1],pr.pts[k+1][0],pr.pts[k+1][1],pr.pts[k][2]||0);
      }
      if(pr.closed){
        var lastP=pr.pts[pr.pts.length-1],firstP=pr.pts[0];
        len+=bulgeLen(lastP[0],lastP[1],firstP[0],firstP[1],lastP[2]||0);
        loops++;
      } else {
        open.push({a:[pr.pts[0][0],pr.pts[0][1]],b:[pr.pts[pr.pts.length-1][0],pr.pts[pr.pts.length-1][1]]});
      }
    }
  });
  // Зшиваємо відкриті сегменти в контури по спільних кінцях (union-find)
  if(open.length){
    var key=function(p){return Math.round(p[0]*20)+'_'+Math.round(p[1]*20)}; // толеранс 0.05мм
    var parent={};
    function find(x){while(parent[x]!==x)x=parent[x]=parent[parent[x]];return x}
    function uni(a,b){a=find(a);b=find(b);if(a!==b)parent[a]=b}
    var byPt={};
    open.forEach(function(s,i){parent['s'+i]='s'+i;
      [key(s.a),key(s.b)].forEach(function(k){
        if(byPt[k]!=null)uni('s'+i,'s'+byPt[k]);else byPt[k]=i;
      });
    });
    var comp={};open.forEach(function(s,i){comp[find('s'+i)]=1});
    loops+=Object.keys(comp).length;
  }
  return {len:len,loops:loops,approx:approx};
}

/* ═══ ПАКУВАННЯ (полиці, FFDH, поворот 90°) ═══ */
function packGroup(instances,sheetW,sheetH,gap,margin,allowRot){
  var uW=sheetW-2*margin+gap,uH=sheetH-2*margin+gap;
  function optsOf(inst){
    var o=[{w:inst.o0.w+gap,h:inst.o0.h+gap,o:inst.o0}];
    if(allowRot&&Math.abs(inst.o0.w-inst.o0.h)>0.01)o.push({w:inst.o90.w+gap,h:inst.o90.h+gap,o:inst.o90});
    return o;
  }
  var oversize=[];
  var rects=instances.filter(function(inst){
    var fits=optsOf(inst).some(function(o){return o.w<=uW&&o.h<=uH});
    if(!fits)oversize.push(inst);
    return fits;
  }).map(function(inst){return {inst:inst}});
  rects.sort(function(a,b){
    return Math.max(b.inst.o0.w,b.inst.o0.h)-Math.max(a.inst.o0.w,a.inst.o0.h);
  });
  var sheets=[];
  function place(r){
    var opts=optsOf(r.inst).filter(function(o){return o.w<=uW&&o.h<=uH});
    for(var si=0;si<sheets.length;si++){
      var sh=sheets[si];
      for(var li=0;li<sh.shelves.length;li++){
        var shelf=sh.shelves[li];
        for(var oi=0;oi<opts.length;oi++){
          var o=opts[oi];
          if(o.h<=shelf.h&&shelf.x+o.w<=uW){
            sh.parts.push({x:shelf.x,y:shelf.y,w:o.w,h:o.h,o:o.o,inst:r.inst});
            shelf.x+=o.w;return true;
          }
        }
      }
      for(var oi2=0;oi2<opts.length;oi2++){
        var o2=opts[oi2];
        if(sh.y+o2.h<=uH&&o2.w<=uW){
          sh.shelves.push({y:sh.y,h:o2.h,x:o2.w});
          sh.parts.push({x:0,y:sh.y,w:o2.w,h:o2.h,o:o2.o,inst:r.inst});
          sh.y+=o2.h;return true;
        }
      }
    }
    var o3=opts[0];
    var ns={shelves:[{y:0,h:o3.h,x:o3.w}],y:o3.h,parts:[{x:0,y:0,w:o3.w,h:o3.h,o:o3.o,inst:r.inst}]};
    sheets.push(ns);return true;
  }
  rects.forEach(place);
  // Використання
  sheets.forEach(function(sh){
    var area=0;sh.parts.forEach(function(p){area+=(p.w-gap)*(p.h-gap)});
    sh.util=Math.round(100*area/(sheetW*sheetH));
  });
  return {sheets:sheets,oversize:oversize};
}

/* ═══ TRUE-SHAPE ПАКУВАННЯ (растрові маски) ═══
   Деталь рендериться в бітову маску за реальним контуром (клітинка
   = 2..6 мм), розкладка "знизу-вліво" перебирає позиції на сітці
   зайнятості листа — деталі заходять у вирізи сусідніх. Відступ між
   деталями забезпечує дилатація маски при штампуванні. */
var MASKS={};
function buildMask(parsed,fileId,angleDeg,cell,gapC){
  var key=fileId+'@'+angleDeg+'@'+cell+'@'+gapC;
  if(MASKS[key]!==undefined)return MASKS[key];
  var o=orientAt(parsed,angleDeg);
  var gw=Math.max(1,Math.ceil(o.w/cell)),gh=Math.max(1,Math.ceil(o.h/cell));
  if(gw>2500||gh>2500){MASKS[key]=null;return null}
  var W=gw+4,H=gh+4;
  var cv=document.createElement('canvas');cv.width=W;cv.height=H;
  var ctx=cv.getContext('2d',{willReadFrequently:true});
  ctx.strokeStyle='#000';ctx.lineWidth=1.6;
  var ang=o.angle*Math.PI/180,ca=Math.cos(ang),sa=Math.sin(ang);
  function tx(px,py){
    var dx=px-parsed.minX,dy=py-parsed.minY;
    var rx=dx*ca-dy*sa-o.rminX,ry=dx*sa+dy*ca-o.rminY;
    return [2+rx/cell,(gh+2)-ry/cell];
  }
  ctx.beginPath();
  parsed.prims.forEach(function(pr){
    if(pr.t==='l'){var a=tx(pr.x1,pr.y1),b=tx(pr.x2,pr.y2);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1])}
    else if(pr.t==='c'){var c=tx(pr.cx,pr.cy);ctx.moveTo(c[0]+pr.r/cell,c[1]);ctx.arc(c[0],c[1],pr.r/cell,0,Math.PI*2)}
    else if(pr.t==='a'){var c2=tx(pr.cx,pr.cy);
      var sA=-(pr.a1*Math.PI/180+ang),eA=-(pr.a2*Math.PI/180+ang);
      ctx.moveTo(c2[0]+pr.r/cell*Math.cos(eA),c2[1]+pr.r/cell*Math.sin(eA));
      ctx.arc(c2[0],c2[1],pr.r/cell,eA,sA)}
    else if(pr.t==='p'&&pr.pts.length>1){
      var s0=tx(pr.pts[0][0],pr.pts[0][1]);ctx.moveTo(s0[0],s0[1]);
      for(var k=1;k<pr.pts.length;k++){var q=tx(pr.pts[k][0],pr.pts[k][1]);ctx.lineTo(q[0],q[1])}
      if(pr.closed)ctx.closePath();
    }
  });
  ctx.stroke();
  var img=ctx.getImageData(0,0,W,H).data;
  var solid=new Uint8Array(W*H);
  for(var i=0;i<W*H;i++)if(img[i*4+3]>40)solid[i]=1;
  // Заливка "зовні" від кута — все недосяжне = деталь (контур + нутро + отвори)
  var outside=new Uint8Array(W*H);var stack=[0];outside[0]=1;
  while(stack.length){
    var p=stack.pop();var px=p%W;
    if(px>0){var q1=p-1;if(!outside[q1]&&!solid[q1]){outside[q1]=1;stack.push(q1)}}
    if(px<W-1){var q2=p+1;if(!outside[q2]&&!solid[q2]){outside[q2]=1;stack.push(q2)}}
    if(p-W>=0){var q3=p-W;if(!outside[q3]&&!solid[q3]){outside[q3]=1;stack.push(q3)}}
    if(p+W<W*H){var q4=p+W;if(!outside[q4]&&!solid[q4]){outside[q4]=1;stack.push(q4)}}
  }
  function toRuns(rowB){var out=[],s=-1;
    for(var c=0;c<=rowB.length;c++){
      var v=c<rowB.length&&rowB[c];
      if(v&&s<0)s=c;
      if(!v&&s>=0){out.push(s,c-1);s=-1}
    }
    return out}
  var bool=[],runs=[],cells=0;
  for(var r=0;r<gh;r++){
    var rowB=new Uint8Array(gw);
    var py=gh+1-r;
    for(var c=0;c<gw;c++)if(!outside[py*W+(2+c)]){rowB[c]=1;cells++}
    bool.push(rowB);runs.push(toRuns(rowB));
  }
  // Дилатація на gapC (для штампу зайнятості): розширені розміри + офсет gapC
  var gwD=gw+2*gapC,ghD=gh+2*gapC;
  var horiz=bool.map(function(rowB){
    var out=new Uint8Array(gwD);
    for(var c=0;c<gw;c++)if(rowB[c])for(var e=c;e<=c+2*gapC;e++)out[e]=1;
    return out});
  var runsD=[];
  for(var rD=0;rD<ghD;rD++){
    var acc=new Uint8Array(gwD);
    for(var rr=Math.max(0,rD-2*gapC);rr<=Math.min(gh-1,rD);rr++){
      var hz=horiz[rr];
      for(var c2=0;c2<gwD;c2++)if(hz[c2])acc[c2]=1;
    }
    runsD.push(toRuns(acc));
  }
  var mk={id:key,o:o,gw:gw,gh:gh,runs:runs,runsD:runsD,pad:gapC,area:cells*cell*cell};
  MASKS[key]=mk;
  return mk;
}
function fitsAt(occ,GW,mk,x,y){
  for(var r=0;r<mk.runs.length;r++){
    var runs=mk.runs[r];if(!runs.length)continue;
    var base=(y+r)*GW+x;
    for(var k=0;k<runs.length;k+=2)
      for(var c=runs[k];c<=runs[k+1];c++)if(occ[base+c])return false;
  }
  return true;
}
function findFit(occ,GW,GH,mk,startIdx){
  var maxY=GH-mk.gh,maxX=GW-mk.gw;
  if(maxY<0||maxX<0)return null;
  var w=maxX+1;
  var y0=Math.floor((startIdx||0)/w),x0=(startIdx||0)%w;
  if(y0>maxY)return null;
  for(var y=y0;y<=maxY;y++){
    for(var x=(y===y0?x0:0);x<=maxX;x++){
      if(fitsAt(occ,GW,mk,x,y))return {x:x,y:y,idx:y*w+x};
    }
  }
  return null;
}
function stampMask(occ,GW,GH,mk,x,y){
  var pad=mk.pad;
  for(var r=0;r<mk.runsD.length;r++){
    var gy=y+r-pad;if(gy<0||gy>=GH)continue;
    var base=gy*GW;var runs=mk.runsD[r];
    for(var k=0;k<runs.length;k+=2){
      var a=Math.max(0,x+runs[k]-pad),b=Math.min(GW-1,x+runs[k+1]-pad);
      for(var c=a;c<=b;c++)occ[base+c]=1;
    }
  }
}
function tsTick_(){return new Promise(function(r){setTimeout(r,0)})}
async function packTrueShape(instances,sheetW,sheetH,gap,margin,allowRot,useOpt,progress){
  var uW=sheetW-2*margin,uH=sheetH-2*margin;
  var cell=Math.max(2,Math.min(6,Math.ceil(Math.max(uW,uH)/500)));
  var gapC=Math.max(1,Math.round(gap/cell));
  var GW=Math.max(1,Math.floor(uW/cell)),GH=Math.max(1,Math.floor(uH/cell));
  var oversize=[];var list=[];
  // Маски (кеш по fileId+кут) — з паузами, щоб не блокувати сторінку
  for(var ii=0;ii<instances.length;ii++){
    var inst=instances[ii];
    var p=inst.parsed;
    var base=useOpt?p.optAngle:0;
    var angles=allowRot?[base,base+90,base+180,base+270]:[base,base+180];
    var opts=[],seen={};
    for(var ai=0;ai<angles.length;ai++){
      var a=((angles[ai]%360)+360)%360;a=Math.round(a*100)/100;
      if(seen[a])continue;seen[a]=1;
      var mk=buildMask(p,inst.item.fileId,a,cell,gapC);
      if(mk&&mk.gw<=GW&&mk.gh<=GH)opts.push(mk);
    }
    if(!opts.length){oversize.push(inst);continue}
    list.push({inst:inst,opts:opts,area:opts[0].area});
    if((ii&15)===15)await tsTick_();
  }
  list.sort(function(a,b){return b.area-a.area});
  var sheets=[];
  function tryPlace(sh,en){
    var best=null;
    for(var oi=0;oi<en.opts.length;oi++){
      var mk=en.opts[oi];
      // Зайнятість листа лише росте: якщо маска вже не влазила — не влізе ніколи
      if(sh.noFit[mk.id])continue;
      var f=findFit(sh.occ,GW,GH,mk,sh.start[mk.id]||0);
      if(!f){sh.noFit[mk.id]=true;continue}
      if(!best||f.y<best.f.y||(f.y===best.f.y&&f.x<best.f.x))best={f:f,mk:mk};
    }
    if(!best)return false;
    stampMask(sh.occ,GW,GH,best.mk,best.f.x,best.f.y);
    sh.start[best.mk.id]=best.f.idx;
    sh.parts.push({x:best.f.x*cell,y:best.f.y*cell,w:best.mk.o.w+gap,h:best.mk.o.h+gap,
      o:best.mk.o,inst:en.inst,areaMM:best.mk.area});
    sh.area+=best.mk.area;
    return true;
  }
  for(var li=0;li<list.length;li++){
    var en=list[li];
    var placed=false;
    for(var si=0;si<sheets.length&&!placed;si++)placed=tryPlace(sheets[si],en);
    if(!placed){
      var ns={occ:new Uint8Array(GW*GH),parts:[],start:{},noFit:{},area:0};
      sheets.push(ns);
      if(!tryPlace(ns,en))oversize.push(en.inst);
    }
    if((li&7)===7){
      if(progress)progress(li+1,list.length,sheets.length);
      await tsTick_();
    }
  }
  sheets.forEach(function(sh){sh.util=Math.round(100*sh.area/(sheetW*sheetH))});
  return {sheets:sheets,oversize:oversize};
}

/* ═══ ГОЛОВНИЙ ЦИКЛ ═══ */
function buildDxf(res,sheet){
  var L=[];
  function w(){for(var i=0;i<arguments.length;i++)L.push(String(arguments[i]))}
  // HEADER
  w(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,0,'ENDSEC');
  // TABLES: шари 0 і SHEET
  w(0,'SECTION',2,'TABLES',
    0,'TABLE',2,'LTYPE',70,1,0,'LTYPE',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,0,'ENDTAB',
    0,'TABLE',2,'LAYER',70,2,
    0,'LAYER',2,'0',70,0,62,7,6,'CONTINUOUS',
    0,'LAYER',2,'SHEET',70,0,62,1,6,'CONTINUOUS',
    0,'ENDTAB',0,'ENDSEC');
  // BLOCKS: унікальні деталі цього листа
  var blocks={},bn=0;
  sheet.parts.forEach(function(p){
    var id=p.inst.item.fileId;
    if(!blocks[id]){bn++;blocks[id]={name:'P'+bn,parsed:p.inst.parsed}}
  });
  w(0,'SECTION',2,'BLOCKS');
  Object.keys(blocks).forEach(function(id){
    var b=blocks[id];
    // базова точка блока = min кут габариту → INSERT ставить деталь кутом у позицію
    w(0,'BLOCK',8,'0',2,b.name,70,0,10,b.parsed.minX,20,b.parsed.minY,30,0,3,b.name);
    b.parsed.raw.forEach(function(ln){L.push(ln)});
    w(0,'ENDBLK',8,'0');
  });
  w(0,'ENDSEC');
  // ENTITIES: контур листа + вставки
  w(0,'SECTION',2,'ENTITIES');
  w(0,'LWPOLYLINE',8,'SHEET',90,4,70,1,
    10,0,20,0, 10,res.sheetW,20,0, 10,res.sheetW,20,res.sheetH, 10,0,20,res.sheetH);
  sheet.parts.forEach(function(p){
    var b=blocks[p.inst.item.fileId];
    // INSERT обертає блок навколо точки вставки (= базова точка блока).
    // Щоб габарит ліг у слот: I = позиція_слота − мін.кут повернутого габариту
    var ix=res.margin+p.x-p.o.rminX;
    var iy=res.margin+p.y-p.o.rminY;
    w(0,'INSERT',8,'0',2,b.name,
      10,Math.round(ix*1000)/1000,20,Math.round(iy*1000)/1000,30,0,
      41,1,42,1,43,1,50,p.o.angle);
  });
  w(0,'ENDSEC',0,'EOF');
  return L.join('\r\n');
}

/* ═══ ВАРТІСТЬ ═══ */
// Тарифи лазера (грн/м.п. різу, без ПДВ) — таблиця постачальника.
// Правило постачальника: 1 пробивка (врізка) = 100 мм різу = 0.1 × грн/м.
var PRICE_TABLE={
  cm:{1:8,1.5:10,2:13,3:18,4:26,5:27,6:30,8:44,10:53.5,12:64,14:77,16:96,18:107,20:120,22:130,25:150,30:180,40:290,50:350,60:480,70:750,80:1300},
  nzAir:{1:8.2,1.5:10.5,2:15.2,3:29,4:55,5:78.4,6:91.6,8:114.4,10:162.8,12:202.4,14:250.8,16:270},
  nzN:{1:12.5,1.5:15,2:21,3:36,4:68.5,5:105,6:125,8:155,10:224,12:275,14:345,16:360,18:370,20:380,22:400,25:470,30:900,40:1150,50:1500,60:1800,70:3500,80:4500},
  al:{1:16,1.5:20,2:27,3:50,4:90,5:135,6:158,8:198,10:285,12:350}
};
/* Товщина/щільність із ключа групи + орієнтовні швидкості різу */
function thickOf(key){var m=key.match(/·\s*([\d.,]+)/);return m?parseFloat(m[1].replace(',','.')):0}
function densOf(key){var m=key.toLowerCase();
  if(/алюм|амг|д16|\bal\b/.test(m))return 2700;
  if(/aisi|нерж|нж/.test(m))return 7900;
  return 7850}
var SPEED_TABLE={1:9,1.5:7,2:5.5,3:3.5,4:2.8,5:2.2,6:1.8,8:1.4,10:1.1,12:0.9,14:0.75,16:0.6,18:0.5,20:0.45,22:0.4,25:0.35,30:0.25};
function suggestSpeed(key){var t=thickOf(key);return SPEED_TABLE[t]||null}
function suggestPierceSec(key){var t=thickOf(key);return t<=3?1:t<=6?2.5:t<=12?4:7}

function suggestPerM(groupKey){
  var m=groupKey.match(/^(.*?)\s*·\s*([\d.,]+)/);
  if(!m)return null;
  var mat=m[1].toLowerCase(),th=parseFloat(String(m[2]).replace(',','.'));
  var cls='cm';
  if(/aisi|нерж|нж/i.test(mat))cls='nzN';          // нержавійка — азотом (деф.)
  else if(/алюм|амг|д16|al/i.test(mat))cls='al';
  var t=PRICE_TABLE[cls];
  return t&&t[th]!=null?t[th]:null;
}


function drawPart(ctx,p,ox,oy,scale,gap){
  var d=p.inst.parsed,o=p.o;
  var ang=o.angle*Math.PI/180,ca=Math.cos(ang),sa2=Math.sin(ang);
  // точка деталі → поворот навколо базової точки → зсув у слот → полотно
  function tx(px,py){
    var dx=px-d.minX,dy=py-d.minY;
    var rx=dx*ca-dy*sa2-o.rminX,ry=dx*sa2+dy*ca-o.rminY;
    return [ox+rx*scale,oy-ry*scale];
  }
  ctx.beginPath();
  d.prims.forEach(function(pr){
    if(pr.t==='l'){var a=tx(pr.x1,pr.y1),b=tx(pr.x2,pr.y2);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1])}
    else if(pr.t==='c'){var c=tx(pr.cx,pr.cy);ctx.moveTo(c[0]+pr.r*scale,c[1]);ctx.arc(c[0],c[1],pr.r*scale,0,Math.PI*2)}
    else if(pr.t==='a'){var c2=tx(pr.cx,pr.cy);
      var sA=-(pr.a1*Math.PI/180+ang),eA=-(pr.a2*Math.PI/180+ang);
      ctx.moveTo(c2[0]+pr.r*scale*Math.cos(eA),c2[1]+pr.r*scale*Math.sin(eA));
      ctx.arc(c2[0],c2[1],pr.r*scale,eA,sA)}
    else if(pr.t==='p'&&pr.pts.length>1){
      var s0=tx(pr.pts[0][0],pr.pts[0][1]);ctx.moveTo(s0[0],s0[1]);
      for(var k=1;k<pr.pts.length;k++){var q=tx(pr.pts[k][0],pr.pts[k][1]);ctx.lineTo(q[0],q[1])}
      if(pr.closed)ctx.closePath();
    }
  });
  ctx.stroke();
}

/* ═══ ГЕНЕРАЦІЯ DXF ═══ */

export {
  drawPart,
  parseDxf, samplePoints, convexHull, orientAt, bestAngle, computeMetrics,
  packGroup, packTrueShape, buildDxf, buildMask,
  thickOf, densOf, suggestSpeed, suggestPerM, suggestPierceSec,
  PRICE_TABLE, SPEED_TABLE,
};

/** Ім'я файлу для Диска: пробіли — на «_» (вимога до розкладок). */
export function safeFileName(name: string): string {
  return String(name || '').replace(/\s+/g, '_').replace(/[/\:*?"<>|]/g, '-');
}

/** Вага деталей і листів у групі, кг. */
export function weightOf(res: any): { parts: number; sheets: number; rest: number; usedPct: number } {
  const th = thickOf(res.key), rho = densOf(res.key);
  let partsA = 0;
  res.sheets.forEach((s: any) => { partsA += s.area || 0; });
  const parts = partsA * th * rho * 1e-9;
  const sheets = res.sheets.length * res.sheetW * res.sheetH * th * rho * 1e-9;
  const usedPct = res.sheets.length
    ? Math.round(100 * partsA / (res.sheets.length * res.sheetW * res.sheetH))
    : 0;
  return { parts, sheets, rest: sheets - parts, usedPct };
}
