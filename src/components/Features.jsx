import { PhoneIncoming, CalendarCheck, MessageSquare, PhoneForwarded, PhoneOutgoing, Clock } from 'lucide-react';

const features = [
  {
    icon: PhoneIncoming,
    title: 'Answer Calls 24/7',
    desc: 'Never lose a lead again. Your AI receptionist picks up every call, day or night, weekends and holidays included.',
  },
  {
    icon: CalendarCheck,
    title: 'Book Appointments',
    desc: 'Seamlessly schedule appointments directly into your calendar. No double bookings, no back-and-forth.',
  },
  {
    icon: MessageSquare,
    title: 'Handle FAQs',
    desc: 'Instantly answer common questions about your hours, pricing, services, and location — saving you time.',
  },
  {
    icon: PhoneForwarded,
    title: 'Route Calls',
    desc: 'Intelligently route calls to the right person or department based on the caller\'s needs.',
  },
  {
    icon: PhoneOutgoing,
    title: 'Outbound Follow-Ups',
    desc: 'Automatically follow up with leads who didn\'t convert, keeping your pipeline warm and active.',
  },
  {
    icon: Clock,
    title: 'After-Hours Coverage',
    desc: 'Capture every opportunity even when your office is closed. Wake up to new bookings every morning.',
  },
];

export default function Features() {
  return (
    <section id="features" className="features">
      <div className="container">
        <div className="section-header">
          <h2>Everything your front desk does — and more</h2>
          <p>Powerful features designed to help small businesses in Los Angeles capture every opportunity.</p>
        </div>
        <div className="features-grid">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">
                <f.icon size={24} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
