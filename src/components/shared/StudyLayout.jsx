import ConditionNav from './ConditionNav.jsx';

/**
 * Layout wrapper for condition pages.
 * Adds ConditionNav at the bottom and provides bottom padding so
 * content is not hidden behind the fixed navigation bar.
 */
export default function StudyLayout({ condition, children }) {
  return (
    <>
      <div className="pb-16">
        {children}
      </div>
      <ConditionNav currentCondition={condition} />
    </>
  );
}
