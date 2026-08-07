import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useSession } from './lib/session';
import { Account } from './pages/Account';
import { Approvals } from './pages/Approvals';
import { ChangePassword } from './pages/ChangePassword';
import { Dashboard } from './pages/Dashboard';
import { IngestDetail } from './pages/IngestDetail';
import { Ingests } from './pages/Ingests';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Multiview } from './pages/Multiview';
import { Presets } from './pages/Presets';
import { Settings } from './pages/Settings';
import { Signup } from './pages/Signup';
import { Users } from './pages/Users';

function Loading(): JSX.Element {
  return (
    <div className="grid min-h-full place-items-center">
      <span className="font-display text-sm uppercase tracking-[.2em] text-faint">
        Carregando…
      </span>
    </div>
  );
}

/**
 * Gate for everything behind a session.
 *
 * The forced password change is enforced here as well as on the server. The
 * server is what actually protects the data; this only spares the user a
 * screen full of failed requests before being told what to do.
 */
function Private({ children }: { children: JSX.Element }): JSX.Element {
  const { user, loading, mustChangePassword } = useSession();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (mustChangePassword) return <Navigate to="/trocar-senha" replace />;
  return children;
}

function AdminOnly({ children }: { children: JSX.Element }): JSX.Element {
  const { isAdmin, loading } = useSession();
  if (loading) return <Loading />;
  return isAdmin ? children : <Navigate to="/app" replace />;
}

/** Public pages bounce an already-signed-in visitor into the app. */
function PublicOnly({ children }: { children: JSX.Element }): JSX.Element {
  const { user, loading, mustChangePassword } = useSession();
  if (loading) return <Loading />;
  if (user) return <Navigate to={mustChangePassword ? '/trocar-senha' : '/app'} replace />;
  return children;
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicOnly>
            <Landing />
          </PublicOnly>
        }
      />
      <Route
        path="/entrar"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      {/*
        Administrator sign-in has its own address so the public page does not
        advertise it. The form is the same and so is the authentication — this
        buys tidiness, not security.
      */}
      <Route
        path="/admin"
        element={
          <PublicOnly>
            <Login adminMode />
          </PublicOnly>
        }
      />
      <Route
        path="/criar-conta"
        element={
          <PublicOnly>
            <Signup />
          </PublicOnly>
        }
      />

      <Route path="/trocar-senha" element={<ChangePassword />} />

      <Route
        path="/app"
        element={
          <Private>
            <Shell />
          </Private>
        }
      >
        <Route index element={<Ingests />} />
        <Route path="recepcao/:id" element={<IngestDetail />} />
        <Route path="multiview" element={<Multiview />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="conta" element={<Account />} />
        <Route
          path="aprovacoes"
          element={
            <AdminOnly>
              <Approvals />
            </AdminOnly>
          }
        />
        <Route
          path="usuarios"
          element={
            <AdminOnly>
              <Users />
            </AdminOnly>
          }
        />
        <Route
          path="destinos"
          element={
            <AdminOnly>
              <Presets />
            </AdminOnly>
          }
        />
        <Route
          path="configuracoes"
          element={
            <AdminOnly>
              <Settings />
            </AdminOnly>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
