/** Tanımlamalar — tarım ürünleri (pancar vb.) ve stok dozaj paneli */

let tarimUrunCache = [];
let malzemeGrupCache = [];
let stokBirimCache = [];

const STOK_BIRIM_VARSAYILAN = [
  { BirimKodu: 'Lt', Aciklama: 'Litre (sıvı)' },
  { BirimKodu: 'Kg', Aciklama: 'Kilogram' },
  { BirimKodu: 'Adet', Aciklama: 'Bidon, çuval' },
  { BirimKodu: 'Kutu', Aciklama: 'Kutu' },
  { BirimKodu: 'Torba', Aciklama: 'Torba' },
];

async function stokBirimleriYukle() {
  try {
    const res = await fetch('/api/stok-birim');
    stokBirimCache = await res.json();
    if (!Array.isArray(stokBirimCache)) stokBirimCache = [];
  } catch (_) {
    stokBirimCache = [];
  }
  return stokBirimCache;
}

function stokBirimListeAktif() {
  const liste = (stokBirimCache || []).filter((b) => b.Aktif !== false && b.Aktif !== 0);
  return liste.length ? liste : STOK_BIRIM_VARSAYILAN;
}

function stokBirimSelectOptionsHtml(secili) {
  const opts = stokBirimListeAktif();
  let html = opts.map((b) => {
    const kod = b.BirimKodu;
    const sel = String(secili || '') === kod ? ' selected' : '';
    const lbl = b.Aciklama ? `${kod} — ${b.Aciklama}` : kod;
    return `<option value="${gunlukMetinEsc(kod)}"${sel}>${gunlukMetinEsc(lbl)}</option>`;
  }).join('');
  if (secili && !opts.some((b) => b.BirimKodu === secili)) {
    html += `<option value="${gunlukMetinEsc(secili)}" selected>${gunlukMetinEsc(secili)} (eski)</option>`;
  }
  return html;
}

function stokBirimSelectDoldur(selectEl, secili, varsayilan) {
  if (!selectEl) return;
  selectEl.innerHTML = stokBirimSelectOptionsHtml(secili || varsayilan);
}

async function stokBirimTabloCiz() {
  const tbody = document.getElementById('stokBirimTabloGovde');
  if (!tbody) return;
  await stokBirimleriYukle();
  const liste = stokBirimListeAktif();
  if (!liste.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted small">Henüz birim yok.</td></tr>';
    return;
  }
  tbody.innerHTML = liste.map((b) => `<tr>
    <td><strong>${gunlukMetinEsc(b.BirimKodu)}</strong></td>
    <td class="text-muted small">${gunlukMetinEsc(b.Aciklama || '—')}</td>
    <td class="text-end">
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="stokBirimSil(${b.BirimID})" title="Sil"><i class="fa-solid fa-trash"></i></button>
    </td>
  </tr>`).join('');
}

async function stokBirimKaydet(event) {
  event.preventDefault();
  const kod = document.getElementById('stokBirimKodu')?.value?.trim();
  const aciklama = document.getElementById('stokBirimAciklama')?.value?.trim();
  if (!kod) return alert('Birim kodu yazın (örn. Lt, Kg, Adet).');
  const res = await fetch('/api/stok-birim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ birimKodu: kod, aciklama }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    alert(data.message || 'Birim eklenemedi.');
    return;
  }
  document.getElementById('stokBirimForm')?.reset();
  await stokBirimTabloCiz();
  await stokBirimleriYukle();
}

