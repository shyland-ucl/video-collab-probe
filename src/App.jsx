import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { wsRelayService } from './services/wsRelayService.js'
import { announce } from './utils/announcer.js'
import { EventLoggerProvider } from './contexts/EventLoggerContext.jsx'
import { AccessibilityProvider, useAccessibility } from './contexts/AccessibilityContext.jsx'

// Route-level code splitting: each probe / researcher / pipeline page becomes
// its own chunk so a participant on a phone only downloads the screen they
// need, instead of one ~670 kB bundle for the whole app.
const SessionSetupPage = lazy(() => import('./pages/SessionSetupPage.jsx'))
const Probe1Page = lazy(() => import('./pages/Probe1Page.jsx'))
const Probe2Page = lazy(() => import('./pages/Probe2Page.jsx'))
const Probe2bPage = lazy(() => import('./pages/Probe2bPage.jsx'))
const Probe3Page = lazy(() => import('./pages/Probe3Page.jsx'))
const ResearcherPage = lazy(() => import('./pages/ResearcherPage.jsx'))
const PipelineUploadPage = lazy(() => import('./pages/pipeline/PipelineUploadPage.jsx'))
const PipelineReviewPage = lazy(() => import('./pages/pipeline/PipelineReviewPage.jsx'))

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
        <Suspense fallback={<div role="status" aria-live="polite" className="p-8 text-center text-gray-500">Loading…</div>}>
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
        </Suspense>
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
