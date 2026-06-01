/** Müşteri reçetesi — stoktan malzeme seç, dekar × dozaj, ambalaj önerisi, kayıt */

let receteCtx = null;
let receteSatirlar = [];
let receteStokCache = [];
let receteKayitliGoruntuleme = null;

function receteParaFormat(tutar) {
  return `${Number(tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function receteStokFiyatBul(stokID, ambalajlar) {
  const fromAmb = (ambalajlar || []).find((a) => Number(a.stokID) === Number(stokID));
  if (fromAmb && fromAmb.satisFiyati != null) return Number(fromAmb.satisFiyati);
  const fromCache = receteStokCache.find((s) => Number(s.StokID) === Number(stokID));
  return Number(fromCache?.SatisFiyati || 0);
}

function recetePlanMaliyet(plan, ambalajlar) {
  if (!plan?.secim?.length) return { kalemler: [], toplam: 0 };
  const kalemler = plan.secim.map((s) => {
    const birimFiyat = s.satisFiyati != null ? Number(s.satisFiyati) : receteStokFiyatBul(s.stokID, ambalajlar);
    const tutar = Math.round(s.adet * birimFiyat * 100) / 100;
    return { ...s, birimFiyat, tutar };
  });
  const toplam = Math.round(kalemler.reduce((acc, k) => acc + k.tutar, 0) * 100) / 100;
  return { kalemler, toplam };
}

function receteSatirMaliyet(satir) {
  const plan = receteAktifPlan(satir);
  return recetePlanMaliyet(plan, satir.ambalajlar);
}

function receteGenelMaliyetToplam() {
  return Math.round(receteSatirlar.reduce((acc, s) => acc + receteSatirMaliyet(s).toplam, 0) * 100) / 100;
}

function receteGenelToplamHtml(toplamOverride) {
  const toplam = toplamOverride != null ? Number(toplamOverride) : receteGenelMaliyetToplam();
  if (toplamOverride == null && !receteSatirlar.length) return '';
  return `<div class="card border-dark shadow-sm mt-2 mb-0">
    <div class="card-body py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
      <span class="fw-semibold"><i class="fa-solid fa-coins me-1 text-success"></i>Reçete genel toplam (maliyet)</span>
      <span class="fs-5 fw-bold text-success mb-0">${receteParaFormat(toplam)}</span>
    </div>
  </div>`;
}

function recetePlanTamMi(plan) {
  return plan && Number(plan.fire) < 1e-6;
}

function recetePlanSatirHtml(plan, etiket, birim, malzemeAdi, ambalajlar) {
  if (!plan?.secim?.length) return '';
  const b = birim || 'Lt';
  const ad = malzemeAdi ? gunlukMetinEsc(malzemeAdi) : '';
  const { kalemler, toplam } = recetePlanMaliyet(plan, ambalajlar);
  const satirlar = kalemler.map((s) => {
    const stokUyari = Number(s.mevcutMiktar) < s.adet
      ? ' <span class="text-danger">(stok yetersiz)</span>' : '';
    const birimTxt = s.birimFiyat > 0 ? ` <span class="text-muted">(${receteParaFormat(s.birimFiyat)}/adet)</span>` : '';
    return `<li class="d-flex justify-content-between align-items-start gap-2">
      <span><strong>${s.adet}</strong> bidon × <strong>${s.ambalajMiktari} ${b}</strong>${ad ? ` (${ad})` : ''}${birimTxt}${stokUyari}</span>
      <span class="fw-semibold text-nowrap">${receteParaFormat(s.tutar)}</span>
    </li>`;
  }).join('');
  const tam = recetePlanTamMi(plan);
  const fazlaMetin = tam
    ? `<span class="badge bg-success">Tam denk — ${plan.ihtiyac} ${b}</span>`
    : `<span class="text-warning">+${plan.fire} ${b} fazla</span> · ${plan.miktarToplam} ${b} toplam`;
  return `<div class="recete-oneri-blok mb-2 p-2 rounded border border-success-subtle bg-white">
    <div class="fw-semibold text-success">${gunlukMetinEsc(etiket)}</div>
    <div class="small text-muted mb-1">${plan.adetToplam} ambalaj · ${fazlaMetin}</div>
    <ul class="small mb-1 mt-1 list-unstyled">${satirlar}</ul>
    <div class="text-end border-top pt-1 small"><span class="text-muted">Kalem toplam:</span> <strong class="text-success">${receteParaFormat(toplam)}</strong></div>
  </div>`;
}

function recetePlanlarAyniMi(a, b) {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function receteVarsayilanSecimTip(oneriler) {
  if (!oneriler) return 'enYakin';
  if (oneriler.tamBolunmus || (oneriler.tamDenk && oneriler.tamUyum)) return 'tamUyum';
  if (oneriler.secimGerekli) return 'enYakin';
  return 'enYakin';
}

function receteAktifPlan(satir) {
  const o = satir.oneriler;
  if (!o) return null;
  const tip = satir.secimTip || receteVarsayilanSecimTip(o);
  if (tip === 'tamUyum' && o.tamBolunmus) return o.tamBolunmus;
  if (tip === 'tamUyum' && o.tamUyum) return o.tamUyum;
  if (tip === 'enUzak' && o.enUzak) return o.enUzak;
  if (tip === 'enYakin' && o.enYakin) return o.enYakin;
  if (tip === 'azKutu' && o.azKutu) return o.azKutu;
  return o.enYakin || o.azAtik || o.enUzak || o.tamUyum || null;
}

function receteMalzemeKartHtml(m, opts = {}) {
  const birim = m.birim || 'Lt';
  const satirKey = opts.satirKey;
  const secimTip = m.secimTip || 'azAtik';
  let oneri = '';

  const malzAd = m.grupAdi || m.urunAdi;
  if (opts.editable && m.oneriler) {
    const o = m.oneriler;
    const amb = m.ambalajlar;
    const tamPlan = o.tamBolunmus || o.tamUyum;
    if (o.tamDenk && tamPlan) {
      oneri += recetePlanSatirHtml(tamPlan, 'Verilecek ambalajlar (büyükten küçüğe)', birim, malzAd, amb);
    } else if (o.secimGerekli && o.enYakin && o.enUzak) {
      oneri += `<p class="small text-warning mb-2">Hesaplanan ${m.toplamIhtiyac} ${birim} tam ambalajlara denk gelmiyor — bir seçenek işaretleyin:</p>`;
      const chkY = secimTip === 'enYakin' || secimTip === 'tamUyum' ? 'checked' : '';
      const chkU = secimTip === 'enUzak' ? 'checked' : '';
      oneri += `<div class="form-check mb-1">
        <input class="form-check-input" type="radio" name="receteSecim_${satirKey}" id="receteEnYakin_${satirKey}" value="enYakin" ${chkY}
          onchange="receteSatirSecimDegisti('${satirKey}', 'enYakin')">
        <label class="form-check-label w-100" for="receteEnYakin_${satirKey}">${recetePlanSatirHtml(o.enYakin, 'En yakın (en az fazla)', birim, malzAd, amb)}</label>
      </div>`;
      oneri += `<div class="form-check mb-1">
        <input class="form-check-input" type="radio" name="receteSecim_${satirKey}" id="receteEnUzak_${satirKey}" value="enUzak" ${chkU}
          onchange="receteSatirSecimDegisti('${satirKey}', 'enUzak')">
        <label class="form-check-label w-100" for="receteEnUzak_${satirKey}">${recetePlanSatirHtml(o.enUzak, 'En uzak (en çok fazla)', birim, malzAd, amb)}</label>
      </div>`;
    } else {
      const plan = o.enYakin || o.azAtik;
      if (plan) oneri += recetePlanSatirHtml(plan, 'Verilecek ambalajlar', birim, malzAd, amb);
    }
  } else {
    const plan = receteAktifPlan(m) || m.oneriler?.enYakin || m.oneriler?.azAtik;
    if (plan) oneri += recetePlanSatirHtml(plan, 'Verilecek ambalajlar', birim, malzAd, m.ambalajlar);
  }

  if (!oneri && !m.ambalajlar?.length) {
    oneri = '<p class="small text-danger mb-0">Stokta ambalaj boyutu tanımlı değil (1 Lt, 5 Lt…).</p>';
  } else if (!oneri) {
    oneri = '<p class="small text-warning mb-0">Ambalaj önerisi üretilemedi.</p>';
  }

  const ambListe = (m.ambalajlar || []).map((a) =>
    `<span class="badge bg-light text-dark border me-1">${Number(a.ambalajMiktari)} ${birim} (${a.mevcutMiktar ?? 0} adet stok)</span>`
  ).join('') || '<span class="text-muted small">—</span>';

  const silBtn = opts.editable
    ? `<button type="button" class="btn btn-sm btn-outline-danger" onclick="receteSatirSil('${satirKey}')" title="Satırı kaldır"><i class="fa-solid fa-trash"></i></button>`
    : '';

  const dekarSatir = m.miktarDekar != null
    ? `<div class="col-md-6">Dozaj (malzeme × ${gunlukMetinEsc(receteCtx?.urunAdi || 'ürün')}): <strong>${m.miktarDekar}</strong> ${birim}/dekar</div>`
    : `<div class="col-md-6"><span class="text-warning small">Manuel toplam</span></div>`;

  const satirMaliyet = receteSatirMaliyet(m);
  const maliyetBadge = `<span class="badge bg-dark">${receteParaFormat(satirMaliyet.toplam)}</span>`;

  return `<div class="card mb-3 border-success shadow-sm" data-recete-satir="${satirKey || ''}">
    <div class="card-header bg-success bg-opacity-10 py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
      <strong>${gunlukMetinEsc(m.grupAdi || m.urunAdi)}</strong>
      <div class="d-flex align-items-center gap-2">${maliyetBadge}${silBtn}</div>
    </div>
    <div class="card-body py-2">
      <div class="row small mb-2">
        ${dekarSatir}
        <div class="col-md-6">Toplam: <strong>${m.toplamIhtiyac} ${birim}</strong> (${m.dekar} dekar)</div>
      </div>
      <div class="small mb-2"><span class="text-muted">Stok ambalajları:</span> ${ambListe}</div>
      ${oneri}
    </div>
  </div>`;
}

function receteOzetMetin() {
  if (!receteCtx) return '—';
  return `${receteCtx.urunAdi} · ${receteCtx.dekar} dekar · ${receteSatirlar.length} malzeme satırı`;
}

function receteSonucHtmlFromSatirlar() {
  if (!receteSatirlar.length) {
    return '<p class="text-muted small mb-0">Stoktan malzeme ekleyin (arama veya barkod).</p>';
  }
  const ozet = `<div class="alert alert-success mb-3 py-2">
    <strong>${gunlukMetinEsc(receteCtx?.urunAdi)}</strong> · <strong>${receteCtx?.dekar}</strong> dekar
    · ${receteSatirlar.length} malzeme satırı
  </div>`;
  return ozet + receteSatirlar.map((s) => receteMalzemeKartHtml(s, { editable: true, satirKey: s.key })).join('')
    + receteGenelToplamHtml();
}

function musteriRecetePanelGoster(panel) {
  const giris = document.getElementById('musteriRecetePanelGiris');
  const calisma = document.getElementById('musteriRecetePanelCalisma');
  const kayitli = document.getElementById('musteriRecetePanelKayitli');
  if (giris) giris.classList.toggle('d-none', panel !== 'giris');
  if (calisma) calisma.classList.toggle('d-none', panel !== 'calisma');
  if (kayitli) kayitli.classList.toggle('d-none', panel !== 'kayitli');
}

async function tarimUrunSelectDoldur(selectId, seciliId) {
  const sel = document.getElementById(selectId);
  if (!sel) return [];
  let list = [];
  try {
    const res = await fetch('/api/tarim-urun');
    list = await res.json();
  } catch (_) {}
  sel.innerHTML = '<option value="">— Tarım ürünü seçin —</option>'
    + list.filter((u) => u.Aktif !== false && u.Aktif !== 0)
      .map((u) => `<option value="${u.TarimUrunID}"${Number(seciliId) === Number(u.TarimUrunID) ? ' selected' : ''}>${gunlukMetinEsc(u.UrunAdi)}</option>`)
      .join('');
  return list;
}

async function receteStokCacheYukle() {
  try {
    if (typeof musteriSatisStokCache !== 'undefined' && musteriSatisStokCache.length) {
      receteStokCache = musteriSatisStokCache;
      return;
    }
    const res = await fetch('/api/stok');
    const stoklar = await res.json();
    receteStokCache = Array.isArray(stoklar) ? stoklar : [];
  } catch (_) {
    receteStokCache = [];
  }
}

function receteMalzemeListeOlustur() {
  const map = new Map();
  for (const s of receteStokCache) {
    const gid = Number(s.MalzemeGrupID || 0);
    if (gid > 0) {
      if (!map.has(gid)) {
        map.set(gid, {
          malzemeGrupID: gid,
          grupAdi: s.MalzemeGrupAdi || String(s.UrunAdi || '').split('—')[0].trim(),
          ornekStokID: s.StokID,
          ambalajSayisi: 0,
          toplamStok: 0,
          barkodlar: [],
        });
      }
      const m = map.get(gid);
      m.ambalajSayisi += 1;
      m.toplamStok += Number(s.MevcutMiktar || 0);
      if (s.Barkod) m.barkodlar.push(String(s.Barkod).trim());
    } else if (Number(s.AmbalajMiktari) > 0 || String(s.Kategori || '').toLowerCase().includes('tarım')) {
      map.set(`s_${s.StokID}`, {
        malzemeGrupID: null,
        stokID: s.StokID,
        grupAdi: s.UrunAdi,
        ornekStokID: s.StokID,
        ambalajSayisi: 1,
        toplamStok: Number(s.MevcutMiktar || 0),
        barkodlar: s.Barkod ? [String(s.Barkod).trim()] : [],
      });
    }
  }
  return [...map.values()];
}

function receteMalzemeFiltrele(kelime) {
  const raw = String(kelime || '').trim().toLocaleLowerCase('tr-TR');
  if (!raw) return [];
  const liste = receteMalzemeListeOlustur();
  return liste.filter((m) => {
    const ad = String(m.grupAdi || '').toLocaleLowerCase('tr-TR');
    if (ad.includes(raw)) return true;
    return (m.barkodlar || []).some((b) => b.toLocaleLowerCase('tr-TR').includes(raw));
  }).slice(0, 15);
}

function receteBarkodMalzemeBul(trimmed) {
  const stok = receteStokCache.find((s) => String(s.Barkod || '').trim() === trimmed);
  if (!stok) return null;
  const gid = Number(stok.MalzemeGrupID || 0);
  if (gid > 0) {
    return {
      malzemeGrupID: gid,
      grupAdi: stok.MalzemeGrupAdi || String(stok.UrunAdi || '').split('—')[0].trim(),
      ornekStokID: stok.StokID,
    };
  }
  return { stokID: stok.StokID, grupAdi: stok.UrunAdi, ornekStokID: stok.StokID };
}

function musteriReceteAramaSonuclariniGizle() {
  const el = document.getElementById('musteriReceteAramaSonuclari');
  if (!el) return;
  el.innerHTML = '';
  el.classList.remove('acik');
  el.style.display = 'none';
}

function musteriReceteAramaGuncelle(deger) {
  const el = document.getElementById('musteriReceteAramaSonuclari');
  if (!el) return;
  const kelime = String(deger || '').trim();
  if (kelime.length < 1) {
    musteriReceteAramaSonuclariniGizle();
    return;
  }
  const filtreli = receteMalzemeFiltrele(kelime);
  el.innerHTML = '';
  filtreli.forEach((m) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-group-item list-group-item-action py-2 px-3 border-0 border-bottom text-start';
    item.innerHTML = `<span class="fw-semibold">${gunlukMetinEsc(m.grupAdi)}</span><br>
      <small class="text-muted">${m.ambalajSayisi} ambalaj boyutu · ${m.toplamStok} adet toplam stok</small>`;
    item.onclick = (e) => {
      e.preventDefault();
      receteMalzemeEkle(m);
    };
    el.appendChild(item);
  });
  if (filtreli.length > 0) {
    el.classList.add('acik');
    el.style.display = 'block';
  } else musteriReceteAramaSonuclariniGizle();
}

async function musteriReceteAramaKeydown(ev) {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  const input = document.getElementById('musteriReceteArama');
  const trimmed = String(input?.value || '').trim();
  if (!trimmed) return;
  const barkodMalz = receteBarkodMalzemeBul(trimmed);
  if (barkodMalz) {
    await receteMalzemeEkle(barkodMalz);
    return;
  }
  const filtreli = receteMalzemeFiltrele(trimmed);
  if (filtreli.length === 1) await receteMalzemeEkle(filtreli[0]);
}

function receteSatirZatenVar(stokID, malzemeGrupID) {
  if (malzemeGrupID) {
    return receteSatirlar.some((s) => s.malzemeGrupID && Number(s.malzemeGrupID) === Number(malzemeGrupID));
  }
  return receteSatirlar.some((s) => Number(s.stokID) === Number(stokID));
}

async function receteSatirHesaplaApi(opts) {
  const res = await fetch('/api/recete/satir-hesapla', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      malzemeGrupID: opts.malzemeGrupID || null,
      stokID: opts.stokID || null,
      tarimUrunID: receteCtx.tarimUrunID,
      dekar: receteCtx.dekar,
      toplamLt: opts.manuelToplamLt,
    }),
  });
  return res.json();
}

async function receteMalzemeEkle(malzeme, manuelToplamLt) {
  if (!receteCtx) return alert('Önce ürün ve dekar seçin.');
  const gid = malzeme?.malzemeGrupID ? Number(malzeme.malzemeGrupID) : null;
  const stokID = malzeme?.ornekStokID || malzeme?.stokID || null;
  if (receteSatirZatenVar(stokID, gid)) {
    alert('Bu malzeme zaten listede.');
    return;
  }

  let data = await receteSatirHesaplaApi({ malzemeGrupID: gid, stokID, manuelToplamLt });
  if (!data.success && data.needsManual && manuelToplamLt == null) {
    const giris = prompt(
      `${data.message || 'Dozaj yok.'}\n\nToplam ihtiyaç (Lt/Kg):`,
      '',
    );
    if (giris == null || giris === '') return;
    const t = parseFloat(String(giris).replace(',', '.'));
    if (!Number.isFinite(t) || t <= 0) return alert('Geçerli bir miktar girin.');
    data = await receteSatirHesaplaApi({ malzemeGrupID: gid, stokID, manuelToplamLt: t });
  }
  if (!data.success) {
    alert(data.message || 'Hesaplanamadı.');
    return;
  }

  const secimTip = receteVarsayilanSecimTip(data.oneriler);
  const sat = await receteSatirEkleFromData(data, secimTip);
  if (!sat) return;
  receteSatirlar.push(sat);

  const arama = document.getElementById('musteriReceteArama');
  if (arama) arama.value = '';
  musteriReceteAramaSonuclariniGizle();
  receteSatirlarRender();
  setTimeout(() => arama?.focus(), 80);
}

function receteSatirSil(key) {
  receteSatirlar = receteSatirlar.filter((s) => s.key !== key);
  receteSatirlarRender();
}

function receteSatirSecimDegisti(key, tip) {
  const sat = receteSatirlar.find((s) => s.key === key);
  if (sat) {
    sat.secimTip = tip;
    receteSatirlarRender();
  }
}

function receteSatirlarRender() {
  const wrap = document.getElementById('musteriReceteSatirlar');
  const ozet = document.getElementById('musteriReceteOzetBar');
  if (ozet) ozet.textContent = receteOzetMetin();
  if (wrap) wrap.innerHTML = receteSonucHtmlFromSatirlar();
}

function receteSatirFromData(data, secimTip) {
  const key = `r${Date.now()}_${data.malzemeGrupID || data.stokID}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    key,
    stokID: data.stokID,
    urunAdi: data.grupAdi || data.urunAdi,
    grupAdi: data.grupAdi,
    malzemeGrupID: data.malzemeGrupID,
    miktarDekar: data.miktarDekar,
    birim: data.birim,
    dekar: data.dekar,
    toplamIhtiyac: data.toplamIhtiyac,
    ambalajlar: data.ambalajlar,
    oneriler: data.oneriler,
    secimTip: secimTip || receteVarsayilanSecimTip(data.oneriler),
  };
}