async function stokBirimSil(id) {
  const b = stokBirimCache.find((x) => Number(x.BirimID) === Number(id));
  const kod = b?.BirimKodu || '';
  if (!confirm(`"${kod}" birimi silinsin mi?`)) return;
  const res = await fetch(`/api/stok-birim/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    alert(data.message || 'Silinemedi.');
    return;
  }
  await stokBirimTabloCiz();
  await stokBirimleriYukle();
}

async function tarimUrunleriYukle() {
  const res = await fetch('/api/tarim-urun');
  tarimUrunCache = await res.json();
  return tarimUrunCache;
}

async function malzemeGruplariYukle() {
  const res = await fetch('/api/malzeme-grup');
  malzemeGrupCache = await res.json();
  return malzemeGrupCache;
}

function tanimlamalarModalAc() {
  modalAc(document.getElementById('tanimlamalarModal'), async () => {
    await Promise.all([tarimUrunleriYukle(), stokBirimleriYukle()]);
    tarimUrunTabloCiz();
    tanimTabAktif('urunler');
  });
}

function tanimTabAktif(tab) {
  document.querySelectorAll('[data-tanim-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tanim-tab') === tab);
  });
  const urunPanel = document.getElementById('tanimPanelUrunler');
  const malzPanel = document.getElementById('tanimPanelMalzemeler');
  const birimPanel = document.getElementById('tanimPanelBirimler');
  const testPanel = document.getElementById('tanimPanelReceteTest');
  if (urunPanel) urunPanel.classList.toggle('d-none', tab !== 'urunler');
  if (malzPanel) malzPanel.classList.toggle('d-none', tab !== 'malzemeler');
  if (birimPanel) birimPanel.classList.toggle('d-none', tab !== 'birimler');
  if (testPanel) testPanel.classList.toggle('d-none', tab !== 'recete-test');
  if (tab === 'birimler') stokBirimTabloCiz();
}

function stokMalzemeUrunAdiOlustur(grupAdi, amb, olcu) {
  const ad = String(grupAdi || '').trim();
  const a = Number(amb);
  const o = String(olcu || 'Lt').trim() || 'Lt';
  if (!ad || !Number.isFinite(a) || a <= 0) return ad;
  return `${ad} — ${a} ${o}`;
}

let malzemeGrupDetayCache = [];

async function malzemeGruplariDetayYukle() {
  const res = await fetch('/api/malzeme-grup?detay=1');
  malzemeGrupDetayCache = await res.json();
  malzemeGrupCache = malzemeGrupDetayCache.map((g) => ({
    MalzemeGrupID: g.MalzemeGrupID,
    GrupAdi: g.GrupAdi,
    AmbalajSayisi: g.AmbalajSayisi,
  }));
  return malzemeGrupDetayCache;
}

async function malzemeGruplariPanelYukle() {
  const wrap = document.getElementById('malzemeGrupListe');
  if (!wrap) return;
  wrap.innerHTML = '<p class="text-muted small">Yükleniyor…</p>';
  await malzemeGruplariDetayYukle();
  if (!malzemeGrupDetayCache.length) {
    wrap.innerHTML = '<p class="text-muted small mb-0">Henüz malzeme yok. <strong>Yeni malzeme</strong> ile ürün adını yazıp ambalaj ekleyin.</p>';
    return;
  }
  wrap.innerHTML = `<div class="list-group">${malzemeGrupDetayCache.map((g) => {
    const n = (g.ambalajlar || []).length;
    const boyutlar = (g.ambalajlar || []).map((a) => `${Number(a.AmbalajMiktari)} ${a.OlcuBirimi || 'Lt'}`).join(', ') || '—';
    return `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
      onclick="malzemeDuzenleModalAc(${g.MalzemeGrupID})">
      <div class="text-start">
        <strong>${gunlukMetinEsc(g.GrupAdi)}</strong>
        <div class="small text-muted">${n} ambalaj: ${gunlukMetinEsc(boyutlar)} · ${g.ToplamAmbalajAdet ?? 0} adet stok</div>
      </div>
      <i class="fa-solid fa-pen text-success"></i>
    </button>`;
  }).join('')}</div>`;
}

let malzemeDuzenleDozajGid = null;

function malzemeEsikDeger(kaynak, alan, varsayilan) {
  const ham = kaynak?.[alan];
  const n = parseInt(ham, 10);
  if (Number.isInteger(n) && n >= 0) return n;
  return varsayilan;
}

function malzemeAmbalajSatirHtml(a, rowKey) {
  const stokID = a?.StokID ? Number(a.StokID) : '';
  const amb = a?.AmbalajMiktari != null ? Number(a.AmbalajMiktari) : '';
  const olcu = a?.OlcuBirimi || 'Lt';
  const kritik = malzemeEsikDeger(a, 'KritikEsik', 5);
  const hedef = malzemeEsikDeger(a, 'HedefEsik', 20);
  return `<tr data-row-key="${rowKey}" data-stok-id="${stokID}">
    <td class="malz-col-boyut"><input type="number" step="0.001" min="0.001" class="form-control form-control-sm malz-amb-miktar" value="${amb === '' ? '' : amb}" placeholder="5"></td>
    <td class="malz-col-birim"><select class="form-select form-select-sm malz-amb-olcu">${stokBirimSelectOptionsHtml(olcu)}</select></td>
    <td class="malz-col-barkod"><input type="text" class="form-control form-control-sm malz-amb-barkod" value="${String(a?.Barkod || '').replace(/"/g, '&quot;')}" maxlength="50" placeholder="Barkod"></td>
    <td class="malz-col-fiyat"><input type="number" step="0.01" min="0" class="form-control form-control-sm malz-amb-alis" value="${Number(a?.AlisFiyati || 0)}"></td>
    <td class="malz-col-fiyat"><input type="number" step="0.01" min="0" class="form-control form-control-sm malz-amb-satis" value="${Number(a?.SatisFiyati || 0)}"></td>
    <td class="malz-col-esik"><input type="number" min="0" step="1" class="form-control form-control-sm malz-amb-kritik" value="${kritik}" title="Tehlikeli stok alt sınırı (adet)"></td>
    <td class="malz-col-esik"><input type="number" min="0" step="1" class="form-control form-control-sm malz-amb-hedef" value="${hedef}" title="Yeterli stok üst sınırı (adet)"></td>
    <td class="malz-col-stok"><input type="number" min="0" step="1" class="form-control form-control-sm malz-amb-stok" value="${parseInt(a?.MevcutMiktar, 10) || 0}"></td>
    <td class="malz-col-sil text-center">
      <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="malzemeAmbalajSatirSil('${rowKey}')" title="Satırı kaldır"><i class="fa-solid fa-xmark"></i></button>
    </td>
  </tr>`;
}

function malzemeAmbalajSatirEkle(bosSatir) {
  const tbody = document.getElementById('malzemeAmbalajGovde');
  if (!tbody) return;
  const key = `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  tbody.insertAdjacentHTML('beforeend', malzemeAmbalajSatirHtml(bosSatir || null, key));
}

