export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-left">
          <a href="#" className="logo">
            <img src="/logo.png" alt="Receptionist LA" className="logo-img footer-logo-img" />
          </a>
        </div>
        <nav className="footer-nav">
          <a href="#features">Features</a>
          <a href="#industries">Industries</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
        <p className="footer-copy">&copy; {new Date().getFullYear()} Receptionist LA. All rights reserved.</p>
      </div>
    </footer>
  );
}
