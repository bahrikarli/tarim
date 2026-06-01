/** Tarım otomasyon — güncelleme kaynağı (elektrik projesinden ayrı). */

const GUNCELLEME_APP_ID = 'tarim-otomasyon';
const GUNCELLEME_REPO = 'bahrikarli/tarim-updates';
const GUNCELLEME_MANIFEST_URL =
  `https://github.com/${GUNCELLEME_REPO}/releases/latest/download/guncelleme.json`;
const GUNCELLEME_ASSET_ON_EK = 'tarim-otomasyon';
const GUNCELLEME_USER_AGENT = 'tarim-otomasyon-updater/1.0';

function guncellemeAssetAdi(version) {
  const v = String(version || '').trim();
  return `${GUNCELLEME_ASSET_ON_EK}-${v}.zip`;
}

function varsayilanGuncellemeManifestUrl(packageJson) {
  const repoUrl = String(packageJson?.repository?.url || packageJson?.repository || '');
  const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  const repoAd = m ? String(m[2]).toLowerCase() : '';
  if (!m || repoAd === 'elektrik-updates' || repoAd === 'elektrik') {
    return GUNCELLEME_MANIFEST_URL;
  }
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main/guncelleme.json`;
}

/**
 * Elektrik yayınındaki manifest / ZIP bu uygulamaya uygulanmasın.
 */
function guncellemeManifestTarimMi(m) {
  if (!m || typeof m !== 'object') return false;

  const app = String(m.app || m.product || m.uygulama || '').trim().toLowerCase();
  if (app === 'elektrik-otomasyon' || app === 'elektrik') return false;
  if (app && app !== GUNCELLEME_APP_ID && app !== 'tarim') return false;

  const asset = String(m.assetName || '').trim().toLowerCase();
  const url = String(m.url || '').trim().toLowerCase();
  const repo = String(m.repo || '').trim().toLowerCase();

  if (/elektrik-otomasyon/.test(asset) && !/tarim/.test(asset)) return false;
  if (/elektrik-otomasyon/.test(url) && !/tarim/.test(url)) return false;
  if (repo === 'bahrikarli/elektrik-updates') return false;

  if (!app && asset && !/tarim/.test(asset)) return false;
  if (!app && url && /elektrik/.test(url) && !/tarim/.test(url)) return false;

  return true;
}

module.exports = {
  GUNCELLEME_APP_ID,
  GUNCELLEME_REPO,
  GUNCELLEME_MANIFEST_URL,
  GUNCELLEME_ASSET_ON_EK,
  GUNCELLEME_USER_AGENT,
  guncellemeAssetAdi,
  varsayilanGuncellemeManifestUrl,
  guncellemeManifestTarimMi,
};
