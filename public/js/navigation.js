function menuyuGoster(bolumAdi) {
  aramaSonuclariniGizle();
  if (bolumAdi === 'musteri') {
    musterileriGetir();
    modalAc(document.getElementById('musteriListeModal'));
    return;
  }
  if (bolumAdi === 'stok') {
    modalAc(document.getElementById('stokListeModal'), async () => {
      if (typeof stokListeAramaTemizle === 'function') stokListeAramaTemizle();
      await stoklariGetir();
      if (typeof stokListeAramaOdakla === 'function') stokListeAramaOdakla();
    });
    return;
  }
  if (bolumAdi === 'tedarikci') {
    modalAc(document.getElementById('tedarikciListeModal'), () => tedarikciListele());
    return;
  }
  if (bolumAdi === 'gider') {
    modalAc(document.getElementById('giderListeModal'), () => genelGiderListele());
    return;
  }
  if (bolumAdi === 'tanimlamalar') {
    tanimlamalarModalAc();
    return;
  }
  document.querySelectorAll('.bolum').forEach((el) => {
    el.style.display = 'none';
  });
  const el = document.getElementById(bolumAdi + '-bolumu');
  if (el) el.style.display = 'block';
}
