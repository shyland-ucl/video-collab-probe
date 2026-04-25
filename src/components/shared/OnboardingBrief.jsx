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

  // ConditionHeader now provides the page-level <h1>, so OnboardingBrief
  // doesn't need its own sr-only heading. The pageTitle prop is kept for
  // backward-compat with callers but is rendered as a screen-reader-only
  // <h2> so the brief still has an addressable section heading without
  // duplicating the page-level title (M4).
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Page instructions"
      className="mx-3 mt-3 mb-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none"
    >
      {pageTitle && (
        <h2 className="sr-only">{pageTitle}</h2>
      )}
      <p className="text-base text-gray-700">{description}</p>
    </section>
  );
}
