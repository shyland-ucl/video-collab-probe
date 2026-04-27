import { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { wsRelayService } from './services/wsRelayService.js'
import { announce } from './utils/announcer.js'
import { EventLoggerProvider } from './contexts/EventLoggerContext.jsx'
import { AccessibilityProvider, useAccessibility } from './contexts/AccessibilityContext.jsx'
import SessionSetupPage from './pages/SessionSetupPage.jsx'
import Probe1Page from './pages/Probe1Page.jsx'
import Probe2Page from './pages/Probe2Page.jsx'
import Probe2bPage from './pages/Probe2bPage.jsx'
import Probe3Page from './pages/Probe3Page.jsx'
import ResearcherPage from './pages/ResearcherPage.jsx'
import PipelineUploadPage from './pages/pipeline/PipelineUploadPage.jsx'
import PipelineReviewPage from './pages/pipeline/PipelineReviewPage.jsx'

const TEXT_SIZE_CLASSES = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
}

function AppShell() {
  const { highContrast, textSize } = useAccessibility()
  const navigate = useNavigate()

  // Listen for researcher navigation commands via WebSocket
  useEffect(() => {
    const unsubscribe = wsRelayService.onData((msg) => {
      if (msg.type === 'NAVIGATE' && msg.path) {
        announce('Moving to the next section.');
        navigate(msg.path);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

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

      {/* Screen reader live announcers.
          Two regions:
          - polite: queues behind whatever TalkBack is currently speaking.
            Used for incidental/background notifications.
          - assertive: interrupts current speech. Used for direct feedback
            to a user action (e.g. detail-level change), where TalkBack
            would otherwise drown out the announce by re-reading the
            just-activated button. */}
      <div id="sr-announcer" role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
      <div id="sr-announcer-assertive" role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" />

      <main id="main-content">
        <Routes>
          <Route path="/" element={<SessionSetupPage />} />
          <Route path="/probe1" element={<Probe1Page />} />
          <Route path="/probe2" element={<Probe2Page />} />
          <Route path="/probe2b" element={<Probe2bPage />} />
          <Route path="/probe3" element={<Probe3Page />} />
          <Route path="/researcher" element={<ResearcherPage />} />
          <Route path="/pipeline" element={<PipelineUploadPage />} />
          <Route path="/pipeline/review/:projectId" element={<PipelineReviewPage />} />
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
