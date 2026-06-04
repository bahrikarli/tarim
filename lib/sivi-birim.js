/**
 * Sıvı birimleri: dozaj (cc/Lt) ile ambalaj boyutunu karşılaştırmak için litreye çevirir.
 * 1000 cc = 1 Lt
 */

function siviBirimNorm(birim) {
  const b = String(birim || 'Lt').trim().toLocaleLowerCase('tr-TR');
  if (b === 'cc' || b === 'ml') return 'cc';
  if (b === 'lt' || b === 'l' || b === 'litre' || b.startsWith('lt')) return 'lt';
  return b;
}

function siviMiktarLt(miktar, birim) {
  const m = Number(miktar);
  if (!Number.isFinite(m) || m <= 0) return 0;
  const n = siviBirimNorm(birim);
  if (n === 'cc') return m / 1000;
  if (n === 'lt') return m;
  return m;
}

module.exports = { siviBirimNorm, siviMiktarLt };
