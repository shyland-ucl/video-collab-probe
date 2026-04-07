import { useEffect, useRef } from 'react';

export default function OnboardingBrief({ description, pageTitle }) {
  const sectionRef = useRef(null);

  useEffect(() => {
    // Auto-focus the section on mount so screen readers read it immediately
    const raf = requestAnimationFrame(() => {
      sectionRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [description]);

  if (!description) return null;

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Page instructions"
      className="mx-3 mt-3 mb-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none"
    >
      {pageTitle && (
        <h1 className="sr-only">{pageTitle}</h1>
      )}
      <p className="text-sm text-gray-700">{description}</p>
    </section>
  );
}
