// A file handed to the person: saved (an <a download>), or through the
// phone's share sheet where it can share files (AirDrop, Messages, …).
export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
// -> 'shared', 'cancelled' or 'downloaded' (the browser can't share files).
export async function shareFile(blob, filename, { title = filename, text = '' } = {}) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  download(blob, filename);
  return 'downloaded';
}
// A name a file can have anywhere (no / \ : * ? " < > | or control
// characters; no space at either end, even once cut to 80).
export const fileName = s => String(s || 'Orbit Beats').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').trim().slice(0, 80).trim() || 'Orbit Beats';
