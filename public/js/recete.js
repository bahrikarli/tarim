/** Müşteri reçetesi — stoktan malzeme seç, dekar × dozaj, ambalaj önerisi, kayıt */

let receteCtx = null;
let receteSatirlar = [];
let receteStokCache = [];
let receteKayitliGoruntuleme = null;
let receteAktifKayitliID = null;
let receteDuzenlemeReceteID = null;
let receteSolListeSatirlari = [];
let ozetReceteListeVurguID = null;
let ozetReceteKayitliSatirlari = [];
let ozetReceteHizliDonus = false;
let receteGoruntuleSonReceteID = null;
let receteGoruntuleCache = null;

function receteParaFormat(tutar) {
  return `${Number(tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function receteStokFiyatBul(stokID, ambalajlar) {
  const fromAmb = (ambalajlar || []).find((a) => Number(a.stokID) === Number(stokID));
  if (fromAmb && fromAmb.satisFiyati != null) return Number(fromAmb.satisFiyati);
  const fromCache = receteStokCache.find((s) => Number(s.StokID) === Number(stokID));
  return Number(fromCache?.SatisFiyati || 0);
}

function receteFiyatInputParse(deger) {
  const s = String(deger ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function receteSatirPlanFiyatGuncelle(satir, stokID, birimFiyat) {
  if (!satir) return;
  const fid = Number(stokID);
  const f = Math.max(0, Number(birimFiyat) || 0);
  const o = satir.oneriler;
  if (o) {
    for (const k of ['tamBolunmus', 'tamUyum', 'enYakin', 'enUzak', 'azAtik', 'azKutu']) {
      const plan = o[k];
      if (!plan?.secim) continue;
      for (const p of plan.secim) {
        if (Number(p.stokID) === fid) p.satisFiyati = f;
      }
    }
  }
  for (const a of satir.ambalajlar || []) {
    if (Number(a.stokID) === fid) a.satisFiyati = f;
  }
}

function receteSatirBirimFiyatDegisti(satirKey, stokID, deger) {
  const sat = receteSatirlar.find((s) => s.key === satirKey);
  if (!sat) return;
  const fiyat = receteFiyatInputParse(deger);
  if (fiyat == null) {
    alert('Geçerli bir birim fiyat girin.');
    receteSatirlarRender();
    return;
  }
  receteSatirPlanFiyatGuncelle(sat, stokID, fiyat);
  receteSatirlarRender();
}

function recetePlanSayilariGuncelle(plan, ihtiyac) {
  if (!plan?.secim?.length) return plan;
  const need = Number(ihtiyac ?? plan.ihtiyac) || 0;
  const miktarToplam = plan.secim.reduce(
    (s, x) => s + (Number(x.adet) || 0) * (Number(x.ambalajMiktari) || 0),
    0,
  );
  plan.adetToplam = plan.secim.reduce((s, x) => s + (Number(x.adet) || 0), 0);
  plan.miktarToplam = Math.round(miktarToplam * 1000) / 1000;
  plan.ihtiyac = Math.round(need * 1000) / 1000;
  plan.fire = Math.round((miktarToplam - need) * 1000) / 1000;
  if (plan.fire < 1e-6) plan.fire = 0;
  return plan;
}

function receteSatirAdetDegisti(satirKey, stokID, deger) {
  const sat = receteSatirlar.find((s) => s.key === satirKey);
  if (!sat) return;
  const adet = Math.floor(Number(String(deger ?? '').replace(',', '.')));
  if (!Number.isFinite(adet) || adet < 1) {
    alert('Adet en az 1 olmalı.');
    receteSatirlarRender();
    return;
  }
  const plan = receteAktifPlan(sat);
  if (!plan?.secim?.length) return;
  const kalem = plan.secim.find((p) => Number(p.stokID) === Number(stokID));
  if (!kalem) return;
  kalem.adet = adet;
  recetePlanSayilariGuncelle(plan, sat.toplamIhtiyac);
  sat.planManuel = true;
  receteSatirlarRender();
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
  const fiyatDuzenle = opts.editable && opts.satirKey;
  const satirlar = kalemler.map((s) => {
    const stokAd = gunlukMetinEsc(receteStokUrunAdi(s.stokID, s) || '—');
    const stokUyari = Number(s.mevcutMiktar) < s.adet
      ? '<span class="badge bg-danger-subtle text-danger ms-1">stok!</span>'
      : '';
    const fiyatHucre = fiyatDuzenle
      ? `<input type="number" class="form-control form-control-sm text-end recete-birim-fiyat-inp ms-auto"
            step="0.01" min="0" value="${Number(s.birimFiyat).toFixed(2)}" title="Birim fiyat (₺)"
            onchange="receteSatirBirimFiyatDegisti('${opts.satirKey}', ${Number(s.stokID)}, this.value)"
            onclick="event.stopPropagation()">`
      : receteParaFormat(s.birimFiyat);
    const adetHucre = fiyatDuzenle
      ? `<input type="number" class="form-control form-control-sm text-end recete-adet-inp"
            min="1" step="1" value="${Number(s.adet) || 1}" title="Ambalaj adedi"
            onchange="receteSatirAdetDegisti('${opts.satirKey}', ${Number(s.stokID)}, this.value)"
            onclick="event.stopPropagation()">`
      : String(s.adet);
    return `<tr>
      <td class="recete-plan-urun">${stokAd}${stokUyari}</td>
      <td class="text-end text-nowrap${fiyatDuzenle ? ' p-1' : ''}">${adetHucre}</td>
      <td class="text-end text-nowrap${fiyatDuzenle ? ' p-1' : ''}">${fiyatHucre}</td>
      <td class="text-end text-nowrap fw-semibold">${receteParaFormat(s.tutar)}</td>
    </tr>`;
  }).join('');
  const fireVar = !tam && plan.fire > 0;
  const baslik = opts.baslik
    ? `<div class="small text-muted px-2 pt-1">${gunlukMetinEsc(opts.baslik)}</div>`
    : '';
  const altToplam = kalemler.length > 1 && !opts.faturaKalem
    ? `<tr class="recete-plan-alt-toplam">
        <td colspan="3" class="text-end text-muted small">Ara toplam</td>
        <td class="text-end text-nowrap fw-bold text-success">${receteParaFormat(toplam)}</td>
      </tr>`
    : '';
  const fireAlt = fireVar
    ? (opts.faturaKalem
      ? `<div class="recete-fatura-not small text-warning border-top px-3 py-1 mb-0">Not: ${plan.fire} ${b} fazla ambalaj.</div>`
      : `<div class="small text-warning py-1 px-2 border-top">(+${plan.fire} ${b} fazla ambalaj)</div>`)
    : '';
  return `<div class="recete-plan-kompakt${opts.faturaKalem ? ' recete-plan-kompakt-fatura' : ''}">
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
    ${fireAlt}
  </div>`;
}

function receteMiktarFmt(v, birim) {
  const n = Number(v);
  const b = birim || 'Lt';
  if (!Number.isFinite(n)) return `— ${b}`;
  const s = n >= 1
    ? n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
    : n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
  return `${s} ${b}`;
}

/** Çiftçi için: dozaj (dekar başı) ve tarla toplam ihtiyaç — ayrı satırlar. */
function receteKalemDozajIhtiyacHtml(m, birim) {
  const b = birim || m.birim || 'Lt';
  const iht = Number(m.toplamIhtiyac);
  const dekar = Number(m.dekar ?? receteCtx?.dekar);
  const dozaj = m.miktarDekar != null ? Number(m.miktarDekar) : null;
  const satirlar = [];

  if (Number.isFinite(dozaj) && dozaj > 0) {
    satirlar.push(`<div class="recete-dozaj-satir"><span class="recete-etiket-dozaj">Dozaj</span> <strong>${receteMiktarFmt(dozaj, b)}/da</strong></div>`);
  }
  if (Number.isFinite(iht) && iht > 0) {
    const dekarNot = Number.isFinite(dekar) && dekar > 0
      ? ` <span class="text-muted fw-normal">(${dekar} da tarla)</span>`
      : '';
    satirlar.push(`<div class="recete-ihtiyac-satir"><span class="recete-etiket-ihtiyac">İhtiyaç (toplam)</span> <strong class="text-success">${receteMiktarFmt(iht, b)}</strong>${dekarNot}</div>`);
  }
  if (!satirlar.length) return '';
  return `<div class="recete-dozaj-ihtiyac">${satirlar.join('')}</div>`;
}

function receteKalemIhtiyacNotu(m, birim) {
  const b = birim || m.birim || 'Lt';
  const iht = Number(m.toplamIhtiyac);
  const dekar = Number(m.dekar ?? receteCtx?.dekar);
  const dozaj = m.miktarDekar != null ? Number(m.miktarDekar) : null;
  const parcalar = [];
  if (Number.isFinite(dozaj) && dozaj > 0) parcalar.push(`Dozaj: ${receteMiktarFmt(dozaj, b)}/da`);
  if (Number.isFinite(iht) && iht > 0) {
    let t = `İhtiyaç (toplam): ${receteMiktarFmt(iht, b)}`;
    if (Number.isFinite(dekar) && dekar > 0) t += ` — ${dekar} da`;
    parcalar.push(t);
  }
  return parcalar.join(' · ');
}

function receteMalzemeSecimRadyoHtml(satirKey, secimTip, oneriler) {
  if (!oneriler?.secimGerekli || !oneriler.enYakin || !oneriler.enUzak) return '';
  const chkY = secimTip === 'enYakin' || secimTip === 'tamUyum' ? 'checked' : '';
  const chkU = secimTip === 'enUzak' ? 'checked' : '';
  const etiketYakin = typeof receteSecimEtiket === 'function' ? receteSecimEtiket('enYakin') : 'İhtiyaca en yakın seçenek';
  const etiketAzGecen = typeof receteSecimEtiket === 'function' ? receteSecimEtiket('enUzak') : 'İhtiyacı en az geçen seçenek';
  return `<div class="recete-fatura-secim px-3 py-2 border-top bg-white small">
    <div class="text-warning mb-1">Ambalaj seçimi</div>
    <div class="form-check mb-1">
      <input class="form-check-input" type="radio" name="receteSecim_${satirKey}" id="receteEnYakin_${satirKey}" value="enYakin" ${chkY} onchange="receteSatirSecimDegisti('${satirKey}', 'enYakin')">
      <label class="form-check-label" for="receteEnYakin_${satirKey}">${etiketYakin}</label>
    </div>
    <div class="form-check mb-0">
      <input class="form-check-input" type="radio" name="receteSecim_${satirKey}" id="receteEnUzak_${satirKey}" value="enUzak" ${chkU} onchange="receteSatirSecimDegisti('${satirKey}', 'enUzak')">
      <label class="form-check-label" for="receteEnUzak_${satirKey}">${etiketAzGecen}</label>
    </div>
  </div>`;
}

function receteAmbalajBoyutSayisi(m) {
  const boyutlar = new Set();
  for (const a of [...(m.ambalajlar || []), ...receteAmbalajlarFromPlan(m)]) {
    const n = Number(a.ambalajMiktari);
    if (n > 0) boyutlar.add(n);
  }
  return boyutlar.size;
}

/** Radyo yokken nedenini kısaca göster (çoğunlukla stokta tek ambalaj boyutu). */
function receteMalzemeSecimBilgiHtml(m, opts) {
  if (!opts?.editable || m.oneriler?.secimGerekli) return '';
  const plan = receteAktifPlan(m) || m.oneriler?.enYakin;
  const fire = Number(plan?.fire) || 0;
  if (fire < 1e-6) return '';
  const boyutSay = receteAmbalajBoyutSayisi(m);
  if (boyutSay >= 2) {
    return `<div class="recete-fatura-secim px-3 py-2 border-top small text-warning mb-0">
      <i class="fa-solid fa-triangle-exclamation me-1"></i>Stokta ${boyutSay} ambalaj boyutu var ama seçenekler gelmedi. Sunucuyu yeniden başlatın (EXE değil, <code>node server.js</code> kök klasörden).
    </div>`;
  }
  const birim = m.birim || 'Lt';
  const tek = [...new Set((m.ambalajlar || []).map((a) => Number(a.ambalajMiktari)).filter((x) => x > 0))][0];
  const fmt = Number.isFinite(tek) ? receteMiktarFmt(tek, birim) : '—';
  return `<div class="recete-fatura-secim px-3 py-2 border-top bg-light small text-muted mb-0">
    <i class="fa-solid fa-circle-info me-1"></i><strong>Ambalaj seçimi yok:</strong> bu malzeme için stokta tek boyut (${fmt}). «En yakın / en az geçen» için aynı gruba ikinci ambalaj ekleyin (Tanımlamalar → Malzemeler veya Stok).
  </div>`;
}

function recetePlanSatirHtml(plan, etiket, birim, malzemeAdi, ambalajlar) {
  return recetePlanKompaktHtml(plan, birim, ambalajlar, { baslik: etiket });
}

function recetePlanlarAyniMi(a, b) {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function receteOnerileriDuzelt(oneriler) {
  if (!oneriler?.secimGerekli || !oneriler.enYakin || !oneriler.enUzak) return oneriler;
  const yF = Number(oneriler.enYakin.fire) || 0;
  const uF = Number(oneriler.enUzak.fire) || 0;
  if (yF > uF + 1e-6) {
    return { ...oneriler, enYakin: oneriler.enUzak, enUzak: oneriler.enYakin };
  }
  return oneriler;
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

function receteMalzemePlanHtml(m, opts, birim, amb, satirKey, secimTip) {
  const planOpts = {
    editable: !!opts.editable,
    satirKey,
    faturaKalem: true,
  };
  if (opts.editable && m.oneriler) {
    const o = m.oneriler;
    const tamPlan = o.tamBolunmus || o.tamUyum;
    if (o.tamDenk && tamPlan) return recetePlanKompaktHtml(tamPlan, birim, amb, planOpts);
    if (o.secimGerekli && o.enYakin && o.enUzak) {
      const plan = secimTip === 'enUzak' ? o.enUzak : o.enYakin;
      return recetePlanKompaktHtml(plan, birim, amb, planOpts);
    }
    const plan = o.enYakin || o.azAtik;
    if (plan) return recetePlanKompaktHtml(plan, birim, amb, planOpts);
  }
  const plan = receteAktifPlan(m) || m.oneriler?.tamBolunmus || m.oneriler?.enYakin || m.oneriler?.azAtik;
  if (plan) return recetePlanKompaktHtml(plan, birim, amb, planOpts);
  if (!amb.length) return '<p class="small text-danger px-3 py-2 mb-0">Stokta ambalaj tanımlı değil.</p>';
  return '<p class="small text-warning px-3 py-2 mb-0">Ambalaj planı hesaplanamadı.</p>';
}

function receteMalzemeKartHtml(m, opts = {}) {
  const birim = m.birim || 'Lt';
  const satirKey = opts.satirKey || `k${Math.random().toString(36).slice(2, 8)}`;
  const secimTip = m.secimTip || receteVarsayilanSecimTip(m.oneriler);
  const amb = receteAmbalajlarFromPlan(m);
  const malzAd = m.grupAdi || m.urunAdi;
  const planHtml = receteMalzemePlanHtml(m, opts, birim, amb, satirKey, secimTip);
  const secimRadio = opts.editable
    ? receteMalzemeSecimRadyoHtml(satirKey, secimTip, m.oneriler)
    : '';
  const secimBilgi = opts.editable ? receteMalzemeSecimBilgiHtml(m, opts) : '';

  const silBtn = opts.editable
    ? `<button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="receteSatirSil('${satirKey}')" title="Kaldır"><i class="fa-solid fa-xmark"></i></button>`
    : '';

  const satirMaliyet = receteSatirMaliyet(m);
  const dozajIhtiyacHtml = receteKalemDozajIhtiyacHtml(m, birim);

  if (opts.testModu) {
    return `<div class="recete-fatura-kalem recete-urun-cerceve mb-3 overflow-hidden" data-recete-satir="${satirKey}">
      <div class="recete-fatura-kalem-ust d-flex justify-content-between align-items-start gap-2 px-3 py-2 bg-light border-bottom">
        <div class="min-w-0"><div class="fw-semibold">${gunlukMetinEsc(malzAd)}</div>${dozajIhtiyacHtml}</div>
        <span class="fw-bold text-success flex-shrink-0">${receteParaFormat(satirMaliyet.toplam)}</span>
      </div>
      ${planHtml}
    </div>`;
  }

  return `<div class="recete-fatura-kalem recete-urun-cerceve mb-3 overflow-hidden" data-recete-satir="${satirKey}">
    <div class="recete-fatura-kalem-ust d-flex justify-content-between align-items-start gap-2 px-3 py-2 bg-light border-bottom">
      <div class="min-w-0 flex-grow-1">
        <div class="fw-semibold text-dark fs-6">${gunlukMetinEsc(malzAd)}</div>
        ${dozajIhtiyacHtml}
      </div>
      <div class="d-flex align-items-center gap-2 flex-shrink-0">
        <span class="fw-bold text-success">${receteParaFormat(satirMaliyet.toplam)}</span>
        ${silBtn}
      </div>
    </div>
    ${secimRadio}
    ${secimBilgi}
    ${planHtml}
  </div>`;
}

function receteKalemNotMetni(m, opts, birim) {
  return receteKalemIhtiyacNotu(m, birim);
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
      const detaySatir = receteNotListeDetayHtml(r.Notlar);
      return `<button type="button" class="list-group-item list-group-item-action${aktif}" data-recete-liste-id="${r.ReceteID}" onclick="musteriReceteKayitliGoster(${r.ReceteID})">
        <div class="d-flex justify-content-between align-items-start gap-1 flex-wrap">
          <strong class="small">${gunlukMetinEsc(r.TarimUrunAdi)}</strong>
          <div class="d-flex align-items-center gap-1 flex-shrink-0">
            <span class="badge bg-success">${r.Dekar} da</span>
            <span class="recete-liste-aksiyon" onclick="event.stopPropagation()">
              <button type="button" class="btn btn-outline-secondary" title="Görüntüle"
                onclick="receteGoruntuleAc(${r.ReceteID})"><i class="fa-solid fa-eye"></i></button>
            </span>
          </div>
        </div>
        ${detaySatir}
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
  wrap.innerHTML = `<p class="small text-muted mb-2"><i class="fa-solid fa-receipt me-1"></i>Her malzeme kalın çerçeve içinde: <strong>dozaj</strong> ve <strong>toplam ihtiyaç</strong>. Altta <strong>adet</strong> ve <strong>birim fiyat</strong> el ile değiştirilebilir.</p>`
    + receteSatirlar.map((s) => receteMalzemeKartHtml(s, {
      editable: true,
      satirKey: s.key,
      tarimUrunAdi: receteCtx?.urunAdi,
    })).join('')
    + receteGenelToplamHtml();
}