async function receteSatirEkleFromData(data, secimTip) {
  if (!data?.success) return null;
  return receteSatirFromData(data, secimTip);
}

async function receteSatirYenidenHesapla(satir, manuelToplamLt) {
  const data = await receteSatirHesaplaApi({
    malzemeGrupID: satir.malzemeGrupID,
    stokID: satir.stokID,
    manuelToplamLt: manuelToplamLt,
  });
  if (!data.success) return null;
  const yeni = receteSatirFromData(data, satir.secimTip || receteVarsayilanSecimTip(data.oneriler));
  yeni.key = satir.key;
  return yeni;
}

async function musteriReceteUrunDekarDegisti() {
  const uid = Number(document.getElementById('musteriReceteUrunIDCalisma')?.value);
  const dekar = parseFloat(document.getElementById('musteriReceteDekarCalisma')?.value);
  if (!uid || !Number.isFinite(dekar) || dekar <= 0) return;

  const sel = document.getElementById('musteriReceteUrunIDCalisma');
  const urunAdi = sel?.selectedOptions?.[0]?.textContent?.trim() || '';
  receteCtx = {
    ...receteCtx,
    tarimUrunID: uid,
    dekar,
    urunAdi,
  };

  const eski = [...receteSatirlar];
  receteSatirlar = [];
  for (const s of eski) {
    const manuel = s.miktarDekar == null ? s.toplamIhtiyac : null;
    const sat = await receteSatirYenidenHesapla(s, manuel);
    if (sat) receteSatirlar.push(sat);
  }
  receteSatirlarRender();
}

