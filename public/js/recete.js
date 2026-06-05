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

function receteGenelToplamHtml(toplamOverride, opts = {}) {
  const toplam = toplamOverride != null ? Number(toplamOverride) : receteGenelMaliyetToplam();
  if (toplamOverride == null && !receteSatirlar.length) return '';
  const ekBilgiBtn = opts.ekBilgiBtn
    ? `<button type="button" class="btn btn-sm btn-outline-secondary" id="musteriReceteEkBilgiBtn" onclick="musteriReceteEkBilgiModalAc()" title="Tarla ve konum bilgisi">
        <i class="fa-solid fa-map-location-dot me-1"></i>Ek bilgiler
      </button>`
    : '';
  return `<div class="recete-duzen-genel">
    ${ekBilgiBtn}
    <div class="recete-duzen-genel-toplam">
      <span class="lbl">Genel toplam</span>
      <span class="tutar">${receteParaFormat(toplam)}</span>
    </div>
  </div>`;
}

function musteriReceteEkBilgiDoluMu() {
  return !!String(receteKayitNotDegeri() || '').trim();
}

function musteriReceteEkBilgiRozetGuncelle() {
  const btn = document.getElementById('musteriReceteEkBilgiBtn');
  if (!btn) return;
  const dolu = musteriReceteEkBilgiDoluMu();
  btn.classList.toggle('btn-outline-secondary', !dolu);
  btn.classList.toggle('btn-outline-success', dolu);
}