function receteSatirFromData(data, secimTip) {
  const key = `r${Date.now()}_${data.malzemeGrupID || data.stokID}_${Math.random().toString(36).slice(2, 6)}`;
  const oneriler = receteOnerileriDuzelt(data.oneriler);
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
    oneriler,
    secimTip: secimTip || receteVarsayilanSecimTip(oneriler),
  };
}

async function receteSatirEkleFromData(data, secimTip) {
  if (!data?.success) return null;
  return receteSatirFromData(data, secimTip);
}

function receteSatirKayitliSatirdan(row, recete) {
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
  const oneriler = {};
  if (plan.length) {
    const t = plan.reduce((a, x) => a + (Number(x.adet) || 0) * (Number(x.ambalajMiktari) || 0), 0);
    const planObj = {
      secim: plan,
      adetToplam: plan.reduce((a, x) => a + (Number(x.adet) || 0), 0),
      miktarToplam: Math.round(t * 1000) / 1000,
      fire: Math.round((t - Number(row.ToplamIhtiyac)) * 1000) / 1000,
      ihtiyac: row.ToplamIhtiyac,
    };
    oneriler.tamDenk = planObj.fire < 1e-6;
    oneriler.tamBolunmus = planObj;
    oneriler.enYakin = planObj;
  }
  const key = `rk${row.SatirID}_${row.StokID || row.MalzemeGrupID || 0}`;
  return {
    key,
    stokID: row.StokID,
    urunAdi: row.UrunAdi,
    grupAdi: row.UrunAdi,
    malzemeGrupID: row.MalzemeGrupID,
    miktarDekar: row.MiktarDekar,
    birim: row.Birim,
    dekar: Number(recete.Dekar),
    toplamIhtiyac: row.ToplamIhtiyac,
    ambalajlar,
    oneriler,
    secimTip: row.SecimTip || 'enYakin',
  };
}

