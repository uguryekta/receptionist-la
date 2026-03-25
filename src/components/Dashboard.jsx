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

// ---------------------------------------------------------------------------
// Master Prompt Template Generator
// ---------------------------------------------------------------------------
function generateMasterPrompt(info) {
  const biz = info.businessName || '[Business Name]';
  const industry = info.industry || '[Industry]';
  const addr = info.address || '[Address]';
  const hours = info.hours || 'Monday through Friday, 9:00 AM to 6:00 PM';
  const services = info.services || '[List of services]';
  const languages = info.languages || 'English';
  const website = info.websiteUrl || '[website URL]';
  const email = info.ownerEmail || '[email]';
  const ownerName = info.ownerName || '[Owner Name]';
  const specialNotes = info.specialNotes || '';
  const parking = info.parking || '';
  const paymentMethods = info.paymentMethods || 'cash, credit cards, and debit cards';
  const cancellation = info.cancellationPolicy || '';
  const serviceArea = info.serviceArea || 'Los Angeles area';

  return `## ROLE & IDENTITY
You are the professional AI receptionist for ${biz}, a ${industry} located at ${addr}, serving the ${serviceArea}. Your name is "the receptionist" — never claim to be a human. If asked, say you are an AI assistant for ${biz}.

## PERSONALITY & TONE
- Warm, friendly, and genuinely helpful — like a great front desk person who cares
- Professional but conversational — never robotic or overly formal
- Patient with callers — never rush them, never show frustration
- Confident when providing information you know; honest when you don't
- Mirror the caller's energy — upbeat with upbeat callers, calm and reassuring with concerned callers

## BUSINESS INFORMATION
- **Business Name:** ${biz}
- **Industry:** ${industry}
- **Address:** ${addr}
- **Service Area:** ${serviceArea}
- **Business Hours:** ${hours}
- **Phone:** [Business Phone]
- **Email:** ${email}
- **Website:** ${website}
- **Owner/Manager:** ${ownerName}
${parking ? `- **Parking:** ${parking}` : ''}
${paymentMethods ? `- **Payment Methods:** ${paymentMethods}` : ''}

## SERVICES OFFERED
${services}

## LANGUAGES
${languages}

## CORE RESPONSIBILITIES (in priority order)

### 1. Answer Questions About the Business
- Provide accurate information about services, hours, location, and pricing ONLY if explicitly included above
- If a caller asks about something NOT covered in this prompt, say: "That's a great question. I don't have that specific information right now, but I'd be happy to take your name and number so ${ownerName || 'the team'} can get back to you with the answer."
- NEVER make up prices, availability, wait times, or any other information

### 2. Help With Appointments/Bookings
- Collect: caller's full name, phone number, preferred date/time, and service needed
- Confirm all details back to the caller before ending
- Say: "I've noted your appointment request. ${ownerName || 'The team'} will confirm your appointment shortly."
- If asked about specific availability, say: "Let me take your preferred time and ${ownerName || 'the team'} will confirm if that slot is available."

### 3. Take Messages
- When the caller wants to reach ${ownerName || 'someone specific'}, collect:
  - Caller's full name
  - Phone number
  - Brief reason for the call
- Say: "I'll make sure ${ownerName || 'they'} gets your message and calls you back as soon as possible."

### 4. Handle Urgent Matters
- If a caller describes an emergency or urgent issue, say: "I understand this is urgent. Let me take your information right away so ${ownerName || 'the team'} can prioritize getting back to you."
- Collect their name, number, and brief description of the urgency

## WHAT YOU MUST NEVER DO
1. **Never fabricate information** — If it's not in this prompt, you don't know it. Say so honestly.
2. **Never provide medical, legal, or financial advice** — Always direct to the appropriate professional.
3. **Never confirm appointments** — You take requests; the team confirms.
4. **Never share personal information** about the owner, employees, or other customers.
5. **Never discuss pricing** unless specific prices are listed above. Say: "Pricing can vary depending on your specific needs. I'd recommend speaking with ${ownerName || 'the team'} for an accurate quote."
6. **Never argue** with a caller. If someone is upset, empathize and offer to take a message.
7. **Never say "I'm just an AI"** dismissively — instead say "I'm the AI receptionist for ${biz}, and I'm here to help."

## HANDLING COMMON SCENARIOS

**Caller asks about hours:**
Provide the hours listed above. If they ask about holidays, say: "Our regular hours are [hours]. For holiday hours, I'd recommend checking our website at ${website} or I can have ${ownerName || 'the team'} get back to you."

**Caller asks for directions:**
Provide the address: ${addr}. ${parking ? `Parking info: ${parking}` : 'If they ask about parking, offer to have the team call back with details.'}

**Caller wants a price quote:**
Only share prices if they are explicitly listed above. Otherwise: "Pricing depends on the specific service and your individual needs. I'd love to set up a time for you to discuss this with ${ownerName || 'our team'} directly."

**Caller asks if you're a real person:**
"I'm an AI receptionist for ${biz}. I'm here to help you with information, appointments, and messages. How can I assist you?"

**Caller speaks a language you support:**
Respond in their language if it's listed in your supported languages: ${languages}.

**After-hours call:**
"Thank you for calling ${biz}. Our business hours are ${hours}. I'd be happy to take a message, and ${ownerName || 'the team'} will get back to you during business hours."

${cancellation ? `**Cancellation/Rescheduling:**\n${cancellation}` : ''}

${specialNotes ? `## ADDITIONAL NOTES\n${specialNotes}` : ''}

## CALL FLOW
1. **Greet** warmly: "Hello! Thank you for calling ${biz}. How can I help you today?"
2. **Listen** carefully to the caller's needs
3. **Respond** with accurate information from this prompt only
4. **Collect info** if needed (name, number, message, appointment details)
5. **Confirm** all collected information back to the caller
6. **Close** professionally: "Is there anything else I can help you with? ... Thank you for calling ${biz}. Have a wonderful day!"`;
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
  const [scraping, setScraping] = useState(false);
  const [showTemplateHelper, setShowTemplateHelper] = useState(false);
  const vapiRef = useRef(null);

  const [form, setForm] = useState({
    businessName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerName: '',
    areaCode: '213',
    websiteUrl: '',
    googleMapsUrl: '',
    masterPrompt: '',
  });
  const [scrapingMaps, setScrapingMaps] = useState(false);

  // Template helper fields
  const [templateFields, setTemplateFields] = useState({
    industry: '',
    address: '',
    serviceArea: 'Los Angeles area',
    hours: 'Monday through Friday, 9:00 AM to 6:00 PM',
    services: '',
    languages: 'English',
    parking: '',
    paymentMethods: 'Cash, credit cards, debit cards',
    cancellationPolicy: '',
    specialNotes: '',
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

  const handleTemplateChange = (e) => {
    setTemplateFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Pull info from website
  const handleScrapeWebsite = async () => {
    if (!form.websiteUrl) {
      showToast('Please enter a website URL first.', 'error');
      return;
    }
    setScraping(true);
    try {
      const res = await fetch(`${API_BASE}/api/scrape-website`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ url: form.websiteUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch website');
      }
      const data = await res.json();
      const info = data.data;

      // Auto-fill form fields
      if (info.pageTitle && !form.businessName) {
        setForm((prev) => ({ ...prev, businessName: info.pageTitle.split('|')[0].split('-')[0].trim() }));
      }
      if (info.emails?.length && !form.ownerEmail) {
        setForm((prev) => ({ ...prev, ownerEmail: info.emails[0] }));
      }
      if (info.phones?.length && !form.ownerPhone) {
        setForm((prev) => ({ ...prev, ownerPhone: info.phones[0] }));
      }

      // Auto-fill template fields
      if (info.address) {
        setTemplateFields((prev) => ({ ...prev, address: info.address }));
      }
      if (info.hours) {
        setTemplateFields((prev) => ({ ...prev, hours: info.hours }));
      }
      if (info.services?.length) {
        setTemplateFields((prev) => ({
          ...prev,
          services: info.services.map((s) => `- ${s}`).join('\n'),
        }));
      }
      if (info.industry) {
        setTemplateFields((prev) => ({ ...prev, industry: info.industry }));
      }
      if (info.languages) {
        setTemplateFields((prev) => ({ ...prev, languages: info.languages }));
      }
      if (info.paymentMethods) {
        setTemplateFields((prev) => ({ ...prev, paymentMethods: info.paymentMethods }));
      }
      if (info.parking) {
        setTemplateFields((prev) => ({ ...prev, parking: info.parking }));
      }
      if (info.serviceArea) {
        setTemplateFields((prev) => ({ ...prev, serviceArea: info.serviceArea }));
      }
      if (info.aboutText || info.description) {
        setTemplateFields((prev) => ({
          ...prev,
          specialNotes: prev.specialNotes
            ? prev.specialNotes
            : `About: ${info.aboutText || info.description}`,
        }));
      }

      // Show summary
      const found = [];
      if (info.pageTitle) found.push('business name');
      if (info.phones?.length) found.push('phone');
      if (info.emails?.length) found.push('email');
      if (info.address) found.push('address');
      if (info.hours) found.push('hours');
      if (info.services?.length) found.push(`${info.services.length} services`);
      if (info.industry) found.push('industry');
      if (info.languages) found.push('languages');
      if (info.paymentMethods) found.push('payments');
      if (info.parking) found.push('parking');
      if (info.aboutText) found.push('about info');

      if (found.length > 0) {
        showToast(`Website: Found ${found.join(', ')}. Review and generate the prompt!`);
        setShowTemplateHelper(true);
      } else {
        showToast('Could not extract structured info. You can still fill the template manually.', 'error');
        setShowTemplateHelper(true);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setScraping(false);
    }
  };

  // Pull info from Google Maps
  const handleScrapeMaps = async () => {
    if (!form.googleMapsUrl) {
      showToast('Please enter a Google Maps URL first.', 'error');
      return;
    }
    setScrapingMaps(true);
    try {
      const res = await fetch(`${API_BASE}/api/scrape-google-maps`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ url: form.googleMapsUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch Google Maps info');
      }
      const data = await res.json();
      const info = data.data;

      // Auto-fill what we found
      if (info.businessName && !form.businessName) {
        setForm((prev) => ({ ...prev, businessName: info.businessName }));
      }
      if (info.phone && !form.ownerPhone) {
        setForm((prev) => ({ ...prev, ownerPhone: info.phone }));
      }
      if (info.address) {
        setTemplateFields((prev) => ({ ...prev, address: info.address }));
      }
      if (info.hours) {
        setTemplateFields((prev) => ({ ...prev, hours: info.hours }));
      }
      if (info.category) {
        setTemplateFields((prev) => ({ ...prev, industry: info.category }));
      }
      if (info.website && !form.websiteUrl) {
        setForm((prev) => ({ ...prev, websiteUrl: info.website }));
      }
      if (info.serviceArea) {
        setTemplateFields((prev) => ({ ...prev, serviceArea: info.serviceArea }));
      }

      const found = [];
      if (info.businessName) found.push('business name');
      if (info.phone) found.push('phone');
      if (info.address) found.push('address');
      if (info.hours) found.push('hours');
      if (info.category) found.push('industry');
      if (info.website) found.push('website');
      if (info.rating) found.push(`rating (${info.rating})`);

      if (found.length > 0) {
        showToast(`Google Maps: Found ${found.join(', ')}. Review and generate the prompt.`);
        setShowTemplateHelper(true);
      } else {
        showToast('Could not extract info from Google Maps. Try pasting the full URL from your browser.', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setScrapingMaps(false);
    }
  };

  // Generate prompt from template
  const handleGeneratePrompt = () => {
    const prompt = generateMasterPrompt({
      businessName: form.businessName,
      ownerEmail: form.ownerEmail,
      ownerName: form.ownerName,
      websiteUrl: form.websiteUrl,
      ...templateFields,
    });
    setForm((prev) => ({ ...prev, masterPrompt: prompt }));
    showToast('Master prompt generated! Review and customize it below.');
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
      setForm({ businessName: '', ownerEmail: '', ownerPhone: '', ownerName: '', areaCode: '213', websiteUrl: '', googleMapsUrl: '', masterPrompt: '' });
      setTemplateFields({
        industry: '', address: '', serviceArea: 'Los Angeles area',
        hours: 'Monday through Friday, 9:00 AM to 6:00 PM', services: '',
        languages: 'English', parking: '', paymentMethods: 'Cash, credit cards, debit cards',
        cancellationPolicy: '', specialNotes: '',
      });
      setShowForm(false);
      setShowTemplateHelper(false);
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

  const handleToggleActive = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${id}/toggle`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to toggle agent');
      const data = await res.json();
      setAgents((prev) => prev.map((a) => (a.id === id ? data.agent : a)));
      showToast(`Agent ${data.agent.active ? 'activated' : 'deactivated'} successfully.`);
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
                Enter the customer's website to auto-fill details, or fill manually.
              </p>

              {/* Website URL + Pull Info */}
              <div className="website-pull-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="websiteUrl">Customer Website URL</label>
                  <input
                    id="websiteUrl"
                    name="websiteUrl"
                    type="url"
                    className="form-input"
                    placeholder="https://www.example.com"
                    value={form.websiteUrl}
                    onChange={handleChange}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-pull-info"
                  onClick={handleScrapeWebsite}
                  disabled={scraping}
                >
                  {scraping ? 'Pulling...' : 'Pull Info from Website'}
                </button>
              </div>

              {/* Google Maps URL + Pull Info */}
              <div className="website-pull-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="googleMapsUrl">Google Maps URL</label>
                  <input
                    id="googleMapsUrl"
                    name="googleMapsUrl"
                    type="url"
                    className="form-input"
                    placeholder="https://maps.google.com/maps?cid=... or search URL"
                    value={form.googleMapsUrl}
                    onChange={handleChange}
                  />
                  <span className="form-help">Paste the Google Maps link for the business to pull address, hours, category, rating, and more.</span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-pull-info"
                  onClick={handleScrapeMaps}
                  disabled={scrapingMaps}
                >
                  {scrapingMaps ? 'Pulling...' : 'Pull Info from Maps'}
                </button>
              </div>

              <form onSubmit={handleCreate} className="dashboard-form create-form-grid">
                <div className="form-group">
                  <label htmlFor="businessName">Business Name *</label>
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
                  <label htmlFor="ownerName">Owner / Manager Name</label>
                  <input
                    id="ownerName"
                    name="ownerName"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Maria Garcia"
                    value={form.ownerName}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="ownerEmail">Owner Email *</label>
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
                  <label htmlFor="ownerPhone">Owner's Cell Phone *</label>
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

                {/* Template Helper Toggle */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-template-toggle"
                    onClick={() => setShowTemplateHelper(!showTemplateHelper)}
                  >
                    {showTemplateHelper ? 'Hide Prompt Builder' : 'Open Prompt Builder (Recommended)'}
                  </button>
                </div>

                {/* Template Helper Fields */}
                {showTemplateHelper && (
                  <div className="template-helper" style={{ gridColumn: '1 / -1' }}>
                    <div className="template-helper-header">
                      <h3>Prompt Builder</h3>
                      <p>Fill in the details below and click "Generate Master Prompt" to create a professional prompt.</p>
                    </div>
                    <div className="template-grid">
                      <div className="form-group">
                        <label htmlFor="industry">Industry / Business Type *</label>
                        <input
                          id="industry"
                          name="industry"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Hair salon, Law firm, Dental office, Auto repair"
                          value={templateFields.industry}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="address">Business Address</label>
                        <input
                          id="address"
                          name="address"
                          type="text"
                          className="form-input"
                          placeholder="e.g. 1234 Sunset Blvd, Los Angeles, CA 90028"
                          value={templateFields.address}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="serviceArea">Service Area</label>
                        <input
                          id="serviceArea"
                          name="serviceArea"
                          type="text"
                          className="form-input"
                          placeholder="e.g. West Hollywood and surrounding areas"
                          value={templateFields.serviceArea}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="hours">Business Hours</label>
                        <input
                          id="hours"
                          name="hours"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Mon-Fri 9am-6pm, Sat 10am-4pm, Sun Closed"
                          value={templateFields.hours}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="languages">Languages Supported</label>
                        <input
                          id="languages"
                          name="languages"
                          type="text"
                          className="form-input"
                          placeholder="e.g. English, Spanish, Korean"
                          value={templateFields.languages}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="paymentMethods">Payment Methods</label>
                        <input
                          id="paymentMethods"
                          name="paymentMethods"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Cash, credit cards, Apple Pay, Zelle"
                          value={templateFields.paymentMethods}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="parking">Parking Info</label>
                        <input
                          id="parking"
                          name="parking"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Free parking behind the building, street parking available"
                          value={templateFields.parking}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="services">Services Offered (one per line)</label>
                        <textarea
                          id="services"
                          name="services"
                          className="form-textarea"
                          rows={4}
                          placeholder={"e.g.\n- Haircuts (men's and women's)\n- Color and highlights\n- Blowouts and styling\n- Keratin treatments"}
                          value={templateFields.services}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="cancellationPolicy">Cancellation / Rescheduling Policy</label>
                        <textarea
                          id="cancellationPolicy"
                          name="cancellationPolicy"
                          className="form-textarea"
                          rows={2}
                          placeholder="e.g. Please cancel or reschedule at least 24 hours in advance to avoid a cancellation fee."
                          value={templateFields.cancellationPolicy}
                          onChange={handleTemplateChange}
                        />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="specialNotes">Special Notes / Custom Instructions</label>
                        <textarea
                          id="specialNotes"
                          name="specialNotes"
                          className="form-textarea"
                          rows={3}
                          placeholder={"e.g.\n- We are currently offering 20% off for first-time customers\n- We don't accept walk-ins on Saturdays\n- Ask callers how they heard about us"}
                          value={templateFields.specialNotes}
                          onChange={handleTemplateChange}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-generate"
                      onClick={handleGeneratePrompt}
                    >
                      Generate Master Prompt
                    </button>
                  </div>
                )}

                {/* Master Prompt */}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="masterPrompt">
                    Master Prompt *
                    <span className="label-hint"> — Generated or custom. This is the AI's brain.</span>
                  </label>
                  <textarea
                    id="masterPrompt"
                    name="masterPrompt"
                    className="form-textarea form-textarea-large"
                    rows={16}
                    placeholder='Use the Prompt Builder above to generate a comprehensive prompt, or write your own...'
                    value={form.masterPrompt}
                    onChange={handleChange}
                    required
                  />
                  <div className="prompt-char-count">
                    {form.masterPrompt.length} characters
                  </div>
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
                    <span className={`status-badge ${agent.active === false ? 'status-inactive' : ''}`}>
                      <span className="status-dot" />
                      {agent.active === false ? 'Inactive' : 'Active'}
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
                          className="form-textarea form-textarea-large"
                          rows={12}
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
                        End Call
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => startTestCall(agent.assistantId)}
                        disabled={!!activeCallId}
                      >
                        Test Call
                      </button>
                    )}
                    <button
                      className={`btn ${agent.active === false ? 'btn-success' : 'btn-warning'}`}
                      onClick={() => handleToggleActive(agent.id)}
                    >
                      {agent.active === false ? 'Activate' : 'Deactivate'}
                    </button>
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
