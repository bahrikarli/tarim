/** Müşteri reçetesi — stoktan malzeme seç, dekar × dozaj, ambalaj önerisi, kayıt */

let receteCtx = null;
let receteSatirlar = [];
let receteStokCache = [];
let receteKayitliGoruntuleme = null;
let receteAktifKayitliID = null;
let receteSolListeSatirlari = [];

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

function receteBirimUzun(birim) {
  const b = String(birim || 'Lt').trim();
  if (/^lt$/i.test(b)) return 'Litre';
  if (/^kg$/i.test(b)) return 'Kilogram';
  return b;
}

function receteAmbalajMiktariFmt(miktar, birim) {
  const v = Number(miktar);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `${v} ${birim || 'Lt'}`;
}

function receteStokUrunAdi(stokID, kaynak) {
  const ad = kaynak?.urunAdi;
  if (ad && String(ad).trim()) return String(ad).trim();
  const s = receteStokCache.find((x) => Number(x.StokID) === Number(stokID));
  return s?.UrunAdi ? String(s.UrunAdi).trim() : '';
}

function receteAmbalajTekSatirFmt(adet, miktar, birim, urunAdi) {
  const a = Number(adet) || 0;
  const m = Number(miktar);
  const bu = receteBirimUzun(birim);
  const amb = !Number.isFinite(m) || m <= 0
    ? `ambalaj, ${a} adet`
    : `ambalaj, ${a} adet-${m} ${bu}`;
  const ad = urunAdi ? String(urunAdi).trim() : '';
  return ad ? `${gunlukMetinEsc(ad)} — ${amb}` : amb;
}

function receteAmbalajSatirFmt(adet, miktar, birim) {
  return receteAmbalajTekSatirFmt(adet, miktar, birim);
}

