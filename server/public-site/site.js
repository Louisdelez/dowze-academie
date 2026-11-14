const status = document.querySelector('#release-status');
const grid = document.querySelector('#download-grid');
const platforms = { macos: ['Mac Intel', 'macOS 13 ou ultérieur'], windows: ['Windows', 'Windows 11 · 64 bits'], fedora: ['Fedora', 'Fedora 44 · RPM · 64 bits'], 'linux-appimage': ['Fedora portable', 'Fedora 44 · AppImage · 64 bits'] };
(async () => {
  try {
    const response = await fetch('/releases.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('unavailable');
    const release = await response.json();
    if (!Array.isArray(release.artifacts)) throw new Error('invalid');
    let count = 0;
    for (const artifact of release.artifacts) {
      if (!platforms[artifact.platform] || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,180}$/.test(artifact.filename) || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0)) continue;
      const article = document.createElement('article'); article.className = 'download-card';
      const title = document.createElement('h3'); title.textContent = platforms[artifact.platform][0];
      const detail = document.createElement('p'); detail.textContent = `${platforms[artifact.platform][1]} · v${artifact.version ?? release.version} · ${(artifact.bytes / 1048576).toFixed(0)} Mio`;
      const link = document.createElement('a'); link.className = 'button'; link.href = `/downloads/${artifact.filename}`; link.download = artifact.filename; link.textContent = 'Télécharger ↓';
      const checksum = document.createElement('small'); checksum.textContent = `SHA-256 : ${artifact.sha256}`;
      article.append(title, detail, link, checksum); grid.append(article); count++;
    }
    status.textContent = count ? `${count} téléchargements disponibles · version indiquée pour chaque plateforme.` : 'Les nouveaux installateurs sont en cours de qualification. Les téléchargements apparaîtront ici dès leur publication.';
  } catch { status.textContent = 'La liste des téléchargements est momentanément indisponible. Réessayez dans quelques instants.'; }
})();
