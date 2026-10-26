import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AppProvider } from "./context/AppContext";
import DashboardPage from "./pages/Dashboard";
import ReviewPage from "./pages/Review";
import CalendarPage from "./pages/CalendarPage";
import StudyPlanPage from "./pages/StudyPlan";
import SourcesPage from "./pages/Sources";
import IntegrationsPage from "./pages/Integrations";
import SettingsPage from "./pages/SettingsPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider>
        <ScrollToTop />
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/study-plan" element={<StudyPlanPage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </AppProvider>
    </BrowserRouter>
  );
}