function receteAmbalajlarFromPlan(m) {
  const plan = receteAktifPlan(m) || m.oneriler?.tamBolunmus || m.oneriler?.enYakin;
  if (!plan?.secim?.length) return m.ambalajlar || [];
  const byKey = new Map();
  for (const s of plan.secim) {
    const mk = Number(s.ambalajMiktari);
    const key = Number.isFinite(mk) && mk > 0 ? `m${mk}` : `s${s.stokID}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        stokID: s.stokID,
        ambalajMiktari: Number.isFinite(mk) ? mk : 0,
        mevcutMiktar: s.mevcutMiktar,
        satisFiyati: s.satisFiyati,
      });
    }
  }
  const fromPlan = [...byKey.values()];
  const kaynak = m.ambalajlar || [];
  if (!kaynak.length) return fromPlan;
  return kaynak.map((a) => ({
    ...a,
    ambalajMiktari: Number.isFinite(Number(a.ambalajMiktari)) && Number(a.ambalajMiktari) > 0
      ? Number(a.ambalajMiktari)
      : fromPlan.find((p) => Number(p.stokID) === Number(a.stokID))?.ambalajMiktari || 0,
  })).filter((a) => Number(a.ambalajMiktari) > 0);
}

function recetePlanKompaktHtml(plan, birim, ambalajlar, opts = {}) {
  if (!plan?.secim?.length) return '';
  const b = birim || 'Lt';
  const { kalemler, toplam } = recetePlanMaliyet(plan, ambalajlar);
  const tam = recetePlanTamMi(plan);
  const satirlar = kalemler.map((s) => {
    const stokAd = gunlukMetinEsc(receteStokUrunAdi(s.stokID, s) || '—');
    const stokUyari = Number(s.mevcutMiktar) < s.adet
      ? '<span class="badge bg-danger-subtle text-danger ms-1">stok!</span>'
      : '';
    return `<tr>
      <td class="recete-plan-urun">${stokAd}${stokUyari}</td>
      <td class="text-end text-nowrap">${s.adet}</td>
      <td class="text-end text-nowrap">${receteParaFormat(s.birimFiyat)}</td>
      <td class="text-end text-nowrap fw-semibold">${receteParaFormat(s.tutar)}</td>
    </tr>`;
  }).join('');
  const fireNot = !tam && plan.fire > 0
    ? `<div class="small text-warning py-1 px-2 border-top">(+${plan.fire} ${b} fazla ambalaj)</div>`
    : '';
  const baslik = opts.baslik
    ? `<div class="small text-muted px-2 pt-1">${gunlukMetinEsc(opts.baslik)}</div>`
    : '';
  const altToplam = kalemler.length > 1
    ? `<tr class="recete-plan-alt-toplam">
        <td colspan="3" class="text-end text-muted small">Satır toplamı</td>
        <td class="text-end text-nowrap fw-bold text-success">${receteParaFormat(toplam)}</td>
      </tr>`
    : '';
  return `<div class="recete-plan-kompakt">
    ${baslik}
    <table class="table table-sm recete-plan-fatura mb-0">
      <thead>
        <tr>
          <th>Ürün</th>
          <th class="text-end" style="width:4.5rem;">Adet</th>
          <th class="text-end" style="width:6.5rem;">Birim fiyat</th>
          <th class="text-end" style="width:6.5rem;">Toplam</th>
        </tr>
      </thead>
      <tbody>${satirlar}${altToplam}</tbody>
    </table>
    ${fireNot}
  </div>`;
}

function recetePlanSatirHtml(plan, etiket, birim, malzemeAdi, ambalajlar) {
  return recetePlanKompaktHtml(plan, birim, ambalajlar, { baslik: etiket });
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
  const satirKey = opts.satirKey || `k${Math.random().toString(36).slice(2, 8)}`;
  const secimTip = m.secimTip || 'azAtik';
  const detayId = `receteDetay_${satirKey}`;
  const amb = receteAmbalajlarFromPlan(m);
  const malzAd = m.grupAdi || m.urunAdi;
  let planHtml = '';

  if (opts.editable && m.oneriler) {
    const o = m.oneriler;
    const tamPlan = o.tamBolunmus || o.tamUyum;
    if (o.tamDenk && tamPlan) {
      planHtml = recetePlanKompaktHtml(tamPlan, birim, amb);
    } else if (o.secimGerekli && o.enYakin && o.enUzak) {
      const chkY = secimTip === 'enYakin' || secimTip === 'tamUyum' ? 'checked' : '';
      const chkU = secimTip === 'enUzak' ? 'checked' : '';
      planHtml = `<p class="small text-warning mb-1 py-0">Tam denk değil — seçin:</p>
        <div class="form-check form-check-inline small mb-1">
          <input class="form-check-input" type="radio" name="receteSecim_${satirKey}" id="receteEnYakin_${satirKey}" value="enYakin" ${chkY} onchange="receteSatirSecimDegisti('${satirKey}', 'enYakin')">
          <label class="form-check-label" for="receteEnYakin_${satirKey}">En yakın</label>
        </div>
        <div class="form-check form-check-inline small mb-2">
          <input class="form-check-input" type="radio" name="receteSecim_${satirKey}" id="receteEnUzak_${satirKey}" value="enUzak" ${chkU} onchange="receteSatirSecimDegisti('${satirKey}', 'enUzak')">
          <label class="form-check-label" for="receteEnUzak_${satirKey}">En uzak</label>
        </div>
        ${recetePlanKompaktHtml(secimTip === 'enUzak' ? o.enUzak : o.enYakin, birim, amb)}`;
    } else {
      const plan = o.enYakin || o.azAtik;
      if (plan) planHtml = recetePlanKompaktHtml(plan, birim, amb);
    }
  } else {
    const plan = receteAktifPlan(m) || m.oneriler?.tamBolunmus || m.oneriler?.enYakin || m.oneriler?.azAtik;
    if (plan) planHtml = recetePlanKompaktHtml(plan, birim, amb);
  }

  if (!planHtml && !amb.length) {
    planHtml = '<p class="small text-danger mb-0">Stokta ambalaj boyutu tanımlı değil.</p>';
  } else if (!planHtml) {
    planHtml = '<p class="small text-warning mb-0">Ambalaj planı yok.</p>';
  }

  const stokParca = amb
    .filter((a) => Number(a.ambalajMiktari) > 0)
    .map((a) => `${receteAmbalajMiktariFmt(a.ambalajMiktari, birim)} · ${Number(a.mevcutMiktar ?? 0)} stok`)
    .join(', ');

  const kalemNot = receteKalemNotMetni(m, opts, birim, stokParca);
  const kalemBaslik = `<div class="flex-grow-1 min-w-0">
    <div class="d-flex flex-wrap align-items-baseline column-gap-2 row-gap-0">
      <strong class="mb-0">${gunlukMetinEsc(m.grupAdi || m.urunAdi)}</strong>
      ${kalemNot ? `<span class="small text-muted recete-kalem-not">${kalemNot}</span>` : ''}
    </div>
  </div>`;

  const silBtn = opts.editable
    ? `<button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" onclick="receteSatirSil('${satirKey}')" title="Kaldır"><i class="fa-solid fa-xmark"></i></button>`
    : '';

  const satirMaliyet = receteSatirMaliyet(m);
  const maliyetBadge = `<span class="badge bg-dark">${receteParaFormat(satirMaliyet.toplam)}</span>`;

  if (opts.testModu) {
    return `<div class="recete-kalem border rounded mb-2 shadow-sm" data-recete-satir="${satirKey}">
      <div class="recete-kalem-ust d-flex align-items-center flex-wrap gap-2 px-2 py-2 bg-light">
        ${kalemBaslik}
        ${maliyetBadge}
      </div>
      <div class="px-2 pb-2 border-top bg-white">${planHtml}</div>
    </div>`;
  }

  return `<div class="recete-kalem border rounded mb-2 shadow-sm" data-recete-satir="${satirKey}">
    <div class="recete-kalem-ust d-flex align-items-center flex-wrap gap-2 px-2 py-2 bg-light">
      ${kalemBaslik}
      ${maliyetBadge}
      <button type="button" class="btn btn-sm btn-outline-secondary btn-dozaj py-0 px-2" data-bs-toggle="collapse" data-bs-target="#${detayId}" aria-expanded="false" title="Verilecek ambalajlar">
        <i class="fa-solid fa-box me-1"></i>Ambalaj
      </button>
      ${silBtn}
    </div>
    <div class="collapse" id="${detayId}">
      <div class="px-2 py-2 border-top bg-white">${planHtml}</div>
    </div>
  </div>`;
}

function receteKalemNotMetni(m, opts, birim, stokParca) {
  const b = birim || m.birim || 'Lt';
  const tarimUrun = gunlukMetinEsc(opts.tarimUrunAdi || receteCtx?.urunAdi || m.tarimUrunAdi || '');
  const parcalar = [];
  if (tarimUrun) parcalar.push(tarimUrun);
  if (m.miktarDekar != null) {
    parcalar.push(`${m.miktarDekar} ${b}/da`);
    parcalar.push(`ihtiyaç ${m.toplamIhtiyac} ${b}`);
    parcalar.push(`${m.dekar} da`);
  } else {
    parcalar.push(`toplam ${m.toplamIhtiyac} ${b}`);
  }
  if (stokParca) parcalar.push(`stok: ${stokParca}`);
  return parcalar.join(' · ');
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
  return ozet + receteSatirlar.map((s) => receteMalzemeKartHtml(s, {
    editable: true,
    satirKey: s.key,
    tarimUrunAdi: receteCtx?.urunAdi,
  })).join('')
    + receteGenelToplamHtml();
}

function musteriReceteSagPanelGoster(panel) {
  const bos = document.getElementById('musteriReceteSagBos');
  const calisma = document.getElementById('musteriRecetePanelCalisma');
  const detay = document.getElementById('musteriReceteSagDetay');
  if (bos) bos.classList.toggle('d-none', panel !== 'bos');
  if (calisma) calisma.classList.toggle('d-none', panel !== 'calisma');
  if (detay) detay.classList.toggle('d-none', panel !== 'detay');
}

function receteSolListeAktif(receteID) {
  receteAktifKayitliID = receteID != null ? Number(receteID) : null;
  document.querySelectorAll('[data-recete-liste-id]').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.receteListeId) === receteAktifKayitliID);
  });
}

