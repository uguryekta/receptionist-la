import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const API_BASE = 'http://localhost:3001';

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
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [form, setForm] = useState({
    businessName: '',
    ownerEmail: '',
    ownerPhone: '',
    areaCode: '213',
    masterPrompt: '',
  });

  const [editPrompt, setEditPrompt] = useState('');
  const [editOwnerPhone, setEditOwnerPhone] = useState('');

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agents`);
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterPrompt: editPrompt,
          ownerPhone: editOwnerPhone,
        }),
      });
      if (!res.ok) throw new Error('Failed to update agent');
      const data = await res.json();
      setAgents((prev) => prev.map((a) => (a.id === id ? data.agent : a)));
      setEditing(false);
      showToast('Agent updated successfully!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete agent');
      setAgents((prev) => prev.filter((a) => a.id !== id));
      setConfirmDelete(null);
      showToast('Agent deleted successfully.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const activeAgent = agents.length > 0 ? agents[0] : null;

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
          <Link to="/" className="btn btn-outline btn-sm">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-container">
          <h1 className="dashboard-title">Customer Dashboard</h1>
          <p className="dashboard-subtitle">
            Set up and manage your AI receptionist agent.
          </p>

          <div className="dashboard-grid">
            {/* Section A - Setup Form */}
            <div className="dashboard-card">
              <h2 className="card-title">Create AI Agent</h2>
              <p className="card-desc">
                Fill out the details below to set up your AI receptionist.
              </p>

              <form onSubmit={handleCreate} className="dashboard-form">
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
                  <span className="form-help">
                    When a customer calls, the AI will try to connect them to this number first. If you don't answer, the AI takes over.
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor="areaCode">Preferred Area Code (optional)</label>
                  <input
                    id="areaCode"
                    name="areaCode"
                    type="text"
                    className="form-input"
                    placeholder="213"
                    value={form.areaCode}
                    onChange={handleChange}
                  />
                  <span className="form-help">
                    We'll get you a local LA phone number with this area code.
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor="masterPrompt">Master Prompt</label>
                  <textarea
                    id="masterPrompt"
                    name="masterPrompt"
                    className="form-textarea"
                    rows={6}
                    placeholder='You are the receptionist for [Business Name], a hair salon in Los Angeles. Our hours are Mon-Sat 9am-7pm. We offer haircuts ($40), coloring ($120), and styling ($60). Book appointments and answer questions about our services.'
                    value={form.masterPrompt}
                    onChange={handleChange}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={loading}
                >
                  {loading ? 'Creating Agent...' : 'Create AI Agent'}
                </button>
              </form>
            </div>

            {/* Section B - Agent Status */}
            <div className="dashboard-card">
              <h2 className="card-title">Agent Status</h2>

              {fetching ? (
                <div className="agent-placeholder">
                  <p>Loading agents...</p>
                </div>
              ) : !activeAgent ? (
                <div className="agent-placeholder">
                  <div className="placeholder-icon">
                    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                  </div>
                  <p>No agent created yet.</p>
                  <p className="placeholder-sub">
                    Fill out the form to create your AI receptionist.
                  </p>
                </div>
              ) : (
                <div className="agent-status">
                  <div className="status-row">
                    <span className="status-badge">
                      <span className="status-dot" />
                      Active
                    </span>
                  </div>

                  <div className="agent-detail">
                    <label>Business</label>
                    <p>{activeAgent.businessName}</p>
                  </div>

                  <div className="agent-detail">
                    <label>Your AI Phone Number</label>
                    <p className="phone-display">
                      {activeAgent.twilioNumber || activeAgent.vapiPhoneNumber || activeAgent.aiPhoneNumber || 'Provisioning...'}
                    </p>
                  </div>

                  <div className="agent-detail">
                    <label>Owner's Phone</label>
                    <p className="phone-display">
                      {activeAgent.ownerPhone || 'Not set'}
                    </p>
                  </div>

                  <div className="agent-instructions">
                    <p>
                      Give this number to your customers. When they call, the AI will greet them and try connecting to your cell phone. If you don't answer, the AI handles the call based on your instructions.
                    </p>
                  </div>

                  <div className="agent-steps">
                    <h3>How It Works</h3>
                    <ol>
                      <li>Customer calls your AI number</li>
                      <li>AI greets them and tries to connect to you</li>
                      <li>If you're busy, AI handles the call for you</li>
                    </ol>
                  </div>

                  {editing ? (
                    <div className="edit-prompt-section">
                      <div className="form-group">
                        <label>Owner's Phone</label>
                        <input
                          type="tel"
                          className="form-input"
                          value={editOwnerPhone}
                          onChange={(e) => setEditOwnerPhone(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Edit Master Prompt</label>
                        <textarea
                          className="form-textarea"
                          rows={5}
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                        />
                      </div>
                      <div className="edit-actions">
                        <button
                          className="btn btn-primary"
                          onClick={() => handleUpdate(activeAgent.id)}
                        >
                          Save Changes
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={() => setEditing(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="agent-actions">
                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          setEditPrompt(activeAgent.masterPrompt || '');
                          setEditOwnerPhone(activeAgent.ownerPhone || '');
                          setEditing(true);
                        }}
                      >
                        Edit Agent
                      </button>
                      {confirmDelete === activeAgent.id ? (
                        <div className="delete-confirm">
                          <p>Are you sure? This cannot be undone.</p>
                          <div className="delete-confirm-actions">
                            <button
                              className="btn btn-danger"
                              onClick={() => handleDelete(activeAgent.id)}
                            >
                              Yes, Delete
                            </button>
                            <button
                              className="btn btn-outline"
                              onClick={() => setConfirmDelete(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn btn-danger-outline"
                          onClick={() => setConfirmDelete(activeAgent.id)}
                        >
                          Delete Agent
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
