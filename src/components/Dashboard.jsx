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

export default function Dashboard() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [activeCallId, setActiveCallId] = useState(null);
  const vapiRef = useRef(null);

  const [form, setForm] = useState({
    businessName: '',
    ownerEmail: '',
    ownerPhone: '',
    areaCode: '213',
    masterPrompt: '',
  });

  const [editForm, setEditForm] = useState({
    masterPrompt: '',
    ownerPhone: '',
  });

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
      const res = await fetch(`${API_BASE}/api/agents`, {
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

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          businessName: form.businessName,
          ownerEmail: form.ownerEmail,
          ownerPhone: form.ownerPhone,
          masterPrompt: form.masterPrompt,
          areaCode: form.areaCode || '213',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create agent');
      }
      const data = await res.json();
      setAgents((prev) => [...prev, data.agent]);
      setForm({ businessName: '', ownerEmail: '', ownerPhone: '', areaCode: '213', masterPrompt: '' });
      setShowForm(false);
      showToast('AI Agent created successfully!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          masterPrompt: editForm.masterPrompt,
          ownerPhone: editForm.ownerPhone,
        }),
      });
      if (!res.ok) throw new Error('Failed to update agent');
      const data = await res.json();
      setAgents((prev) => prev.map((a) => (a.id === id ? data.agent : a)));
      setEditingId(null);
      showToast('Agent updated successfully!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete agent');
      setAgents((prev) => prev.filter((a) => a.id !== id));
      setConfirmDelete(null);
      showToast('Agent deleted successfully.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const startTestCall = (assistantId) => {
    if (!VAPI_PUBLIC_KEY) {
      showToast('Vapi public key not configured.', 'error');
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
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link to="/" className="logo">
            Receptionist LA
          </Link>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Link to="/" className="btn btn-outline btn-sm">
              Back to Home
            </Link>
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
              <h1 className="dashboard-title">AI Agents</h1>
              <p className="dashboard-subtitle">
                Manage all your customer AI receptionists.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? 'Cancel' : '+ Create New Agent'}
            </button>
          </div>

          {/* Create Agent Form */}
          {showForm && (
            <div className="dashboard-card" style={{ marginBottom: '32px' }}>
              <h2 className="card-title">Create New Agent</h2>
              <p className="card-desc">
                Fill out the details below to set up a new AI receptionist.
              </p>
              <form onSubmit={handleCreate} className="dashboard-form create-form-grid">
                <div className="form-group">
                  <label htmlFor="businessName">Business Name</label>
                  <input
                    id="businessName"
                    name="businessName"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Sunset Hair Studio"
                    value={form.businessName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="ownerEmail">Owner Email</label>
                  <input
                    id="ownerEmail"
                    name="ownerEmail"
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={form.ownerEmail}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="ownerPhone">Owner's Cell Phone</label>
                  <input
                    id="ownerPhone"
                    name="ownerPhone"
                    type="tel"
                    className="form-input"
                    placeholder="+1 (310) 555-0100"
                    value={form.ownerPhone}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="areaCode">Area Code</label>
                  <input
                    id="areaCode"
                    name="areaCode"
                    type="text"
                    className="form-input"
                    placeholder="213"
                    value={form.areaCode}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="masterPrompt">Master Prompt</label>
                  <textarea
                    id="masterPrompt"
                    name="masterPrompt"
                    className="form-textarea"
                    rows={4}
                    placeholder='You are the receptionist for [Business Name], a hair salon in Los Angeles. Our hours are Mon-Sat 9am-7pm...'
                    value={form.masterPrompt}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    disabled={loading}
                  >
                    {loading ? 'Creating Agent...' : 'Create AI Agent'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Agents List */}
          {fetching ? (
            <div className="agent-placeholder">
              <p>Loading agents...</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="dashboard-card">
              <div className="agent-placeholder">
                <div className="placeholder-icon">
                  <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </div>
                <p>No agents created yet.</p>
                <p className="placeholder-sub">
                  Click "Create New Agent" to get started.
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
                        {agent.ownerEmail} &middot; Created {new Date(agent.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="status-badge">
                      <span className="status-dot" />
                      Active
                    </span>
                  </div>

                  <div className="agent-card-details">
                    <div className="agent-card-detail">
                      <label>AI Phone Number</label>
                      <p>{agent.twilioNumber || agent.vapiPhoneNumber || 'N/A'}</p>
                    </div>
                    <div className="agent-card-detail">
                      <label>Owner's Phone</label>
                      <p>{agent.ownerPhone || 'Not set'}</p>
                    </div>
                    <div className="agent-card-detail prompt-detail">
                      <label>Master Prompt</label>
                      <p>{agent.masterPrompt?.substring(0, 120)}{agent.masterPrompt?.length > 120 ? '...' : ''}</p>
                    </div>
                  </div>

                  {/* Edit Form */}
                  {editingId === agent.id && (
                    <div className="edit-prompt-section">
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
                          className="form-textarea"
                          rows={5}
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

                  {/* Delete Confirmation */}
                  {confirmDelete === agent.id && (
                    <div className="delete-confirm">
                      <p>Are you sure? This will delete the agent and release the phone number.</p>
                      <div className="delete-confirm-actions">
                        <button className="btn btn-danger" onClick={() => handleDelete(agent.id)}>
                          Yes, Delete
                        </button>
                        <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="agent-card-actions">
                    {activeCallId === agent.assistantId ? (
                      <button className="btn btn-on-call" onClick={endTestCall}>
                        🔴 End Call
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => startTestCall(agent.assistantId)}
                        disabled={!!activeCallId}
                      >
                        🎙️ Test Call
                      </button>
                    )}
                    {editingId !== agent.id && (
                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          setEditForm({
                            masterPrompt: agent.masterPrompt || '',
                            ownerPhone: agent.ownerPhone || '',
                          });
                          setEditingId(agent.id);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {confirmDelete !== agent.id && (
                      <button
                        className="btn btn-danger-outline"
                        onClick={() => setConfirmDelete(agent.id)}
                      >
                        Delete
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