function musteriReceteOzetBarGuncelle() {
  const bar = document.getElementById('musteriReceteOzetBar');
  if (bar && receteCtx?.urunAdi) bar.textContent = receteOzetMetin();
}

async function musteriReceteSolListeYukle(seciliID) {
  const liste = document.getElementById('musteriReceteSolListe');
  if (!liste || !aktifMusteriDetayID) return [];
  liste.innerHTML = '<p class="text-muted small mb-0 py-2">Yükleniyor…</p>';
  try {
    const res = await fetch(`/api/musteri/${aktifMusteriDetayID}/receteler`);
    const rows = await res.json();
    receteSolListeSatirlari = Array.isArray(rows) ? rows : [];
    if (!rows.length) {
      liste.innerHTML = '<p class="text-muted small mb-0 py-2">Henüz kayıtlı reçete yok.</p>';
      return [];
    }
    liste.innerHTML = `<div class="list-group list-group-flush">${rows.map((r) => {
      const tarih = r.Tarih ? new Date(r.Tarih).toLocaleDateString('tr-TR') : '—';
      const aktif = Number(seciliID) === Number(r.ReceteID) ? ' active' : '';
      const satildi = r.SatisYapildi ? '<span class="badge bg-primary mt-1">Satış ✓</span>' : '';
      return `<button type="button" class="list-group-item list-group-item-action${aktif}" data-recete-liste-id="${r.ReceteID}" onclick="musteriReceteKayitliGoster(${r.ReceteID})">
        <div class="d-flex justify-content-between align-items-start gap-1 flex-wrap">
          <strong class="small">${gunlukMetinEsc(r.TarimUrunAdi)}</strong>
          <span class="badge bg-success">${r.Dekar} da</span>
        </div>
        <small class="text-muted d-block mt-1">${tarih} · ${r.KalemSayisi || 0} kalem</small>
        ${satildi}
      </button>`;
    }).join('')}</div>`;
    if (seciliID != null) receteSolListeAktif(seciliID);
    return rows;
  } catch (_) {
    liste.innerHTML = '<p class="text-danger small mb-0">Liste alınamadı.</p>';
    return [];
  }
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
  musteriReceteOzetBarGuncelle();
  if (!wrap) return;
  if (!receteSatirlar.length) {
    wrap.innerHTML = '<p class="text-muted small mb-0">Stoktan malzeme ekleyin (arama veya barkod).</p>';
    return;
  }
  wrap.innerHTML = receteSatirlar.map((s) => receteMalzemeKartHtml(s, {
    editable: true,
    satirKey: s.key,
    tarimUrunAdi: receteCtx?.urunAdi,
  })).join('')
    + receteGenelToplamHtml();
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

async function musteriReceteSepetStokHazirla() {
  if (typeof musteriDetayUrunleriDoldur === 'function') {
    await musteriDetayUrunleriDoldur();
  }
  if (typeof musteriSatisStokCache !== 'undefined' && !musteriSatisStokCache.length && receteStokCache.length) {
    musteriSatisStokCache = receteStokCache;
  }
}

function receteMalzemeSatirlariSepetKalemleri(satirlar) {
  const kalemler = [];
  for (const s of satirlar || []) {
    const plan = s.plan || receteAktifPlan(s);
    if (!plan?.secim?.length) continue;
    for (const p of plan.secim) {
      const stokID = Number(p.stokID);
      const adet = Math.max(1, Math.floor(Number(p.adet) || 1));
      if (!stokID) continue;
      kalemler.push({
        stokID,
        adet,
        urunAdi: receteStokUrunAdi(stokID, p) || s.grupAdi || s.urunAdi,
      });
    }
  }
  return kalemler;
}

async function musteriReceteSepeteEkleKaynak(satirlar, etiket, receteID) {
  if (!aktifMusteriDetayID) {
    alert('Önce müşteri cari kartı açın.');
    return;
  }
  await receteStokCacheYukle();
  await musteriReceteSepetStokHazirla();
  const kalemler = receteMalzemeSatirlariSepetKalemleri(satirlar);
  if (!kalemler.length) {
    alert('Sepete eklenecek ambalaj satırı yok.');
    return;
  }
  let eklenen = 0;
  let atlanan = 0;
  for (const k of kalemler) {
    if (typeof musteriSatisSepeteEkle === 'function' && musteriSatisSepeteEkle(k.stokID, k.adet)) {
      eklenen += 1;
    } else {
      atlanan += 1;
    }
  }
  if (typeof musteriSatisSepetBadgeGuncelle === 'function') musteriSatisSepetBadgeGuncelle();
  const rid = Number(receteID);
  if (rid > 0 && typeof musteriReceteSepeteKayit === 'function') musteriReceteSepeteKayit(rid);
  const adetToplam = kalemler.reduce((a, k) => a + k.adet, 0);
  const msg = atlanan > 0
    ? `${etiket}: ${adetToplam} adet eklendi (${atlanan} stok satırı bulunamadı).`
    : `${etiket} sepete eklendi — ${adetToplam} adet, ${eklenen} stok kalemi (aynı ürünler birleştirildi).`;
  alert(msg);
}

async function musteriReceteSepeteEkleAktif() {
  if (receteKayitliGoruntuleme && receteAktifKayitliID) {
    const satirlar = (receteKayitliGoruntuleme.satirlar || []).map((row) => {
      const plan = row.plan || [];
      return {
        grupAdi: row.UrunAdi,
        plan: plan.length ? { secim: plan } : null,
        oneriler: plan.length ? { tamBolunmus: { secim: plan } } : {},
      };
    });
    await musteriReceteSepeteEkleKaynak(satirlar, `Reçete #${receteAktifKayitliID}`, receteAktifKayitliID);
    return;
  }
  if (!receteSatirlar.length) {
    alert('Önce malzeme ekleyin veya kayıtlı bir reçete seçin.');
    return;
  }
  await musteriReceteSepeteEkleKaynak(receteSatirlar, 'Reçete (taslak)', null);
}

function musteriReceteSepetModalAc() {
  if (typeof musteriSatisModalAc === 'function') {
    musteriSatisModalAc();
    return;
  }
  alert('Satış ekranı açılamadı.');
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
  receteAktifKayitliID = null;

  const baslik = document.getElementById('musteriReceteMusteriAd');
  if (baslik) baslik.textContent = receteCtx.musteriAd;

  const sagDetay = document.getElementById('musteriReceteSagDetay');
  if (sagDetay) sagDetay.innerHTML = '';

  musteriReceteSagPanelGoster('bos');
  await receteStokCacheYukle();
  await musteriReceteSolListeYukle(null);
  if (typeof musteriSatisSepetBadgeGuncelle === 'function') musteriSatisSepetBadgeGuncelle();
  await musteriAltModalAc(document.getElementById('musteriReceteModal'));
}

async function musteriReceteYeniModalAc() {
  if (!aktifMusteriDetayID) return;
  const dekarInp = document.getElementById('musteriReceteDekar');
  if (dekarInp) dekarInp.value = dekarInp.value || '10';
  await tarimUrunSelectDoldur('musteriReceteUrunID');
  const yeniEl = document.getElementById('musteriReceteYeniModal');
  if (!yeniEl) return;
  const modal = bootstrap.Modal.getOrCreateInstance(yeniEl);
  modal.show();
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
    musteriAd: document.getElementById('musteriReceteMusteriAd')?.textContent || document.getElementById('mdAdSoyad')?.textContent || 'Müşteri',
    tarimUrunID: uid,
    dekar,
    urunAdi,
  };
  receteKayitliGoruntuleme = null;
  receteAktifKayitliID = null;
  receteSolListeAktif(null);

  await tarimUrunSelectDoldur('musteriReceteUrunIDCalisma', uid);
  const dCal = document.getElementById('musteriReceteDekarCalisma');
  if (dCal) dCal.value = String(dekar);

  const notlar = document.getElementById('musteriReceteNotlar');
  if (notlar) notlar.value = '';

  const yeniEl = document.getElementById('musteriReceteYeniModal');
  if (yeniEl) bootstrap.Modal.getInstance(yeniEl)?.hide();

  musteriReceteSagPanelGoster('calisma');
  musteriReceteOzetBarGuncelle();
  receteSatirlarRender();
  setTimeout(() => document.getElementById('musteriReceteArama')?.focus(), 250);
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
    const yeniId = data.receteID;
    receteSatirlar = [];
    receteKayitliGoruntuleme = null;
    await musteriReceteSolListeYukle(yeniId);
    await musteriReceteKayitliGoster(yeniId);
    alert(`Reçete kaydedildi (No: ${yeniId}).`);
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

async function musteriReceteKayitliGoster(receteID) {
  const detay = document.getElementById('musteriReceteSagDetay');
  if (!detay) return;
  receteSolListeAktif(receteID);
  musteriReceteSagPanelGoster('detay');
  detay.innerHTML = '<p class="text-muted small py-4 text-center">Yükleniyor…</p>';
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
      const plan = (row.plan || []).map((p) => ({
        ...p,
        urunAdi: p.urunAdi || receteStokUrunAdi(p.stokID, p),
      }));
      const ambalajlar = plan.map((p) => ({
        stokID: p.stokID,
        urunAdi: p.urunAdi,
        satisFiyati: p.satisFiyati,
        ambalajMiktari: p.ambalajMiktari,
        mevcutMiktar: p.mevcutMiktar,
      }));
      const m = {
        grupAdi: row.UrunAdi,
        miktarDekar: row.MiktarDekar,
        birim: row.Birim,
        toplamIhtiyac: row.ToplamIhtiyac,
        dekar: data.recete.Dekar,
        tarimUrunAdi: data.recete.TarimUrunAdi,
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
      return receteMalzemeKartHtml(m, { tarimUrunAdi: data.recete.TarimUrunAdi });
    }).join('');
    if (!Number.isFinite(genelToplam) || genelToplam <= 0) {
      genelToplam = data.satirlar.reduce((acc, row) => acc + receteKayitliSatirMaliyet(row), 0);
    }
    data.genelToplam = genelToplam;
    const not = data.recete.Notlar ? `<p class="small"><em>Not:</em> ${gunlukMetinEsc(data.recete.Notlar)}</p>` : '';
    const tarih = data.recete.Tarih ? new Date(data.recete.Tarih).toLocaleString('tr-TR') : '—';
    const satisBadge = data.recete.SatisYapildi
      ? `<div class="alert alert-primary py-2 small mb-2 mb-md-0"><i class="fa-solid fa-circle-check me-1"></i>Satış yapıldı${data.recete.SatisTarih ? ` — ${new Date(data.recete.SatisTarih).toLocaleString('tr-TR')}` : ''}</div>`
      : '';
    const sepeteEkleBtn = data.recete.SatisYapildi
      ? ''
      : `<button type="button" class="btn btn-sm btn-outline-primary" onclick="musteriReceteSepeteEkleAktif()">
            <i class="fa-solid fa-cart-plus me-1"></i>Sepete ekle
          </button>`;
    detay.innerHTML = `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <span class="badge bg-secondary-subtle text-secondary mb-1">Kayıtlı reçete</span>
          <h6 class="mb-0">#${receteID} · ${gunlukMetinEsc(data.recete.TarimUrunAdi)}</h6>
          <small class="text-muted">${data.recete.Dekar} dekar · ${tarih}</small>
          ${satisBadge}
        </div>
        <div class="d-flex flex-wrap gap-2">
          ${sepeteEkleBtn}
          <button type="button" class="btn btn-sm btn-outline-dark" onclick="musteriReceteYazdir()">
            <i class="fa-solid fa-print me-1"></i>Yazdır
          </button>
        </div>
      </div>
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
  const kartlar = data.malzemeler.map((m) => receteMalzemeKartHtml(m, {
    tarimUrunAdi: data.urunAdi,
    testModu: true,
  })).join('');
  const genelToplam = Math.round(
    data.malzemeler.reduce((acc, m) => acc + receteSatirMaliyet(m).toplam, 0) * 100,
  ) / 100;
  return ozet + kartlar + receteGenelToplamHtml(genelToplam);
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
  const stokYukle = typeof receteStokCacheYukle === 'function' ? receteStokCacheYukle() : Promise.resolve();
  Promise.all([stokYukle, receteHesapla(uid, dekar)])
    .then(([, data]) => { out.innerHTML = receteSonucHtml(data); })
    .catch(() => { out.innerHTML = '<p class="text-danger small">Sunucu hatası.</p>'; });
}

async function receteTestUrunSelectDoldur() {
  await tarimUrunSelectDoldur('receteTestUrunID');
}
