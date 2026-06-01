(function () {
  'use strict';

  const STOK_BIRIM_VARSAYILAN = [
    { BirimKodu: 'Lt' },
    { BirimKodu: 'Kg' },
    { BirimKodu: 'Adet' },
    { BirimKodu: 'Kutu' },
    { BirimKodu: 'Torba' },
  ];

  let stokBirimCache = [];
  let tarimUrunCache = [];
  let mobilMalzemeAmbalaj = [];
  let mobilMalzemeSilinecek = [];
  let genelStokDuzenleID = null;

  function core() {
    return window.TarimMobilCore || null;
  }

  function $(id) {
    const c = core();
    return c ? c.$(id) : document.getElementById(id);
  }

  function esc(s) {
    const c = core();
    return c ? c.esc(s) : String(s ?? '');
  }

  function toast(msg) {
    const c = core();
    if (c) c.toast(msg);
  }

  async function apiFetch(path, opts) {
    const c = core();
    if (!c) throw new Error('Mobil çekirdek yüklenmedi');
    return c.apiFetch(path, opts);
  }

  function kullanici() {
    const c = core();
    return c?.aktifKullanici || 'Mobil';
  }

  function demoKilit() {
    const c = core();
    return !!(c && c.demoOkumaModuMu());
  }

  function dialogKapat(dlg) {
    if (dlg && typeof dlg.close === 'function') dlg.close();
  }

  async function stokBirimleriYukle() {
    try {
      const res = await apiFetch('/api/stok-birim');
      stokBirimCache = res.ok ? await res.json() : [];
      if (!Array.isArray(stokBirimCache)) stokBirimCache = [];
    } catch (_) {
      stokBirimCache = [];
    }
    return stokBirimCache;
  }

  function birimListe() {
    const liste = stokBirimCache.filter((b) => b.Aktif !== false && b.Aktif !== 0);
    return liste.length ? liste : STOK_BIRIM_VARSAYILAN;
  }

  function birimSelectHtml(secili) {
    const opts = birimListe();
    let html = opts.map((b) => {
      const kod = b.BirimKodu;
      const sel = String(secili || '') === kod ? ' selected' : '';
      return `<option value="${esc(kod)}"${sel}>${esc(kod)}</option>`;
    }).join('');
    if (secili && !opts.some((b) => b.BirimKodu === secili)) {
      html += `<option value="${esc(secili)}" selected>${esc(secili)}</option>`;
    }
    return html;
  }

  async function birimSelectDoldur(selectId, secili, varsayilan) {
    await stokBirimleriYukle();
    const sel = $(selectId);
    if (sel) sel.innerHTML = birimSelectHtml(secili || varsayilan || 'Adet');
  }

  async function tarimUrunleriYukle() {
    try {
      const res = await apiFetch('/api/tarim-urun');
      tarimUrunCache = res.ok ? await res.json() : [];
      if (!Array.isArray(tarimUrunCache)) tarimUrunCache = [];
    } catch (_) {
      tarimUrunCache = [];
    }
    return tarimUrunCache;
  }

  function yeniAmbalajSatir(bos) {
    return {
      key: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stokID: bos?.StokID ? Number(bos.StokID) : null,
      ambalajMiktari: bos?.AmbalajMiktari != null ? Number(bos.AmbalajMiktari) : '',
      olcuBirimi: bos?.OlcuBirimi || 'Lt',
      barkod: bos?.Barkod || '',
      alisFiyati: Number(bos?.AlisFiyati || 0),
      satisFiyati: Number(bos?.SatisFiyati || 0),
      kritikEsik: Number.isInteger(Number(bos?.KritikEsik)) ? Number(bos.KritikEsik) : 5,
      hedefEsik: Number.isInteger(Number(bos?.HedefEsik)) ? Number(bos.HedefEsik) : 20,
      mevcutMiktar: parseInt(bos?.MevcutMiktar, 10) || 0,
    };
  }

  function ambalajKartHtml(a) {
    return `<div class="malzeme-ambalaj-kart" data-amb-key="${esc(a.key)}">
      <div class="malzeme-ambalaj-kart-ust">
        <strong>Ambalaj</strong>
        <button type="button" class="btn-text btn-text-danger" data-amb-sil="${esc(a.key)}">Kaldır</button>
      </div>
      <div class="form-iki-kolon">
        <div>
          <label class="field-label">Boyut</label>
          <input type="number" class="field-input malz-amb-miktar" data-key="${esc(a.key)}" min="0.001" step="0.001" inputmode="decimal" value="${a.ambalajMiktari === '' ? '' : a.ambalajMiktari}" placeholder="5">
        </div>
        <div>
          <label class="field-label">Birim</label>
          <select class="field-input malz-amb-olcu" data-key="${esc(a.key)}">${birimSelectHtml(a.olcuBirimi)}</select>
        </div>
      </div>
      <label class="field-label">Barkod</label>
      <input type="text" class="field-input malz-amb-barkod" data-key="${esc(a.key)}" maxlength="50" value="${esc(a.barkod)}">
      <div class="form-iki-kolon">
        <div>
          <label class="field-label">Alış ₺</label>
          <input type="number" class="field-input malz-amb-alis" data-key="${esc(a.key)}" min="0" step="0.01" value="${a.alisFiyati}">
        </div>
        <div>
          <label class="field-label">Satış ₺</label>
          <input type="number" class="field-input malz-amb-satis" data-key="${esc(a.key)}" min="0" step="0.01" value="${a.satisFiyati}">
        </div>
      </div>
      <div class="form-iki-kolon form-iki-kolon-3">
        <div>
          <label class="field-label">Stok</label>
          <input type="number" class="field-input malz-amb-stok" data-key="${esc(a.key)}" min="0" step="1" value="${a.mevcutMiktar}">
        </div>
        <div>
          <label class="field-label">Kritik</label>
          <input type="number" class="field-input malz-amb-kritik" data-key="${esc(a.key)}" min="0" step="1" value="${a.kritikEsik}">
        </div>
        <div>
          <label class="field-label">Hedef</label>
          <input type="number" class="field-input malz-amb-hedef" data-key="${esc(a.key)}" min="0" step="1" value="${a.hedefEsik}">
        </div>
      </div>
    </div>`;
  }

  function ambalajListedenOku() {
    mobilMalzemeAmbalaj.forEach((a) => {
      const miktar = parseFloat(document.querySelector(`.malz-amb-miktar[data-key="${a.key}"]`)?.value);
      a.ambalajMiktari = miktar;
      a.olcuBirimi = document.querySelector(`.malz-amb-olcu[data-key="${a.key}"]`)?.value || 'Lt';
      a.barkod = document.querySelector(`.malz-amb-barkod[data-key="${a.key}"]`)?.value?.trim() || '';
      a.alisFiyati = parseFloat(document.querySelector(`.malz-amb-alis[data-key="${a.key}"]`)?.value) || 0;
      a.satisFiyati = parseFloat(document.querySelector(`.malz-amb-satis[data-key="${a.key}"]`)?.value) || 0;
      a.mevcutMiktar = parseInt(document.querySelector(`.malz-amb-stok[data-key="${a.key}"]`)?.value, 10) || 0;
      a.kritikEsik = parseInt(document.querySelector(`.malz-amb-kritik[data-key="${a.key}"]`)?.value, 10) || 5;
      a.hedefEsik = parseInt(document.querySelector(`.malz-amb-hedef[data-key="${a.key}"]`)?.value, 10) || 20;
    });
  }

  function ambalajListeCiz() {
    const el = $('mobilMalzemeAmbalajListe');
    if (!el) return;
    el.innerHTML = mobilMalzemeAmbalaj.map((a) => ambalajKartHtml(a)).join('')
      || '<p class="bos-metin">Ambalaj ekleyin</p>';
    el.querySelectorAll('[data-amb-sil]').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-amb-sil');
        const sat = mobilMalzemeAmbalaj.find((x) => x.key === key);
        if (sat?.stokID && !confirm('Bu ambalaj stoktan silinsin mi?')) return;
        if (sat?.stokID) mobilMalzemeSilinecek.push(sat.stokID);
        mobilMalzemeAmbalaj = mobilMalzemeAmbalaj.filter((x) => x.key !== key);
        ambalajListeCiz();
      };
    });
  }

  function ambalajSatirlariTopla() {
    ambalajListedenOku();
    return mobilMalzemeAmbalaj.filter((a) => Number.isFinite(a.ambalajMiktari) && a.ambalajMiktari > 0);
  }

  async function dozajListeCiz(mevcutDozajlar) {
    const el = $('mobilMalzemeDozajListe');
    if (!el) return;
    await tarimUrunleriYukle();
    const map = {};
    (mevcutDozajlar || []).forEach((d) => { map[d.TarimUrunID] = d; });
    const urunler = tarimUrunCache.filter((u) => u.Aktif !== false && u.Aktif !== 0);
    if (!urunler.length) {
      el.innerHTML = '<p class="bos-metin">Tanımlı tarım ürünü yok.</p>';
      return;
    }
    el.innerHTML = urunler.map((u) => {
      const d = map[u.TarimUrunID];
      const miktar = d ? Number(d.MiktarDekar) : '';
      const birim = d?.Birim || 'Lt';
      return `<div class="malzeme-dozaj-satir">
        <span class="malzeme-dozaj-ad">${esc(u.UrunAdi)}</span>
        <input type="number" class="field-input malz-doz-miktar" data-uid="${u.TarimUrunID}" min="0" step="0.0001" inputmode="decimal" value="${miktar === '' ? '' : miktar}" placeholder="0">
        <select class="field-input malz-doz-birim" data-uid="${u.TarimUrunID}">${birimSelectHtml(birim)}</select>
      </div>`;
    }).join('');
  }

  function dozajTopla() {
    const rows = [];
    document.querySelectorAll('.malz-doz-miktar').forEach((inp) => {
      const miktar = parseFloat(inp.value);
      if (!Number.isFinite(miktar) || miktar <= 0) return;
      const uid = Number(inp.getAttribute('data-uid'));
      const birim = document.querySelector(`.malz-doz-birim[data-uid="${uid}"]`)?.value || 'Lt';
      rows.push({ tarimUrunID: uid, miktarDekar: miktar, birim });
    });
    return rows;
  }

  function dozajPanelGuncelle() {
    const acik = !!$('mobilMalzemeDozajGerekli')?.checked;
    const bolum = $('mobilMalzemeDozajBolum');
    if (bolum) bolum.hidden = !acik;
  }

  async function genelStokDialogAc(stokID) {
    if (demoKilit()) {
      toast('Demo süresi doldu');
      return;
    }
    await birimSelectDoldur('mobilGenelBirim', null, 'Adet');
    genelStokDuzenleID = Number(stokID) > 0 ? Number(stokID) : null;
    const baslik = $('dlgGenelStokBaslik');
    const c = core();
    const kayit = genelStokDuzenleID && c?.stokCache
      ? c.stokCache.find((s) => Number(s.StokID) === genelStokDuzenleID)
      : null;
    if (Number(kayit?.MalzemeGrupID) > 0) {
      malzemeDialogAc(kayit.MalzemeGrupID);
      return;
    }
    $('formGenelStok')?.reset();
    if (baslik) baslik.textContent = genelStokDuzenleID ? 'Stok düzenle' : 'Genel stok ürünü';
    if (kayit) {
      $('mobilGenelUrunAdi').value = kayit.UrunAdi || '';
      $('mobilGenelKategori').value = kayit.Kategori || '';
      $('mobilGenelBarkod').value = kayit.Barkod || '';
      $('mobilGenelAlis').value = Number(kayit.AlisFiyati || 0);
      $('mobilGenelSatis').value = Number(kayit.SatisFiyati || 0);
      $('mobilGenelMiktar').value = parseInt(kayit.MevcutMiktar, 10) || 0;
      await birimSelectDoldur('mobilGenelBirim', kayit.Birim || 'Adet', 'Adet');
      $('mobilGenelKritik').value = Number.isFinite(Number(kayit.KritikEsik)) ? kayit.KritikEsik : 5;
      $('mobilGenelHedef').value = Number.isFinite(Number(kayit.HedefEsik)) ? kayit.HedefEsik : 20;
    } else {
      $('mobilGenelKritik').value = 5;
      $('mobilGenelHedef').value = 20;
    }
    $('dlgGenelStok')?.showModal();
  }

  async function genelStokKaydet(ev) {
    ev.preventDefault();
    if (demoKilit()) {
      toast('Demo süresi doldu');
      return;
    }
    const ad = $('mobilGenelUrunAdi')?.value?.trim();
    const satis = parseFloat($('mobilGenelSatis')?.value);
    if (!ad) {
      toast('Ürün adı zorunlu');
      return;
    }
    if (!Number.isFinite(satis) || satis < 0) {
      toast('Geçerli satış fiyatı girin');
      return;
    }
    const body = {
      UrunAdi: ad,
      Kategori: $('mobilGenelKategori')?.value?.trim() || null,
      Barkod: $('mobilGenelBarkod')?.value?.trim() || null,
      AlisFiyati: parseFloat($('mobilGenelAlis')?.value) || 0,
      SatisFiyati: satis,
      MevcutMiktar: parseInt($('mobilGenelMiktar')?.value, 10) || 0,
      Birim: $('mobilGenelBirim')?.value || 'Adet',
      KritikEsik: parseInt($('mobilGenelKritik')?.value, 10),
      HedefEsik: parseInt($('mobilGenelHedef')?.value, 10),
      kullanici: kullanici(),
    };
    try {
      const duzenle = genelStokDuzenleID;
      const res = await apiFetch(duzenle ? `/api/stok/${duzenle}` : '/api/stok', {
        method: duzenle ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        dialogKapat($('dlgGenelStok'));
        toast(duzenle ? 'Stok güncellendi' : 'Ürün eklendi');
        genelStokDuzenleID = null;
        await core()?.veriYukle();
      } else {
        const t = await res.text();
        toast(t || 'Kayıt başarısız');
      }
    } catch (e) {
      console.error(e);
      toast('Bağlantı hatası');
    }
  }

  async function malzemeDialogAc(grupID) {
    if (demoKilit()) {
      toast('Demo süresi doldu');
      return;
    }
    await Promise.all([stokBirimleriYukle(), tarimUrunleriYukle()]);
    mobilMalzemeSilinecek = [];
    const gid = Number(grupID) > 0 ? Number(grupID) : 0;
    $('mobilMalzemeGrupID').value = gid ? String(gid) : '';
    const baslik = $('dlgMalzemeBaslik');
    if (baslik) baslik.textContent = gid ? 'Malzeme düzenle' : 'Yeni malzeme';

    if (gid) {
      const res = await apiFetch(`/api/malzeme-grup/${gid}`);
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        toast('Malzeme yüklenemedi');
        return;
      }
      $('mobilMalzemeAd').value = data.grup?.GrupAdi || '';
      const dozajGerekli = data.grup?.DozajGerekli !== false && data.grup?.DozajGerekli !== 0;
      $('mobilMalzemeDozajGerekli').checked = dozajGerekli;
      mobilMalzemeAmbalaj = (data.ambalajlar || []).map((a) => yeniAmbalajSatir(a));
      let dozajlar = [];
      if (dozajGerekli) {
        const dRes = await apiFetch(`/api/malzeme-grup/${gid}/dozaj`);
        dozajlar = dRes.ok ? await dRes.json() : [];
      }
      dozajPanelGuncelle();
      ambalajListeCiz();
      await dozajListeCiz(dozajlar);
    } else {
      $('mobilMalzemeAd').value = '';
      $('mobilMalzemeDozajGerekli').checked = true;
      mobilMalzemeAmbalaj = [yeniAmbalajSatir()];
      dozajPanelGuncelle();
      ambalajListeCiz();
      await dozajListeCiz([]);
    }
    $('dlgMalzeme')?.showModal();
  }

  async function malzemeKaydet() {
    if (demoKilit()) {
      toast('Demo süresi doldu');
      return;
    }
    const ad = $('mobilMalzemeAd')?.value?.trim();
    let gid = Number($('mobilMalzemeGrupID')?.value || 0);
    const satirlar = ambalajSatirlariTopla();
    const dozajGerekli = !!$('mobilMalzemeDozajGerekli')?.checked;

    if (!ad) {
      toast('Malzeme adı zorunlu');
      return;
    }
    if (!satirlar.length) {
      toast('En az bir ambalaj girin');
      return;
    }
    const boyutlar = satirlar.map((s) => s.ambalajMiktari);
    if (new Set(boyutlar).size !== boyutlar.length) {
      toast('Aynı ambalaj boyutu iki kez girilemez');
      return;
    }

    const btn = $('btnMobilMalzemeKaydet');
    if (btn) btn.disabled = true;
    try {
      if (!gid) {
        const resGrup = await apiFetch('/api/malzeme-grup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grupAdi: ad, dozajGerekli }),
        });
        const grupData = await resGrup.json().catch(() => ({}));
        if (!resGrup.ok) {
          if (resGrup.status === 409 && grupData.malzemeGrupID) {
            gid = grupData.malzemeGrupID;
            await apiFetch(`/api/malzeme-grup/${gid}`, {
              method: 'PUT',
              body: JSON.stringify({ grupAdi: ad, dozajGerekli }),
            });
          } else {
            toast(grupData.message || 'Malzeme oluşturulamadı');
            return;
          }
        } else {
          gid = grupData.malzemeGrupID;
        }
      } else {
        const resAd = await apiFetch(`/api/malzeme-grup/${gid}`, {
          method: 'PUT',
          body: JSON.stringify({ grupAdi: ad, dozajGerekli }),
        });
        if (!resAd.ok) {
          toast('Malzeme adı güncellenemedi');
          return;
        }
      }

      for (const stokID of mobilMalzemeSilinecek) {
        await apiFetch(`/api/stok/${stokID}?kullanici=${encodeURIComponent(kullanici())}`, { method: 'DELETE' });
      }
      mobilMalzemeSilinecek = [];

      for (const sat of satirlar) {
        if (sat.stokID) {
          const urunAdi = `${ad} — ${sat.ambalajMiktari} ${sat.olcuBirimi}`;
          const res = await apiFetch(`/api/stok/${sat.stokID}`, {
            method: 'PUT',
            body: JSON.stringify({
              UrunAdi: urunAdi,
              Kategori: 'Tarım',
              Barkod: sat.barkod,
              AlisFiyati: sat.alisFiyati,
              SatisFiyati: sat.satisFiyati,
              MevcutMiktar: sat.mevcutMiktar,
              Birim: 'Adet',
              KritikEsik: sat.kritikEsik,
              HedefEsik: sat.hedefEsik,
              malzemeGrupID: gid,
              ambalajMiktari: sat.ambalajMiktari,
              olcuBirimi: sat.olcuBirimi,
              dozajlar: [],
            }),
          });
          if (!res.ok) {
            toast(`Ambalaj güncellenemedi (${sat.ambalajMiktari} ${sat.olcuBirimi})`);
            return;
          }
        } else {
          const res = await apiFetch(`/api/malzeme-grup/${gid}/ambalaj`, {
            method: 'POST',
            body: JSON.stringify({
              ambalajMiktari: sat.ambalajMiktari,
              olcuBirimi: sat.olcuBirimi,
              barkod: sat.barkod,
              alisFiyati: sat.alisFiyati,
              satisFiyati: sat.satisFiyati,
              mevcutMiktar: sat.mevcutMiktar,
              birim: 'Adet',
              kritikEsik: sat.kritikEsik,
              hedefEsik: sat.hedefEsik,
              kullanici: kullanici(),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast(data.message || `Ambalaj eklenemedi (${sat.ambalajMiktari} ${sat.olcuBirimi})`);
            return;
          }
        }
      }

      const dozajlar = dozajGerekli ? dozajTopla() : [];
      await apiFetch(`/api/malzeme-grup/${gid}/dozaj`, {
        method: 'PUT',
        body: JSON.stringify({ dozajlar }),
      });

      dialogKapat($('dlgMalzeme'));
      toast('Malzeme kaydedildi');
      await core()?.veriYukle();
    } catch (e) {
      console.error(e);
      toast('Kayıt hatası');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function stokKartAc(s) {
    if (!s) return;
    if (Number(s.MalzemeGrupID) > 0) malzemeDialogAc(s.MalzemeGrupID);
    else genelStokDialogAc(s.StokID);
  }

  function init() {
    const c = core();
    if (!c) return;

    $('btnMobilMalzeme')?.addEventListener('click', () => malzemeDialogAc(0));
    $('btnMobilGenelStok')?.addEventListener('click', () => genelStokDialogAc(0));
    $('formGenelStok')?.addEventListener('submit', genelStokKaydet);
    $('btnMobilMalzemeKaydet')?.addEventListener('click', malzemeKaydet);
    $('btnMobilAmbalajEkle')?.addEventListener('click', () => {
      ambalajListedenOku();
      mobilMalzemeAmbalaj.push(yeniAmbalajSatir());
      ambalajListeCiz();
    });
    $('mobilMalzemeDozajGerekli')?.addEventListener('change', dozajPanelGuncelle);

    document.querySelectorAll('#dlgGenelStok [data-dialog-close], #dlgMalzeme [data-dialog-close]').forEach((b) => {
      b.addEventListener('click', () => dialogKapat(b.closest('dialog')));
    });
  }

  window.MobilStok = { init, kartAc: stokKartAc, genelStokDialogAc, malzemeDialogAc };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
