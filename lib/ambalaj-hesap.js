/**
 * Toplam ihtiyacı (Lt/Kg) stoktaki ambalaj boyutlarına böler; az fire ve az kutu seçenekleri.
 */

function planKlon(plan) {
  if (!plan) return null;
  return {
    ...plan,
    secim: (plan.secim || []).map((s) => ({ ...s })),
  };
}

function planOzeti(secim, ihtiyac) {
  const secimKopya = secim.map((x) => ({ ...x }));
  const adetToplam = secimKopya.reduce((s, x) => s + x.adet, 0);
  const miktarToplam = secimKopya.reduce((s, x) => s + x.adet * x.ambalajMiktari, 0);
  return {
    secim: secimKopya,
    adetToplam,
    miktarToplam: Math.round(miktarToplam * 1000) / 1000,
    ihtiyac: Math.round(ihtiyac * 1000) / 1000,
    fire: Math.round((miktarToplam - ihtiyac) * 1000) / 1000,
  };
}

function tekBoyutPlan(variant, ihtiyac) {
  if (!variant.ambalajMiktari || variant.ambalajMiktari <= 0) return null;
  const adet = Math.ceil(ihtiyac / variant.ambalajMiktari - 1e-9);
  if (adet < 1) return null;
  return planOzeti([{ ...variant, adet }], ihtiyac);
}

/** Tam ihtiyaca büyük ambalajdan küçüğe böl (örn. 12 Lt → 2×5 + 2×1). */
function planTamBuyuktenKucuk(variants, ihtiyac) {
  const sorted = [...variants]
    .filter((v) => v.ambalajMiktari > 0)
    .sort((a, b) => b.ambalajMiktari - a.ambalajMiktari);
  if (!sorted.length) return null;

  let kalan = Math.round(ihtiyac * 1000) / 1000;
  const secim = [];
  for (const v of sorted) {
    while (kalan >= v.ambalajMiktari - 1e-6) {
      const mevcut = secim.find((s) => s.stokID === v.stokID);
      if (mevcut) mevcut.adet += 1;
      else secim.push({ ...v, adet: 1 });
      kalan = Math.round((kalan - v.ambalajMiktari) * 1000) / 1000;
    }
  }
  if (kalan > 1e-6) return null;
  return planOzeti(secim, ihtiyac);
}

function greedyPlan(variants, ihtiyac, buyuktenKucuge) {
  const sorted = [...variants]
    .filter((v) => v.ambalajMiktari > 0)
    .sort((a, b) => (buyuktenKucuge ? b.ambalajMiktari - a.ambalajMiktari : a.ambalajMiktari - b.ambalajMiktari));
  if (!sorted.length) return null;

  const secim = [];
  let kalan = ihtiyac;
  let guard = 0;
  while (kalan > 1e-6 && guard < 200) {
    guard += 1;
    let pick = sorted.find((v) => v.ambalajMiktari <= kalan + 1e-6);
    if (!pick) pick = sorted[sorted.length - 1];
    const mevcut = secim.find((s) => s.stokID === pick.stokID);
    if (mevcut) mevcut.adet += 1;
    else secim.push({ ...pick, adet: 1 });
    kalan -= pick.ambalajMiktari;
  }
  const toplam = secim.reduce((s, x) => s + x.adet * x.ambalajMiktari, 0);
  if (toplam < ihtiyac - 1e-6) {
    const enBuyuk = sorted[0];
    const ek = secim.find((s) => s.stokID === enBuyuk.stokID);
    if (ek) ek.adet += 1;
    else secim.push({ ...enBuyuk, adet: 1 });
  }
  return planOzeti(secim, ihtiyac);
}

function boundedAramaPlan(variants, ihtiyac, maxAdet) {
  const list = variants.filter((v) => v.ambalajMiktari > 0);
  if (!list.length) return null;

  let enIyi = null;
  const limit = Math.min(maxAdet, 48);

  function dene(secim, basIdx, kalanAdet) {
    const toplam = secim.reduce((s, x) => s + x.adet * x.ambalajMiktari, 0);
    if (toplam >= ihtiyac - 1e-6) {
      const plan = planOzeti(secim, ihtiyac);
      if (!enIyi || plan.fire < enIyi.fire - 1e-6
        || (Math.abs(plan.fire - enIyi.fire) < 1e-6 && plan.adetToplam < enIyi.adetToplam)) {
        enIyi = plan;
      }
      return;
    }
    if (kalanAdet <= 0) return;
    for (let i = basIdx; i < list.length; i += 1) {
      const v = list[i];
      const mevcut = secim.find((s) => s.stokID === v.stokID);
      if (mevcut) mevcut.adet += 1;
      else secim.push({ ...v, adet: 1 });
      dene(secim, i, kalanAdet - 1);
      if (mevcut) {
        mevcut.adet -= 1;
        if (mevcut.adet <= 0) {
          const idx = secim.indexOf(mevcut);
          if (idx >= 0) secim.splice(idx, 1);
        }
      } else secim.pop();
    }
  }

  dene([], 0, limit);
  return enIyi;
}

/**
 * @param {number} ihtiyac Lt veya Kg
 * @param {Array<{stokID, urunAdi, ambalajMiktari, mevcutMiktar, birim?}>} variants
 */
