import { useEffect, useRef } from 'react';

interface DynamicFormRendererProps {
  htmlContent: string;
  formData: Record<string, any>;
  onFieldChange: (name: string, value: any) => void;
  isReadOnly?: boolean;
  pdfTitle?: string;
  valuePrefix?: string;
}

export default function DynamicFormRenderer({
  htmlContent,
  formData,
  onFieldChange,
  isReadOnly = false,
  pdfTitle,
  valuePrefix
}: DynamicFormRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isPrintMode = new URLSearchParams(window.location.search).get('print') === 'true';
  const hasPrintedRef = useRef(false);

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    // Avoid running on initial empty about:blank page before srcDoc is loaded
    const hasContent = doc.querySelector('input, textarea, select, button, form, .w');
    if (!hasContent) return;

    if (pdfTitle) {
      doc.title = pdfTitle;
    }

    // 1. Populate inputs, textareas and selects with values from formData
    const inputs = doc.querySelectorAll<HTMLInputElement>('input');
    const textareas = doc.querySelectorAll<HTMLTextAreaElement>('textarea');
    const selects = doc.querySelectorAll<HTMLSelectElement>('select');

    const restoreFieldValues = () => {
      // Inputs
      inputs.forEach(input => {
        const name = input.name || input.id || input.getAttribute('aria-label') || '';
        if (!name) return;

        input.disabled = isReadOnly;

        const lookupKey = valuePrefix ? `${valuePrefix}${name}` : name;
        let value = formData[lookupKey] !== undefined ? formData[lookupKey] : formData[name];
        if (value === undefined && !valuePrefix) {
          value = formData[`entry_${name}`];
        }
        if (value !== undefined) {
          if (input.type === 'radio') {
            input.checked = String(input.value) === String(value);
          } else if (input.type === 'checkbox') {
            input.checked = !!value;
          } else {
            input.value = value;
          }
        }
      });

      // Textareas
      textareas.forEach(textarea => {
        const name = textarea.name || textarea.id || textarea.getAttribute('aria-label') || '';
        if (!name) return;

        textarea.disabled = isReadOnly;

        const lookupKey = valuePrefix ? `${valuePrefix}${name}` : name;
        let value = formData[lookupKey] !== undefined ? formData[lookupKey] : formData[name];
        if (value === undefined && !valuePrefix) {
          value = formData[`entry_${name}`];
        }
        if (value !== undefined) {
          textarea.value = value;
        }
      });

      // Selects
      selects.forEach(select => {
        const name = select.name || select.id || select.getAttribute('aria-label') || '';
        if (!name) return;

        select.disabled = isReadOnly;

        const lookupKey = valuePrefix ? `${valuePrefix}${name}` : name;
        let value = formData[lookupKey] !== undefined ? formData[lookupKey] : formData[name];
        if (value === undefined && !valuePrefix) {
          value = formData[`entry_${name}`];
        }
        if (value !== undefined) {
          select.value = value;
        }
      });
    };

    restoreFieldValues();

    // Trigger change handlers if the template has scripts (like radar chart update)
    const triggerScriptUpdates = () => {
      if (iframe.contentWindow && 'updateRadar' in iframe.contentWindow) {
        try {
          (iframe.contentWindow as any).updateRadar();
        } catch (e) {
          console.error('Failed to trigger updateRadar inside iframe', e);
        }
      }
    };
    
    triggerScriptUpdates();

    // Auto resize iframe height to fit its full content size (avoids scrollbars during printing)
    const resizeIframe = () => {
      try {
        if (doc.documentElement) {
          const height = doc.documentElement.scrollHeight;
          iframe.style.height = `${height + 40}px`;
        }
      } catch (e) {
        console.error(e);
      }
    };

    resizeIframe();
    // Run resize again after scripts and assets finish loading
    setTimeout(resizeIframe, 500);

    // 2. Attach change/input listeners to sync values to Firestore
    const handleInputEvent = (e: Event) => {
      if (isReadOnly) return;
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (!target) return;

      const name = target.name || target.id || target.getAttribute('aria-label') || '';
      if (!name) return;

      let value: any;
      if (target instanceof HTMLInputElement && target.type === 'checkbox') {
        value = target.checked;
      } else if (target instanceof HTMLInputElement && target.type === 'radio') {
        if (target.checked) {
          value = target.value;
        } else {
          return;
        }
      } else {
        value = target.value;
      }

      const lookupKey = valuePrefix ? `${valuePrefix}${name}` : name;
      onFieldChange(lookupKey, value);
      
      // Trigger chart or scripts update in iframe
      triggerScriptUpdates();
    };

    doc.body.removeEventListener('input', handleInputEvent);
    doc.body.removeEventListener('change', handleInputEvent);
    doc.body.addEventListener('input', handleInputEvent);
    doc.body.addEventListener('change', handleInputEvent);

    // Trigger automatic print if printMode is active on the parent window
    if (isPrintMode && !hasPrintedRef.current) {
      const triggerPrint = () => {
        if (document.hasFocus()) {
          hasPrintedRef.current = true;
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch (e) {
              console.error('Failed to trigger print inside iframe', e);
            }
          }, 1000);
        } else {
          const handleWindowFocus = () => {
            window.removeEventListener('focus', handleWindowFocus);
            triggerPrint();
          };
          window.addEventListener('focus', handleWindowFocus);
        }
      };
      triggerPrint();
    }

    // Handle custom signatures saved inside the iframe
    if (iframe.contentWindow) {
      const originalSaveSignature = (iframe.contentWindow as any).saveSignature;
      (iframe.contentWindow as any).saveSignature = function() {
        let data = '';
        if (originalSaveSignature) {
          data = originalSaveSignature();
        }
        if (data) {
          const keySig = valuePrefix ? `${valuePrefix}signatureData` : 'signatureData';
          const keyDate = valuePrefix ? `${valuePrefix}signatureDate` : 'signatureDate';
          onFieldChange(keySig, data);
          onFieldChange(keyDate, new Date().toLocaleDateString('fr-FR'));
        }
        return data;
      };

      const originalClearSignature = (iframe.contentWindow as any).clearSignature;
      (iframe.contentWindow as any).clearSignature = function() {
        if (originalClearSignature) {
          originalClearSignature();
        }
        const keySig = valuePrefix ? `${valuePrefix}signatureData` : 'signatureData';
        const keyDate = valuePrefix ? `${valuePrefix}signatureDate` : 'signatureDate';
        onFieldChange(keySig, '');
        onFieldChange(keyDate, '');
      };
    }
  };

  // Run initial restore values when formData changes
  useEffect(() => {
    handleIframeLoad();
  }, [formData, isReadOnly]);

  return (
    <div className={`w-full bg-white ${isPrintMode ? 'border-0 shadow-none' : 'rounded-2xl border border-slate-200 shadow-sm overflow-visible'}`}>
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        onLoad={handleIframeLoad}
        className="w-full border-0 min-h-[400px]"
        style={{ height: 'auto' }}
        title="Formulaire Dynamique"
      />
    </div>
  );
}
