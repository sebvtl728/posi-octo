import { useNavigate, NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Target, LogOut } from 'lucide-react';
import { adminLogout } from '../../lib/auth';

const navItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/questionnaires', icon: FileText, label: 'Questionnaires' },
  { to: '/admin/positioning', icon: Target, label: 'Positionnement' },
  { to: '/admin/sessions', icon: Users, label: 'Sessions' },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await adminLogout();
    navigate('/admin', { replace: true });
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <aside className="w-52 bg-indigo-950 text-indigo-300 flex flex-col shrink-0">
        <div className="p-5 border-b border-indigo-900">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full" />
            <span className="text-white font-bold text-sm tracking-tight">Posi-octo</span>
          </div>
          <div className="text-indigo-500 text-[10px] mt-1 ml-4">Administration</div>
        </div>

        <nav className="flex-1 py-3">
          <div className="px-4 mb-2 text-[9px] font-bold uppercase tracking-widest text-indigo-700">
            Navigation
          </div>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-xs border-l-2 transition-colors ${
                  isActive
                    ? 'bg-indigo-900 border-indigo-400 text-white font-medium'
                    : 'border-transparent hover:bg-indigo-900/50 hover:text-white'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-indigo-900">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-indigo-400 hover:text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