function ambalajOnerileri(ihtiyac, variants) {
  const need = Number(ihtiyac);
  if (!Number.isFinite(need) || need <= 0) {
    return { ihtiyac: 0, azAtik: null, azKutu: null, tekBoyutlar: [] };
  }

  const norm = variants
    .filter((v) => Number(v.ambalajMiktari) > 0)
    .map((v) => ({
      stokID: v.stokID,
      urunAdi: v.urunAdi || '',
      ambalajMiktari: Number(v.ambalajMiktari),
      mevcutMiktar: Number(v.mevcutMiktar || 0),
      barkod: v.barkod || null,
      satisFiyati: Number(v.satisFiyati || 0),
      alisFiyati: Number(v.alisFiyati || 0),
    }));

  const tamBolunmus = planTamBuyuktenKucuk(norm, need);

  const adaylar = [];
  const planAnahtar = (p) => (p?.secim || []).map((s) => `${s.stokID}:${s.adet}`).join('|');
  const adayEkle = (p) => {
    if (!p?.secim?.length) return;
    const k = planAnahtar(p);
    if (!adaylar.some((x) => planAnahtar(x) === k)) adaylar.push(planKlon(p));
  };
  if (tamBolunmus) adayEkle(tamBolunmus);
  for (const v of norm) {
    adayEkle(tekBoyutPlan(v, need));
  }
  const g1 = greedyPlan(norm, need, true);
  const g2 = greedyPlan(norm, need, false);
  const arama = boundedAramaPlan(norm, need, 24);
  adayEkle(g1);
  adayEkle(g2);
  adayEkle(arama);

  const gecerli = adaylar.filter((p) => p && p.miktarToplam >= need - 1e-6);
  if (!gecerli.length) {
    const yedek = g1 || g2 || arama;
    return {
      ihtiyac: need,
      azAtik: yedek,
      azKutu: yedek,
      enYakin: yedek,
      enUzak: yedek,
      tamUyum: null,
      tamBolunmus: null,
      tamDenk: false,
      secimGerekli: false,
      tekBoyutlar: norm.map((v) => tekBoyutPlan(v, need)).filter(Boolean),
    };
  }

  const tamPlanlar = gecerli.filter((p) => p.fire < 1e-6);
  const enAzAmbalajTam = tamPlanlar.length
    ? tamPlanlar.reduce((a, b) => (a.adetToplam < b.adetToplam ? a : b))
    : null;

  const azAtik = gecerli.reduce((a, b) => (a.fire < b.fire - 1e-6 ? a : b.fire > a.fire + 1e-6 ? b : (a.adetToplam <= b.adetToplam ? a : b)));
  const azKutu = gecerli.reduce((a, b) => (a.adetToplam < b.adetToplam ? a : b.adetToplam > a.adetToplam ? b : (a.fire <= b.fire ? a : b)));
  const tamUyum = tamBolunmus || enAzAmbalajTam;
  const planlarEsit = (a, b) => {
    if (!a || !b) return a === b;
    if (Math.abs((a.fire || 0) - (b.fire || 0)) > 1e-6) return false;
    if (a.adetToplam !== b.adetToplam) return false;
    return planAnahtar(a) === planAnahtar(b);
  };
  const planMaxAmbalaj = (p) => Math.max(...(p?.secim || []).map((s) => s.ambalajMiktari), 0);
  const minFire = Math.min(...gecerli.map((p) => p.fire));
  const minFirePlanlar = gecerli.filter((p) => p.fire <= minFire + 1e-6);
  const tekSatirPlanlar = minFirePlanlar.filter((p) => (p.secim || []).length === 1);
  const enYakinAday = tekSatirPlanlar.length ? tekSatirPlanlar : minFirePlanlar;
  /** En yakın: en az fire; tek ambalaj satırı; az kutu, büyük boy (17,25 → 6×3). */
  const siralaEnYakin = (a, b) => {
    if (a.adetToplam !== b.adetToplam) return a.adetToplam - b.adetToplam;
    const ambFark = planMaxAmbalaj(b) - planMaxAmbalaj(a);
    if (Math.abs(ambFark) > 1e-6) return ambFark;
    return planAnahtar(a).localeCompare(planAnahtar(b));
  };
  /** Alternatif: aynı fire'da çok kutu / küçük ambalaj; yoksa bir sonraki fire seviyesi. */
  const siralaEnUzak = (a, b) => {
    if (a.adetToplam !== b.adetToplam) return b.adetToplam - a.adetToplam;
    const ambFark = planMaxAmbalaj(a) - planMaxAmbalaj(b);
    if (Math.abs(ambFark) > 1e-6) return ambFark;
    return planAnahtar(a).localeCompare(planAnahtar(b));
  };
  const enYakin = planKlon([...enYakinAday].sort(siralaEnYakin)[0]);
  let enUzak = [...minFirePlanlar]
    .sort(siralaEnUzak)
    .find((p) => !planlarEsit(p, enYakin)) || null;
  if (!enUzak) {
    const diger = gecerli
      .filter((p) => p.fire > minFire + 1e-6)
      .sort((a, b) => a.fire - b.fire || siralaEnUzak(a, b));
    enUzak = diger.find((p) => !planlarEsit(p, enYakin)) || null;
  }
  if (!enUzak) enUzak = planKlon(enYakin);
  const tamDenk = !!tamUyum;
  const secimGerekli = !tamDenk && !planlarEsit(enYakin, enUzak);

  return {
    ihtiyac: need,
    azAtik,
    azKutu,
    enYakin,
    enUzak,
    tamUyum,
    tamBolunmus,
    tamDenk,
    secimGerekli,
    tekBoyutlar: norm.map((v) => tekBoyutPlan(v, need)).filter(Boolean),
  };
}

module.exports = { ambalajOnerileri, planOzeti, planTamBuyuktenKucuk, planKlon };
