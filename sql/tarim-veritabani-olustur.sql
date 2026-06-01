-- SQL Server Management Studio veya sqlcmd ile çalıştırın.
-- Örnek: sqlcmd -S localhost -U sa -P "sifreniz" -i tarim-veritabani-olustur.sql

IF DB_ID(N'tarim') IS NULL
BEGIN
  CREATE DATABASE [tarim];
END
GO

USE [tarim];
GO

-- Şema ELEKTRIK ile aynı uygulama tarafından ilk çalıştırmada da oluşturulabilir;
-- boş veritabanı yeterlidir. Gerekirse buraya ek tablolar eklenir.

PRINT N'Veritabanı [tarim] hazır.';
GO
