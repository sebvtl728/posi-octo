import { useEffect, useRef } from 'react';

interface DynamicFormRendererProps {
  htmlContent: string;
  formData: Record<string, any>;
  onFieldChange: (name: string, value: any) => void;
  isReadOnly?: boolean;
}

export default function DynamicFormRenderer({
  htmlContent,
  formData,
  onFieldChange,
  isReadOnly = false
}: DynamicFormRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Separate styles, scripts, and body content
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Clear previous dynamic styles
    const existingStyles = document.querySelectorAll('[data-dynamic-form-style]');
    existingStyles.forEach(s => s.remove());

    // Inject styles
    const styles = doc.querySelectorAll('style');
    styles.forEach(style => {
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-dynamic-form-style', 'true');
      styleEl.textContent = style.textContent;
      document.head.appendChild(styleEl);
    });

    // Get body content
    const bodyContent = doc.body.innerHTML;
    container.innerHTML = bodyContent;

    // 2. Populate inputs, textareas and radios with current values from formData
    const inputs = container.querySelectorAll<HTMLInputElement>('input');
    const textareas = container.querySelectorAll<HTMLTextAreaElement>('textarea');
    const selects = container.querySelectorAll<HTMLSelectElement>('select');

    const restoreFieldValues = () => {
      // Inputs
      inputs.forEach(input => {
        const name = input.name || input.id || input.getAttribute('aria-label') || '';
        if (!name) return;

        if (isReadOnly) {
          input.disabled = true;
        }

        const value = formData[name];
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

        if (isReadOnly) {
          textarea.disabled = true;
        }

        const value = formData[name];
        if (value !== undefined) {
          textarea.value = value;
        }
      });

      // Selects
      selects.forEach(select => {
        const name = select.name || select.id || select.getAttribute('aria-label') || '';
        if (!name) return;

        if (isReadOnly) {
          select.disabled = true;
        }

        const value = formData[name];
        if (value !== undefined) {
          select.value = value;
        }
      });
    };

    restoreFieldValues();

    // 3. Attach change/input listeners to automatically sync inputs to Firestore
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
          return; // Don't trigger change for unchecked radios
        }
      } else {
        value = target.value;
      }

      onFieldChange(name, value);
    };

    container.addEventListener('input', handleInputEvent);
    container.addEventListener('change', handleInputEvent);

    // 4. Inject and execute scripts inside HTML template
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => {
      const scriptEl = document.createElement('script');
      scriptEl.setAttribute('data-dynamic-form-script', 'true');
      if (script.src) {
        scriptEl.src = script.src;
      } else {
        scriptEl.textContent = script.textContent;
      }
      document.body.appendChild(scriptEl);
    });

    return () => {
      container.removeEventListener('input', handleInputEvent);
      container.removeEventListener('change', handleInputEvent);

      // Clean up dynamic scripts and styles on unmount
      const existingScripts = document.querySelectorAll('[data-dynamic-form-script]');
      existingScripts.forEach(s => s.remove());
      const remainingStyles = document.querySelectorAll('[data-dynamic-form-style]');
      remainingStyles.forEach(s => s.remove());
    };
  }, [htmlContent, formData, isReadOnly]);

  return (
    <div ref={containerRef} className="dynamic-html-form-container w-full flex flex-col items-center mx-auto" />
  );
}