async function receteKayitliDuzenlemeAc(receteID, opts) {
  const rid = Number(receteID);
  if (!rid) return;
  const res = await fetch(`/api/recete/${rid}`);
  const data = await res.json();
  if (!data.success) {
    alert(data.message || 'Reçete bulunamadı.');
    return;
  }
  await receteStokCacheYukle();
  const r = data.recete;
  const mid = Number(r.MusteriID);
  const m = (window._musteriListeCache || []).find((x) => Number(x.MusteriID) === mid);
  const musteriAd = m && typeof musteriGorunenAd === 'function' ? musteriGorunenAd(m) : 'Müşteri';
  const uid = opts?.tarimUrunID ? Number(opts.tarimUrunID) : Number(r.TarimUrunID);
  const dekar = opts?.dekar != null ? Number(opts.dekar) : Number(r.Dekar);
  const urunAdi = opts?.urunAdi || r.TarimUrunAdi || '';

  receteDuzenlemeReceteID = rid;
  aktifMusteriDetayID = mid;

  const receteEl = document.getElementById('musteriReceteModal');
  if (!receteEl?.classList.contains('show')) {
    receteKayitliGoruntuleme = null;
    const sagDetay = document.getElementById('musteriReceteSagDetay');
    if (sagDetay) sagDetay.innerHTML = '';
    musteriReceteSagPanelGoster('bos');
    await musteriReceteSolListeYukle(rid);
    if (typeof musteriSatisSepetBadgeGuncelle === 'function') musteriSatisSepetBadgeGuncelle();
    await musteriAltModalAc(receteEl);
  }

  const receteBaslik = { ...r, Dekar: dekar, TarimUrunID: uid, TarimUrunAdi: urunAdi };
  await musteriReceteCalismaBaslat(mid, musteriAd, uid, dekar, urunAdi);
  receteDuzenlemeReceteID = rid;
  receteAktifKayitliID = rid;
  const satirlarKayit = data.satirlar.map((row) => receteSatirKayitliSatirdan(row, receteBaslik));
  receteSatirlar = [];
  for (const s of satirlarKayit) {
    const yeniden = await receteSatirYenidenHesapla(s, s.toplamIhtiyac);
    receteSatirlar.push(yeniden || s);
  }
  receteTarlaFormDoldur('musteriRecete', receteNotlarParcala(r.Notlar));
  receteSolListeAktif(rid);
  musteriRecetePanelEtiketGuncelle();
  receteSatirlarRender();
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

  receteTarlaFormTemizle('musteriRecete');
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

/** Kayıtlı reçete listesinde tarla / konum detayı (Notlar alanı). */
function receteNotListeDetayHtml(notlar) {
  const metin = String(notlar || '').trim();
  if (!metin) return '';
  const satirlar = metin.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const tam = gunlukMetinEsc(metin);
  const icerik = satirlar.map((s) => gunlukMetinEsc(s)).join('<br>');
  return `<div class="recete-liste-detay small text-muted mt-1" title="${tam}">
    <i class="fa-solid fa-map-location-dot me-1 opacity-75"></i><span>${icerik}</span>
  </div>`;
}

function receteTarlaNotBirlestir(tarla) {
  const t = tarla || {};
  const parcalar = [];
  if (String(t.tarlaAdi || '').trim()) parcalar.push(`Tarla: ${String(t.tarlaAdi).trim()}`);
  const konum = [];
  if (String(t.mevki || '').trim()) konum.push(`Mevkii: ${String(t.mevki).trim()}`);
  if (String(t.ada || '').trim()) konum.push(`Ada: ${String(t.ada).trim()}`);
  if (String(t.parsel || '').trim()) konum.push(`Parsel: ${String(t.parsel).trim()}`);
  if (konum.length) parcalar.push(konum.join(' · '));
  if (String(t.ozelAciklama || '').trim()) parcalar.push(String(t.ozelAciklama).trim());
  return parcalar.join('\n').trim().substring(0, 500);
}

function receteNotlarParcala(notlar) {
  const metin = String(notlar || '').trim();
  const out = { tarlaAdi: '', mevki: '', ada: '', parsel: '', ozelAciklama: '' };
  if (!metin) return out;
  const satirlar = metin.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const serbest = [];
  for (const s of satirlar) {
    const tarlaM = s.match(/^Tarla:\s*(.+)$/i);
    if (tarlaM) {
      out.tarlaAdi = tarlaM[1].trim();
      continue;
    }
    if (/Mevkii:|Ada:|Parsel:/i.test(s)) {
      const mevkiM = s.match(/Mevkii:\s*([^·]+)/i);
      const adaM = s.match(/Ada:\s*([^·]+)/i);
      const parselM = s.match(/Parsel:\s*([^·]+)/i);
      if (mevkiM) out.mevki = mevkiM[1].trim();
      if (adaM) out.ada = adaM[1].trim();
      if (parselM) out.parsel = parselM[1].trim();
      continue;
    }
    serbest.push(s);
  }
  if (serbest.length) out.ozelAciklama = serbest.join('\n');
  else if (!out.tarlaAdi && !out.mevki && !out.ada && !out.parsel) out.ozelAciklama = metin;
  return out;
}

function receteTarlaFormDoldur(prefix, tarla) {
  const t = tarla || {};
  const set = (suffix, val) => {
    const el = document.getElementById(`${prefix}${suffix}`);
    if (el) el.value = val || '';
  };
  set('TarlaAdi', t.tarlaAdi);
  set('Mevki', t.mevki);
  set('Ada', t.ada);
  set('Parsel', t.parsel);
  set('Aciklama', t.ozelAciklama);
}

function receteTarlaFormTemizle(prefix) {
  receteTarlaFormDoldur(prefix, {});
}

function receteTarlaFormOku(prefix) {
  const get = (suffix) => document.getElementById(`${prefix}${suffix}`)?.value || '';
  return receteTarlaNotBirlestir({
    tarlaAdi: get('TarlaAdi'),
    mevki: get('Mevki'),
    ada: get('Ada'),
    parsel: get('Parsel'),
    ozelAciklama: get('Aciklama'),
  });
}

function receteKayitNotDegeri() {
  return receteTarlaFormOku('musteriRecete');
}

function musteriRecetePanelEtiketGuncelle() {
  const el = document.getElementById('musteriRecetePanelEtiket');
  if (!el) return;
  el.textContent = receteDuzenlemeReceteID ? 'Reçete düzenleme' : 'Yeni reçete';
}

async function musteriReceteCalismaBaslat(musteriID, musteriAd, uid, dekar, urunAdi, baslangicNotlari) {
  const mid = Number(musteriID);
  if (!mid) return alert('Müşteri seçin.');
  if (!uid) return alert('Tarım ürünü seçin.');
  if (!Number.isFinite(dekar) || dekar <= 0) return alert('Geçerli bir dekar girin.');

  aktifMusteriDetayID = mid;
  const ad = String(musteriAd || 'Müşteri').trim();

  const tarlaNot = String(baslangicNotlari || '').trim();
  receteCtx = {
    musteriID: mid,
    musteriAd: ad,
    tarimUrunID: uid,
    dekar,
    urunAdi: urunAdi || '',
    ...(tarlaNot ? { tarlaNot } : {}),
  };
  receteSatirlar = [];
  receteKayitliGoruntuleme = null;
  receteAktifKayitliID = null;
  receteDuzenlemeReceteID = null;
  receteSolListeAktif(null);

  const baslik = document.getElementById('musteriReceteMusteriAd');
  if (baslik) baslik.textContent = ad;

  await tarimUrunSelectDoldur('musteriReceteUrunIDCalisma', uid);
  const dCal = document.getElementById('musteriReceteDekarCalisma');
  if (dCal) dCal.value = String(dekar);

  receteTarlaFormDoldur('musteriRecete', receteNotlarParcala(tarlaNot));

  musteriReceteSagPanelGoster('calisma');
  musteriRecetePanelEtiketGuncelle();
  musteriReceteOzetBarGuncelle();
  receteSatirlarRender();
  setTimeout(() => document.getElementById('musteriReceteArama')?.focus(), 250);
}

async function musteriReceteDevam() {
  const uid = Number(document.getElementById('musteriReceteUrunID')?.value);
  const dekar = parseFloat(document.getElementById('musteriReceteDekar')?.value);
  if (!uid) return alert('Tarım ürünü seçin.');
  if (!Number.isFinite(dekar) || dekar <= 0) return alert('Geçerli bir dekar girin.');

  const sel = document.getElementById('musteriReceteUrunID');
  const urunAdi = sel?.selectedOptions?.[0]?.textContent?.trim() || '';
  const musteriAd = document.getElementById('musteriReceteMusteriAd')?.textContent
    || document.getElementById('mdAdSoyad')?.textContent || 'Müşteri';

  const yeniEl = document.getElementById('musteriReceteYeniModal');
  if (yeniEl) bootstrap.Modal.getInstance(yeniEl)?.hide();

  const receteEl = document.getElementById('musteriReceteModal');
  const receteAcik = receteEl?.classList.contains('show');
  if (!receteAcik) {
    await musteriReceteModalAc();
  }
  await musteriReceteCalismaBaslat(aktifMusteriDetayID, musteriAd, uid, dekar, urunAdi);
}

function ozetReceteKayitliListeAktif(receteID) {
  ozetReceteListeVurguID = receteID != null ? Number(receteID) : null;
  document.querySelectorAll('[data-ozet-recete-id]').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.ozetReceteId) === ozetReceteListeVurguID);
  });
}

