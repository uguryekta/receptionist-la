import { Scissors, Home, Scale, Wrench } from 'lucide-react';

const industries = [
  {
    icon: Scissors,
    name: 'Beauty Salons',
    desc: 'Book appointments, answer pricing questions, and never miss a new client call while you\'re with a customer.',
    example: '"Hi, I\'d like to book a balayage for Saturday." — Handled automatically.',
  },
  {
    icon: Home,
    name: 'Real Estate',
    desc: 'Capture buyer inquiries, schedule showings, and follow up with leads — even during open houses.',
    example: '"I saw the listing on Zillow and want to schedule a tour." — Booked instantly.',
  },
  {
    icon: Scale,
    name: 'Law Firms',
    desc: 'Screen potential clients, collect case details, and route urgent calls to the right attorney.',
    example: '"I need a consultation for a personal injury case." — Intake completed.',
  },
  {
    icon: Wrench,
    name: 'HVAC',
    desc: 'Handle emergency service requests, schedule maintenance calls, and provide quotes around the clock.',
    example: '"My AC stopped working — can someone come today?" — Dispatched immediately.',
  },
];

export default function Industries() {
  return (
    <section id="industries" className="industries">
      <div className="container">
        <div className="section-header">
          <h2>Built for your specific needs</h2>
          <p>Custom AI for your industry and needs — not a generic solution.</p>
        </div>
        <div className="industries-grid">
          {industries.map((ind, i) => (
            <div key={i} className="industry-card">
              <div className="industry-icon">
                <ind.icon size={28} />
              </div>
              <h3>{ind.name}</h3>
              <p>{ind.desc}</p>
              <div className="industry-example">
                <p>{ind.example}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
