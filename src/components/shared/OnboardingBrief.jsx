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

  // ConditionHeader provides the page-level <h1>; OnboardingBrief no
  // longer renders an <h2> (it caused TalkBack heading-jump to land on
  // the brief subtitle before the page <h1>, B1).
  //
  // We auto-focus this container on mount so TalkBack starts reading
  // here, skipping the chrome above. Using a plain <div> with no
  // landmark/aria-label so the focused element reads the description
  // text directly — previously a <section aria-label="Page instructions">
  // made TalkBack announce "Page instructions, region" before the actual
  // content, which buried the lede on every probe entry.
  // The `pageTitle` prop is kept for backward-compat with existing callers.
  void pageTitle;
  return (
    <div
      ref={sectionRef}
      tabIndex={-1}
      className="mx-3 mt-3 mb-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none"
    >
      <p className="text-base text-gray-700">{description}</p>
    </div>
  );
}