async function ozetReceteKayitliListeYukle() {
  const liste = document.getElementById('ozetReceteKayitliListe');
  if (!liste) return [];
  const arama = document.getElementById('ozetReceteListeAra')?.value || '';
  liste.innerHTML = '<p class="text-muted small mb-0 py-2">Yükleniyor…</p>';
  try {
    const q = encodeURIComponent(String(arama).trim());
    const res = await fetch(`/api/receteler?limit=150${q ? `&arama=${q}` : ''}`);
    const rows = await res.json();
    ozetReceteKayitliSatirlari = Array.isArray(rows) ? rows : [];
    if (!ozetReceteKayitliSatirlari.length) {
      liste.innerHTML = '<p class="text-muted small mb-0 py-2">Kayıtlı reçete yok.</p>';
      return [];
    }
    liste.innerHTML = `<div class="list-group list-group-flush">${ozetReceteKayitliSatirlari.map((r) => {
      const tarih = r.Tarih ? new Date(r.Tarih).toLocaleDateString('tr-TR') : '—';
      const aktif = Number(ozetReceteListeVurguID) === Number(r.ReceteID) ? ' active' : '';
      const musAd = gunlukMetinEsc(r.MusteriAd || 'Müşteri');
      const urun = gunlukMetinEsc(r.TarimUrunAdi || '—');
      const detaySatir = receteNotListeDetayHtml(r.Notlar);
      return `<div class="list-group-item list-group-item-action${aktif} py-2 px-2" data-ozet-recete-id="${r.ReceteID}" role="button"
          onclick="ozetReceteKayitliSec(${r.ReceteID})">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="min-w-0 flex-grow-1">
            <div class="small fw-semibold text-truncate">${musAd}</div>
            <div class="small text-secondary text-truncate">${urun}</div>
            ${detaySatir}
            <small class="text-muted">${tarih} · ${r.KalemSayisi || 0} kalem</small>
          </div>
          <div class="d-flex flex-column align-items-end gap-1 flex-shrink-0">
            <span class="badge bg-success">${r.Dekar} da</span>
            <div class="d-flex gap-1 ozet-recete-aksiyon" onclick="event.stopPropagation()">
              <button type="button" class="btn btn-outline-secondary" title="Görüntüle"
                onclick="receteGoruntuleAc(${r.ReceteID})"><i class="fa-solid fa-eye"></i></button>
              <button type="button" class="btn btn-outline-primary" title="Düzenle"
                onclick="ozetReceteKayitliDuzenle(${r.ReceteID})"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="btn btn-outline-danger" title="Sil"
                onclick="ozetReceteKayitliSil(${r.ReceteID})"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;
    if (ozetReceteListeVurguID != null) ozetReceteKayitliListeAktif(ozetReceteListeVurguID);
    return ozetReceteKayitliSatirlari;
  } catch (_) {
    liste.innerHTML = '<p class="text-danger small mb-0">Liste alınamadı.</p>';
    return [];
  }
}

