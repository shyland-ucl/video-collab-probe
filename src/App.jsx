import { Routes, Route } from 'react-router-dom'
import { EventLoggerProvider } from './contexts/EventLoggerContext.jsx'
import { AccessibilityProvider, useAccessibility } from './contexts/AccessibilityContext.jsx'
import SessionSetupPage from './pages/SessionSetupPage.jsx'
import Probe1Page from './pages/Probe1Page.jsx'
import Probe2Page from './pages/Probe2Page.jsx'
import Probe2bPage from './pages/Probe2bPage.jsx'
import Probe3Page from './pages/Probe3.jsx'
import ResearcherPage from './pages/ResearcherPage.jsx'
import StudyLayout from './components/shared/StudyLayout.jsx'

const TEXT_SIZE_CLASSES = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
}

function AppShell() {
  const { highContrast, textSize } = useAccessibility()

  const rootClasses = [
    highContrast ? 'high-contrast' : '',
    TEXT_SIZE_CLASSES[textSize] || 'text-base',
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClasses}>
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-4 focus:bg-[#2B579A] focus:text-white"
      >
        Skip to main content
      </a>

      {/* Screen reader live announcer */}
      <div id="sr-announcer" role="status" aria-live="assertive" className="sr-only" />

      <main id="main-content">
        <Routes>
          <Route path="/" element={<SessionSetupPage />} />
          <Route path="/probe1" element={<StudyLayout condition="probe1"><Probe1Page /></StudyLayout>} />
          <Route path="/probe2" element={<StudyLayout condition="probe2a"><Probe2Page /></StudyLayout>} />
          <Route path="/probe2b" element={<StudyLayout condition="probe2b"><Probe2bPage /></StudyLayout>} />
          <Route path="/probe3" element={<StudyLayout condition="probe3"><Probe3Page /></StudyLayout>} />
          <Route path="/researcher" element={<ResearcherPage />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <EventLoggerProvider>
      <AccessibilityProvider>
        <AppShell />
      </AccessibilityProvider>
    </EventLoggerProvider>
  )
}

export default App
