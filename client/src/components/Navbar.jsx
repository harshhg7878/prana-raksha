export default function Navbar({ menuOpen, setMenuOpen }) {
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="navbar">
      <div className="container nav-inner">
        <a href="#home" className="brand" onClick={closeMenu}>
          <img src="/logo.png" alt="Prana Raksha Logo" className="brand-logo" />
        </a>

        <nav className={`nav-links ${menuOpen ? "active" : ""}`}>
          <a href="#home" onClick={closeMenu}>Home</a>
          <a href="#features" onClick={closeMenu}>Features</a>
          <a href="#how" onClick={closeMenu}>How It Works</a>
          <a href="#about" onClick={closeMenu}>About</a>

          <a href="/login" className="nav-btn" onClick={closeMenu}>Login</a>
        </nav>

        <button
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>
  );
}