/** Soldaki listede yalnızca vurgular; sağdaki yeni reçete formunu doldurmaz. */
function ozetReceteKayitliSec(receteID) {
  ozetReceteKayitliListeAktif(receteID);
}

async function ozetReceteKayitliDuzenle(receteID) {
  const rid = Number(receteID);
  if (!rid) return;

  ozetReceteHizliDonus = true;
  const hizliEl = document.getElementById('ozetReceteHizliModal');
  if (hizliEl) bootstrap.Modal.getInstance(hizliEl)?.hide();

  await receteStokCacheYukle();
  const r = ozetReceteKayitliSatirlari.find((x) => Number(x.ReceteID) === rid);
  const receteEl = document.getElementById('musteriReceteModal');

  if (!receteEl?.classList.contains('show')) {
    receteKayitliGoruntuleme = null;
    const sagDetay = document.getElementById('musteriReceteSagDetay');
    if (sagDetay) sagDetay.innerHTML = '';
    musteriReceteSagPanelGoster('bos');
    if (r) aktifMusteriDetayID = Number(r.MusteriID);
    await musteriReceteSolListeYukle(rid);
    if (typeof musteriSatisSepetBadgeGuncelle === 'function') musteriSatisSepetBadgeGuncelle();
    await musteriAltModalAc(receteEl);
  } else if (r) {
    aktifMusteriDetayID = Number(r.MusteriID);
  }

  await receteKayitliDuzenlemeAc(rid);
}