function malzemeAmbalajSatirSil(rowKey) {
  const tr = document.querySelector(`#malzemeAmbalajGovde tr[data-row-key="${rowKey}"]`);
  if (!tr) return;
  const stokID = tr.getAttribute('data-stok-id');
  if (stokID && !confirm('Bu ambalaj stoktan silinsin mi?')) return;
  tr.remove();
  if (stokID) malzemeDuzenleSilinecekStok.push(Number(stokID));
}

let malzemeDuzenleSilinecekStok = [];

function malzemeAmbalajSatirlariTopla() {
  const rows = [];
  document.querySelectorAll('#malzemeAmbalajGovde tr').forEach((tr) => {
    const amb = parseFloat(tr.querySelector('.malz-amb-miktar')?.value);
    if (!Number.isFinite(amb) || amb <= 0) return;
    rows.push({
      stokID: Number(tr.getAttribute('data-stok-id')) || null,
      ambalajMiktari: amb,
      olcuBirimi: tr.querySelector('.malz-amb-olcu')?.value || 'Lt',
      barkod: tr.querySelector('.malz-amb-barkod')?.value?.trim() || '',
      alisFiyati: parseFloat(tr.querySelector('.malz-amb-alis')?.value) || 0,
      satisFiyati: parseFloat(tr.querySelector('.malz-amb-satis')?.value) || 0,
      kritikEsik: (() => {
        const n = parseInt(tr.querySelector('.malz-amb-kritik')?.value, 10);
        return Number.isInteger(n) && n >= 0 ? n : 5;
      })(),
      hedefEsik: (() => {
        const n = parseInt(tr.querySelector('.malz-amb-hedef')?.value, 10);
        return Number.isInteger(n) && n >= 0 ? n : 20;
      })(),
      mevcutMiktar: parseInt(tr.querySelector('.malz-amb-stok')?.value, 10) || 0,
      birim: 'Adet',
    });
  });
  return rows;
}

