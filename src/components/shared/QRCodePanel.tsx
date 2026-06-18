import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  url: string;
  label?: string;
  size?: number;
}

export default function QRCodePanel({
  url,
  label = 'Scannez pour accéder sur mobile',
  size = 120,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback pour les contextes non-HTTPS (accès via IP locale)
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // En dernier recours : sélectionner le texte affiché
      const el = document.getElementById('qr-url-text');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-white p-3 border border-slate-200 rounded-xl">
        <QRCodeSVG value={url} size={size} />
      </div>
      {label && (
        <p className="text-[10px] text-center text-slate-500 leading-tight max-w-[160px]">{label}</p>
      )}
      <div
        id="qr-url-text"
        className="text-[9px] text-slate-400 text-center break-all max-w-[180px] select-all cursor-text px-2"
      >
        {url}
      </div>
      <button
        type="button"
        onClick={copyUrl}
        className={`text-[10px] font-medium px-3 py-1 rounded-lg transition-colors ${
          copied
            ? 'bg-green-100 text-green-700'
            : 'bg-slate-100 text-indigo-600 hover:bg-indigo-50'
        }`}
      >
        {copied ? '✓ Copié !' : 'Copier le lien'}
      </button>
    </div>
  );
}