function musteriReceteEkBilgiModalAc() {
  const el = document.getElementById('musteriReceteEkBilgiModal');
  if (!el) return;
  bootstrap.Modal.getOrCreateInstance(el).show();
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

/** Dozaj ve toplam ihtiyaç — tek satırda kompakt. */
function receteKalemDozajIhtiyacHtml(m, birim) {
  const b = birim || m.birim || 'Lt';
  const iht = Number(m.toplamIhtiyac);
  const dekar = Number(m.dekar ?? receteCtx?.dekar);
  const dozaj = m.miktarDekar != null ? Number(m.miktarDekar) : null;
  const parcalar = [];

  if (Number.isFinite(dozaj) && dozaj > 0) {
    parcalar.push(`<span><span class="recete-etiket-inline">Dozaj</span> <strong>${receteMiktarFmt(dozaj, b)}/da</strong></span>`);
  }
  if (Number.isFinite(iht) && iht > 0) {
    const dekarNot = Number.isFinite(dekar) && dekar > 0
      ? ` <span class="text-muted fw-normal">(${dekar} da)</span>`
      : '';
    parcalar.push(`<span><span class="recete-etiket-inline recete-etiket-inline--iht">İhtiyaç</span> <strong class="text-success">${receteMiktarFmt(iht, b)}</strong>${dekarNot}</span>`);
  }
  if (!parcalar.length) return '';
  return `<div class="recete-dozaj-ihtiyac recete-dozaj-ihtiyac--kompakt">${parcalar.join('<span class="recete-meta-ayrac">·</span>')}</div>`;
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

function recetePlanSatirHtml(plan, etiket, birim, malzemeAdi, ambalajlar) {
  return recetePlanKompaktHtml(plan, birim, ambalajlar, { baslik: etiket });
}

function recetePlanlarAyniMi(a, b) {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function receteOnerileriDuzelt(oneriler) {
  if (!oneriler) return oneriler;
  return { ...oneriler, secimGerekli: false };
}

function receteVarsayilanSecimTip(oneriler) {
  if (!oneriler) return 'enYakin';
  if (oneriler.tamBolunmus || (oneriler.tamDenk && oneriler.tamUyum)) return 'tamUyum';
  return 'enYakin';
}

function receteAktifPlan(satir) {
  const o = satir.oneriler;
  if (!o) return null;
  const tip = satir.secimTip || receteVarsayilanSecimTip(o);
  if (tip === 'tamUyum' && o.tamBolunmus) return o.tamBolunmus;
  if (tip === 'tamUyum' && o.tamUyum) return o.tamUyum;
  if (tip === 'enYakin' && o.enYakin) return o.enYakin;
  if (tip === 'enUzak' && o.enYakin) return o.enYakin;
  if (tip === 'azKutu' && o.azKutu) return o.azKutu;
  return o.enYakin || o.azAtik || o.enUzak || o.tamUyum || null;
}

function receteDuzenAktifPlanVeAmb(m) {
  const amb = receteAmbalajlarFromPlan(m);
  const o = m.oneriler;
  if (o) {
    const tamPlan = o.tamBolunmus || o.tamUyum;
    if (o.tamDenk && tamPlan) return { plan: tamPlan, amb };
    const plan = o.enYakin || o.azAtik;
    if (plan) return { plan, amb };
  }
  const plan = receteAktifPlan(m) || o?.tamBolunmus || o?.enYakin || o?.azAtik;
  return { plan, amb };
}

function receteDuzenMalzemeTabloHtml(satirlar, opts = {}) {
  const editable = opts.editable !== false;
  const gruplar = [];
  let hasContent = false;

  satirlar.forEach((m, blokIdx) => {
    const birim = m.birim || 'Lt';
    const satirKey = m.key;
    const malzAd = m.grupAdi || m.urunAdi;
    const { plan, amb } = receteDuzenAktifPlanVeAmb(m);
    const grupSatirlar = [];

    if (!plan?.secim?.length) {
      grupSatirlar.push(`<tr class="recete-duzen-hata"><td colspan="5" class="text-danger small py-2 px-2">
        <strong>${gunlukMetinEsc(malzAd)}</strong>: ambalaj planı yok.
        ${editable ? `<button type="button" class="btn btn-link btn-sm text-danger p-0 ms-1" onclick="receteSatirSil('${satirKey}')">Kaldır</button>` : ''}
      </td></tr>`);
      gruplar.push(`<tbody class="recete-duzen-grup${blokIdx > 0 ? ' recete-duzen-grup-ayrac' : ''}" data-recete-satir="${satirKey}">${grupSatirlar.join('')}</tbody>`);
      return;
    }

    hasContent = true;
    const { kalemler, toplam } = recetePlanMaliyet(plan, amb);
    const tam = recetePlanTamMi(plan);
    const fireVar = !tam && plan.fire > 0;
    const iht = receteMiktarFmt(m.toplamIhtiyac, birim);
    kalemler.forEach((k, i) => {
      const grupCls = blokIdx > 0 && i === 0 ? ' recete-malzeme-grup-bas' : '';
      const silBtn = editable && i === 0
        ? `<button type="button" class="recete-duzen-sil-cikti" onclick="receteSatirSil('${satirKey}')" title="Malzemeyi kaldır"><i class="fa-solid fa-xmark"></i></button>`
        : '';
      const malzemeHucre = `${silBtn}<div class="recete-malzeme-ad">${gunlukMetinEsc(malzAd)}</div>
        <div class="recete-malzeme-iht">${gunlukMetinEsc(iht)}</div>`;
      const malzemeTd = i === 0
        ? `<td class="recete-malzeme-col" rowspan="${kalemler.length}">${malzemeHucre}</td>`
        : '';
      const stokUyari = Number(k.mevcutMiktar) < k.adet
        ? ' <span class="badge bg-danger-subtle text-danger">stok!</span>' : '';
      const adetHucre = editable
        ? `<input type="number" class="form-control form-control-sm text-end recete-adet-inp" min="1" step="1" value="${Number(k.adet) || 1}"
            onchange="receteSatirAdetDegisti('${satirKey}', ${Number(k.stokID)}, this.value)" onclick="event.stopPropagation()">`
        : String(k.adet);
      const fiyatHucre = editable
        ? `<input type="number" class="form-control form-control-sm text-end recete-birim-fiyat-inp" step="0.01" min="0" value="${Number(k.birimFiyat).toFixed(2)}"
            onchange="receteSatirBirimFiyatDegisti('${satirKey}', ${Number(k.stokID)}, this.value)" onclick="event.stopPropagation()">`
        : receteParaFormat(k.birimFiyat);

      grupSatirlar.push(`<tr class="recete-malzeme-satir${grupCls}" data-recete-satir="${satirKey}">
        ${malzemeTd}
        <td class="amb">${k.ambalajMiktari} ${gunlukMetinEsc(birim)}${stokUyari}</td>
        <td class="num p-1">${adetHucre}</td>
        <td class="num p-1">${fiyatHucre}</td>
        <td class="num b">${receteParaFormat(k.tutar)}</td>
      </tr>`);
    });

    grupSatirlar.push(`<tr class="recete-malzeme-alt">
      <td colspan="3" class="recete-malzeme-alt-bos"></td>
      <td class="recete-malzeme-alt-etiket">Malzeme toplamı:</td>
      <td class="num recete-malzeme-alt-tutar"><strong>${receteParaFormat(toplam)}</strong></td>
    </tr>`);

    if (fireVar) {
      grupSatirlar.push(`<tr class="recete-duzen-fire"><td colspan="5" class="small text-warning py-1 px-2">
        <i class="fa-solid fa-circle-info me-1"></i>Not: ${plan.fire} ${birim} fazla ambalaj.
      </td></tr>`);
    }

    gruplar.push(`<tbody class="recete-duzen-grup${blokIdx > 0 ? ' recete-duzen-grup-ayrac' : ''}" data-recete-satir="${satirKey}">${grupSatirlar.join('')}</tbody>`);
  });

  if (!hasContent && !gruplar.length) return '<p class="text-muted small mb-0">Ambalaj satırı yok.</p>';

  return `<div class="recete-duzen-malzeme-wrap recete-gor-malzeme-wrap">
    <table class="recete-gor-tablo recete-duzen-malzeme-tablo recete-gor-malzeme-tablo">
      <colgroup>
        <col class="col-malzeme"><col class="col-amb"><col class="col-adet"><col class="col-birim"><col class="col-tutar">
      </colgroup>
      <thead><tr>
        <th class="malzeme">Malzeme</th>
        <th class="amb">Ambalaj</th>
        <th class="num">Adet</th>
        <th class="num">Birim</th>
        <th class="num">Tutar</th>
      </tr></thead>
      ${gruplar.join('')}
    </table>
  </div>`;
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
  const silBtn = opts.editable
    ? `<button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="receteSatirSil('${satirKey}')" title="Kaldır"><i class="fa-solid fa-xmark"></i></button>`
    : '';

  const satirMaliyet = receteSatirMaliyet(m);
  const dozajIhtiyacHtml = receteKalemDozajIhtiyacHtml(m, birim);

  if (opts.testModu) {
    return `<div class="recete-fatura-kalem recete-urun-cerceve mb-2 overflow-hidden" data-recete-satir="${satirKey}">
      <div class="recete-fatura-kalem-ust d-flex justify-content-between align-items-center gap-2 px-2 py-1 bg-light border-bottom">
        <div class="min-w-0"><div class="fw-semibold">${gunlukMetinEsc(malzAd)}</div>${dozajIhtiyacHtml}</div>
        <span class="fw-bold text-success flex-shrink-0">${receteParaFormat(satirMaliyet.toplam)}</span>
      </div>
      ${planHtml}
    </div>`;
  }

  return `<div class="recete-fatura-kalem recete-urun-cerceve mb-2 overflow-hidden" data-recete-satir="${satirKey}">
    <div class="recete-fatura-kalem-ust d-flex justify-content-between align-items-center gap-2 px-2 py-1 bg-light border-bottom">
      <div class="min-w-0 flex-grow-1">
        <div class="fw-semibold text-dark recete-kart-baslik">${gunlukMetinEsc(malzAd)}</div>
        ${dozajIhtiyacHtml}
      </div>
      <div class="d-flex align-items-center gap-2 flex-shrink-0">
        <span class="fw-bold text-success">${receteParaFormat(satirMaliyet.toplam)}</span>
        ${silBtn}
      </div>
    </div>
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
  const liste = document.getElementById('musteriReceteListePanel');
  const calisma = document.getElementById('musteriRecetePanelCalisma');
  const detay = document.getElementById('musteriReceteSagDetay');
  const listeModu = panel === 'bos' || panel === 'liste';
  if (liste) liste.classList.toggle('d-none', !listeModu);
  if (calisma) calisma.classList.toggle('d-none', panel !== 'calisma');
  if (detay) detay.classList.toggle('d-none', panel !== 'detay');
  if (panel !== 'calisma') {
    musteriReceteAramaTemizle();
  } else {
    musteriRecetePanelBaslikGuncelle();
    musteriReceteAramaOdakla();
  }
}

async function musteriReceteListeyeDon() {
  receteDuzenlemeReceteID = null;
  receteAktifKayitliID = null;
  receteSatirlar = [];
  receteKayitliGoruntuleme = null;
  musteriReceteAramaTemizle();
  musteriRecetePanelBaslikGuncelle();
  if (ozetReceteHizliDonus) {
    const receteEl = document.getElementById('musteriReceteModal');
    if (receteEl) bootstrap.Modal.getInstance(receteEl)?.hide();
    return;
  }
  await musteriReceteSolListeYukle(null);
  musteriReceteSagPanelGoster('liste');
}

async function musteriReceteAktifSil() {
  const rid = Number(receteDuzenlemeReceteID);
  if (!rid) return;
  const r = (receteSolListeSatirlari || []).find((x) => Number(x.ReceteID) === rid);
  const etiket = r
    ? `${recetePanelMusteriAdBul(r.MusteriAd || receteCtx?.musteriAd)} — ${r.TarimUrunAdi || receteCtx?.urunAdi || ''} (${r.Dekar || receteCtx?.dekar} da)`
    : `#${rid}`;
  if (!confirm(`Bu reçeteyi silmek istediğinize emin misiniz?\n\n${etiket}`)) return;
  try {
    const res = await fetch(`/api/recete/${rid}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) {
      alert('Silinemedi.');
      return;
    }
    receteDuzenlemeReceteID = null;
    receteAktifKayitliID = null;
    receteSatirlar = [];
    receteKayitliGoruntuleme = null;
    if (ozetReceteHizliDonus) {
      const receteEl = document.getElementById('musteriReceteModal');
      if (receteEl) bootstrap.Modal.getInstance(receteEl)?.hide();
      return;
    }
    await musteriReceteListeyeDon();
  } catch (_) {
    alert('Sunucuya ulaşılamadı.');
  }
}

function receteSolListeAktif(receteID) {
  receteAktifKayitliID = receteID != null ? Number(receteID) : null;
  document.querySelectorAll('[data-recete-liste-id]').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.receteListeId) === receteAktifKayitliID);
  });
}

function musteriReceteOzetBarGuncelle() {
  const bar = document.getElementById('musteriReceteOzetBar');
  if (!bar) return;
  const n = receteSatirlar.length;
  bar.textContent = `${n} malzeme`;
}

function musteriReceteAramaOdakla() {
  const panel = document.getElementById('musteriRecetePanelCalisma');
  const input = document.getElementById('musteriReceteArama');
  if (!panel || panel.classList.contains('d-none') || !input) return;
  window.setTimeout(() => {
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    input.classList.remove('recete-arama-vurgu');
    void input.offsetWidth;
    input.classList.add('recete-arama-vurgu');
    window.setTimeout(() => input.classList.remove('recete-arama-vurgu'), 1000);
  }, 100);
}

function receteMusteriAdPlaceholderMi(ad) {
  const t = String(ad || '').trim();
  return !t || t === '—' || t === '-';
}

function recetePanelMusteriAdBul(tercih) {
  if (!receteMusteriAdPlaceholderMi(tercih)) return String(tercih).trim();
  if (receteCtx?.musteriAd && !receteMusteriAdPlaceholderMi(receteCtx.musteriAd)) {
    return String(receteCtx.musteriAd).trim();
  }
  const panel = document.getElementById('musteriReceteMusteriAd')?.textContent?.trim();
  if (!receteMusteriAdPlaceholderMi(panel)) return panel;
  const md = document.getElementById('mdAdSoyad')?.textContent?.trim();
  if (!receteMusteriAdPlaceholderMi(md)) return md;
  return 'Müşteri';
}

function musteriReceteSolKartMusteriAdlariGuncelle(ad) {
  const goster = recetePanelMusteriAdBul(ad);
  document.querySelectorAll('#musteriReceteSolListe .recete-sol-kart-musteri strong').forEach((el) => {
    el.textContent = goster;
  });
}

async function musteriReceteSolListeYukle(seciliID, musteriAdOverride) {
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
    const musteriAd = recetePanelMusteriAdBul(musteriAdOverride);
    liste.innerHTML = `<div class="recete-sol-kartlar">${rows.map((r) => {
      const aktif = Number(seciliID) === Number(r.ReceteID) ? ' active' : '';
      return musteriReceteSolKartHtml(r, aktif, musteriAd);
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

async function receteStokCacheYukle(force = false) {
  try {
    const taze = window._stokSonYenileme && (Date.now() - window._stokSonYenileme < 1500);
    if (!force && taze && typeof stokListeCache !== 'undefined' && stokListeCache.length) {
      receteStokCache = stokListeCache;
      if (typeof musteriSatisStokCache !== 'undefined') musteriSatisStokCache = stokListeCache;
      return;
    }
    if (typeof stokVerileriniYenile === 'function') {
      await stokVerileriniYenile({ stokListesiGoster: false });
      return;
    }
    const res = await fetch(`/api/stok?_=${Date.now()}`);
    const stoklar = await res.json();
    receteStokCache = Array.isArray(stoklar) ? stoklar : [];
    window._stokSonYenileme = Date.now();
  } catch (_) {
    receteStokCache = [];
  }
}

function receteStokListeUygunMu(s) {
  return Number(s?.AmbalajMiktari) > 0
    || String(s?.Kategori || '').toLocaleLowerCase('tr-TR').includes('tarım');
}

function receteMalzemeMarkaBaslik(stoklar) {
  const urunler = (stoklar || []).map((s) => ({ UrunAdi: s.UrunAdi }));
  if (urunler.length && typeof stokGruplaOrtakAdTahmin === 'function') {
    const t = stokGruplaOrtakAdTahmin(urunler);
    if (t) return t;
  }
  const k = receteStokMarkaKelimeleri(stoklar[0]?.UrunAdi || '');
  if (k.length >= 2) return `${k[0]} ${k[1]}`;
  return k[0] || stoklar[0]?.UrunAdi || '';
}

function receteMalzemeMarkaSiralı(stoklar) {
  const liste = [...(stoklar || [])];
  liste.sort((a, b) => (typeof stokAmbalajKucuktenBuyuge === 'function'
    ? stokAmbalajKucuktenBuyuge(a, b)
    : String(a.UrunAdi).localeCompare(String(b.UrunAdi), 'tr')));
  return liste;
}

/** Aynı markadaki tüm stok satırları (gruplu / grupsuz). */
function receteHazirlaMarkaStokSatirlari(arama, odakStokID, malzeme) {
  const odak = Number(odakStokID)
    ? (receteStokCache || []).find((s) => Number(s.StokID) === Number(odakStokID))
    : null;
  const referans = String(arama || odak?.UrunAdi || '').trim();
  let marka = String(malzeme?.markaAnahtari || '').trim().toLocaleLowerCase('tr-TR')
    || receteStokMarkaAnahtari(referans);
  if ((!marka || marka.length < 2) && Array.isArray(malzeme?.grupsuzStokIDs) && malzeme.grupsuzStokIDs.length) {
    const s0 = (receteStokCache || []).find((s) => Number(s.StokID) === Number(malzeme.grupsuzStokIDs[0]));
    marka = receteStokMarkaAnahtari(s0?.UrunAdi);
  }
  if (!marka || marka.length < 2) return odak ? [odak] : [];
  const liste = (receteStokCache || []).filter((s) => receteStokMarkaAnahtari(s.UrunAdi) === marka);
  return receteMalzemeMarkaSiralı(liste);
}

function receteMarkaZatenTekGrupta(satirlar) {
  const gids = [...new Set((satirlar || []).map((s) => Number(s.MalzemeGrupID || 0)).filter((g) => g > 0))];
  if (gids.length !== 1 || (satirlar || []).length < 2) return false;
  const gid = gids[0];
  return (satirlar || []).every((s) => Number(s.MalzemeGrupID) === gid);
}

function receteMalzemeGrupAmbalajSayisi(gid) {
  const g = Number(gid) || 0;
  if (!g) return 0;
  return (receteStokCache || []).filter((s) => Number(s.MalzemeGrupID) === g).length;
}

/**
 * Ayni markada birlestirilmesi gereken satirlar: grupsuz veya tek ambalajli (bolunmus) grup.
 * Tam gruplanmis (2+ ambalaj tek grupta) satirlar burada yok.
 */
function receteHazirlaBirlestirmeSatirlari(arama, odakStokID, malzeme) {
  const markaSatirlari = receteHazirlaMarkaStokSatirlari(arama, odakStokID, malzeme);
  if (markaSatirlari.length < 2) return markaSatirlari;
  if (receteMarkaZatenTekGrupta(markaSatirlari)) return markaSatirlari;

  return markaSatirlari.filter((s) => {
    const g = Number(s.MalzemeGrupID || 0);
    if (!g) return true;
    return receteMalzemeGrupAmbalajSayisi(g) < 2;
  });
}

/** Reçete araması: stoktaki her satır (tam ürün adı); sanal marka grubu yok. */
function receteMalzemeListeOlustur() {
  const liste = [];
  for (const s of receteStokCache) {
    if (!receteStokListeUygunMu(s)) continue;
    const sid = Number(s.StokID);
    const gid = Number(s.MalzemeGrupID || 0) || null;
    const marka = receteStokMarkaAnahtari(s.UrunAdi);
    liste.push({
      malzemeGrupID: gid,
      stokID: sid,
      grupAdi: String(s.UrunAdi || '').trim(),
      ornekStokID: sid,
      ambalajSayisi: 1,
      toplamStok: Number(s.MevcutMiktar || 0),
      barkodlar: s.Barkod ? [String(s.Barkod).trim()] : [],
      markaAnahtari: marka || '',
      malzemeGrupAdi: String(s.MalzemeGrupAdi || '').trim(),
    });
  }
  return liste;
}

function receteMalzemeAramaMetni(m) {
  const parcalar = [
    m.grupAdi,
    m.malzemeGrupAdi,
    ...(m.barkodlar || []),
  ];
  return parcalar.filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
}

function receteMalzemeFiltrele(kelime) {
  const raw = String(kelime || '').trim().toLocaleLowerCase('tr-TR');
  if (!raw) return [];
  const liste = receteMalzemeListeOlustur();
  return liste.filter((m) => receteMalzemeAramaMetni(m).includes(raw)).slice(0, 20);
}

function receteBarkodMalzemeBul(trimmed) {
  const stok = receteStokCache.find((s) => String(s.Barkod || '').trim() === trimmed);
  if (!stok) return null;
  const gid = Number(stok.MalzemeGrupID || 0);
  const marka = receteStokMarkaAnahtari(stok.UrunAdi);
  if (gid > 0) {
    return {
      malzemeGrupID: gid,
      stokID: Number(stok.StokID),
      grupAdi: String(stok.UrunAdi || '').trim(),
      ornekStokID: stok.StokID,
      markaAnahtari: marka || '',
    };
  }
  return {
    stokID: stok.StokID,
    grupAdi: String(stok.UrunAdi || '').trim(),
    ornekStokID: stok.StokID,
    markaAnahtari: marka || '',
  };
}

let _musteriReceteAramaSecimIdx = -1;
let _musteriReceteAramaFiltreli = [];

function musteriReceteAramaSonucAcikMi() {
  const el = document.getElementById('musteriReceteAramaSonuclari');
  return !!el?.classList.contains('acik');
}

function musteriReceteAramaSonuclariniGizle() {
  const el = document.getElementById('musteriReceteAramaSonuclari');
  if (!el) return;
  el.innerHTML = '';
  el.classList.remove('acik');
  el.style.display = 'none';
  _musteriReceteAramaSecimIdx = -1;
  _musteriReceteAramaFiltreli = [];
}

function musteriReceteAramaDisTiklaKapat(ev) {
  const wrap = document.getElementById('musteriReceteAramaKutu');
  if (!wrap || !musteriReceteAramaSonucAcikMi()) return;
  if (!wrap.contains(ev.target)) musteriReceteAramaSonuclariniGizle();
}

function musteriReceteAramaEscKapat(ev) {
  if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
  if (!musteriReceteAramaSonucAcikMi()) return;
  const receteModal = document.getElementById('musteriReceteModal');
  if (!receteModal?.classList.contains('show')) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
  musteriReceteAramaSonuclariniGizle();
}

function musteriReceteAramaSecimVurgula(idx) {
  const el = document.getElementById('musteriReceteAramaSonuclari');
  if (!el) return;
  const items = [...el.querySelectorAll('button.list-group-item-action')];
  items.forEach((item, i) => item.classList.toggle('active', i === idx));
  if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
}

function musteriReceteAramaTemizle() {
  clearTimeout(_musteriReceteMalzemeAraTimer);
  _musteriReceteMalzemeAraTimer = null;
  const input = document.getElementById('musteriReceteArama');
  if (input) input.value = '';
  musteriReceteAramaSonuclariniGizle();
}

let _musteriReceteMalzemeAraTimer = null;

function musteriReceteAramaGuncelle(deger) {
  const el = document.getElementById('musteriReceteAramaSonuclari');
  if (!el) return;
  const kelime = String(deger || '').trim();
  if (kelime.length < 1) {
    musteriReceteAramaSonuclariniGizle();
    return;
  }
  const filtreli = receteMalzemeFiltrele(kelime);
  _musteriReceteAramaFiltreli = filtreli;
  _musteriReceteAramaSecimIdx = -1;
  if (!filtreli.length) {
    el.innerHTML = '<div class="list-group-item small text-muted">Malzeme bulunamadı. Tanımlamalar → Malzemeler’den ekleyin.</div>';
    el.classList.add('acik');
    el.style.display = 'block';
    return;
  }
  el.innerHTML = filtreli.map((m) => {
    const s = (receteStokCache || []).find((x) => Number(x.StokID) === Number(m.ornekStokID));
    const alt = [];
    if (s?.Barkod) alt.push(String(s.Barkod).trim());
    if (Number(s?.AmbalajMiktari) > 0) alt.push(`${s.AmbalajMiktari} ${s.OlcuBirimi || ''}`.trim());
    alt.push(`${m.toplamStok} adet stok`);
    if (m.malzemeGrupID && m.malzemeGrupAdi) alt.push(`grup: ${m.malzemeGrupAdi}`);
    return `<button type="button" class="list-group-item list-group-item-action py-2 px-3 border-0 border-bottom text-start" data-mid="${m.malzemeGrupID || ''}" data-sid="${m.ornekStokID || ''}">
    <span class="fw-semibold">${gunlukMetinEsc(m.grupAdi)}</span><br>
    <small class="text-muted">${gunlukMetinEsc(alt.join(' · '))}</small>
  </button>`;
  }).join('');
  filtreli.forEach((m, i) => {
    el.children[i].onclick = (e) => {
      e.preventDefault();
      musteriReceteAramaListedenSec(m);
    };
  });
  el.classList.add('acik');
  el.style.display = 'block';
}

function musteriReceteAramaGuncelleDebounced(deger) {
  clearTimeout(_musteriReceteMalzemeAraTimer);
  _musteriReceteMalzemeAraTimer = setTimeout(() => musteriReceteAramaGuncelle(deger), 200);
}

async function musteriReceteAramaListedenSec(malzeme) {
  await receteMalzemeEkle(malzeme);
}

async function musteriReceteAramaKeydown(ev) {
  const input = document.getElementById('musteriReceteArama');
  const sonucAcik = document.getElementById('musteriReceteAramaSonuclari')?.classList.contains('acik');
  const listeVar = _musteriReceteAramaFiltreli.length > 0;

  if (ev.key === 'ArrowDown') {
    if (!sonucAcik || !listeVar) return;
    ev.preventDefault();
    const max = _musteriReceteAramaFiltreli.length - 1;
    _musteriReceteAramaSecimIdx = _musteriReceteAramaSecimIdx < 0
      ? 0
      : Math.min(_musteriReceteAramaSecimIdx + 1, max);
    musteriReceteAramaSecimVurgula(_musteriReceteAramaSecimIdx);
    return;
  }
  if (ev.key === 'ArrowUp') {
    if (!sonucAcik || !listeVar) return;
    ev.preventDefault();
    _musteriReceteAramaSecimIdx = _musteriReceteAramaSecimIdx <= 0
      ? 0
      : _musteriReceteAramaSecimIdx - 1;
    musteriReceteAramaSecimVurgula(_musteriReceteAramaSecimIdx);
    return;
  }
  if (ev.key === 'Escape' || ev.key === 'Esc') {
    if (!sonucAcik) return;
    ev.preventDefault();
    ev.stopPropagation();
    musteriReceteAramaSonuclariniGizle();
    return;
  }
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  const trimmed = String(input?.value || '').trim();
  if (!trimmed) return;
  if (sonucAcik && listeVar && _musteriReceteAramaSecimIdx >= 0) {
    await musteriReceteAramaListedenSec(_musteriReceteAramaFiltreli[_musteriReceteAramaSecimIdx]);
    return;
  }
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

let receteMalzemeHazirlaCtx = null;

const RECETE_STOK_MARKA_ATLA = new Set([
  'cc', 'lt', 'kg', 'ml', 'gr', 'ec', 'lf', 'sıvı', 'sivi', 'adet', 'tarım', 'tarim', 'lt.', 'cc.',
  'ad', 'x', 'lf.', 'ml.', 'bu', 've', 'ile',
]);

/** Ürün adının başındaki ham kelimeler (parantez / tire temizlenmiş). */
function receteStokMarkaKelimeleri(ad) {
  return String(ad || '')
    .replace(/[()[\]—–-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜâîû.]/gi, '').trim())
    .filter((w) => w.length > 0);
}

/** Ambalaj hacmi (lt, cc…) — marka anahtarinda sayi+dahil edilmez. */
function receteStokMarkaBirimKelimesiMi(w) {
  const x = String(w || '').toLocaleLowerCase('tr-TR');
  return /^(lt|cc|kg|ml|gr|g|adet)$/i.test(x);
}

/**
 * Gruplama şüphesi anahtarı (hazırla / birleştirme).
 * MANTRAK 5 LT + MANTRAK 1 LT → "mantrak"; APACHE 50 EC → "apache 50"; VALUE QUAJE → "value quaje".
 */
function receteStokMarkaAnahtari(ad) {
  const t = receteStokMarkaKelimeleri(ad);
  if (!t.length) return '';
  const w1 = t[0].toLocaleLowerCase('tr-TR');
  if (t.length < 2) return w1;
  const w2 = t[1].toLocaleLowerCase('tr-TR');
  if (RECETE_STOK_MARKA_ATLA.has(w2)) return w1;

  if (/^\d+([.,]\d+)?$/.test(w2)) {
    const w3 = (t[2] || '').toLocaleLowerCase('tr-TR');
    if (!w3 || receteStokMarkaBirimKelimesiMi(w3)) return w1;
    return `${w1} ${w2}`;
  }

  return `${w1} ${w2}`;
}

function receteStokAyniMarkaMi(adA, adB) {
  const ma = receteStokMarkaAnahtari(adA);
  const mb = receteStokMarkaAnahtari(adB);
  return ma.length >= 2 && mb.length >= 2 && ma === mb;
}

/** Gruplama icin: grupsuz + tek ambalajli bolunmus gruplar (ayni marka). */
function receteHazirlaGrupAdaylari(arama, odakStokID, malzeme) {
  return receteHazirlaBirlestirmeSatirlari(arama, odakStokID, malzeme);
}

/** Modal tablosu: tam grup veya birlestirilecek marka satirlari. */
function receteHazirlaModalSatirlari(ctx) {
  const stok = ctx?.stok;
  const arama = String(ctx?.arama || stok?.UrunAdi || '').trim();
  const malzeme = ctx?.malzeme;
  const markaSatirlari = receteHazirlaMarkaStokSatirlari(arama, ctx?.stokID, malzeme);
  const birlestirme = receteHazirlaBirlestirmeSatirlari(arama, ctx?.stokID, malzeme);
  const grupSatirlari = ctx?.grupSatirlari || [];

  if (receteMarkaZatenTekGrupta(markaSatirlari) && markaSatirlari.length >= 2) {
    return receteMalzemeMarkaSiralı(markaSatirlari);
  }

  if (birlestirme.length >= 2) return receteMalzemeMarkaSiralı(birlestirme);

  if (grupSatirlari.length) return [...grupSatirlari];
  if (stok) return [stok];

  if (ctx?.hesap?.success && Array.isArray(ctx.hesap.ambalajlar) && ctx.hesap.ambalajlar.length) {
    const ids = ctx.hesap.ambalajlar.map((a) => Number(a.stokID)).filter(Boolean);
    const cache = receteStokCache || [];
    const fromCache = ids.map((id) => cache.find((s) => Number(s.StokID) === id)).filter(Boolean);
    const kaynak = fromCache.length ? fromCache : [];
    return kaynak.filter((s) => receteStokAyniMarkaMi(arama, s.UrunAdi));
  }

  return [];
}

function receteHazirlaVarsayilanSeciliIds(h) {
  const seciliIds = new Set();
  for (const s of h.modalSatirlari || []) {
    seciliIds.add(Number(s.StokID));
  }
  if (!seciliIds.size && h.stokID) seciliIds.add(Number(h.stokID));
  return seciliIds;
}

/** Eski çağrılar — grupsuz marka adayları */
function receteBenzerStokSatirlari(arama, odakStokID, malzeme) {
  return receteHazirlaGrupAdaylari(arama, odakStokID, malzeme);
}

async function receteMalzemeHazirlikGerekliMi(malzeme) {
  await receteStokCacheYukle(true);
  if (typeof stokBirimleriYukle === 'function') await stokBirimleriYukle();

  const gid = malzeme?.malzemeGrupID ? Number(malzeme.malzemeGrupID) : null;
  const stokID = Number(malzeme?.ornekStokID || malzeme?.stokID || 0);
  const stok = receteStokCache.find((s) => Number(s.StokID) === stokID);
  const arama = String(malzeme?.grupAdi || stok?.UrunAdi || '').trim();
  const efektifGid = Number(gid) || Number(stok?.MalzemeGrupID || 0) || 0;
  const grupSatirlari = efektifGid > 0
    ? (receteStokCache || []).filter((s) => Number(s.MalzemeGrupID) === efektifGid)
    : [];
  const markaSatirlari = receteHazirlaMarkaStokSatirlari(arama, stokID, malzeme);
  const grupAdaylari = receteHazirlaGrupAdaylari(arama, stokID, malzeme);

  const hesap = await receteSatirHesaplaApi({ malzemeGrupID: gid || efektifGid || null, stokID });
  const dozajEksik = !hesap.success && !!hesap.needsManual;

  const modalSatirlari = receteHazirlaModalSatirlari({
    gid: efektifGid,
    stok,
    stokID,
    arama,
    hesap,
    grupSatirlari,
    grupAdaylari,
    malzeme,
  });

  const birlestirme = receteHazirlaBirlestirmeSatirlari(arama, stokID, malzeme);
  const grupGerekli = birlestirme.length >= 2 && !receteMarkaZatenTekGrupta(markaSatirlari);
  const ambalajEksik = modalSatirlari.length > 0
    && modalSatirlari.some((s) => !(Number(s.AmbalajMiktari) > 0));

  const fiyatEksikSatirlar = modalSatirlari.filter((s) => !(Number(s.SatisFiyati) > 0));
  const fiyatEksik = fiyatEksikSatirlar.length > 0;

  const gerekli = dozajEksik || grupGerekli || ambalajEksik || fiyatEksik;

  return {
    gerekli,
    dozajEksik,
    grupGerekli,
    gruplariBirlestir: false,
    cokluBolunmusGrup: false,
    ambalajEksik,
    fiyatEksik,
    fiyatEksikSatirlar,
    benzer: grupAdaylari,
    markaSatirlari,
    grupAdaylari,
    modalSatirlari,
    grupSatirlari,
    malzeme,
    stok,
    stokID,
    gid: efektifGid || gid,
    arama,
    hesap,
  };
}

function receteHazirlaIlgiliStokSatirlari(ctx) {
  if (ctx.grupSatirlari?.length >= 2) return ctx.grupSatirlari;
  if (ctx.hesap?.success && Array.isArray(ctx.hesap.ambalajlar) && ctx.hesap.ambalajlar.length) {
    const ids = ctx.hesap.ambalajlar.map((a) => Number(a.stokID)).filter(Boolean);
    const cache = receteStokCache || [];
    const fromCache = ids.map((id) => cache.find((s) => Number(s.StokID) === id)).filter(Boolean);
    if (fromCache.length) return fromCache;
    return ctx.hesap.ambalajlar.map((a) => ({
      StokID: a.stokID,
      UrunAdi: a.urunAdi,
      SatisFiyati: a.satisFiyati,
      AmbalajMiktari: a.ambalajMiktari,
      OlcuBirimi: a.olcuBirimi || 'Lt',
      MalzemeGrupID: ctx.gid || null,
    }));
  }
  if (ctx.ambalajKontrol?.length) return ctx.ambalajKontrol;
  if (ctx.stok) return [ctx.stok];
  if (ctx.stokID) {
    const s = (receteStokCache || []).find((x) => Number(x.StokID) === Number(ctx.stokID));
    if (s) return [s];
  }
  return (ctx.benzer || []).slice(0, 8);
}

function receteHazirlaEksikListeHtml(h) {
  const maddeler = [];
  if (h.dozajEksik) {
    const urun = receteCtx?.urunAdi || 'seçili tarım ürünü';
    maddeler.push(`<strong>Dozaj</strong> — <em>${gunlukMetinEsc(urun)}</em> için dekar başına miktar girin (alttaki yeşil bölüm).`);
  }
  if (h.grupGerekli) {
    const n = (h.grupAdaylari || []).length;
    maddeler.push(`<strong>Gruplama</strong> — aynı markanın ${n} grupsuz ambalajını işaretleyip tek malzeme yapın (zaten gruplu satırlar listede yok).`);
  }
  if (h.ambalajEksik) {
    maddeler.push('<strong>Ambalaj</strong> — her satır için boyut (miktar) ve birim girin.');
  }
  if (h.fiyatEksik) {
    const n = (h.fiyatEksikSatirlar || []).length;
    maddeler.push(`<strong>Satış fiyatı</strong> — ${n > 1 ? `${n} ambalajda` : 'tabloda'} satış ₺ sütununu doldurun.`);
  }
  if (!maddeler.length) {
    return '<span class="text-muted">Bilgileri kontrol edip kaydedin.</span>';
  }
  return `<div class="fw-semibold mb-1">Eksikler (${maddeler.length}):</div>
    <ul class="mb-0 ps-3">${maddeler.map((m) => `<li class="mb-1">${m}</li>`).join('')}</ul>`;
}

function receteHazirlaBenzerListeCiz(benzer, seciliIds) {
  const wrap = document.getElementById('receteHazirlaBenzerListe');
  if (!wrap) return;
  if (!benzer.length) {
    wrap.innerHTML = '<p class="small text-muted mb-0">Benzer satır bulunamadı.</p>';
    return;
  }
  wrap.innerHTML = benzer.map((u) => {
    const sid = Number(u.StokID);
    const chk = seciliIds.has(sid) ? 'checked' : '';
    const grupNot = Number(u.MalzemeGrupID || 0) > 0
      ? ' <span class="badge bg-success-subtle text-success">gruplu</span>' : '';
    return `<label class="d-flex align-items-start gap-2 py-1 border-bottom recete-hazirla-stok-satir">
      <input type="checkbox" class="form-check-input mt-1 recete-hazirla-chk" data-stok-id="${sid}" ${chk} onchange="receteHazirlaBenzerTabloSenkron()">
      <span class="small"><strong>${gunlukMetinEsc(u.UrunAdi)}</strong>${grupNot}
      <span class="text-muted"> · ${gunlukMetinEsc(u.Barkod || '—')} · ${Number(u.SatisFiyati || 0).toFixed(2)} ₺</span></span>
    </label>`;
  }).join('');
}

function receteHazirlaAmbalajKaynakListesi(h) {
  if (!h) return [];
  if ((h.modalSatirlari || []).length) return h.modalSatirlari;
  if ((h.fiyatEksikSatirlar || []).length) return h.fiyatEksikSatirlar;
  if (h.stok) return [h.stok];
  return [];
}

function receteHazirlaTabloSeciliIdler() {
  const ids = new Set();
  const tabloChk = document.querySelectorAll('#receteHazirlaAmbalajTablo .recete-hazirla-tablo-chk:checked');
  if (tabloChk.length) {
    tabloChk.forEach((el) => {
      const id = Number(el.getAttribute('data-stok-id'));
      if (id) ids.add(id);
    });
    return ids;
  }
  document.querySelectorAll('.recete-hazirla-chk:checked').forEach((el) => {
    const id = Number(el.getAttribute('data-stok-id'));
    if (id) ids.add(id);
  });
  return ids;
}

function receteHazirlaSeciliStoklar() {
  const ids = receteHazirlaTabloSeciliIdler();
  return (receteStokCache || []).filter((s) => ids.has(Number(s.StokID)));
}

function receteHazirlaGrupAdiOner() {
  const secilen = receteHazirlaSeciliStoklar();
  const adInp = document.getElementById('receteHazirlaGrupAdi');
  if (!adInp || !secilen.length) return;
  const tahmin = typeof stokGruplaOrtakAdTahmin === 'function'
    ? stokGruplaOrtakAdTahmin(secilen)
    : (secilen[0]?.UrunAdi || '');
  if (!String(adInp.value || '').trim() || adInp.dataset.auto === '1') {
    adInp.value = receteMalzemeAdiTemizle(tahmin);
    adInp.dataset.auto = '1';
  }
}

function receteHazirlaBenzerTabloSenkron() {
  document.querySelectorAll('.recete-hazirla-chk').forEach((el) => {
    const sid = Number(el.getAttribute('data-stok-id'));
    const tabloChk = document.querySelector(
      `#receteHazirlaAmbalajTablo .recete-hazirla-tablo-chk[data-stok-id="${sid}"]`,
    );
    if (tabloChk) tabloChk.checked = el.checked;
  });
  receteHazirlaGrupAdiOner();
  receteHazirlaTabloTumunuSecDurum();
}

function receteHazirlaTabloTumunuSec(checked) {
  document.querySelectorAll('.recete-hazirla-tablo-chk').forEach((el) => { el.checked = checked; });
  document.querySelectorAll('.recete-hazirla-chk').forEach((el) => { el.checked = checked; });
  receteHazirlaGrupAdiOner();
}

function receteHazirlaTabloTumunuSecDurum() {
  const tum = document.getElementById('receteHazirlaTabloTumunuSec');
  const chks = [...document.querySelectorAll('.recete-hazirla-tablo-chk')];
  if (!tum || !chks.length) return;
  const isaretli = chks.filter((c) => c.checked).length;
  tum.checked = isaretli === chks.length;
  tum.indeterminate = isaretli > 0 && isaretli < chks.length;
}

function receteHazirlaAmbalajTabloGuncelle() {
  const tb = document.getElementById('receteHazirlaAmbalajTablo');
  if (!tb) return;
  const ctx = receteMalzemeHazirlaCtx;
  const kaynak = ctx?.ambalajKaynak?.length
    ? ctx.ambalajKaynak
    : receteHazirlaAmbalajKaynakListesi(ctx);
  if (ctx && !ctx.ambalajKaynak?.length) ctx.ambalajKaynak = kaynak;

  const varsayilan = ctx?.varsayilanSeciliIds;
  const oncekiSecili = receteHazirlaTabloSeciliIdler();
  const seciliIds = (varsayilan && varsayilan.size)
    ? varsayilan
    : (oncekiSecili.size
      ? oncekiSecili
      : new Set((kaynak || []).map((u) => Number(u.StokID)).filter(Boolean)));

  const kaynakSirali = [...(kaynak || [])].sort(
    typeof stokAmbalajKucuktenBuyuge === 'function'
      ? stokAmbalajKucuktenBuyuge
      : (a, b) => Number(a.AmbalajMiktari || 0) - Number(b.AmbalajMiktari || 0),
  );
  tb.innerHTML = kaynakSirali.map((u) => {
    const sid = Number(u.StokID);
    const chk = seciliIds.has(sid) ? 'checked' : '';
    const mevcutAmb = Number(u.AmbalajMiktari);
    const mevcutOlcu = String(u.OlcuBirimi || 'Lt').trim() || 'Lt';
    const ambVal = Number.isFinite(mevcutAmb) && mevcutAmb > 0 ? mevcutAmb : '';
    const satis = Number(u.SatisFiyati || 0);
    const satisVal = satis > 0 ? satis : '';
    const olcuHtml = typeof stokBirimSelectOptionsHtml === 'function'
      ? stokBirimSelectOptionsHtml(mevcutOlcu)
      : `<option value="Lt" selected>Lt</option><option value="cc">cc</option><option value="Kg">Kg</option>`;
    return `<tr data-stok-id="${sid}">
      <td class="text-center align-middle">
        <input type="checkbox" class="form-check-input recete-hazirla-tablo-chk" data-stok-id="${sid}" ${chk}
          onchange="receteHazirlaTabloSatirSecildi(${sid})">
      </td>
      <td class="small fw-semibold">${gunlukMetinEsc(u.UrunAdi)}</td>
      <td><input type="number" class="form-control form-control-sm text-end recete-hazirla-satis-fiyat" min="0" step="0.01" placeholder="Satış ₺" value="${satisVal}" title="Fiyat yoksa buradan girin"></td>
      <td><input type="number" class="form-control form-control-sm recete-hazirla-amb-miktar" min="0.001" step="any" value="${ambVal}"></td>
      <td><select class="form-select form-select-sm recete-hazirla-amb-olcu">${olcuHtml}</select></td>
    </tr>`;
  }).join('');

  receteHazirlaGrupAdiOner();
  receteHazirlaTabloTumunuSecDurum();
}

function receteHazirlaTabloSatirSecildi(stokID) {
  const sid = Number(stokID);
  const tabloChk = document.querySelector(`#receteHazirlaAmbalajTablo .recete-hazirla-tablo-chk[data-stok-id="${sid}"]`);
  const benzerChk = document.querySelector(`.recete-hazirla-chk[data-stok-id="${sid}"]`);
  if (benzerChk && tabloChk) benzerChk.checked = tabloChk.checked;
  receteHazirlaGrupAdiOner();
  receteHazirlaTabloTumunuSecDurum();
}

async function receteMalzemeDozajBirlestirKaydet(gid, tarimUrunID, miktarDekar, birim) {
  const uid = Number(tarimUrunID);
  const g = Number(gid);
  if (!g || !uid) return false;
  const kayit = await fetch(`/api/malzeme-grup/${g}/dozaj-satir`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tarimUrunID: uid,
      miktarDekar: Number(miktarDekar),
      birim: String(birim || 'Lt').trim() || 'Lt',
    }),
  });
  const data = await kayit.json().catch(() => ({}));
  if (!kayit.ok || !data.success) return false;
  const dogrula = await fetch(`/api/malzeme-grup/${g}/dozaj`);
  if (!dogrula.ok) return true;
  const liste = await dogrula.json().catch(() => []);
  const hit = (Array.isArray(liste) ? liste : []).find((d) => Number(d.TarimUrunID) === uid);
  return !!hit && Number(hit.MiktarDekar) > 0;
}

async function receteMalzemeHazirlaModalAc(malzeme, hazirlik) {
  receteMalzemeHazirlaCtx = { malzeme, ...hazirlik };
  const h = hazirlik;
  const showBenzer = !!h.grupGerekli && (h.grupAdaylari || h.benzer || []).length > 0;
  const showGrupAdi = !!h.grupGerekli;
  const showAmbalajTablo = (h.modalSatirlari || []).length > 0;
  const showGrupBolge = showBenzer || showGrupAdi || showAmbalajTablo;

  const ozet = document.getElementById('receteHazirlaEksikOzet');
  if (ozet) ozet.innerHTML = receteHazirlaEksikListeHtml(h);

  const grupBolge = document.getElementById('receteHazirlaGrupBolge');
  if (grupBolge) grupBolge.classList.toggle('d-none', !showGrupBolge);
  const benzerBolge = document.getElementById('receteHazirlaBenzerBolge');
  if (benzerBolge) benzerBolge.classList.toggle('d-none', !showBenzer);
  const grupAdiBolge = document.getElementById('receteHazirlaGrupAdiBolge');
  if (grupAdiBolge) grupAdiBolge.classList.toggle('d-none', !showGrupAdi);
  const ambalajBolge = document.getElementById('receteHazirlaAmbalajBolge');
  if (ambalajBolge) ambalajBolge.classList.toggle('d-none', !showAmbalajTablo);
  const dozajBolge = document.getElementById('receteHazirlaDozajBolge');
  if (dozajBolge) dozajBolge.classList.toggle('d-none', !h.dozajEksik);

  const seciliIds = receteHazirlaVarsayilanSeciliIds(h);

  const adInp = document.getElementById('receteHazirlaGrupAdi');
  if (adInp) {
    const secilen = (h.benzer || []).filter((s) => seciliIds.has(Number(s.StokID)));
    const tahmin = typeof stokGruplaOrtakAdTahmin === 'function'
      ? stokGruplaOrtakAdTahmin(secilen.length ? secilen : [{ UrunAdi: h.arama }])
      : String(h.arama || '').trim();
    adInp.value = receteMalzemeAdiTemizle(tahmin);
  }

  receteMalzemeHazirlaCtx.ambalajKaynak = h.modalSatirlari || receteHazirlaAmbalajKaynakListesi(h);
  receteMalzemeHazirlaCtx.varsayilanSeciliIds = seciliIds;
  receteHazirlaBenzerListeCiz(h.benzer || [], seciliIds);
  receteHazirlaAmbalajTabloGuncelle();

  const urunAd = document.getElementById('receteHazirlaDozajUrunAdi');
  const dekarEl = document.getElementById('receteHazirlaDozajDekar');
  if (urunAd) urunAd.textContent = receteCtx?.urunAdi || '—';
  if (dekarEl) dekarEl.textContent = String(receteCtx?.dekar ?? '—');

  const dozM = document.getElementById('receteHazirlaDozajMiktar');
  const dozB = document.getElementById('receteHazirlaDozajBirim');
  if (dozM) dozM.value = '';
  if (dozB && typeof stokBirimSelectDoldur === 'function') {
    stokBirimSelectDoldur(dozB, h.stok?.OlcuBirimi || 'Lt', 'Lt');
  } else if (dozB) {
    dozB.innerHTML = '<option value="Lt" selected>Lt</option>';
  }

  const onDozGid = Number(h.gid) || receteSecilenOrtakGrupId(h.benzer || []);
  if (onDozGid > 0) {
    try {
      const dr = await fetch(`/api/malzeme-grup/${onDozGid}/dozaj`);
      const list = dr.ok ? await dr.json() : [];
      const arr = Array.isArray(list) ? list : [];
      const hit = arr.find((d) => Number(d.TarimUrunID) === Number(receteCtx?.tarimUrunID));
      if (hit && dozM) dozM.value = Number(hit.MiktarDekar) || '';
      if (hit && dozB && typeof stokBirimSelectDoldur === 'function') {
        stokBirimSelectDoldur(dozB, hit.Birim || 'Lt', 'Lt');
      }
    } catch (_) { /* ignore */ }
  }

  const modalEl = document.getElementById('receteMalzemeHazirlaModal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' }).show();
  }
}

function receteMalzemeAdiTemizle(ad) {
  return String(ad || '')
    .replace(/\s*—\s*—\s*$/u, '')
    .replace(/\s*—\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function receteSecilenOrtakGrupId(secilen) {
  const gids = [...new Set(secilen.map((s) => Number(s.MalzemeGrupID || 0)).filter((g) => g > 0))];
  return gids.length === 1 ? gids[0] : 0;
}

function receteHazirlaAmbalajlariTopla() {
  const ambalajlar = [];
  for (const tr of document.querySelectorAll('#receteHazirlaAmbalajTablo tr[data-stok-id]')) {
    const tabloChk = tr.querySelector('.recete-hazirla-tablo-chk');
    if (tabloChk && !tabloChk.checked) continue;
    const stokID = Number(tr.getAttribute('data-stok-id'));
    const ambalajMiktari = Number(tr.querySelector('.recete-hazirla-amb-miktar')?.value);
    const olcuBirimi = String(tr.querySelector('.recete-hazirla-amb-olcu')?.value || 'Lt').trim() || 'Lt';
    const satisRaw = tr.querySelector('.recete-hazirla-satis-fiyat')?.value;
    const satisParsed = satisRaw != null && String(satisRaw).trim() !== ''
      ? parseFloat(String(satisRaw).replace(',', '.'))
      : NaN;
    const satisFiyati = Number.isFinite(satisParsed) && satisParsed >= 0 ? satisParsed : null;
    if (!stokID || !Number.isFinite(ambalajMiktari) || ambalajMiktari <= 0) return null;
    ambalajlar.push({ stokID, ambalajMiktari, olcuBirimi, satisFiyati });
  }
  return ambalajlar;
}

function receteHazirlaStokPutBody(grupAdi, a, gid) {
  const urunAdi = typeof stokMalzemeUrunAdiOlustur === 'function'
    ? stokMalzemeUrunAdiOlustur(grupAdi, a.ambalajMiktari, a.olcuBirimi)
    : `${grupAdi} — ${a.ambalajMiktari} ${a.olcuBirimi}`;
  const body = {
    UrunAdi: urunAdi,
    Kategori: 'Tarım',
    malzemeGrupID: gid,
    ambalajMiktari: a.ambalajMiktari,
    olcuBirimi: a.olcuBirimi,
  };
  if (a.satisFiyati != null) body.SatisFiyati = a.satisFiyati;
  return body;
}

async function receteHazirlaMevcutGrupGuncelle(gid, grupAdi, ambalajlar) {
  if (grupAdi) {
    await fetch(`/api/malzeme-grup/${gid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupAdi, dozajGerekli: true }),
    });
  }
  for (const a of ambalajlar) {
    await fetch(`/api/stok/${a.stokID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receteHazirlaStokPutBody(grupAdi, a, gid)),
    });
  }
}

async function receteMalzemeGrupOlusturBagla(grupAdi, stokID, ambM, olcu, kullanici) {
  const resG = await fetch('/api/malzeme-grup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grupAdi, dozajGerekli: true }),
  });
  const gData = await resG.json().catch(() => ({}));
  if (!resG.ok || !gData.malzemeGrupID) {
    return { ok: false, message: gData.message || 'Malzeme oluşturulamadı.' };
  }
  const gid = gData.malzemeGrupID;
  if (Number.isFinite(ambM) && ambM > 0 && stokID) {
    const urunAdi = typeof stokMalzemeUrunAdiOlustur === 'function'
      ? stokMalzemeUrunAdiOlustur(grupAdi, ambM, olcu)
      : `${grupAdi} — ${ambM} ${olcu}`;
    const rStok = await fetch(`/api/stok/${stokID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UrunAdi: urunAdi,
        Kategori: 'Tarım',
        malzemeGrupID: gid,
        ambalajMiktari: ambM,
        olcuBirimi: olcu,
        kullanici,
      }),
    });
    if (!rStok.ok) return { ok: false, message: 'Stok malzemeye bağlanamadı.' };
  }
  return { ok: true, gid, ornekStokID: stokID };
}

async function receteMalzemeHazirlaKaydet(ev) {
  if (ev?.preventDefault) ev.preventDefault();
  const ctx = receteMalzemeHazirlaCtx;
  if (!ctx) {
    alert('Hazırlık penceresi verisi yok. Kapatıp malzemeyi yeniden seçin.');
    return;
  }
  if (!receteCtx?.tarimUrunID || !receteCtx?.dekar) {
    alert('Önce tarım ürünü ve dekar seçili olmalı.');
    return;
  }

  const dozajBolgeAcik = !document.getElementById('receteHazirlaDozajBolge')?.classList.contains('d-none');
  const dozMiktar = parseFloat(String(document.getElementById('receteHazirlaDozajMiktar')?.value || '').replace(',', '.'));
  const dozBirim = String(document.getElementById('receteHazirlaDozajBirim')?.value || 'Lt').trim() || 'Lt';
  if (dozajBolgeAcik && (!Number.isFinite(dozMiktar) || dozMiktar <= 0)) {
    alert('Bu reçete için dekar başına dozaj miktarını girin.');
    return;
  }

  const grupBolgeAcik = !document.getElementById('receteHazirlaGrupBolge')?.classList.contains('d-none');
  const ambalajTabloAcik = !document.getElementById('receteHazirlaAmbalajBolge')?.classList.contains('d-none');
  let secilen = receteHazirlaSeciliStoklar();
  if (!secilen.length && ctx.fiyatEksikSatirlar?.length) {
    secilen = ctx.fiyatEksikSatirlar;
  }
  if (grupBolgeAcik && !secilen.length) {
    alert('Tabloda en az bir satır işaretleyin.');
    return;
  }
  const grupAdi = receteMalzemeAdiTemizle(
    document.getElementById('receteHazirlaGrupAdi')?.value || ctx.arama || '',
  );
  const kullanici = typeof aktifKullaniciAdi === 'function' ? aktifKullaniciAdi() : (localStorage.getItem('kullanici') || 'Sistem');
  let gid = Number(ctx.gid) || Number(ctx.malzeme?.malzemeGrupID) || 0;
  let ornekStokID = Number(ctx.stokID) || Number(ctx.malzeme?.ornekStokID) || null;
  if (!gid && secilen.length) gid = receteSecilenOrtakGrupId(secilen);

  const btn = document.getElementById('receteHazirlaKaydetBtn');
  const btnHtml = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Kaydediliyor…';
  }

  try {
    const tabloIsaretli = receteHazirlaSeciliStoklar().length;
    if (grupBolgeAcik && tabloIsaretli >= 2) {
      if (!grupAdi) {
        alert('Ortak malzeme adını yazın.');
        return;
      }
      const ambalajlar = receteHazirlaAmbalajlariTopla();
      if (!ambalajlar?.length) {
        alert('En az 2 satır işaretleyin veya tablodan elediğiniz satırları geri seçin.');
        return;
      }
      if (!ambalajlar) {
        alert('Her seçili satır için ambalaj miktarı girin.');
        return;
      }
      const ortakGid = receteSecilenOrtakGrupId(secilen);
      if (ortakGid > 0) {
        gid = ortakGid;
        await receteHazirlaMevcutGrupGuncelle(gid, grupAdi, ambalajlar);
        ornekStokID = ambalajlar[0]?.stokID || ornekStokID;
      } else {
        const res = await fetch('/api/malzeme-grup/stok-grupla', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grupAdi, ambalajlar, kullanici }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          alert(data.message || 'Gruplama kaydedilemedi.');
          return;
        }
        gid = data.malzemeGrupID;
        ornekStokID = ambalajlar[0]?.stokID || ornekStokID;
      }
    } else if (grupBolgeAcik && secilen.length === 1) {
      const s = secilen[0];
      ornekStokID = Number(s.StokID);
      gid = Number(s.MalzemeGrupID || 0) || gid;
      const tr = document.querySelector(`#receteHazirlaAmbalajTablo tr[data-stok-id="${ornekStokID}"]`);
      const ambM = Number(tr?.querySelector('.recete-hazirla-amb-miktar')?.value);
      const olcu = String(tr?.querySelector('.recete-hazirla-amb-olcu')?.value || 'Lt').trim() || 'Lt';
      if (!gid) {
        if (!grupAdi) {
          alert('Malzeme adı yazın.');
          return;
        }
        const resG = await fetch('/api/malzeme-grup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grupAdi, dozajGerekli: true }),
        });
        const gData = await resG.json().catch(() => ({}));
        if (!resG.ok || !gData.malzemeGrupID) {
          alert(gData.message || 'Malzeme oluşturulamadı.');
          return;
        }
        gid = gData.malzemeGrupID;
      }
      if (Number.isFinite(ambM) && ambM > 0) {
        const satisRaw = tr?.querySelector('.recete-hazirla-satis-fiyat')?.value;
        const satisParsed = satisRaw != null && String(satisRaw).trim() !== ''
          ? parseFloat(String(satisRaw).replace(',', '.'))
          : NaN;
        const satisFiyati = Number.isFinite(satisParsed) && satisParsed >= 0 ? satisParsed : null;
        await fetch(`/api/stok/${ornekStokID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(receteHazirlaStokPutBody(grupAdi || ctx.arama, {
            ambalajMiktari: ambM,
            olcuBirimi: olcu,
            satisFiyati,
          }, gid)),
        });
      }
    } else if (ambalajTabloAcik && ctx.fiyatEksik && secilen.length) {
      ornekStokID = ornekStokID || Number(secilen[0]?.StokID) || Number(ctx.stokID) || null;
      gid = gid || Number(secilen[0]?.MalzemeGrupID) || 0;
      const sadeceFiyat = secilen.map((s) => {
        const tr = document.querySelector(`#receteHazirlaAmbalajTablo tr[data-stok-id="${Number(s.StokID)}"]`);
        const satisRaw = tr?.querySelector('.recete-hazirla-satis-fiyat')?.value;
        const satisParsed = satisRaw != null && String(satisRaw).trim() !== ''
          ? parseFloat(String(satisRaw).replace(',', '.'))
          : NaN;
        const ambM = Number(s.AmbalajMiktari) || Number(tr?.querySelector('.recete-hazirla-amb-miktar')?.value);
        const olcu = String(s.OlcuBirimi || tr?.querySelector('.recete-hazirla-amb-olcu')?.value || 'Lt').trim() || 'Lt';
        return {
          stokID: Number(s.StokID),
          ambalajMiktari: ambM,
          olcuBirimi: olcu,
          satisFiyati: Number.isFinite(satisParsed) && satisParsed > 0 ? satisParsed : null,
        };
      });
      const fiyatGirilmeyen = sadeceFiyat.filter((a) => a.satisFiyati == null);
      if (fiyatGirilmeyen.length) {
        alert(`Satış fiyatı girilmemiş ambalaj var (${fiyatGirilmeyen.length} satır). Tablodaki Satış ₺ sütununu doldurun.`);
        return;
      }
      const grupAdiKayit = grupAdi || receteMalzemeAdiTemizle(ctx.arama || ctx.malzeme?.grupAdi || '');
      const ambKayit = sadeceFiyat.filter((a) => Number(a.ambalajMiktari) > 0);
      if (gid && ambKayit.length) {
        await receteHazirlaMevcutGrupGuncelle(gid, grupAdiKayit, ambKayit);
      } else {
        for (const a of sadeceFiyat) {
          if (a.satisFiyati == null) continue;
          await fetch(`/api/stok/${a.stokID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Kategori: 'Tarım', SatisFiyati: a.satisFiyati }),
          });
        }
      }
    } else if (gid) {
      ornekStokID = ornekStokID || Number(ctx.stokID) || null;
    } else if (ornekStokID) {
      const olustur = await receteMalzemeGrupOlusturBagla(grupAdi, ornekStokID, null, 'Lt', kullanici);
      if (!olustur.ok) {
        alert(olustur.message || 'Malzeme oluşturulamadı.');
        return;
      }
      gid = olustur.gid;
    }

    if (!gid) {
      alert('Malzeme grubu oluşturulamadı. Benzer satırları işaretleyip gruplayın veya malzeme adı yazın.');
      return;
    }

    const tarimUrunID = Number(receteCtx.tarimUrunID);
    if (dozajBolgeAcik) {
      const dozOk = await receteMalzemeDozajBirlestirKaydet(gid, tarimUrunID, dozMiktar, dozBirim);
      if (!dozOk) {
        alert('Dozaj veritabanına yazılamadı. Sunucuyu yeniden başlattığınızdan emin olun (server.js güncel).');
        return;
      }
      const adKayit = grupAdi || receteMalzemeAdiTemizle(ctx.arama || '');
      if (adKayit) {
        await fetch(`/api/malzeme-grup/${gid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grupAdi: adKayit, dozajGerekli: true }),
        });
      }
    }

    if (typeof stokVerileriniYenile === 'function') {
      await stokVerileriniYenile({ stokListesiGoster: true, malzemeDetay: true });
    } else {
      await receteStokCacheYukle(true);
      if (typeof stoklariGetir === 'function') await stoklariGetir();
      if (typeof malzemeGruplariDetayYukle === 'function') await malzemeGruplariDetayYukle();
    }

    const modalEl = document.getElementById('receteMalzemeHazirlaModal');
    if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide();

    await receteMalzemeEkleDevam({
      malzemeGrupID: gid,
      ornekStokID,
      grupAdi: grupAdi || ctx.arama,
    }, null, { hazirlikAtlandi: true });
  } catch (e) {
    console.error(e);
    alert(`Kayıt sırasında hata: ${e.message || e}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (btnHtml) btn.innerHTML = btnHtml;
    }
  }
}

async function receteMalzemeEkleDevam(malzeme, manuelToplamLt, opts = {}) {
  if (!receteCtx) return;
  const gid = malzeme?.malzemeGrupID ? Number(malzeme.malzemeGrupID) : null;
  const stokID = malzeme?.ornekStokID || malzeme?.stokID || null;
  if (receteSatirZatenVar(stokID, gid)) {
    alert('Bu malzeme zaten listede.');
    return;
  }

  let data = await receteSatirHesaplaApi({ malzemeGrupID: gid, stokID, manuelToplamLt });
  if (!data.success && data.needsManual && manuelToplamLt == null && !opts.hazirlikAtlandi) {
    const hazirlik = await receteMalzemeHazirlikGerekliMi(malzeme);
    if (hazirlik.gerekli) {
      await receteMalzemeHazirlaModalAc(malzeme, hazirlik);
      return;
    }
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
    const mesaj = data.message || 'Hesaplanamadı.';
    if (opts.hazirlikAtlandi) {
      alert(`${mesaj}\n\nDozaj kayıtlı görünüyor; sunucuyu yeniden başlatın (server.js güncel) veya malzeme düzenlede "Dozaj gerekli" açık olsun.`);
    } else {
      alert(mesaj);
    }
    return;
  }

  const secimTip = receteVarsayilanSecimTip(data.oneriler);
  const sat = await receteSatirEkleFromData(data, secimTip);
  if (!sat) return;
  receteSatirlar.push(sat);
  receteMalzemeHazirlaCtx = null;

  musteriReceteAramaTemizle();
  receteSatirlarRender();
  musteriReceteAramaOdakla();
}

async function receteMalzemeEkle(malzeme, manuelToplamLt) {
  if (!receteCtx) return alert('Önce ürün ve dekar seçin.');
  if (manuelToplamLt != null) {
    return receteMalzemeEkleDevam(malzeme, manuelToplamLt);
  }
  const hazirlik = await receteMalzemeHazirlikGerekliMi(malzeme);
  if (hazirlik.gerekli) {
    await receteMalzemeHazirlaModalAc(malzeme, hazirlik);
    return;
  }
  return receteMalzemeEkleDevam(malzeme, manuelToplamLt);
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

function receteGenelToplamAlaniGuncelle() {
  const alt = document.getElementById('musteriReceteGenelToplam');
  if (!alt) return;
  if (!receteSatirlar.length) {
    alt.innerHTML = '';
    return;
  }
  alt.innerHTML = receteGenelToplamHtml(undefined, { ekBilgiBtn: true });
  musteriReceteEkBilgiRozetGuncelle();
}

function receteSatirlarRender() {
  const wrap = document.getElementById('musteriReceteSatirlar');
  musteriReceteOzetBarGuncelle();
  if (!wrap) return;
  if (!receteSatirlar.length) {
    wrap.innerHTML = '<p class="text-muted small mb-0">Malzeme ekleyin (arama veya barkod). Ambalaj ve dozaj: <strong>Tanımlamalar → Malzemeler</strong>.</p>';
    receteGenelToplamAlaniGuncelle();
    return;
  }
  wrap.innerHTML = receteDuzenMalzemeTabloHtml(receteSatirlar, { editable: true });
  receteGenelToplamAlaniGuncelle();
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
  const cacheAd = m && typeof musteriGorunenAd === 'function' ? musteriGorunenAd(m) : '';
  const musteriAd = recetePanelMusteriAdBul(cacheAd);
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
    if (typeof musteriSatisSepetBadgeGuncelle === 'function') musteriSatisSepetBadgeGuncelle();
    await musteriAltModalAc(receteEl);
  }
  void musteriReceteSolListeYukle(rid, musteriAd);

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
  musteriRecetePanelBaslikGuncelle();
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
  const musteriAd = recetePanelMusteriAdBul(document.getElementById('mdAdSoyad')?.textContent);
  receteCtx = {
    musteriID: aktifMusteriDetayID,
    musteriAd,
  };
  receteSatirlar = [];
  receteKayitliGoruntuleme = null;
  receteAktifKayitliID = null;

  const baslik = document.getElementById('musteriReceteMusteriAd');
  if (baslik) baslik.textContent = musteriAd;

  const sagDetay = document.getElementById('musteriReceteSagDetay');
  if (sagDetay) sagDetay.innerHTML = '';

  receteTarlaFormTemizle('musteriRecete');
  musteriReceteAramaTemizle();
  musteriReceteSagPanelGoster('liste');
  await receteStokCacheYukle(true);
  await musteriReceteSolListeYukle(null, musteriAd);
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

function receteListeKonumKisaHtml(notlar) {
  const t = receteNotlarParcala(notlar);
  const parcalar = [];
  if (String(t.tarlaAdi || '').trim()) parcalar.push({ lbl: 'Tarla', val: t.tarlaAdi });
  if (String(t.mevki || '').trim()) parcalar.push({ lbl: 'Mevkii', val: t.mevki });
  if (String(t.ada || '').trim()) parcalar.push({ lbl: 'Ada', val: t.ada });
  if (String(t.parsel || '').trim()) parcalar.push({ lbl: 'Parsel', val: t.parsel });
  if (!parcalar.length) {
    const serbest = String(t.ozelAciklama || '').trim();
    if (!serbest) return '';
    return `<div class="recete-sol-kart-konum text-truncate" title="${gunlukMetinEsc(serbest)}">${gunlukMetinEsc(serbest)}</div>`;
  }
  return `<div class="recete-sol-kart-konum">${parcalar.map((p) => `<span class="recete-sol-kart-konum-hucre"><span class="recete-sol-kart-konum-lbl">${gunlukMetinEsc(p.lbl)}:</span> ${gunlukMetinEsc(p.val)}</span>`).join('<span class="recete-sol-kart-ayrac">·</span>')}</div>`;
}

function receteSolKartHtml(r, opts = {}) {
  const {
    aktif = '',
    musteriAd = 'Müşteri',
    onclick = `receteKayitliDuzenlemeAc(${r.ReceteID})`,
    dataAttr = 'data-recete-liste-id',
    dataVal = r.ReceteID,
  } = opts;
  const tarih = r.Tarih
    ? new Date(r.Tarih).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const konum = receteListeKonumKisaHtml(r.Notlar);
  const satildi = r.SatisYapildi
    ? '<span class="recete-sol-kart-rozet recete-sol-kart-rozet--satis">Satış</span>'
    : '';
  return `<button type="button" class="recete-sol-kart list-group-item list-group-item-action${aktif}" ${dataAttr}="${dataVal}" onclick="${onclick}">
    <div class="recete-sol-kart-ust">
      <span class="recete-sol-kart-urun">${gunlukMetinEsc(r.TarimUrunAdi || '—')}</span>
      <span class="recete-sol-kart-dekar">${gunlukMetinEsc(String(r.Dekar))} da</span>
    </div>
    <div class="recete-sol-kart-musteri"><i class="fa-solid fa-user me-1 opacity-75"></i><strong>${gunlukMetinEsc(musteriAd)}</strong></div>
    ${konum}
    <div class="recete-sol-kart-alt">
      <span class="recete-sol-kart-tarih"><i class="fa-regular fa-clock me-1"></i>${gunlukMetinEsc(tarih)}</span>
      <span class="recete-sol-kart-kalem">${r.KalemSayisi || 0} kalem</span>
      ${satildi}
    </div>
  </button>`;
}

function musteriReceteSolKartHtml(r, aktif, musteriAd) {
  return receteSolKartHtml(r, { aktif, musteriAd });
}

/** Sol liste: tarla / konum / tarih tek satırda kompakt. */
function receteListeMetaSatirHtml(notlar, tarih, kalemSayisi) {
  const t = receteNotlarParcala(notlar);
  const parcalar = [];
  if (String(t.tarlaAdi || '').trim()) parcalar.push({ lbl: 'Tarla', val: t.tarlaAdi });
  if (String(t.mevki || '').trim()) parcalar.push({ lbl: 'Mevkii', val: t.mevki });
  if (String(t.ada || '').trim()) parcalar.push({ lbl: 'Ada', val: t.ada });
  if (String(t.parsel || '').trim()) parcalar.push({ lbl: 'Parsel', val: t.parsel });
  const tarihMeta = `${tarih} · ${kalemSayisi || 0} kalem`;

  if (!parcalar.length) {
    const serbest = String(t.ozelAciklama || '').trim();
    if (!serbest) {
      return `<div class="recete-liste-meta"><span class="recete-liste-meta-tarih">${gunlukMetinEsc(tarihMeta)}</span></div>`;
    }
    return `<div class="recete-liste-meta">
      <span class="recete-liste-meta-hucre text-truncate" title="${gunlukMetinEsc(serbest)}">${gunlukMetinEsc(serbest)}</span>
      <span class="recete-liste-meta-tarih">${gunlukMetinEsc(tarihMeta)}</span>
    </div>`;
  }

  const konum = parcalar.map((p, i) => {
    const tarlaCls = i === 0 && p.lbl === 'Tarla' ? ' recete-liste-meta-tarla' : '';
    return `<span class="recete-liste-meta-hucre${tarlaCls}" title="${gunlukMetinEsc(`${p.lbl}: ${p.val}`)}">
      <span class="recete-liste-meta-lbl">${gunlukMetinEsc(p.lbl)}:</span> ${gunlukMetinEsc(p.val)}
    </span>`;
  }).join('');

  return `<div class="recete-liste-meta">
    <div class="recete-liste-meta-konum recete-liste-meta-konum--${parcalar.length}">${konum}</div>
    <span class="recete-liste-meta-tarih">${gunlukMetinEsc(tarihMeta)}</span>
  </div>`;
}

/** Reçete raporu: tarla / konum alanları tek satırda eşit sütunlar. */
function receteRaporKonumDetayHtml(notlar) {
  const t = receteNotlarParcala(notlar);
  const parcalar = [];
  if (String(t.tarlaAdi || '').trim()) parcalar.push({ lbl: 'Tarla', val: t.tarlaAdi });
  if (String(t.mevki || '').trim()) parcalar.push({ lbl: 'Mevkii', val: t.mevki });
  if (String(t.ada || '').trim()) parcalar.push({ lbl: 'Ada', val: t.ada });
  if (String(t.parsel || '').trim()) parcalar.push({ lbl: 'Parsel', val: t.parsel });
  if (!parcalar.length) {
    const serbest = String(t.ozelAciklama || '').trim();
    if (!serbest) return '';
    return `<div class="recete-gor-konum recete-gor-konum--1">
      <div class="recete-gor-konum-hucre"><strong>${gunlukMetinEsc(serbest)}</strong></div>
    </div>`;
  }
  const hucreler = parcalar.map((p) => `<div class="recete-gor-konum-hucre">
    <span class="lbl">${gunlukMetinEsc(p.lbl)}</span><strong>${gunlukMetinEsc(p.val)}</strong>
  </div>`).join('');
  const ozel = String(t.ozelAciklama || '').trim()
    ? `<div class="recete-gor-konum-ozel">${gunlukMetinEsc(t.ozelAciklama)}</div>`
    : '';
  return `<div class="recete-gor-konum recete-gor-konum--${parcalar.length}">${hucreler}</div>${ozel}`;
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

function musteriRecetePanelBaslikGuncelle() {
  musteriRecetePanelEtiketGuncelle();
  const musEl = document.getElementById('musteriReceteCalismaMusteriAd');
  if (musEl) musEl.textContent = recetePanelMusteriAdBul(receteCtx?.musteriAd);
  const noEl = document.getElementById('musteriReceteCalismaReceteNo');
  if (noEl) {
    noEl.textContent = receteDuzenlemeReceteID ? `Reçete #${receteDuzenlemeReceteID}` : '';
  }
  const silBtn = document.getElementById('musteriReceteSilBtn');
  if (silBtn) silBtn.classList.toggle('d-none', !receteDuzenlemeReceteID);
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
  musteriReceteSolKartMusteriAdlariGuncelle(ad);
  musteriRecetePanelBaslikGuncelle();

  await tarimUrunSelectDoldur('musteriReceteUrunIDCalisma', uid);
  const dCal = document.getElementById('musteriReceteDekarCalisma');
  if (dCal) dCal.value = String(dekar);

  receteTarlaFormDoldur('musteriRecete', receteNotlarParcala(tarlaNot));

  musteriReceteAramaTemizle();
  musteriReceteSagPanelGoster('calisma');
  musteriRecetePanelEtiketGuncelle();
  musteriReceteOzetBarGuncelle();
  receteSatirlarRender();
  musteriReceteAramaOdakla();
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
    liste.innerHTML = `<div class="recete-sol-kartlar">${ozetReceteKayitliSatirlari.map((r) => {
      const aktif = Number(ozetReceteListeVurguID) === Number(r.ReceteID) ? ' active' : '';
      return receteSolKartHtml(r, {
        aktif,
        musteriAd: r.MusteriAd || 'Müşteri',
        onclick: `ozetReceteKayitliDuzenle(${r.ReceteID})`,
        dataAttr: 'data-ozet-recete-id',
        dataVal: r.ReceteID,
      });
    }).join('')}</div>`;
    if (ozetReceteListeVurguID != null) ozetReceteKayitliListeAktif(ozetReceteListeVurguID);
    return ozetReceteKayitliSatirlari;
  } catch (_) {
    liste.innerHTML = '<p class="text-danger small mb-0">Liste alınamadı.</p>';
    return [];
  }
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

  if (r) aktifMusteriDetayID = Number(r.MusteriID);
  ozetReceteKayitliListeAktif(rid);
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
  const sonuc = [];
  const metin = typeof musteriAramaMetniOlustur === 'function'
    ? (m) => musteriAramaMetniOlustur(m)
    : (m) => [
      m.MusteriID, m.AdSoyad, m.FirmaAdi, m.Telefon,
      typeof musteriGorunenAd === 'function' ? musteriGorunenAd(m) : '',
    ].join(' ').toLocaleLowerCase('tr-TR');
  for (let i = 0; i < liste.length; i += 1) {
    if (metin(liste[i]).includes(aranan)) sonuc.push(liste[i]);
    if (sonuc.length >= 40) break;
  }
  return sonuc;
}

let _ozetReceteMusteriAraTimer = null;

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
  if (!String(deger || '').trim() || filtreli.length === 0) {
    sonuc.innerHTML = '';
    sonuc.classList.add('d-none');
    return;
  }
  sonuc.innerHTML = filtreli.map((m) => {
    const ad = typeof musteriGorunenAd === 'function' ? musteriGorunenAd(m) : (m.AdSoyad || '');
    return `<button type="button" class="list-group-item list-group-item-action py-2" data-mid="${m.MusteriID}">
      <span class="fw-semibold">${gunlukMetinEsc(ad)}</span><small class="text-muted ms-2">#${m.MusteriID}</small>
    </button>`;
  }).join('');
  filtreli.forEach((m, i) => {
    sonuc.children[i].onclick = () => ozetReceteMusteriSec(m);
  });
  sonuc.classList.remove('d-none');
}

function ozetReceteMusteriAraGuncelleDebounced(deger) {
  clearTimeout(_ozetReceteMusteriAraTimer);
  _ozetReceteMusteriAraTimer = setTimeout(() => ozetReceteMusteriAraGuncelle(deger), 220);
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
    aktifMusteriDetayID = mid;
    await musteriReceteSolListeYukle(null, musteriAd);
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
      musteriReceteSagPanelGoster('liste');
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

function receteRaporDozajMetni(s) {
  const birim = s.birim || 'Lt';
  const kayitli = Number(s.miktarDekar);
  if (Number.isFinite(kayitli) && kayitli > 0) {
    const fmt = kayitli >= 1
      ? kayitli.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
      : kayitli.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
    return `${fmt} ${birim}/da`;
  }
  const dekar = Number(s.dekar);
  let toplam = Number(s.toplamIhtiyac);
  if (!Number.isFinite(toplam) && s.ihtiyac) {
    const m = String(s.ihtiyac).match(/^([\d.,]+)/);
    if (m) toplam = Number(String(m[1]).replace(',', '.'));
  }
  if (Number.isFinite(dekar) && dekar > 0 && Number.isFinite(toplam) && toplam > 0) {
    const da = Math.round((toplam / dekar) * 10000) / 10000;
    const fmt = da >= 1
      ? da.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
      : da.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
    return `${fmt} ${birim}/da`;
  }
  return null;
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
      dozaj: receteRaporDozajMetni(s),
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
      dozaj: receteRaporDozajMetni(s),
      dekar,
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

function receteRaporDozajNotHtml(bloklar, dekar) {
  const satirlar = (bloklar || [])
    .map((b) => {
      let doz = String(b.dozaj || '').trim();
      if (!doz) {
        const hesap = receteRaporDozajMetni({
          birim: b.birim,
          miktarDekar: null,
          dekar: b.dekar ?? dekar,
          toplamIhtiyac: b.ihtiyac,
          ihtiyac: b.ihtiyac,
        });
        doz = hesap ? String(hesap).trim() : '';
      }
      if (!doz) return '';
      return `<div class="recete-dozaj-satir"><span class="recete-dozaj-urun">${gunlukMetinEsc(b.malzeme)}</span> — ${gunlukMetinEsc(doz)}</div>`;
    })
    .filter(Boolean);
  if (!satirlar.length) return '';
  return `<div class="recete-gor-dozaj-not">
    <div class="recete-dozaj-baslik">Listede bulunan ürünlerin dekara uygulanma oranları</div>
    ${satirlar.join('')}
  </div>`;
}

function receteRaporIhtiyacHtml(ihtiyac) {
  const v = String(ihtiyac || '').trim();
  if (!v) return '';
  return `<div class="recete-malzeme-iht"><span class="recete-malzeme-iht-lbl">Öngörülen ihtiyaç</span> ${gunlukMetinEsc(v)}</div>`;
}

function receteRaporMalzemeKartlariHtml(bloklar) {
  if (!bloklar.length) return '<p class="recete-rapor-bos">Ambalaj satırı yok.</p>';
  const satirlar = [];
  bloklar.forEach((b, blokIdx) => {
    const kalemler = b.kalemler || [];
    if (!kalemler.length) return;
    const malzemeHucre = `<div class="recete-malzeme-ad">${gunlukMetinEsc(b.malzeme)}</div>
      ${receteRaporIhtiyacHtml(b.ihtiyac)}`;
    kalemler.forEach((k, i) => {
      const grupCls = blokIdx > 0 && i === 0 ? ' recete-malzeme-grup-bas' : '';
      const malzemeTd = i === 0
        ? `<td class="recete-malzeme-col" rowspan="${kalemler.length}">${malzemeHucre}</td>`
        : '';
      satirlar.push(`<tr class="recete-malzeme-satir${grupCls}">
        ${malzemeTd}
        <td class="amb">${k.ambalajMiktari} ${gunlukMetinEsc(b.birim)}</td>
        <td class="num">${k.adet}</td>
        <td class="num">${receteParaFormat(k.birimFiyat)}</td>
        <td class="num b">${receteParaFormat(k.tutar)}</td>
      </tr>`);
    });
    satirlar.push(`<tr class="recete-malzeme-alt">
      <td colspan="3" class="recete-malzeme-alt-bos"></td>
      <td class="recete-malzeme-alt-etiket">Malzeme toplamı:</td>
      <td class="num recete-malzeme-alt-tutar"><strong>${receteParaFormat(b.toplam)}</strong></td>
    </tr>`);
  });
  if (!satirlar.length) return '<p class="recete-rapor-bos">Ambalaj satırı yok.</p>';
  return `<div class="recete-gor-malzeme-wrap">
    <table class="recete-gor-tablo recete-gor-malzeme-tablo">
      <colgroup>
        <col class="col-malzeme"><col class="col-amb"><col class="col-adet"><col class="col-birim"><col class="col-tutar">
      </colgroup>
      <thead><tr>
        <th class="malzeme">Malzeme</th>
        <th class="amb">Ambalaj</th><th class="num">Adet</th><th class="num">Birim</th><th class="num">Tutar</th>
      </tr></thead>
      <tbody>${satirlar.join('')}</tbody>
    </table>
  </div>`;
}

function receteRaporGovdeHtml(opts) {
  const {
    musteriAd = '—',
    urunAdi = '—',
    dekar = '—',
    receteNo = null,
    tarih = '—',
    malzemeSayisi = 0,
    genelToplam = 0,
    bloklar = [],
    notlar = '',
    satisYapildi = false,
  } = opts;
  const notHtml = receteRaporKonumDetayHtml(notlar);
  const notBlok = notHtml ? `<div class="recete-gor-not">${notHtml}</div>` : '';
  const satisNot = satisYapildi
    ? '<div class="recete-rapor-satis">Satış yapıldı</div>'
    : '';
  const receteNoHucre = receteNo
    ? `<div class="recete-gor-detay-no"><span class="lbl">Reçete no</span><strong>#${gunlukMetinEsc(String(receteNo))}</strong></div>`
    : '';
  return `${satisNot}
    <div class="recete-gor-ust">
      <div class="recete-gor-meta recete-gor-ust-satir">
        <div class="recete-gor-musteri"><span class="lbl">Müşteri</span><strong>${gunlukMetinEsc(musteriAd)}</strong></div>
        <div class="recete-gor-detay-grup">
          <div class="recete-gor-detay-urun"><span class="lbl">Tarım ürünü</span><strong>${gunlukMetinEsc(urunAdi)}</strong></div>
          <div class="recete-gor-detay-dekar"><span class="lbl">Dekar</span><strong>${gunlukMetinEsc(String(dekar))}</strong></div>
          ${receteNoHucre}
        </div>
      </div>
      <div class="recete-gor-ozet">${gunlukMetinEsc(tarih)} · ${malzemeSayisi} malzeme</div>
    </div>
    ${notBlok}
    ${receteRaporMalzemeKartlariHtml(bloklar)}
    <div class="recete-gor-alt">
      <div class="recete-gor-alt-sol">${receteRaporDozajNotHtml(bloklar, dekar)}</div>
      <div class="recete-gor-genel">
        <div class="lbl">Genel toplam</div>
        <div class="tutar">${receteParaFormat(genelToplam)}</div>
      </div>
    </div>`;
}

function receteRaporYazdirCss() {
  return `
    @page { size: A4 portrait; margin: 12mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #212529; font-size: 10.5pt; line-height: 1.4; background: #fff; }
    .recete-gor-rapor { max-width: 100%; }
    .recete-rapor-baslik { border-bottom: 1px solid #dee2e6; padding-bottom: 8px; margin-bottom: 12px; }
    .recete-rapor-baslik h1 { font-size: 16pt; margin: 0 0 4px; color: #1b5e20; font-weight: 700; }
    .recete-rapor-baslik .firm { font-size: 9.5pt; color: #6c757d; }
    .recete-rapor-satis { font-size: 9.5pt; color: #0d6efd; margin-bottom: 8px; }
    .recete-gor-ust { border-bottom: 1px solid #dee2e6; padding-bottom: 10px; margin-bottom: 12px; }
    .recete-gor-meta { font-size: 10pt; }
    .recete-gor-meta .lbl { display: block; font-size: 8.5pt; color: #6c757d; margin-bottom: 2px; }
    .recete-gor-meta strong { font-weight: 600; }
    .recete-gor-ust-satir { display: flex; align-items: flex-end; gap: 24px 32px; }
    .recete-gor-musteri { flex: 2 1 0; min-width: 0; padding-right: 8px; }
    .recete-gor-musteri strong { word-break: break-word; }
    .recete-gor-detay-grup {
      flex: 3 1 0;
      min-width: 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px 20px;
      align-items: end;
    }
    .recete-gor-detay-no { text-align: right; }
    .recete-gor-ozet { font-size: 9pt; color: #6c757d; margin-top: 8px; }
    .recete-gor-not { background: #f8f9fa; border-radius: 6px; padding: 8px 10px; font-size: 9.5pt; margin-bottom: 12px; }
    .recete-gor-konum { display: grid; gap: 8px 16px; align-items: start; }
    .recete-gor-konum--1 { grid-template-columns: 1fr; }
    .recete-gor-konum--2 { grid-template-columns: repeat(2, 1fr); }
    .recete-gor-konum--3 { grid-template-columns: repeat(3, 1fr); }
    .recete-gor-konum--4 { grid-template-columns: repeat(4, 1fr); }
    .recete-gor-konum-hucre { min-width: 0; }
    .recete-gor-konum-hucre .lbl { display: block; font-size: 8.5pt; color: #6c757d; margin-bottom: 2px; }
    .recete-gor-konum-hucre strong { font-weight: 600; word-break: break-word; }
    .recete-gor-konum-ozel { margin-top: 6px; font-size: 9pt; color: #495057; word-break: break-word; }
    .recete-gor-malzeme-wrap { border: 1px solid #e9ecef; border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
    .recete-gor-malzeme-tablo { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9.5pt; }
    .recete-gor-malzeme-tablo col.col-malzeme { width: 28%; }
    .recete-gor-malzeme-tablo col.col-amb { width: 22%; }
    .recete-gor-malzeme-tablo col.col-adet { width: 10%; }
    .recete-gor-malzeme-tablo col.col-birim { width: 20%; }
    .recete-gor-malzeme-tablo col.col-tutar { width: 20%; }
    .recete-gor-tablo { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9.5pt; }
    .recete-gor-tablo th, .recete-gor-tablo td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
    .recete-gor-malzeme-tablo th { background: #f8fafc; color: #6c757d; font-weight: 600; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.03em; }
    .recete-gor-malzeme-tablo .recete-malzeme-col { vertical-align: top; background: #f8fdf9; border-right: 1px solid #eef2f6; }
    .recete-malzeme-ad { font-weight: 700; font-size: 9.5pt; color: #1b5e20; line-height: 1.3; }
    .recete-malzeme-iht { font-size: 8.5pt; color: #6c757d; margin-top: 2px; }
    .recete-malzeme-iht-lbl { font-weight: 600; color: #94a3b8; }
    .recete-malzeme-doz { font-size: 8pt; color: #94a3b8; margin-top: 2px; }
    .recete-malzeme-grup-bas td { border-top: 2px solid #e2e8f0; }
    .recete-gor-tablo th.amb, .recete-gor-tablo td.amb { text-align: left; }
    .recete-gor-tablo th.num, .recete-gor-tablo td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .recete-gor-tablo td.num.b { font-weight: 600; }
    .recete-malzeme-alt td { background: #fafafa; font-size: 9pt; padding: 4px 10px; }
    .recete-malzeme-alt-bos { border-bottom: 1px solid #f0f0f0; }
    .recete-malzeme-alt-etiket { text-align: right; color: #6c757d; white-space: nowrap; }
    .recete-malzeme-alt-tutar { font-weight: 600; text-align: right !important; white-space: nowrap; }
    .recete-gor-alt { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: flex-end; justify-content: space-between; border-top: 2px solid #2e7d32; padding-top: 10px; margin-top: 4px; }
    .recete-gor-alt-sol { flex: 1 1 240px; min-width: 0; }
    .recete-gor-dozaj-not { font-size: 8.5pt; color: #495057; line-height: 1.45; }
    .recete-dozaj-baslik { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6c757d; margin-bottom: 6px; }
    .recete-dozaj-satir { margin-bottom: 3px; }
    .recete-dozaj-urun { font-weight: 600; color: #1b5e20; }
    .recete-gor-genel { flex: 0 0 auto; text-align: right; min-width: 140px; }
    .recete-gor-genel .lbl { font-size: 9pt; color: #6c757d; }
    .recete-gor-genel .tutar { font-size: 14pt; font-weight: 700; color: #1b5e20; margin-top: 2px; }
    .recete-rapor-bos { color: #6c757d; font-size: 10pt; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }`;
}

function receteGoruntuleRaporHtml(data, musteriAd) {
  const r = data.recete || {};
  const bloklar = receteBloklariFromKayitData(data);
  const genelToplam = receteKayitGenelToplamHesapla(data, bloklar);
  const tarih = r.Tarih ? new Date(r.Tarih).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }) : '—';
  return `<div class="recete-gor-rapor">${receteRaporGovdeHtml({
    musteriAd,
    urunAdi: r.TarimUrunAdi,
    dekar: r.Dekar,
    receteNo: r.ReceteID,
    tarih,
    malzemeSayisi: bloklar.length,
    genelToplam,
    bloklar,
    notlar: r.Notlar,
    satisYapildi: !!r.SatisYapildi,
  })}</div>`;
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

function receteRaporA4DokumaniOlustur(meta, bloklar, genelToplam) {
  const unvan = typeof uygulamaAyarlari !== 'undefined' ? (uygulamaAyarlari?.SirketUnvan || '') : '';
  const tel = typeof uygulamaAyarlari !== 'undefined' ? (uygulamaAyarlari?.SirketTelefon || '') : '';
  const firmSatir = unvan
    ? `<div class="firm">${gunlukMetinEsc(unvan)}${tel ? ` · Tel: ${gunlukMetinEsc(tel)}` : ''}</div>`
    : '';
  const govde = receteRaporGovdeHtml({
    musteriAd: meta.musteriAd,
    urunAdi: meta.urunAdi,
    dekar: meta.dekar,
    receteNo: meta.receteNo,
    tarih: meta.tarih,
    malzemeSayisi: bloklar.length,
    genelToplam,
    bloklar,
    notlar: meta.notlar || '',
    satisYapildi: !!meta.satisYapildi,
  });
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Reçete raporu — ${gunlukMetinEsc(meta.musteriAd || '')}</title>
  <style>${receteRaporYazdirCss()}</style>
</head>
<body>
  <div class="recete-gor-rapor">
    <div class="recete-rapor-baslik">
      <h1>Reçete raporu</h1>
      ${firmSatir}
    </div>
    ${govde}
  </div>
</body>
</html>`;
}

function receteRaporDirektYazdir(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Reçete yazdır');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();
  win.focus();
  win.print();
  setTimeout(() => iframe.remove(), 1500);
}

async function musteriReceteYazdir() {
  if (!receteCtx) return alert('Reçete yok.');
  if (!receteKayitliGoruntuleme && !receteSatirlar.length) return alert('Yazdırmak için malzeme ekleyin.');
  await receteStokCacheYukle();
  const bloklar = receteRaporBloklariOlustur();
  if (!bloklar.length) return alert('Rapor için ambalaj satırı bulunamadı.');
  const genelToplam = receteRaporGenelToplam(bloklar);
  const d = receteCtx;
  const kayit = receteKayitliGoruntuleme?.recete;
  const tarihKaynak = kayit?.Tarih || kayit?.OlusturmaTarihi;
  const calismaAcik = !document.getElementById('musteriRecetePanelCalisma')?.classList.contains('d-none');
  const notlar = calismaAcik ? receteKayitNotDegeri() : (kayit?.Notlar || '');
  const html = receteRaporA4DokumaniOlustur({
    musteriAd: d.musteriAd,
    urunAdi: d.urunAdi || kayit?.TarimUrunAdi,
    dekar: d.dekar ?? kayit?.Dekar,
    tarih: tarihKaynak
      ? new Date(tarihKaynak).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })
      : new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }),
    receteNo: kayit?.ReceteID || receteDuzenlemeReceteID || null,
    notlar,
    satisYapildi: !!kayit?.SatisYapildi,
  }, bloklar, genelToplam);
  receteRaporDirektYazdir(html);
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

document.addEventListener('click', musteriReceteAramaDisTiklaKapat);
document.addEventListener('keydown', musteriReceteAramaEscKapat, true);

document.getElementById('musteriReceteModal')?.addEventListener('shown.bs.modal', () => {
  musteriReceteAramaOdakla();
});
document.getElementById('musteriReceteEkBilgiModal')?.addEventListener('hidden.bs.modal', () => {
  musteriReceteEkBilgiRozetGuncelle();
});
['musteriReceteTarlaAdi', 'musteriReceteMevki', 'musteriReceteAda', 'musteriReceteParsel', 'musteriReceteAciklama'].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', musteriReceteEkBilgiRozetGuncelle);
});
document.getElementById('musteriReceteModal')?.addEventListener('hidden.bs.modal', () => {
  musteriReceteAramaTemizle();
  if (!ozetReceteHizliDonus) return;
  ozetReceteHizliDonus = false;
  setTimeout(() => { ozetReceteHizliModalGeriAc(); }, 120);
});
