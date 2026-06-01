/**
 * İlk kurulum: ELEKTRIK ile uyumlu temel tablolar (boş tarim veritabanı).
 */
async function ensureTemelTablolar(pool) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.Musteriler', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Musteriler (
        MusteriID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AdSoyad NVARCHAR(100) NOT NULL,
        FirmaAdi NVARCHAR(150) NULL,
        Telefon NVARCHAR(20) NULL,
        Adres NVARCHAR(255) NULL,
        Bakiye DECIMAL(18,2) NULL CONSTRAINT DF_Musteriler_Bakiye DEFAULT (0),
        KayitTarihi DATETIME NULL CONSTRAINT DF_Musteriler_Kayit DEFAULT (GETDATE()),
        tcno NCHAR(11) NULL,
        vergino NCHAR(10) NULL,
        yetkili NVARCHAR(50) NULL,
        Il NVARCHAR(60) NULL,
        Ilce NVARCHAR(60) NULL,
        TanimAdi NVARCHAR(120) NULL,
        Mahalle NVARCHAR(120) NULL,
        tur NVARCHAR(20) NULL
      );
    END

    IF OBJECT_ID(N'dbo.Stok', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Stok (
        StokID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UrunAdi NVARCHAR(150) NOT NULL,
        Kategori NVARCHAR(50) NULL,
        Barkod NVARCHAR(50) NULL,
        AlisFiyati DECIMAL(18,2) NULL CONSTRAINT DF_Stok_Alis DEFAULT (0),
        SatisFiyati DECIMAL(18,2) NULL CONSTRAINT DF_Stok_Satis DEFAULT (0),
        MevcutMiktar INT NULL CONSTRAINT DF_Stok_Miktar DEFAULT (0),
        Birim NVARCHAR(20) NULL,
        KritikEsik INT NULL,
        HedefEsik INT NULL
      );
    END

    IF OBJECT_ID(N'dbo.Kullanicilar', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Kullanicilar (
        KullaniciID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AdSoyad NVARCHAR(100) NOT NULL,
        KullaniciAdi NVARCHAR(50) NOT NULL,
        Sifre NVARCHAR(255) NOT NULL,
        Yetki NVARCHAR(20) NOT NULL CONSTRAINT DF_Kullanicilar_Yetki DEFAULT (N'admin')
      );
      CREATE UNIQUE INDEX UX_Kullanicilar_KullaniciAdi ON dbo.Kullanicilar (KullaniciAdi);
    END

    IF OBJECT_ID(N'dbo.Kasa', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Kasa (
        KasaID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        IslemTipi NVARCHAR(20) NULL,
        Tutar DECIMAL(18,2) NULL,
        Aciklama NVARCHAR(255) NULL,
        Kullanici NVARCHAR(50) NULL,
        Tarih DATETIME NULL CONSTRAINT DF_Kasa_Tarih DEFAULT (GETDATE()),
        makbuzNo INT NULL
      );
    END

    IF OBJECT_ID(N'dbo.IslemGecmisi', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.IslemGecmisi (
        LogID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        KullaniciAdi NVARCHAR(50) NULL,
        IslemTipi NVARCHAR(50) NULL,
        Aciklama NVARCHAR(500) NULL,
        Tarih DATETIME NULL CONSTRAINT DF_IslemGecmisi_Tarih DEFAULT (GETDATE())
      );
    END
  `);

  const kullaniciSay = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.Kullanicilar');
  if (Number(kullaniciSay.recordset[0]?.n || 0) === 0) {
    await pool.request().query(`
      INSERT INTO dbo.Kullanicilar (AdSoyad, KullaniciAdi, Sifre, Yetki)
      VALUES (N'Yönetici', N'admin', N'1234', N'admin');
    `);
    console.log('[TARIM] Varsayılan kullanıcı: admin / 1234');
  }

  console.log('[TARIM] Temel tablolar hazır.');
}

module.exports = { ensureTemelTablolar };
