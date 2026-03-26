import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [verifying, setVerifying] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      return;
    }

    fetch(`${API_BASE}/api/auth/verify-setup-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setValid(true);
          setEmail(data.email);
          setName(data.name || '');
        } else {
          setError(data.error || 'Invalid or expired link.');
        }
      })
      .catch(() => setError('Could not verify link. Please try again.'))
      .finally(() => setVerifying(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to set password.');
      }

      // Auto-login
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setSuccess(true);

      // Redirect to customer dashboard after 2 seconds
      setTimeout(() => navigate('/my-dashboard'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Verifying your link...</p>
        </div>
      </div>
    );
  }

  if (!token || !valid) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Invalid Link</h1>
          <p style={{ textAlign: 'center', color: '#ef4444', marginBottom: '20px' }}>
            {error || 'This setup link is invalid or has already been used.'}
          </p>
          <p style={{ textAlign: 'center' }}>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block' }}>
              Go to Login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title" style={{ color: '#10b981' }}>Password Set!</h1>
          <p style={{ textAlign: 'center', color: '#6b7280' }}>
            Your password has been set successfully. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Set Your Password</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '24px' }}>
          Welcome{name ? `, ${name}` : ''}! Set a password for <strong>{email}</strong> to access your AI receptionist dashboard.
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              className="form-input"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Setting Password...' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