async function ozetReceteKayitliSil(receteID) {
  const r = ozetReceteKayitliSatirlari.find((x) => Number(x.ReceteID) === Number(receteID));
  const etiket = r
    ? `${r.MusteriAd || 'Müşteri'} — ${r.TarimUrunAdi || ''} (${r.Dekar} da)`
    : `#${receteID}`;
  if (!confirm(`Bu reçeteyi silmek istediğinize emin misiniz?\n\n${etiket}`)) return;
  try {
    const res = await fetch(`/api/recete/${receteID}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) {
      alert('Silinemedi.');
      return;
    }
    if (Number(ozetReceteListeVurguID) === Number(receteID)) {
      ozetReceteListeVurguID = null;
      ozetReceteKayitliListeAktif(null);
    }
    await ozetReceteKayitliListeYukle();
  } catch (_) {
    alert('Sunucuya ulaşılamadı.');
  }
}

function ozetReceteYeniFormTemizle() {
  const hid = document.getElementById('ozetReceteYeniMusteriID');
  const ara = document.getElementById('ozetReceteYeniMusteriAra');
  const ozet = document.getElementById('ozetReceteYeniMusteriSecili');
  const dekarInp = document.getElementById('ozetReceteYeniDekar');
  const uidSel = document.getElementById('ozetReceteYeniUrunID');
  if (hid) hid.value = '';
  if (ara) ara.value = '';
  if (ozet) ozet.classList.add('d-none');
  if (dekarInp) dekarInp.value = '';
  if (uidSel) uidSel.value = '';
  receteTarlaFormTemizle('ozetReceteYeni');
  ozetReceteMusteriSonuclariniGizle();
}

async function ozetReceteHizliModalGeriAc() {
  await ozetReceteKayitliListeYukle();
  const el = document.getElementById('ozetReceteHizliModal');
  if (!el) return;
  if (typeof modalArtigiTemizle === 'function') modalArtigiTemizle();
  bootstrap.Modal.getOrCreateInstance(el).show();
}

function ozetReceteMusteriSonuclariniGizle() {
  const el = document.getElementById('ozetReceteYeniMusteriSonuclari');
  if (el) el.classList.add('d-none');
}

function ozetReceteMusteriFiltrele(q) {
  const liste = Array.isArray(window._musteriListeCache) ? window._musteriListeCache : [];
  const aranan = String(q || '').trim().toLocaleLowerCase('tr-TR');
  if (!aranan) return liste.slice(0, 40);
  return liste.filter((m) => {
    const no = String(m.MusteriID || '');
    const ad = String(m.AdSoyad || '').toLocaleLowerCase('tr-TR');
    const firma = String(m.FirmaAdi || '').toLocaleLowerCase('tr-TR');
    const tel = String(m.Telefon || '').toLocaleLowerCase('tr-TR');
    const gorunen = typeof musteriGorunenAd === 'function' ? musteriGorunenAd(m).toLocaleLowerCase('tr-TR') : '';
    return no.includes(aranan) || ad.includes(aranan) || firma.includes(aranan) || tel.includes(aranan) || gorunen.includes(aranan);
  }).slice(0, 40);
}

function ozetReceteMusteriSec(m) {
  if (!m) return;
  const hid = document.getElementById('ozetReceteYeniMusteriID');
  const ara = document.getElementById('ozetReceteYeniMusteriAra');
  const ozet = document.getElementById('ozetReceteYeniMusteriSecili');
  if (hid) hid.value = String(m.MusteriID);
  const ad = typeof musteriGorunenAd === 'function' ? musteriGorunenAd(m) : (m.AdSoyad || 'Müşteri');
  if (ara) ara.value = ad;
  if (ozet) {
    ozet.textContent = `Seçili: ${ad} (#${m.MusteriID})`;
    ozet.classList.remove('d-none');
  }
  ozetReceteMusteriSonuclariniGizle();
  setTimeout(() => document.getElementById('ozetReceteYeniUrunID')?.focus(), 80);
}

function ozetReceteMusteriAraGuncelle(deger) {
  const sonuc = document.getElementById('ozetReceteYeniMusteriSonuclari');
  const hid = document.getElementById('ozetReceteYeniMusteriID');
  const ozet = document.getElementById('ozetReceteYeniMusteriSecili');
  if (!sonuc) return;
  if (hid) hid.value = '';
  if (ozet) ozet.classList.add('d-none');

  const filtreli = ozetReceteMusteriFiltrele(deger);
  sonuc.innerHTML = '';
  if (!String(deger || '').trim() || filtreli.length === 0) {
    sonuc.classList.add('d-none');
    return;
  }
  filtreli.forEach((m) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-group-item list-group-item-action py-2';
    const ad = typeof musteriGorunenAd === 'function' ? musteriGorunenAd(m) : (m.AdSoyad || '');
    btn.innerHTML = `<span class="fw-semibold">${gunlukMetinEsc(ad)}</span><small class="text-muted ms-2">#${m.MusteriID}</small>`;
    btn.onclick = () => ozetReceteMusteriSec(m);
    sonuc.appendChild(btn);
  });
  sonuc.classList.remove('d-none');
}

function ozetReceteMusteriAraKeydown(ev) {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  const filtreli = ozetReceteMusteriFiltrele(ev.target.value);
  if (filtreli.length === 1) ozetReceteMusteriSec(filtreli[0]);
}

async function ozetReceteOlusturAc() {
  if (typeof menuyuGoster === 'function') menuyuGoster('ozet');
  if (typeof hizliSatisMusteriListesiniHazirla === 'function') await hizliSatisMusteriListesiniHazirla();

  const listeAra = document.getElementById('ozetReceteListeAra');
  if (listeAra) listeAra.value = '';
  ozetReceteListeVurguID = null;

  await ozetReceteKayitliListeYukle();

  const el = document.getElementById('ozetReceteHizliModal');
  if (!el) return;
  bootstrap.Modal.getOrCreateInstance(el).show();
}

function ozetReceteYeniDekarFocus(el) {
  if (!el) return;
  if (el.value === '10' || el.value === 10) {
    el.value = '';
    return;
  }
  if (el.value !== '') el.select();
}

async function ozetReceteYeniModalAc() {
  if (typeof hizliSatisMusteriListesiniHazirla === 'function') await hizliSatisMusteriListesiniHazirla();
  ozetReceteYeniFormTemizle();
  await tarimUrunSelectDoldur('ozetReceteYeniUrunID');
  const yeniEl = document.getElementById('ozetReceteYeniModal');
  if (!yeniEl) return;
  bootstrap.Modal.getOrCreateInstance(yeniEl).show();
  setTimeout(() => document.getElementById('ozetReceteYeniMusteriAra')?.focus(), 200);
}

async function ozetReceteYeniBasla() {
  const mid = Number(document.getElementById('ozetReceteYeniMusteriID')?.value);
  const uid = Number(document.getElementById('ozetReceteYeniUrunID')?.value);
  const dekar = parseFloat(document.getElementById('ozetReceteYeniDekar')?.value);
  if (!mid) return alert('Müşteri seçin (arama kutusundan tıklayın).');
  if (!uid) return alert('Tarım ürünü seçin.');
  if (!Number.isFinite(dekar) || dekar <= 0) return alert('Geçerli bir dekar girin.');

  const sel = document.getElementById('ozetReceteYeniUrunID');
  const urunAdi = sel?.selectedOptions?.[0]?.textContent?.trim() || '';
  const m = (window._musteriListeCache || []).find((x) => Number(x.MusteriID) === mid);
  const musteriAd = m && typeof musteriGorunenAd === 'function' ? musteriGorunenAd(m) : 'Müşteri';

  const tarlaNot = receteTarlaFormOku('ozetReceteYeni');

  const yeniEl = document.getElementById('ozetReceteYeniModal');
  if (yeniEl) bootstrap.Modal.getInstance(yeniEl)?.hide();

  ozetReceteHizliDonus = true;
  const hizliEl = document.getElementById('ozetReceteHizliModal');
  if (hizliEl) bootstrap.Modal.getInstance(hizliEl)?.hide();

  await receteStokCacheYukle();
  const receteEl = document.getElementById('musteriReceteModal');
  if (!receteEl?.classList.contains('show')) {
    receteSatirlar = [];
    receteKayitliGoruntuleme = null;
    receteAktifKayitliID = null;
    receteDuzenlemeReceteID = null;
    const sagDetay = document.getElementById('musteriReceteSagDetay');
    if (sagDetay) sagDetay.innerHTML = '';
    musteriReceteSagPanelGoster('bos');
    aktifMusteriDetayID = mid;
    await musteriReceteSolListeYukle(null);
    if (typeof musteriSatisSepetBadgeGuncelle === 'function') musteriSatisSepetBadgeGuncelle();
    await musteriAltModalAc(receteEl);
  } else {
    aktifMusteriDetayID = mid;
  }

  await musteriReceteCalismaBaslat(mid, musteriAd, uid, dekar, urunAdi, tarlaNot);
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
    const guncelleId = receteDuzenlemeReceteID ? Number(receteDuzenlemeReceteID) : null;
    const url = guncelleId ? `/api/recete/${guncelleId}` : '/api/recete/kaydet';
    const method = guncelleId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        musteriID: receteCtx.musteriID,
        tarimUrunID: receteCtx.tarimUrunID,
        dekar: receteCtx.dekar,
        notlar: receteKayitNotDegeri(),
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
    const yeniId = data.receteID || guncelleId;
    receteSatirlar = [];
    receteKayitliGoruntuleme = null;
    receteDuzenlemeReceteID = null;
    const mesaj = guncelleId ? `Reçete güncellendi (No: ${yeniId}).` : `Reçete kaydedildi (No: ${yeniId}).`;
    if (ozetReceteHizliDonus) {
      alert(mesaj);
      const receteEl = document.getElementById('musteriReceteModal');
      if (receteEl) bootstrap.Modal.getInstance(receteEl)?.hide();
    } else {
      await musteriReceteSolListeYukle(yeniId);
      await musteriReceteKayitliGoster(yeniId);
      alert(mesaj);
    }
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

function receteGoruntuleMusteriAdBul(receteID, data) {
  const rid = Number(receteID);
  const oz = ozetReceteKayitliSatirlari.find((x) => Number(x.ReceteID) === rid);
  if (oz?.MusteriAd) return String(oz.MusteriAd).trim();
  const sol = receteSolListeSatirlari.find((x) => Number(x.ReceteID) === rid);
  if (sol?.MusteriAd) return String(sol.MusteriAd).trim();
  const panelAd = document.getElementById('musteriReceteMusteriAd')?.textContent?.trim();
  if (panelAd) return panelAd;
  if (data?.recete?.MusteriAd) return String(data.recete.MusteriAd).trim();
  return '—';
}

function receteBloklariFromKayitData(data) {
  const dekar = Number(data?.recete?.Dekar);
  const satirlar = (data?.satirlar || []).map((row) => {
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
  const bloklar = [];
  for (const s of satirlar) {
    const birim = s.birim || 'Lt';
    const maliyet = recetePlanMaliyet(s.plan, s.ambalajlar);
    if (!maliyet.kalemler.length) continue;
    bloklar.push({
      malzeme: s.grupAdi || '—',
      birim,
      ihtiyac: `${s.toplamIhtiyac} ${birim}`,
      dozaj: s.miktarDekar != null ? `${s.miktarDekar} ${birim}/da` : null,
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

function receteKayitGenelToplamHesapla(data, bloklar) {
  let genelToplam = Number(data?.genelToplam);
  if (!Number.isFinite(genelToplam) || genelToplam <= 0) {
    genelToplam = (data?.satirlar || []).reduce((acc, row) => acc + receteKayitliSatirMaliyet(row), 0);
  }
  if (!Number.isFinite(genelToplam) || genelToplam <= 0) {
    genelToplam = bloklar.reduce((acc, b) => acc + b.toplam, 0);
  }
  return Math.round(genelToplam * 100) / 100;
}

function receteGoruntuleRaporHtml(data, musteriAd) {
  const r = data.recete || {};
  const bloklar = receteBloklariFromKayitData(data);
  const genelToplam = receteKayitGenelToplamHesapla(data, bloklar);
  const tarih = r.Tarih ? new Date(r.Tarih).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }) : '—';
  const notHtml = receteNotListeDetayHtml(r.Notlar);
  const notBlok = notHtml
    ? `<div class="recete-gor-not">${notHtml}</div>`
    : '';
  const malzemeHtml = bloklar.length
    ? bloklar.map((b) => {
      const satirlar = b.kalemler.map((k) => `<tr>
          <td>${k.adet} × ${k.ambalajMiktari} ${gunlukMetinEsc(b.birim)}</td>
          <td class="text-center">${k.adet}</td>
          <td class="text-end">${receteParaFormat(k.birimFiyat)}</td>
          <td class="text-end fw-semibold">${receteParaFormat(k.tutar)}</td>
        </tr>`).join('');
      const alt = b.dozaj ? ` · ${gunlukMetinEsc(b.dozaj)}` : '';
      return `<div class="recete-gor-malzeme">
          <div class="recete-gor-malzeme-ust">
            ${gunlukMetinEsc(b.malzeme)}
            <small class="ms-1">— ${gunlukMetinEsc(b.ihtiyac)}${alt}</small>
          </div>
          <table class="table table-sm recete-gor-tablo mb-0">
            <thead><tr>
              <th>Ambalaj</th><th class="text-center" style="width:4rem">Adet</th>
              <th class="text-end" style="width:6.5rem">Birim</th><th class="text-end" style="width:6.5rem">Tutar</th>
            </tr></thead>
            <tbody>${satirlar}</tbody>
          </table>
          <div class="recete-gor-malzeme-alt">Malzeme toplamı: <strong>${receteParaFormat(b.toplam)}</strong></div>
        </div>`;
    }).join('')
    : '<p class="text-muted small mb-0">Ambalaj satırı yok.</p>';
  const satisNot = r.SatisYapildi
    ? '<div class="small text-primary mb-2"><i class="fa-solid fa-circle-check me-1"></i>Satış yapıldı</div>'
    : '';
  return `<div class="recete-gor-rapor">
    ${satisNot}
    <div class="recete-gor-ust">
      <div class="recete-gor-meta">
        <div><span class="text-muted">Müşteri</span><br><strong>${gunlukMetinEsc(musteriAd || '—')}</strong></div>
        <div><span class="text-muted">Tarım ürünü</span><br><strong>${gunlukMetinEsc(r.TarimUrunAdi || '—')}</strong></div>
        <div><span class="text-muted">Dekar</span><br><strong>${gunlukMetinEsc(String(r.Dekar ?? '—'))}</strong></div>
        <div><span class="text-muted">Reçete no</span><br><strong>#${gunlukMetinEsc(String(r.ReceteID || '—'))}</strong></div>
      </div>
      <div class="small text-muted mt-2">${gunlukMetinEsc(tarih)} · ${bloklar.length} malzeme</div>
    </div>
    ${notBlok}
    ${malzemeHtml}
    <div class="recete-gor-genel">
      <div class="text-muted small">Genel toplam</div>
      <div class="tutar">${receteParaFormat(genelToplam)}</div>
    </div>
  </div>`;
}

async function receteGoruntuleAc(receteID) {
  const rid = Number(receteID);
  if (!rid) return;
  const modalEl = document.getElementById('receteGoruntuleModal');
  const body = document.getElementById('receteGoruntuleIcerik');
  const duzenleBtn = document.getElementById('receteGoruntuleDuzenleBtn');
  if (!modalEl || !body) return;
  receteGoruntuleSonReceteID = rid;
  receteGoruntuleCache = null;
  body.innerHTML = '<p class="text-muted text-center py-4 mb-0">Yükleniyor…</p>';
  if (duzenleBtn) duzenleBtn.classList.add('d-none');
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
  try {
    const res = await fetch(`/api/recete/${rid}`);
    const data = await res.json();
    if (!data.success) {
      body.innerHTML = '<p class="text-danger small mb-0">Reçete bulunamadı.</p>';
      return;
    }
    await receteStokCacheYukle();
    const bloklar = receteBloklariFromKayitData(data);
    data.genelToplam = receteKayitGenelToplamHesapla(data, bloklar);
    receteGoruntuleCache = data;
    const musteriAd = receteGoruntuleMusteriAdBul(rid, data);
    body.innerHTML = receteGoruntuleRaporHtml(data, musteriAd);
    if (duzenleBtn) duzenleBtn.classList.remove('d-none');
  } catch (_) {
    body.innerHTML = '<p class="text-danger small mb-0">Okuma hatası.</p>';
  }
}

async function receteGoruntuleYazdir() {
  if (!receteGoruntuleCache) return alert('Reçete yüklenmedi.');
  const onceki = receteKayitliGoruntuleme;
  const oncekiCtx = receteCtx;
  try {
    receteKayitliGoruntuleme = receteGoruntuleCache;
    const rid = receteGoruntuleSonReceteID;
    receteCtx = {
      musteriID: receteGoruntuleCache.recete?.MusteriID || aktifMusteriDetayID,
      musteriAd: receteGoruntuleMusteriAdBul(rid, receteGoruntuleCache),
      tarimUrunID: receteGoruntuleCache.recete?.TarimUrunID,
      dekar: Number(receteGoruntuleCache.recete?.Dekar),
      urunAdi: receteGoruntuleCache.recete?.TarimUrunAdi,
    };
    await musteriReceteYazdir();
  } finally {
    receteKayitliGoruntuleme = onceki;
    receteCtx = oncekiCtx;
  }
}

async function receteGoruntuleDuzenle() {
  const rid = receteGoruntuleSonReceteID;
  if (!rid) return;
  const modalEl = document.getElementById('receteGoruntuleModal');
  if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
  const r = ozetReceteKayitliSatirlari.find((x) => Number(x.ReceteID) === rid)
    || receteSolListeSatirlari.find((x) => Number(x.ReceteID) === rid);
  if (r?.MusteriID) aktifMusteriDetayID = Number(r.MusteriID);
  const receteEl = document.getElementById('musteriReceteModal');
  if (receteEl && !receteEl.classList.contains('show')) {
    await musteriAltModalAc(receteEl);
    await musteriReceteSolListeYukle(rid);
  }
  await receteKayitliDuzenlemeAc(rid);
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
    const bloklar = receteBloklariFromKayitData(data);
    const genelToplam = receteKayitGenelToplamHesapla(data, bloklar);
    data.genelToplam = genelToplam;
    const kalemSayisi = (data.satirlar || []).length;
    const not = receteNotListeDetayHtml(data.recete.Notlar);
    const tarih = data.recete.Tarih ? new Date(data.recete.Tarih).toLocaleString('tr-TR') : '—';
    const satisBadge = data.recete.SatisYapildi
      ? `<div class="alert alert-primary py-2 small mb-2"><i class="fa-solid fa-circle-check me-1"></i>Satış yapıldı${data.recete.SatisTarih ? ` — ${new Date(data.recete.SatisTarih).toLocaleString('tr-TR')}` : ''}</div>`
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
          <small class="text-muted d-block">${data.recete.Dekar} dekar · ${tarih}</small>
          <small class="text-muted">${kalemSayisi} malzeme · ${receteParaFormat(genelToplam)}</small>
          ${satisBadge}
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-success" onclick="receteGoruntuleAc(${receteID})">
            <i class="fa-solid fa-eye me-1"></i>Görüntüle
          </button>
          <button type="button" class="btn btn-sm btn-outline-success" onclick="receteKayitliDuzenlemeAc(${receteID})">
            <i class="fa-solid fa-pen me-1"></i>Düzenle
          </button>
          ${sepeteEkleBtn}
          <button type="button" class="btn btn-sm btn-outline-dark" onclick="musteriReceteYazdir()">
            <i class="fa-solid fa-print me-1"></i>Yazdır
          </button>
        </div>
      </div>
      ${not}
      <p class="text-muted small mb-0">Detaylı rapor için <strong>Görüntüle</strong>ye tıklayın.</p>`;
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

document.getElementById('musteriReceteModal')?.addEventListener('hidden.bs.modal', () => {
  if (!ozetReceteHizliDonus) return;
  ozetReceteHizliDonus = false;
  setTimeout(() => { ozetReceteHizliModalGeriAc(); }, 120);
});