function malzemeDozajGerekliMi() {
  return !!document.getElementById('malzemeDozajGerekli')?.checked;
}

async function malzemeDozajPanelGuncelle() {
  const acik = malzemeDozajGerekliMi();
  const wrap = document.getElementById('malzemeDozajWrap');
  const not = document.getElementById('malzemeDozajKapaliNot');
  if (wrap) wrap.classList.toggle('d-none', !acik);
  if (not) not.classList.toggle('d-none', acik);
  if (!acik) return;
  const gid = Number(document.getElementById('malzemeDuzenleGrupID')?.value || 0);
  if (gid > 0) {
    await malzemeGrupDozajlariYukle(gid);
    malzemeDuzenleDozajCiz(gid);
  } else {
    malzemeDuzenleDozajCiz(null);
  }
}

function malzemeDozajGerekliAyarla(deger) {
  const chk = document.getElementById('malzemeDozajGerekli');
  if (chk) chk.checked = deger !== false && deger !== 0;
  malzemeDozajPanelGuncelle();
}

function malzemeDuzenleDozajCiz(gid) {
  malzemeDuzenleDozajGid = gid || null;
  const wrap = document.getElementById('malzemeDuzenleDozaj');
  if (!wrap) return;
  wrap.innerHTML = malzemeDozajTabloHtml(gid || 'yeni');
}

async function malzemeDuzenleModalAc(grupID) {
  const modal = document.getElementById('malzemeDuzenleModal');
  if (!modal) return;
  malzemeDuzenleSilinecekStok = [];
  await Promise.all([tarimUrunleriYukle(), stokBirimleriYukle()]);

  const gidInp = document.getElementById('malzemeDuzenleGrupID');
  const adInp = document.getElementById('malzemeDuzenleAd');
  const tbody = document.getElementById('malzemeAmbalajGovde');
  const baslik = document.getElementById('malzemeDuzenleBaslik');
  const gid = Number(grupID || 0);

  if (gid > 0) {
    const res = await fetch(`/api/malzeme-grup/${gid}`);
    const data = await res.json().catch(() => ({}));
    if (!data.success) return alert('Malzeme yüklenemedi.');
    if (gidInp) gidInp.value = String(gid);
    if (adInp) adInp.value = data.grup?.GrupAdi || '';
    malzemeDozajGerekliAyarla(data.grup?.DozajGerekli);
    if (baslik) baslik.innerHTML = '<i class="fa-solid fa-pen me-2"></i>Malzeme düzenle';
    if (tbody) {
      tbody.innerHTML = '';
      for (const a of data.ambalajlar || []) {
        malzemeAmbalajSatirEkle(a);
      }
    }
    const g = malzemeGrupDetayCache.find((x) => Number(x.MalzemeGrupID) === gid) || { MalzemeGrupID: gid };
    g._dozajlar = null;
    if (malzemeDozajGerekliMi()) {
      await malzemeGrupDozajlariYukle(gid);
      malzemeDuzenleDozajCiz(gid);
    } else {
      malzemeDuzenleDozajCiz(null);
    }
  } else {
    if (gidInp) gidInp.value = '';
    if (adInp) adInp.value = '';
    malzemeDozajGerekliAyarla(true);
    if (baslik) baslik.innerHTML = '<i class="fa-solid fa-plus me-2"></i>Yeni malzeme';
    if (tbody) {
      tbody.innerHTML = '';
      malzemeAmbalajSatirEkle();
    }
    malzemeDuzenleDozajCiz(null);
  }

  if (typeof modalAc === 'function') modalAc(modal);
  else if (typeof bootstrap !== 'undefined') bootstrap.Modal.getOrCreateInstance(modal).show();
  setTimeout(() => adInp?.focus(), 300);
}

async function malzemeDuzenleDozajKaydet() {
  const gid = malzemeDuzenleDozajGid || Number(document.getElementById('malzemeDuzenleGrupID')?.value);
  if (!gid) return;
  await malzemeDozajKaydet(gid);
}

