import { ArrowRight } from 'lucide-react';

export default function CTA() {
  return (
    <section id="cta" className="cta">
      <div className="container cta-inner">
        <h2>Adopt the latest AI technology and focus on more profit.</h2>
        <p>
          Let your AI receptionist handle the calls while you focus on growing
          your business. Hundreds of LA businesses are already seeing the results.
        </p>
        <div className="cta-actions">
          <a href="#book" className="btn btn-primary btn-lg">
            Book a 30-min Call
            <ArrowRight size={18} />
          </a>
        </div>
        <p className="cta-note">No commitment required. We will be glad to visit you in your location after our free consultation call.</p>
      </div>
    </section>
  );
}
