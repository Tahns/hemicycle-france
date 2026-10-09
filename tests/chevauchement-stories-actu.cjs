#!/usr/bin/env node
/**
 * Contrôle automatique des stories d'actualité (js/stories-actu*.js) : aucun texte ne doit en chevaucher un autre, toucher une photo
 * ou sortir du cadre, même avec des titres de 40 mots, des noms très longs, 1 à 6 médias, une vidéo, un sujet sensible, sans photo.
 * Chromium (Playwright) : on enregistre chaque fillText / drawImage du canvas, puis on compare les rectangles.
 * USAGE : NODE_PATH=$(npm root -g) node tests/chevauchement-stories-actu.cjs   (hors lancer-tous : demande un navigateur)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const RACINE = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".css": "text/css" };
const serveur = () => new Promise((ok) => {
  const s = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const f = path.join(RACINE, url === "/" ? "index.html" : url);
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  s.listen(0, () => ok(s));
});
const INSTR = `
window.__rec = [];
(()=>{
  const P = CanvasRenderingContext2D.prototype;
  const oft = P.fillText, odi = P.drawImage;
  P.fillText = function(t, x, y, ...r){
    try{
      const m = this.measureText(t), tr = this.getTransform();
      let l = x - (this.textAlign==="right"||this.textAlign==="end" ? m.width : this.textAlign==="center" ? m.width/2 : 0);
      const a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
      let yy = y; // baseline (alphabetic) ; middle handled via fontBoundingBox
      if(this.textBaseline==="middle"){ yy = y + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent)/2; }
      const ls = parseFloat(this.letterSpacing)||0;
      const w = m.width - (ls>0?ls:0);
      const R = { k:"t", t:String(t), x:l+tr.e, y:yy-a+tr.f, w, h:a+d, f:this.font };
      window.__rec.push(R);
    }catch(e){}
    return oft.call(this, t, x, y, ...r);
  };
  const orect=P.rect, orr=P.roundRect, oclip=P.clip, osave=P.save, orest=P.restore;
  let last=null, cur=null, stack=[];
  P.rect=function(x,y,w,h){ last={x,y,w,h}; return orect.call(this,x,y,w,h); };
  P.roundRect=function(x,y,w,h,...r){ last={x,y,w,h}; return orr.call(this,x,y,w,h,...r); };
  P.clip=function(...a){ if(last) cur=last; return oclip.apply(this,a); };
  P.save=function(){ stack.push(cur); return osave.call(this); };
  P.restore=function(){ cur=stack.pop()||null; return orest.call(this); };
  P.drawImage = function(img, ...a){
    try{
      let dx,dy,dw,dh;
      if(a.length===2){dx=a[0];dy=a[1];dw=img.width;dh=img.height;} else if(a.length===4){[dx,dy,dw,dh]=a;} else {[,,,,dx,dy,dw,dh]=a;}
      const tr=this.getTransform();
      let R={k:"i", x:dx+tr.e, y:dy+tr.f, w:dw, h:dh};
      if(cur){ const x0=Math.max(R.x,cur.x+tr.e), y0=Math.max(R.y,cur.y+tr.f), x1=Math.min(R.x+R.w,cur.x+cur.w+tr.e), y1=Math.min(R.y+R.h,cur.y+cur.h+tr.f); R={k:"i",x:x0,y:y0,w:Math.max(0,x1-x0),h:Math.max(0,y1-y0)}; }
      window.__rec.push(R);
    }catch(e){}
    return odi.call(this, img, ...a);
  };
})();`;
const STRESS = `(()=>{
const M = ["Le Monde","Libération","Dernières Nouvelles d'Alsace","Le Journal de Saône-et-Loire","L'Est républicain","Ouest-France","Le Parisien Aujourd'hui en France","Sud Ouest"];
const mots = n => Array.from({length:n},(_,i)=>["gouvernement","réforme","retraites","Assemblée","nationale","budget","opposition","majorité","présidentielle","commission","parlementaire","inquiétudes","propositions","débat"][i%14]).join(" ");
const longT = n => "Le "+mots(n);
const P1 = {nom:"Édouard Philippe",photo:"photos/personnalites/edouard-philippe.jpg",photoHd:"photos/personnalites/hd/edouard-philippe.jpg",parti:"HOR",credit:"Wasasaq8, CC0, Wikimedia Commons"};
const P2 = {nom:"Bruno Retailleau",photo:"photos/senateurs/04033B.jpg",photoHd:"photos/senateurs/hd/04033B.jpg",parti:"LR",credit:"Sénat"};
const long1 = {...P1, nom:"Jean-Christophe Marie-Antoinette de la Rochefoucauld-Montmorency-Villiers", parti:"HOR"};
const long2 = {...P2, nom:"Anne-Charlotte Wolfgang-Aleksandrovitch Hoffmann-Schwarzenberg", parti:"LR"};
const sans = {nom:"Hélène Dupont-Castelnaudary", parti:"PS"};
const arts = (n, titre, video) => Array.from({length:n},(_,i)=>({titre: i? titre+" "+i : titre, url:"https://ex.fr/"+i, media:M[i], date:new Date(Date.now()-3600e3*(i+1)).toISOString(), ...(video&&i===0?{video:true}:{})}));
const mk = (o)=>({medias:o.n,mediasDistincts:o.n,sources:M.slice(0,o.n),derniere:new Date().toISOString(),illustration:{personnes:o.pers||[],partis:[],theme:o.theme||"gouvernement",vignette:o.theme||"gouvernement"},articles:arts(o.n,o.titrePresse||longT(22),o.video),titrePropre:o.propre?{titre:o.propre,origine:"regles"}:undefined,...(o.extra||{})});
const F = [
 ["f0",{n:6,propre:longT(34)}],
 ["f1",{n:1,propre:longT(40),pers:[long1,long2]}],
 ["f2",{n:2,propre:"Réforme : ce qu'il faut savoir",pers:[long1]}],
 ["f3",{n:3,titrePresse:longT(36)}],
 ["f4",{n:4,video:true,propre:longT(20),extra:{sensible:{libelle:"Décision de justice",pied:"Sources : Le Monde, Libération, Dernières Nouvelles d'Alsace et 3 autres (articles du 9 octobre). Toute personne mise en cause est présumée innocente tant qu'elle n'a pas été jugée.",sansCitation:true,sansHeure:false}}}],
 ["f5",{n:5,propre:longT(26),extra:{sensible:{libelle:"Selon la presse",pied:"Sources : Le Monde, Libération et 3 autres. Présumée innocente.",sansCitation:false}}}],
 ["f6",{n:6,propre:longT(18),pers:[P1,P2],video:true,extra:{chiffre:{valeur:"1 234 567 890 €",unite:"de dépenses supplémentaires prévues chaque année pour les collectivités territoriales et l'État"},contexte:[{type:"fait",texte:longT(30),source:"Cour des comptes, rapport public annuel 2026 sur la situation et les perspectives"},{type:"fait",texte:longT(30),source:"INSEE"},{type:"fait",texte:longT(30),source:"Sénat"}]}}],
 ["f7",{n:6,propre:longT(30),video:true,extra:{date:{iso:"2026-12-25",jour:1,mois:"septembre"},contexte:[{type:"fait",texte:longT(30),source:"INSEE"},{type:"fait",texte:longT(25),source:"X"}]}}],
 ["f8",{n:2,propre:"Duel",pers:[long1,sans],extra:{chiffre:{valeur:"4",unite:"milliards"}}}],
 ["f9",{n:6,titrePresse:longT(40),pers:[long1]}],
 ["f10",{n:1,propre:"Titre court",pers:[sans]}],
 ["f11",{n:2,propre:longT(30),pers:[sans,P2],video:true,extra:{chiffre:{valeur:"12 %",unite:"en un mois"},contexte:[{type:"fait",texte:"Un fait court.",source:"INSEE"}]}}],
];
window.__F = {};
F.forEach(([k,o])=>{ ACTUALITES.sujets.push(mk(o)); window.__F[k]=ACTUALITES.sujets.length-1; });
// dossier fictif
ACTUALITES.dossiers.push({id:"stress",titre:"Une réforme des retraites très contestée par l'ensemble des syndicats et des partis d'opposition",mediasDistincts:6,nb:30,medias:M.slice(0,6),articles:arts(6,longT(34),true)});
ACTUALITES.dossiers.push({id:"stress2",titre:"Budget",mediasDistincts:6,nb:3,medias:M.slice(0,3),articles:arts(3,longT(10),false)});
})();
`;
function analyser(rec, W=1080, H=1920){
  const out = [];
  const T = rec.filter(r=>r.k==="t" && r.t.trim() && r.w>0 && r.h<400);
  const I = rec.filter(r=>r.k==="i" && r.w < W*0.95 && r.h < H*0.9);
  for(const t of T){
    if(t.x < 40 || t.x+t.w > W-40 || t.y < 0 || t.y+t.h > H) out.push(`HORS-CADRE "${t.t.slice(0,30)}" x=${t.x|0}..${(t.x+t.w)|0} y=${t.y|0}..${(t.y+t.h)|0}`);
  }
  for(let i=0;i<T.length;i++) for(let j=i+1;j<T.length;j++){
    const a=T[i], b=T[j];
    const ox = Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x), oy = Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
    if(a.t===b.t && ox>1 && oy>1) continue;
    if(ox>1 && oy>1) out.push(`CHEVAUCHE "${a.t.slice(0,25)}" / "${b.t.slice(0,25)}" (${ox|0}x${oy|0})`);
    else if(a.f!==b.f && ox>1 && oy>-12 && oy<=1 ) out.push(`  proche(${(-oy)|0}px) "${a.t.slice(0,25)}" / "${b.t.slice(0,25)}"`);
    else if(oy>1 && ox>-12 && ox<=1) out.push(`  proche-h(${(-ox)|0}px) "${a.t.slice(0,25)}" / "${b.t.slice(0,25)}"`);
  }
  for(const t of T) for(const im of I){
    const ox = Math.min(t.x+t.w,im.x+im.w)-Math.max(t.x,im.x), oy = Math.min(t.y+t.h,im.y+im.h)-Math.max(t.y,im.y);
    if(ox>1 && oy>1) out.push(`TEXTE/IMAGE "${t.t.slice(0,25)}" / img(${im.x|0},${im.y|0},${im.w|0},${im.h|0}) (${ox|0}x${oy|0}) [img possiblement rognée]`);
  }
  return out;
}

(async () => {
  const s = await serveur();
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  p.on("pageerror", (e) => console.log("erreur page :", e.message));
  await p.addInitScript(INSTR);
  await p.goto(`http://localhost:${s.address().port}/`); await p.waitForTimeout(3500);
  await p.evaluate(STRESS);
  const F = await p.evaluate(() => window.__F);
  const cas = [];
  for (const [k, i] of Object.entries(F)) for (const m of ["une", "direct", "facea", "chiffre", "date"]) for (const st of (m === "direct" ? [""] : ["bleu", "une-photo", "question", "chiffre"])) cas.push([`${k}-${m}${st ? "-" + st : ""}`, "actualite", `${i}:${m}${st ? ":" + st : ""}`]);
  for (const id of ["stress", "stress2"]) for (const st of ["", "|question", "|une-photo", "|chiffre"]) cas.push([`dossier-${id}${st}`, "actualites", id + st]);
  const v = Object.values(F);
  cas.push(["bref-1", "actualites", "bref:" + v.slice(0, 4).join(",")], ["bref-2", "actualites", "bref:" + v.slice(4, 8).join(",")], ["bref-3", "actualites", "bref:" + [F.f9, F.f3, F.f1, F.f6].join(",")]);
  let defauts = 0, rendus = 0;
  for (const [nom, type, info] of cas) {
    const r = await p.evaluate(async ([type, info]) => { window.__rec = []; try { const r = await dessinerStory(type, info); return { ok: !!(r && r.apercu), rec: window.__rec.slice() }; } catch (e) { return { err: String(e) }; } }, [type, info]);
    if (r.err) { defauts++; console.log(`ERREUR ${nom} : ${r.err}`); continue; }
    if (!r.ok) continue;
    rendus++;
    const res = analyser(r.rec);
    if (res.length) { defauts++; console.log(`DEFAUT ${nom}\n   ${res.join("\n   ")}`); }
  }
  await b.close(); s.close();
  console.log(defauts ? `${defauts} story(s) avec défaut sur ${rendus}` : `${rendus} stories sans chevauchement`);
  process.exit(defauts ? 1 : 0);
})();