async function malzemeDuzenleKaydet() {
  const ad = document.getElementById('malzemeDuzenleAd')?.value?.trim();
  let gid = Number(document.getElementById('malzemeDuzenleGrupID')?.value || 0);
  const satirlar = malzemeAmbalajSatirlariTopla();
  const btn = document.getElementById('malzemeDuzenleKaydetBtn');
  const kullanici = typeof aktifKullanici !== 'undefined' ? aktifKullanici : 'Sistem';

  if (!ad) return alert('Ürün / malzeme adı zorunlu.');
  if (!satirlar.length) return alert('En az bir ambalaj satırı girin (boyut, fiyat, stok).');

  const boyutlar = satirlar.map((s) => s.ambalajMiktari);
  if (new Set(boyutlar).size !== boyutlar.length) {
    return alert('Aynı ambalaj boyutu iki kez girilemez.');
  }

  if (btn) btn.disabled = true;
  try {
    if (!gid) {
      const resGrup = await fetch('/api/malzeme-grup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupAdi: ad, dozajGerekli: malzemeDozajGerekliMi() }),
      });
      const grupData = await resGrup.json().catch(() => ({}));
      if (!resGrup.ok) {
        if (resGrup.status === 409 && grupData.malzemeGrupID) {
          gid = grupData.malzemeGrupID;
          await fetch(`/api/malzeme-grup/${gid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grupAdi: ad, dozajGerekli: malzemeDozajGerekliMi() }),
          });
        } else {
          alert(grupData.message || 'Malzeme oluşturulamadı.');
          return;
        }
      } else {
        gid = grupData.malzemeGrupID;
      }
      document.getElementById('malzemeDuzenleGrupID').value = String(gid);
    } else {
      const resAd = await fetch(`/api/malzeme-grup/${gid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupAdi: ad, dozajGerekli: malzemeDozajGerekliMi() }),
      });
      if (!resAd.ok) {
        alert('Malzeme adı güncellenemedi.');
        return;
      }
    }

    for (const stokID of malzemeDuzenleSilinecekStok) {
      await fetch(`/api/stok/${stokID}?kullanici=${encodeURIComponent(kullanici)}`, { method: 'DELETE' });
    }
    malzemeDuzenleSilinecekStok = [];

    for (const sat of satirlar) {
      if (sat.stokID) {
        const urunAdi = stokMalzemeUrunAdiOlustur(ad, sat.ambalajMiktari, sat.olcuBirimi);
        const res = await fetch(`/api/stok/${sat.stokID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            UrunAdi: urunAdi,
            Kategori: 'Tarım',
            Barkod: sat.barkod,
            AlisFiyati: sat.alisFiyati,
            SatisFiyati: sat.satisFiyati,
            MevcutMiktar: sat.mevcutMiktar,
            Birim: sat.birim,
            KritikEsik: sat.kritikEsik,
            HedefEsik: sat.hedefEsik,
            malzemeGrupID: gid,
            ambalajMiktari: sat.ambalajMiktari,
            olcuBirimi: sat.olcuBirimi,
            dozajlar: [],
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          alert(t || `Ambalaj güncellenemedi (${sat.ambalajMiktari} ${sat.olcuBirimi})`);
          return;
        }
      } else {
        const res = await fetch(`/api/malzeme-grup/${gid}/ambalaj`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ambalajMiktari: sat.ambalajMiktari,
            olcuBirimi: sat.olcuBirimi,
            barkod: sat.barkod,
            alisFiyati: sat.alisFiyati,
            satisFiyati: sat.satisFiyati,
            mevcutMiktar: sat.mevcutMiktar,
            birim: sat.birim,
            kritikEsik: sat.kritikEsik,
            hedefEsik: sat.hedefEsik,
            kullanici,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.message || `Ambalaj eklenemedi (${sat.ambalajMiktari} ${sat.olcuBirimi})`);
          return;
        }
      }
    }

    if (malzemeDozajGerekliMi()) {
      const dozajlar = malzemeDozajTopla();
      await fetch(`/api/malzeme-grup/${gid}/dozaj`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dozajlar }),
      });
    } else {
      await fetch(`/api/malzeme-grup/${gid}/dozaj`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dozajlar: [] }),
      });
    }

    if (typeof modalKapat === 'function') modalKapat(document.getElementById('malzemeDuzenleModal'));
    else if (typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(document.getElementById('malzemeDuzenleModal'))?.hide();

    if (typeof stoklariGetir === 'function') await stoklariGetir();
    await malzemeGruplariPanelYukle();
    alert('Malzeme ve ambalajlar kaydedildi.');
  } catch (e) {
    console.error(e);
    alert('Kayıt sırasında hata oluştu.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function malzemeDozajTabloHtml(gid) {
  const g = malzemeGrupDetayCache.find((x) => Number(x.MalzemeGrupID) === Number(gid));
  let dozajMap = {};
  if (g?._dozajlar) {
    for (const d of g._dozajlar) dozajMap[d.TarimUrunID] = d;
  }
  if (!tarimUrunCache.length) {
    return '<p class="text-muted mb-0">Önce Ürünler sekmesinden tarım ürünü ekleyin.</p>';
  }
  return `<p class="small text-muted mb-2">Örn. “Arpa ekiminde bu malzemeden dekar başına 1 Lt” — 5 Lt veya 10 Lt bidon aynı dozajı kullanır.</p>
    <table class="table table-sm table-bordered mb-0"><thead class="table-light">
    <tr><th>Tarım ürünü (ekin)</th><th style="width:7.5rem">Miktar / dekar</th><th class="malz-col-birim">Birim</th></tr></thead><tbody>
    ${tarimUrunCache.filter((u) => u.Aktif !== false && u.Aktif !== 0).map((u) => {
      const d = dozajMap[u.TarimUrunID];
      const miktar = d ? Number(d.MiktarDekar) : '';
      const birim = d?.Birim || 'Lt';
      return `<tr><td>${gunlukMetinEsc(u.UrunAdi)}</td>
        <td><input type="number" step="0.0001" min="0" class="form-control form-control-sm malz-dozaj-miktar"
          data-gid="${gid}" data-urun-id="${u.TarimUrunID}" value="${miktar === '' ? '' : miktar}"></td>
        <td class="malz-col-birim"><select class="form-select form-select-sm malz-dozaj-birim" data-gid="${gid}" data-urun-id="${u.TarimUrunID}">${stokBirimSelectOptionsHtml(birim)}</select></td></tr>`;
    }).join('')}
    </tbody></table>`;
}

async function malzemeGrupDozajlariYukle(gid) {
  const res = await fetch(`/api/malzeme-grup/${gid}/dozaj`);
  const list = await res.json();
  const g = malzemeGrupDetayCache.find((x) => Number(x.MalzemeGrupID) === Number(gid));
  if (g) g._dozajlar = list;
  const wrap = document.getElementById('malzemeDuzenleDozaj');
  const acikGid = Number(document.getElementById('malzemeDuzenleGrupID')?.value || 0);
  if (wrap && acikGid === Number(gid)) wrap.innerHTML = malzemeDozajTabloHtml(gid);
}

function malzemeDozajTopla() {
  const rows = [];
  document.querySelectorAll('#malzemeDuzenleDozaj .malz-dozaj-miktar').forEach((el) => {
    const miktar = parseFloat(el.value);
    if (!Number.isFinite(miktar) || miktar <= 0) return;
    const uid = Number(el.getAttribute('data-urun-id'));
    const birimEl = document.querySelector(`#malzemeDuzenleDozaj .malz-dozaj-birim[data-urun-id="${uid}"]`);
    rows.push({ tarimUrunID: uid, miktarDekar: miktar, birim: birimEl?.value || 'Lt' });
  });
  return rows;
}

async function malzemeDozajKaydet(gid) {
  const dozajlar = malzemeDozajTopla();
  const res = await fetch(`/api/malzeme-grup/${gid}/dozaj`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dozajlar }),
  });
  if (!res.ok) return alert('Dozaj kaydedilemedi.');
  alert('Dozajlar kaydedildi.');
  await malzemeGrupDozajlariYukle(gid);
}

