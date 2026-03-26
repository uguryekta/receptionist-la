import { useState, useRef } from 'react';
import { ArrowRight, Zap, Phone, PhoneOff } from 'lucide-react';
import VapiModule from '@vapi-ai/web';
const Vapi = VapiModule.default || VapiModule;

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || '';
const DEMO_ASSISTANT_ID = import.meta.env.VITE_VAPI_DEMO_ASSISTANT_ID || '';

export default function Hero() {
  const [onCall, setOnCall] = useState(false);
  const vapiRef = useRef(null);

  const toggleCall = () => {
    if (onCall) {
      // End the call
      if (vapiRef.current) {
        vapiRef.current.stop();
        setOnCall(false);
      }
    } else {
      // Start a call
      if (!VAPI_PUBLIC_KEY) return;
      if (!vapiRef.current) {
        vapiRef.current = new Vapi(VAPI_PUBLIC_KEY);
        vapiRef.current.on('call-start', () => setOnCall(true));
        vapiRef.current.on('call-end', () => setOnCall(false));
      }
      vapiRef.current.start(DEMO_ASSISTANT_ID || '9160374d-3ad8-4bc4-8544-70baa401f707');
    }
  };

  return (
    <section className="hero">
      <div className="container hero-inner">
        <div className="hero-content centered">
          <div className="hero-badge">
            <Zap size={14} />
            <span>AI Receptionist for LA Businesses</span>
          </div>
          <h1>
            Your AI receptionist that
            <span className="hero-highlight"> never misses a call.</span>
          </h1>
          <p className="hero-sub">
            An AI receptionist helping you grow your business by answering calls
            and following up on outbound leads — working 24/7 for you.
          </p>
          <div className="hero-cta">
            <a href="#book" className="btn btn-primary btn-lg">
              Book Free Consultation
              <ArrowRight size={18} />
            </a>
            <button
              className={`btn btn-lg ${onCall ? 'btn-on-call' : 'btn-outline'}`}
              onClick={toggleCall}
            >
              {onCall ? <PhoneOff size={18} /> : <Phone size={18} />}
              {onCall ? 'End Call' : 'Talk to AI Now'}
            </button>
          </div>
        </div>
      </div>

      <div className="logo-strip">
        <div className="container">
          <p className="logo-strip-title">Running smoothly in 100+ businesses in LA</p>
          <div className="logo-strip-logos">
            <div className="client-logo">
              <div className="logo-placeholder">
                <span className="logo-icon">✦</span>
                <span>Glow Studio</span>
              </div>
            </div>
            <div className="client-logo">
              <div className="logo-placeholder">
                <span className="logo-icon">◆</span>
                <span>LA Realty</span>
              </div>
            </div>
            <div className="client-logo">
              <div className="logo-placeholder">
                <span className="logo-icon">⬡</span>
                <span>Pacific Law</span>
              </div>
            </div>
            <div className="client-logo">
              <div className="logo-placeholder">
                <span className="logo-icon">●</span>
                <span>CoolAir HVAC</span>
              </div>
            </div>
            <div className="client-logo">
              <div className="logo-placeholder">
                <span className="logo-icon">▲</span>
                <span>Sunset Salon</span>
              </div>
            </div>
            <div className="client-logo">
              <div className="logo-placeholder">
                <span className="logo-icon">◈</span>
                <span>WestSide Properties</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
