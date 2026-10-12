import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { IncomingPoller } from "./components/IncomingPoller";
import { CheckEmailPage } from "./pages/CheckEmailPage";
import { DisplayNamePage } from "./pages/DisplayNamePage";
import { HomePage } from "./pages/HomePage";
import { IncomingPage } from "./pages/IncomingPage";
import { LoginPage } from "./pages/LoginPage";
import { MyCodePage } from "./pages/MyCodePage";
import { ProfilePage } from "./pages/ProfilePage";
import { ScanPage } from "./pages/ScanPage";
import { VerifyPage } from "./pages/VerifyPage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-shell muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <IncomingPoller />
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/check-email" element={<CheckEmailPage />} />
      <Route path="/auth/verify" element={<VerifyPage />} />
      <Route
        path="/display-name"
        element={
          <PrivateRoute>
            <DisplayNamePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <HomePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <PrivateRoute>
            <ProfilePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/code"
        element={
          <PrivateRoute>
            <MyCodePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/scan"
        element={
          <PrivateRoute>
            <ScanPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/incoming/:id"
        element={
          <PrivateRoute>
            <IncomingPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