function tarimUrunTabloCiz() {
  const tbody = document.getElementById('tarimUrunTabloGovdesi');
  if (!tbody) return;
  if (!tarimUrunCache.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted p-3">Henüz ürün yok.</td></tr>';
    return;
  }
  tbody.innerHTML = tarimUrunCache.map((u) => {
    const aktif = u.Aktif !== false && u.Aktif !== 0;
    return `<tr>
      <td class="fw-semibold">${gunlukMetinEsc(u.UrunAdi)}</td>
      <td class="small text-muted">${gunlukMetinEsc(u.Aciklama || '—')}</td>
      <td class="text-end text-nowrap">
        <span class="badge ${aktif ? 'bg-success' : 'bg-secondary'} me-1">${aktif ? 'Aktif' : 'Pasif'}</span>
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="tarimUrunDuzenle(${u.TarimUrunID})"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="tarimUrunSil(${u.TarimUrunID})"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function tarimUrunFormTemizle() {
  document.getElementById('tarimUrunFormID').value = '';
  document.getElementById('tarimUrunAdi').value = '';
  document.getElementById('tarimUrunAciklama').value = '';
}

async function tarimUrunKaydet(e) {
  e.preventDefault();
  const id = document.getElementById('tarimUrunFormID').value;
  const body = {
    urunAdi: document.getElementById('tarimUrunAdi').value.trim(),
    aciklama: document.getElementById('tarimUrunAciklama').value.trim(),
    kullanici: typeof aktifKullanici !== 'undefined' ? aktifKullanici : 'Sistem',
  };
  if (!body.urunAdi) return alert('Ürün adı zorunlu.');
  const url = id ? `/api/tarim-urun/${id}` : '/api/tarim-urun';
  const res = await fetch(url, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.message || 'Kayıt hatası');
  tarimUrunFormTemizle();
  await tarimUrunleriYukle();
  tarimUrunTabloCiz();
}

function tarimUrunDuzenle(id) {
  const u = tarimUrunCache.find((x) => Number(x.TarimUrunID) === Number(id));
  if (!u) return;
  document.getElementById('tarimUrunFormID').value = u.TarimUrunID;
  document.getElementById('tarimUrunAdi').value = u.UrunAdi || '';
  document.getElementById('tarimUrunAciklama').value = u.Aciklama || '';
}

async function tarimUrunSil(id) {
  if (!confirm('Bu tarım ürününü silmek istiyor musunuz? Bağlı dozajlar da silinir.')) return;
  const res = await fetch(`/api/tarim-urun/${id}`, { method: 'DELETE' });
  if (!res.ok) return alert('Silinemedi.');
  await tarimUrunleriYukle();
  tarimUrunTabloCiz();
}

function stokTarimAlanlariniTopla() {
  const tarimAktif = document.getElementById('stokTarimMalzemeAktif')?.checked;
  if (!tarimAktif) {
    return { malzemeGrupID: null, yeniMalzemeGrupAdi: null, ambalajMiktari: null, olcuBirimi: null, dozajlar: [] };
  }
  return { hata: 'Tarım malzemesi buradan kaydedilmez. “Malzeme / ambalaj düzenle” ile ürün adı ve ambalajları girin.' };
}

function stokTarimAlanlariniDoldur(urun) {
  const chk = document.getElementById('stokTarimMalzemeAktif');
  const wrap = document.getElementById('stokTarimAlanWrap');
  const gid = Number(urun?.MalzemeGrupID || 0);
  const aktif = gid > 0 || Number(urun?.AmbalajMiktari) > 0;
  if (chk) chk.checked = aktif;
  if (wrap) wrap.classList.toggle('d-none', !aktif);
}

function stokTarimAlanlariSifirla() {
  const chk = document.getElementById('stokTarimMalzemeAktif');
  if (chk) chk.checked = false;
  const wrap = document.getElementById('stokTarimAlanWrap');
  if (wrap) wrap.classList.add('d-none');
}

document.addEventListener('DOMContentLoaded', () => {
  const chk = document.getElementById('stokTarimMalzemeAktif');
  if (chk) {
    chk.addEventListener('change', () => {
      const wrap = document.getElementById('stokTarimAlanWrap');
      if (wrap) wrap.classList.toggle('d-none', !chk.checked);
    });
  }
  stokBirimleriYukle();
  receteTestUrunSelectDoldur();
});
