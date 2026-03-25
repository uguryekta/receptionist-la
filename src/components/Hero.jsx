import { useState, useRef } from 'react';
import { ArrowRight, Zap, Play, Pause } from 'lucide-react';

export default function Hero() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const toggleAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/sample_call.wav');
      audioRef.current.addEventListener('ended', () => setIsPlaying(false));
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
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
            Never miss another
            <span className="hero-highlight"> customer call.</span>
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
              className="btn btn-outline btn-lg"
              onClick={toggleAudio}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              {isPlaying ? 'Pause Call' : 'Listen to a Call'}
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
