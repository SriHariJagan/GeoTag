import { useState, useRef, useEffect } from "react";
import { Menu, User, X, LogOut, ChevronDown, Mail, ShieldCheck, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../store/context/AuthContext";
import { getUserDetail } from "../../api/auth.api";
import styles from "./Navbar.module.css";
import { ROLES } from "../../constants/roles";

const photoUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.VITE_API_URL || "";
  const origin = base ? new URL(base, window.location.origin).origin : "";
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
};

const prettyRole = (role) =>
  role ? role.charAt(0) + role.slice(1).toLowerCase() : "Role";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const profileRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [profileDetail, setProfileDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const role = user?.role;

  // Lazy-load full profile (name, photo) the first time the menu opens.
  useEffect(() => {
    if (!profileOpen || profileDetail || !user?.id) return;
    setDetailLoading(true);
    getUserDetail(user.id)
      .then((r) => setProfileDetail(r.data || null))
      .catch(() => setProfileDetail(null))
      .finally(() => setDetailLoading(false));
  }, [profileOpen, profileDetail, user?.id]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const adminLinks = [
    { label: "Logs", path: "/admin/logs" },
    { label: "Projects", path: "/admin/projects" },
    { label: "Daily Execution", path: "/admin/daily-execution-report" },
    { label: "Supervisors", path: "/admin/supervisors" },
    { label: "Vendors", path: "/admin/vendors" },
    { label: "Procurement", path: "/admin/procurement" },
    { label: "Work Orders", path: "/admin/work-orders" },
    { label: "Machinery", path: "/admin/machines" },
    { label: "Users", path: "/admin/users" },
    { label: "Expenditures", path: "/admin/expenditures" },
    { label: "Company", path: "/admin/settings/company" },
  ];

  const supervisorLinks = [
    { label: "My Projects", path: "/supervisor/my-projects" },
    { label: "Daily Execution", path: "/supervisor/daily-execution-report" },
    { label: "Expenditures", path: "/supervisor/expenditures" },
  ];

  const vendorLinks = [
    { label: "Dashboard", path: "/vendor" },
    { label: "RFQs", path: "/vendor/rfqs" },
    { label: "Work Orders", path: "/vendor/work-orders" },
    { label: "My Projects", path: "/vendor/projects" },
  ];

  const isAdminLike = role === ROLES.SUPERADMIN || role === ROLES.ADMIN || role === ROLES.MONITOR;
  const canSeeLogs =
    (user?.email || "").toLowerCase() === "sriharijagan04@gmail.com";
  const baseLinks =
    isAdminLike ? adminLinks : role === ROLES.VENDOR ? vendorLinks : supervisorLinks;
  const links = baseLinks.filter(
    (link) => link.label !== "Logs" || canSeeLogs
  );

  const itemVariant = {
    hidden: { opacity: 0, x: 28 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.22 } },
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const displayName =
    profileDetail?.full_name || user?.email?.split("@")[0] || "User";
  const displayInitial = displayName.charAt(0)?.toUpperCase() || "U";
  const avatarSrc = photoUrl(profileDetail?.profile_photo);
  const isActive = (profileDetail?.account_status || "ACTIVE") === "ACTIVE";

  return (
    <nav className={styles.navbar}>
      <div className={styles.logo}>
        <Link to={role === ROLES.VENDOR ? "/vendor" : role === ROLES.SUPERVISOR ? "/supervisor" : "/admin"}>
          GeoTech
        </Link>
      </div>

      <div className={styles.desktopMenu}>
        {links.map((link) => (
          <NavLink
            key={link.label}
            to={link.path}
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.active}` : styles.navItem
            }
          >
            {({ isActive }) => (
              <>
                <span>{link.label}</span>
                {isActive && (
                  <motion.span
                    className={styles.activePill}
                    layoutId="navbar-active-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className={styles.rightSide}>
        <div className={styles.profileWrapper} ref={profileRef}>
          <button
            onClick={() => setProfileOpen((p) => !p)}
            className={styles.profileButton}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <span className={styles.avatar}>
              {avatarSrc ? (
                <img src={avatarSrc} alt={displayName} />
              ) : (
                displayInitial
              )}
            </span>
            <span className={styles.profileText}>
              <strong>{displayName}</strong>
              <small>{prettyRole(role)}</small>
            </span>
            <ChevronDown
              className={`${styles.chevron} ${
                profileOpen ? styles.chevronOpen : ""
              }`}
            />
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className={styles.profileDropdown}
                role="menu"
              >
                <div className={styles.profileCover}>
                  <span className={styles.coverAvatar}>
                    {avatarSrc ? (
                      <img src={avatarSrc} alt={displayName} />
                    ) : (
                      displayInitial
                    )}
                    <i
                      className={styles.statusDot}
                      data-active={isActive ? "1" : undefined}
                      title={isActive ? "Active" : "Inactive"}
                    />
                  </span>
                  <div className={styles.coverText}>
                    <strong>{detailLoading ? "Loading…" : displayName}</strong>
                    <span>{user?.email || "No email"}</span>
                  </div>
                  <span className={styles.roleBadge}>{prettyRole(role)}</span>
                </div>

                <div className={styles.profileMeta}>
                  <div className={styles.metaRow}>
                    <Mail size={14} />
                    <span>Email</span>
                    <b>{user?.email || "—"}</b>
                  </div>
                  <div className={styles.metaRow}>
                    <ShieldCheck size={14} />
                    <span>Access</span>
                    <b>{prettyRole(role)}</b>
                  </div>
                  <div className={styles.metaRow}>
                    <User size={14} />
                    <span>Member ID</span>
                    <b>#{user?.id ?? "—"}</b>
                  </div>
                </div>

                {isAdminLike && user?.id && (
                  <button
                    className={styles.profileBtn}
                    onClick={() => {
                      setProfileOpen(false);
                      navigate(`/admin/users/${user.id}`);
                    }}
                  >
                    <Eye size={16} />
                    View full profile
                  </button>
                )}

                {!isAdminLike && role === ROLES.SUPERVISOR && user?.id && (
                  <button
                    className={styles.profileBtn}
                    onClick={() => {
                      setProfileOpen(false);
                      navigate("/supervisor/profile");
                    }}
                  >
                    <Eye size={16} />
                    My profile & edit
                  </button>
                )}

                <button className={styles.logoutBtn} onClick={handleLogout}>
                  <LogOut size={16} />
                  Logout
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          className={`${styles.iconButton} ${styles.hamburgerButton}`}
          onClick={() => setMenuOpen(true)}
        >
          <Menu className={styles.icon} />
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className={styles.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />

            <motion.div
              className={styles.mobileSlideMenu}
              initial={{ x: "100%" }}
              animate={{ x: "0%" }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.28 }}
            >
              <div className={styles.mobileHeader}>
                <div>
                  <p>GeoTech</p>
                  <span>Navigation</span>
                </div>

                <button
                  className={styles.closeButton}
                  onClick={() => setMenuOpen(false)}
                >
                  <X className={styles.icon} />
                </button>
              </div>

              <div className={styles.mobileProfile}>
                <span className={styles.mobileAvatar}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={displayName} />
                  ) : (
                    displayInitial
                  )}
                </span>
                <div className={styles.mobileProfileText}>
                  <strong>{displayName}</strong>
                  <span>
                    {user?.email || ""} · {prettyRole(role)}
                  </span>
                </div>
              </div>

              <motion.div
                className={styles.mobileMenuInner}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={{ staggerChildren: 0.06 }}
              >
                {links.map((link) => (
                  <motion.div key={link.label} variants={itemVariant}>
                    <NavLink
                      to={link.path}
                      onClick={() => {
                        setMenuOpen(false);
                        setProfileOpen(false);
                      }}
                      className={({ isActive }) =>
                        isActive
                          ? `${styles.mobileNavItem} ${styles.mobileActive}`
                          : styles.mobileNavItem
                      }
                    >
                      {link.label}
                    </NavLink>
                  </motion.div>
                ))}
              </motion.div>

              <button
                className={styles.mobileLogout}
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
              >
                <LogOut size={16} />
                Logout
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
}