async function musteriReceteModalAc() {
  if (!aktifMusteriDetayID) {
    alert('Önce bir müşteri cari kartı açın.');
    return;
  }
  receteCtx = {
    musteriID: aktifMusteriDetayID,
    musteriAd: document.getElementById('mdAdSoyad')?.textContent || 'Müşteri',
  };
  receteSatirlar = [];
  receteKayitliGoruntuleme = null;

  musteriRecetePanelGoster('giris');
  const detay = document.getElementById('musteriReceteKayitliDetay');
  if (detay) { detay.classList.add('d-none'); detay.innerHTML = ''; }

  const baslik = document.getElementById('musteriReceteMusteriAd');
  if (baslik) baslik.textContent = receteCtx.musteriAd;

  const dekarInp = document.getElementById('musteriReceteDekar');
  if (dekarInp && !dekarInp.value) dekarInp.value = '10';

  await tarimUrunSelectDoldur('musteriReceteUrunID');
  await receteStokCacheYukle();
  await musteriAltModalAc(document.getElementById('musteriReceteModal'));
}

async function musteriReceteDevam() {
  const uid = Number(document.getElementById('musteriReceteUrunID')?.value);
  const dekar = parseFloat(document.getElementById('musteriReceteDekar')?.value);
  if (!uid) return alert('Tarım ürünü seçin.');
  if (!Number.isFinite(dekar) || dekar <= 0) return alert('Geçerli bir dekar girin.');

  const sel = document.getElementById('musteriReceteUrunID');
  const urunAdi = sel?.selectedOptions?.[0]?.textContent?.trim() || '';

  receteCtx = {
    musteriID: aktifMusteriDetayID,
    musteriAd: document.getElementById('mdAdSoyad')?.textContent || 'Müşteri',
    tarimUrunID: uid,
    dekar,
    urunAdi,
  };

  await tarimUrunSelectDoldur('musteriReceteUrunIDCalisma', uid);
  const dCal = document.getElementById('musteriReceteDekarCalisma');
  if (dCal) dCal.value = String(dekar);

  const notlar = document.getElementById('musteriReceteNotlar');
  if (notlar) notlar.value = '';

  musteriRecetePanelGoster('calisma');
  receteSatirlarRender();
  setTimeout(() => document.getElementById('musteriReceteArama')?.focus(), 200);
}

