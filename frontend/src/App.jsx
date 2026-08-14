import { Routes, Route, NavLink, Link } from 'react-router-dom'
import ProfilePage from './pages/ProfilePage.jsx'
import WeeklyPlanPage from './pages/WeeklyPlanPage.jsx'
import ApplicationsPage from './pages/ApplicationsPage.jsx'
import PrepGuidePage from './pages/PrepGuidePage.jsx'
import ResumeLibraryPage from './pages/ResumeLibraryPage.jsx'

const NAV = [
  { label: 'Profile', to: '/profile', end: true },
  { label: 'Weekly Plan', to: '/weekly-plan' },
  { label: 'Applications', to: '/applications' },
  { label: 'Prep Guide', to: '/prep-guide/1' },
  { label: 'Resumes', to: '/resumes' },
]

function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#brand-grad)" />
      <path
        d="M7 16.5 17 7.5M10.5 7.5H17V14"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function NotFound() {
  return (
    <div className="panel panel--center">
      <p className="panel__eyebrow">404</p>
      <h1 className="panel__title">This page isn't part of the flow yet</h1>
      <p className="panel__desc">The route you followed doesn't exist — yet.</p>
      <div className="form__actions">
        <Link to="/profile" className="btn btn--primary">
          Back to profile setup
        </Link>
      </div>
    </div>
  )
}

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand" aria-label="HireFlow AI — home">
            <BrandMark />
            <span className="brand__name">
              HireFlow<span className="brand__suffix">AI</span>
            </span>
          </Link>

          <nav className="topnav" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `topnav__link${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="app-main">
        <Routes>
          <Route path="/" element={<ProfilePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/weekly-plan" element={<WeeklyPlanPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/prep-guide/:id" element={<PrepGuidePage />} />
          <Route path="/resumes" element={<ResumeLibraryPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <p className="app-footer__note">
          HireFlow AI · Career automation for students · Backend at :8000
        </p>
      </footer>
    </div>
  )
}

export default App
