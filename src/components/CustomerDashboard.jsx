import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import VapiModule from '@vapi-ai/web';
const Vapi = VapiModule.default || VapiModule;

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || '';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button className="toast-close" onClick={onClose}>&times;</button>
    </div>
  );
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [toast, setToast] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [activeCallId, setActiveCallId] = useState(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const vapiRef = useRef(null);

  const [editForm, setEditForm] = useState({
    masterPrompt: '',
    ownerPhone: '',
    businessName: '',
  });

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      if (!res.ok) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
      }
    }).catch(() => {
      navigate('/login');
    });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/my/agents`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch agents');
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setFetching(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleUpdate = async (id) => {
    try {
      const body = {};
      if (editForm.masterPrompt) body.masterPrompt = editForm.masterPrompt;
      if (editForm.ownerPhone) body.ownerPhone = editForm.ownerPhone;
      if (editForm.businessName) body.businessName = editForm.businessName;

      const res = await fetch(`${API_BASE}/api/my/agents/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update');
      }
      const data = await res.json();
      setAgents((prev) => prev.map((a) => (a.id === id ? data.agent : a)));
      setEditingId(null);
      showToast('Agent updated successfully!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/my/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to change password');
      }
      showToast('Password changed successfully!');
      setShowPasswordForm(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  const startTestCall = (assistantId) => {
    if (!VAPI_PUBLIC_KEY) {
      showToast('Test calls are not configured. Please contact support.', 'error');
      return;
    }
    try {
      if (!vapiRef.current) {
        vapiRef.current = new Vapi(VAPI_PUBLIC_KEY);
        vapiRef.current.on('call-start', () => {});
        vapiRef.current.on('call-end', () => setActiveCallId(null));
      }
      vapiRef.current.start(assistantId);
      setActiveCallId(assistantId);
      showToast('Starting test call... speak into your microphone!');
    } catch (err) {
      showToast('Failed to start test call: ' + err.message, 'error');
    }
  };

  const endTestCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop();
      setActiveCallId(null);
    }
  };

  return (
    <div className="dashboard">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link to="/" className="logo">Receptionist LA</Link>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span className="customer-greeting">Welcome, {user.name || user.email}</span>
            <button className="btn btn-outline btn-sm" onClick={() => setShowPasswordForm(!showPasswordForm)}>
              {showPasswordForm ? 'Cancel' : 'Change Password'}
            </button>
            <button className="btn btn-danger-outline btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-container">
          <div className="dashboard-top-row">
            <div>
              <h1 className="dashboard-title">My AI Receptionist</h1>
              <p className="dashboard-subtitle">
                View and manage your AI receptionist settings.
              </p>
            </div>
          </div>

          {/* Change Password Form */}
          {showPasswordForm && (
            <div className="dashboard-card" style={{ marginBottom: '24px' }}>
              <h3>Change Password</h3>
              <form onSubmit={handleChangePassword} style={{ maxWidth: '400px' }}>
                <div className="form-group">
                  <label>Current Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                    required
                    minLength={8}
                  />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={passwordLoading}>
                  {passwordLoading ? 'Changing...' : 'Update Password'}
                </button>
              </form>
            </div>
          )}

          {/* Agents */}
          {fetching ? (
            <div className="agent-placeholder"><p>Loading...</p></div>
          ) : agents.length === 0 ? (
            <div className="dashboard-card">
              <div className="agent-placeholder">
                <p>No AI receptionist set up yet.</p>
                <p className="placeholder-sub">
                  Your AI receptionist will appear here once it's been configured. Contact us if you need help.
                </p>
              </div>
            </div>
          ) : (
            <div className="agents-list">
              {agents.map((agent) => (
                <div key={agent.id} className="dashboard-card agent-card">
                  <div className="agent-card-header">
                    <div>
                      <h3 className="agent-card-name">{agent.businessName}</h3>
                      <p className="agent-card-meta">
                        AI Phone: {agent.twilioNumber || 'N/A'} &middot;
                        Status: {agent.active === false ? 'Inactive' : 'Active'}
                      </p>
                    </div>
                    <span className={`status-badge ${agent.active === false ? 'status-inactive' : ''}`}>
                      <span className="status-dot" />
                      {agent.active === false ? 'Inactive' : 'Active'}
                    </span>
                  </div>

                  <div className="agent-card-details">
                    <div className="agent-card-detail">
                      <label>AI Phone Number</label>
                      <p>{agent.twilioNumber || 'N/A'}</p>
                    </div>
                    <div className="agent-card-detail">
                      <label>Owner's Phone</label>
                      <p>{agent.ownerPhone || 'Not set'}</p>
                    </div>
                    <div className="agent-card-detail prompt-detail">
                      <label>Master Prompt</label>
                      <p>{agent.masterPrompt?.substring(0, 200)}{agent.masterPrompt?.length > 200 ? '...' : ''}</p>
                    </div>
                  </div>

                  {/* Edit Form */}
                  {editingId === agent.id && (
                    <div className="edit-prompt-section">
                      <div className="form-group">
                        <label>Business Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editForm.businessName}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, businessName: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Owner's Phone</label>
                        <input
                          type="tel"
                          className="form-input"
                          value={editForm.ownerPhone}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, ownerPhone: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Master Prompt</label>
                        <textarea
                          className="form-textarea form-textarea-large"
                          rows={16}
                          value={editForm.masterPrompt}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, masterPrompt: e.target.value }))}
                        />
                      </div>
                      <div className="edit-actions">
                        <button className="btn btn-primary" onClick={() => handleUpdate(agent.id)}>
                          Save Changes
                        </button>
                        <button className="btn btn-outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="agent-card-actions">
                    {activeCallId === agent.assistantId ? (
                      <button className="btn btn-on-call" onClick={endTestCall}>
                        End Call
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => startTestCall(agent.assistantId)}
                        disabled={!!activeCallId || agent.active === false}
                      >
                        Test Call
                      </button>
                    )}
                    {editingId !== agent.id && (
                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          setEditForm({
                            masterPrompt: agent.masterPrompt || '',
                            ownerPhone: agent.ownerPhone || '',
                            businessName: agent.businessName || '',
                          });
                          setEditingId(agent.id);
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