function musteriReceteGeri() {
  musteriRecetePanelGoster('giris');
}

function musteriReceteGeriKayitliden() {
  const detay = document.getElementById('musteriReceteKayitliDetay');
  if (detay?.classList.contains('d-none') === false && receteSatirlar.length) {
    musteriRecetePanelGoster('calisma');
    return;
  }
  if (receteSatirlar.length) musteriRecetePanelGoster('calisma');
  else musteriRecetePanelGoster('giris');
}

async function musteriReceteKaydet() {
  if (!receteCtx || !receteSatirlar.length) return alert('Kaydetmek için en az bir malzeme ekleyin.');
  const btn = document.getElementById('musteriReceteKaydetBtn');
  if (btn) btn.disabled = true;
  try {
    const satirlar = receteSatirlar.map((s) => {
      const plan = receteAktifPlan(s);
      const secimTipKayit = s.secimTip || 'enYakin';
      const maliyet = receteSatirMaliyet(s);
      const planKayit = (plan?.secim || []).map((p) => {
        const birimFiyat = p.satisFiyati != null ? Number(p.satisFiyati) : receteStokFiyatBul(p.stokID, s.ambalajlar);
        return {
          ...p,
          satisFiyati: birimFiyat,
          satirTutar: Math.round(p.adet * birimFiyat * 100) / 100,
        };
      });
      return {
        stokID: s.stokID,
        urunAdi: s.grupAdi || s.urunAdi,
        malzemeGrupID: s.malzemeGrupID,
        miktarDekar: s.miktarDekar,
        birim: s.birim,
        toplamIhtiyac: s.toplamIhtiyac,
        secimTip: secimTipKayit,
        satirMaliyet: maliyet.toplam,
        plan: planKayit,
      };
    });
    const genelToplam = receteGenelMaliyetToplam();
    const res = await fetch('/api/recete/kaydet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        musteriID: receteCtx.musteriID,
        tarimUrunID: receteCtx.tarimUrunID,
        dekar: receteCtx.dekar,
        notlar: document.getElementById('musteriReceteNotlar')?.value || '',
        kullanici: typeof aktifKullanici !== 'undefined' ? aktifKullanici : 'Sistem',
        satirlar,
        genelToplam,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Kayıt başarısız.');
      return;
    }
    alert(`Reçete kaydedildi (No: ${data.receteID}).`);
  } catch (_) {
    alert('Sunucuya ulaşılamadı.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function receteKayitliSatirMaliyet(row) {
  const plan = row.plan || [];
  let toplam = Number(row.satirMaliyet);
  if (!Number.isFinite(toplam) || toplam <= 0) {
    toplam = plan.reduce((acc, p) => {
      const satirT = Number(p.satirTutar);
      if (Number.isFinite(satirT)) return acc + satirT;
      const bf = p.satisFiyati != null ? Number(p.satisFiyati) : receteStokFiyatBul(p.stokID, []);
      return acc + (Number(p.adet) || 0) * bf;
    }, 0);
  }
  return Math.round(toplam * 100) / 100;
}

function receteRaporKaynakSatirlari() {
  if (receteKayitliGoruntuleme) {
    const dekar = Number(receteKayitliGoruntuleme.recete?.Dekar);
    return (receteKayitliGoruntuleme.satirlar || []).map((row) => {
      const plan = row.plan || [];
      return {
        grupAdi: row.UrunAdi,
        miktarDekar: row.MiktarDekar,
        birim: row.Birim || 'Lt',
        toplamIhtiyac: row.ToplamIhtiyac,
        dekar,
        plan: plan.length ? { secim: plan } : null,
        ambalajlar: plan.map((p) => ({ stokID: p.stokID, satisFiyati: p.satisFiyati })),
      };
    });
  }
  return receteSatirlar.map((s) => ({
    grupAdi: s.grupAdi || s.urunAdi,
    miktarDekar: s.miktarDekar,
    birim: s.birim || 'Lt',
    toplamIhtiyac: s.toplamIhtiyac,
    dekar: s.dekar ?? receteCtx?.dekar,
    plan: receteAktifPlan(s),
    ambalajlar: s.ambalajlar,
  }));
}

function receteRaporBloklariOlustur() {
  const bloklar = [];
  for (const s of receteRaporKaynakSatirlari()) {
    const birim = s.birim || 'Lt';
    const maliyet = recetePlanMaliyet(s.plan, s.ambalajlar);
    if (!maliyet.kalemler.length) continue;
    bloklar.push({
      malzeme: s.grupAdi || '—',
      birim,
      ihtiyac: `${s.toplamIhtiyac} ${birim}`,
      dozaj: s.miktarDekar != null ? `${s.miktarDekar} ${birim}/da` : null,
      dekar: s.dekar,
      kalemler: maliyet.kalemler.map((k) => ({
        ambalajMiktari: k.ambalajMiktari,
        adet: k.adet,
        birimFiyat: k.birimFiyat,
        tutar: k.tutar,
      })),
      toplam: maliyet.toplam,
    });
  }
  return bloklar;
}

function receteRaporGenelToplam(bloklar) {
  if (receteKayitliGoruntuleme) {
    let t = Number(receteKayitliGoruntuleme.genelToplam);
    if (Number.isFinite(t) && t > 0) return Math.round(t * 100) / 100;
  }
  return Math.round(bloklar.reduce((acc, b) => acc + b.toplam, 0) * 100) / 100;
}

function receteRaporTabloGovdesi(bloklar) {
  let sira = 0;
  let satirlar = '';
  for (const b of bloklar) {
    const n = b.kalemler.length;
    b.kalemler.forEach((k, i) => {
      sira += 1;
      const malzemeHucre = i === 0
        ? `<td rowspan="${n}" class="malzeme">
            <div class="ad">${gunlukMetinEsc(b.malzeme)}</div>
            <div class="alt">${gunlukMetinEsc(b.ihtiyac)}${b.dozaj ? ` · ${gunlukMetinEsc(b.dozaj)}` : ''}</div>
          </td>`
        : '';
      satirlar += `<tr class="${i === 0 ? 'grup-ust' : ''}">
        <td class="c nw">${sira}</td>
        ${malzemeHucre}
        <td class="nw">${k.adet} × ${k.ambalajMiktari} ${gunlukMetinEsc(b.birim)}</td>
        <td class="r c">${k.adet}</td>
        <td class="r">${receteParaFormat(k.birimFiyat)}</td>
        <td class="r b">${receteParaFormat(k.tutar)}</td>
      </tr>`;
    });
    satirlar += `<tr class="malzeme-toplam">
      <td colspan="5" class="r etiket">Malzeme toplamı</td>
      <td class="r b">${receteParaFormat(b.toplam)}</td>
    </tr>`;
  }
  return satirlar || '<tr><td colspan="6" class="c muted">Kalem yok.</td></tr>';
}

function receteRaporA4DokumaniOlustur(meta, bloklar, genelToplam) {
  const company = {
    unvan: gunlukMetinEsc(typeof uygulamaAyarlari !== 'undefined' ? (uygulamaAyarlari?.SirketUnvan || '') : ''),
    tel: gunlukMetinEsc(typeof uygulamaAyarlari !== 'undefined' ? (uygulamaAyarlari?.SirketTelefon || '') : ''),
  };
  const firmSatir = company.unvan
    ? `<div class="firm">${company.unvan}${company.tel ? ` · Tel: ${company.tel}` : ''}</div>`
    : '';
  const receteNo = meta.receteNo ? `<div><b>Reçete no:</b> ${meta.receteNo}</div>` : '';
  const govde = receteRaporTabloGovdesi(bloklar);
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Reçete — ${gunlukMetinEsc(meta.musteriAd || '')}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; font-size: 11pt; line-height: 1.35; }
    h1 { font-size: 17pt; margin: 0 0 2px; letter-spacing: -0.02em; }
    .firm { font-size: 9.5pt; color: #555; margin-bottom: 10px; }
    .ust { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 12px; }
    .tarih { font-size: 9.5pt; color: #444; text-align: right; white-space: nowrap; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 28px; font-size: 10pt; margin-bottom: 14px; }
    .meta b { display: inline-block; min-width: 72px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    col.c-sira { width: 6%; }
    col.c-malz { width: 28%; }
    col.c-amb { width: 22%; }
    col.c-adet { width: 8%; }
    col.c-fiyat { width: 18%; }
    col.c-tutar { width: 18%; }
    th, td { border: 1px solid #999; padding: 5px 7px; vertical-align: top; }
    th { background: #e8f5e9; font-size: 9pt; font-weight: 700; text-align: left; }
    th.r, td.r { text-align: right; }
    th.c, td.c { text-align: center; }
    td.nw { white-space: nowrap; }
    td.b { font-weight: 700; }
    td.malzeme .ad { font-weight: 700; font-size: 10.5pt; }
    td.malzeme .alt { font-size: 8.5pt; color: #444; margin-top: 2px; }
    tr.grup-ust td { border-top: 2px solid #333; }
    tr.malzeme-toplam td { background: #f4f4f4; border-top: 1px dashed #888; font-size: 9.5pt; }
    tr.malzeme-toplam td.etiket { color: #555; padding-right: 10px; }
    td.muted { color: #666; text-align: center; padding: 16px; }
    .genel { margin-top: 14px; display: flex; justify-content: flex-end; }
    .genel-kutu { border: 2px solid #222; padding: 10px 18px; min-width: 240px; text-align: right; }
    .genel-kutu .etiket { font-size: 10pt; color: #444; margin-bottom: 2px; }
    .genel-kutu .tutar { font-size: 15pt; font-weight: 700; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="ust">
    <div>
      <h1>Tarım Reçetesi</h1>
      ${firmSatir}
    </div>
    <div class="tarih">${gunlukMetinEsc(meta.tarih || '')}</div>
  </div>
  <div class="meta">
    <div><b>Müşteri:</b> ${gunlukMetinEsc(meta.musteriAd || '—')}</div>
    <div><b>Tarım ürünü:</b> ${gunlukMetinEsc(meta.urunAdi || '—')}</div>
    <div><b>Dekar:</b> ${gunlukMetinEsc(String(meta.dekar ?? '—'))}</div>
    <div><b>Kalem:</b> ${bloklar.length} malzeme</div>
    ${receteNo}
  </div>
  <table>
    <colgroup>
      <col class="c-sira"><col class="c-malz"><col class="c-amb"><col class="c-adet"><col class="c-fiyat"><col class="c-tutar">
    </colgroup>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>Malzeme</th>
        <th>Verilecek ambalaj</th>
        <th class="c">Adet</th>
        <th class="r">Birim fiyat</th>
        <th class="r">Tutar</th>
      </tr>
    </thead>
    <tbody>${govde}</tbody>
  </table>
  <div class="genel">
    <div class="genel-kutu">
      <div class="etiket">Reçete genel toplam</div>
      <div class="tutar">${receteParaFormat(genelToplam)}</div>
    </div>
  </div>
</body>
</html>`;
}

async function musteriReceteYazdir() {
  if (!receteCtx) return alert('Reçete yok.');
  if (!receteKayitliGoruntuleme && !receteSatirlar.length) return alert('Yazdırmak için malzeme ekleyin.');
  await receteStokCacheYukle();
  const bloklar = receteRaporBloklariOlustur();
  if (!bloklar.length) return alert('Rapor için ambalaj satırı bulunamadı.');
  const genelToplam = receteRaporGenelToplam(bloklar);
  const d = receteCtx;
  const html = receteRaporA4DokumaniOlustur({
    musteriAd: d.musteriAd,
    urunAdi: d.urunAdi || receteKayitliGoruntuleme?.recete?.TarimUrunAdi,
    dekar: d.dekar ?? receteKayitliGoruntuleme?.recete?.Dekar,
    tarih: new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }),
    receteNo: receteKayitliGoruntuleme?.recete?.ReceteID || null,
  }, bloklar, genelToplam);
  if (typeof belgeOnizlemeAcHtml === 'function') {
    belgeOnizlemeAcHtml(html, '<i class="fa-solid fa-seedling me-2"></i>Reçete raporu (A4)');
  } else {
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }
}

async function musteriReceteKayitliPanelAc() {
  if (!aktifMusteriDetayID) return;
  musteriRecetePanelGoster('kayitli');
  const liste = document.getElementById('musteriReceteKayitliListe');
  const detay = document.getElementById('musteriReceteKayitliDetay');
  if (detay) { detay.classList.add('d-none'); detay.innerHTML = ''; }
  receteKayitliGoruntuleme = null;
  if (liste) liste.innerHTML = '<p class="text-muted small">Yükleniyor…</p>';
  try {
    const res = await fetch(`/api/musteri/${aktifMusteriDetayID}/receteler`);
    const rows = await res.json();
    if (!rows.length) {
      liste.innerHTML = '<p class="text-muted small mb-0">Bu müşteri için kayıtlı reçete yok.</p>';
      return;
    }
    liste.innerHTML = `<div class="list-group">${rows.map((r) => {
      const tarih = r.Tarih ? new Date(r.Tarih).toLocaleString('tr-TR') : '—';
      return `<button type="button" class="list-group-item list-group-item-action" onclick="musteriReceteKayitliGoster(${r.ReceteID})">
        <div class="d-flex justify-content-between">
          <strong>${gunlukMetinEsc(r.TarimUrunAdi)}</strong>
          <span class="badge bg-success">${r.Dekar} da</span>
        </div>
        <small class="text-muted">${tarih} · ${r.KalemSayisi || 0} kalem · ${gunlukMetinEsc(r.Kullanici || '')}</small>
      </button>`;
    }).join('')}</div>`;
  } catch (_) {
    if (liste) liste.innerHTML = '<p class="text-danger small">Liste alınamadı.</p>';
  }
}

async function musteriReceteKayitliGoster(receteID) {
  const detay = document.getElementById('musteriReceteKayitliDetay');
  if (!detay) return;
  detay.classList.remove('d-none');
  detay.innerHTML = '<p class="text-muted small">Yükleniyor…</p>';
  try {
    const res = await fetch(`/api/recete/${receteID}`);
    const data = await res.json();
    if (!data.success) {
      detay.innerHTML = '<p class="text-danger small">Reçete bulunamadı.</p>';
      return;
    }
    await receteStokCacheYukle();
    receteKayitliGoruntuleme = data;
    receteCtx = {
      musteriID: aktifMusteriDetayID,
      musteriAd: document.getElementById('musteriReceteMusteriAd')?.textContent || '',
      tarimUrunID: data.recete.TarimUrunID,
      dekar: Number(data.recete.Dekar),
      urunAdi: data.recete.TarimUrunAdi,
    };
    let genelToplam = Number(data.genelToplam);
    const kartlar = data.satirlar.map((row) => {
      const plan = row.plan || [];
      const ambalajlar = plan.map((p) => ({
        stokID: p.stokID,
        satisFiyati: p.satisFiyati,
      }));
      const m = {
        grupAdi: row.UrunAdi,
        miktarDekar: row.MiktarDekar,
        birim: row.Birim,
        toplamIhtiyac: row.ToplamIhtiyac,
        dekar: data.recete.Dekar,
        ambalajlar,
        oneriler: {},
      };
      if (plan.length) {
        const t = plan.reduce((a, x) => a + x.adet * (x.ambalajMiktari || 0), 0);
        m.oneriler.tamDenk = true;
        m.oneriler.tamBolunmus = {
          secim: plan,
          adetToplam: plan.reduce((a, x) => a + x.adet, 0),
          miktarToplam: Math.round(t * 1000) / 1000,
          fire: Math.round((t - row.ToplamIhtiyac) * 1000) / 1000,
          ihtiyac: row.ToplamIhtiyac,
        };
      }
      return receteMalzemeKartHtml(m);
    }).join('');
    if (!Number.isFinite(genelToplam) || genelToplam <= 0) {
      genelToplam = data.satirlar.reduce((acc, row) => acc + receteKayitliSatirMaliyet(row), 0);
    }
    data.genelToplam = genelToplam;
    const not = data.recete.Notlar ? `<p class="small"><em>Not:</em> ${gunlukMetinEsc(data.recete.Notlar)}</p>` : '';
    detay.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">Reçete #${receteID}</h6>
        <button type="button" class="btn btn-sm btn-outline-dark" onclick="musteriReceteYazdir()"><i class="fa-solid fa-print me-1"></i>Yazdır</button>
      </div>
      <div class="alert alert-success py-2 small">${gunlukMetinEsc(data.recete.TarimUrunAdi)} · ${data.recete.Dekar} dekar</div>
      ${not}${kartlar}${receteGenelToplamHtml(genelToplam)}`;
  } catch (_) {
    detay.innerHTML = '<p class="text-danger small">Okuma hatası.</p>';
  }
}

async function receteHesapla(tarimUrunID, dekar, ekstra) {
  const res = await fetch('/api/recete/hesapla', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tarimUrunID,
      dekar,
      musteriID: ekstra?.musteriID,
      kullanici: ekstra?.kullanici,
    }),
  });
  return res.json();
}

function receteSonucHtml(data) {
  if (!data?.success) {
    return `<p class="text-danger">${gunlukMetinEsc(data?.message || 'Hesaplama hatası')}</p>`;
  }
  if (!data.malzemeler?.length) {
    return `<div class="alert alert-warning mb-0">
      <strong>${gunlukMetinEsc(data.urunAdi)}</strong> için tanımlı malzeme/dozaj yok.
      <hr class="my-2">
      <span class="small">Tanımlamalar → Malzemeler: malzeme + tarım ürünü için dozaj tanımlayın.</span>
    </div>`;
  }
  const ozet = `<div class="alert alert-success mb-3 py-2">
    <strong>${gunlukMetinEsc(data.urunAdi)}</strong> · <strong>${data.dekar}</strong> dekar
    · ${data.malzemeler.length} malzeme satırı
  </div>`;
  return ozet + data.malzemeler.map((m) => receteMalzemeKartHtml(m)).join('');
}

function receteTestHesapla() {
  const uid = Number(document.getElementById('receteTestUrunID')?.value);
  const dekar = parseFloat(document.getElementById('receteTestDekar')?.value);
  const out = document.getElementById('receteTestSonuc');
  if (!out) return;
  if (!uid || !Number.isFinite(dekar) || dekar <= 0) {
    out.innerHTML = '<p class="text-muted small mb-0">Ürün ve dekar girin.</p>';
    return;
  }
  out.innerHTML = '<p class="text-muted small">Hesaplanıyor…</p>';
  receteHesapla(uid, dekar)
    .then((data) => { out.innerHTML = receteSonucHtml(data); })
    .catch(() => { out.innerHTML = '<p class="text-danger small">Sunucu hatası.</p>'; });
}

async function receteTestUrunSelectDoldur() {
  await tarimUrunSelectDoldur('receteTestUrunID');
}
