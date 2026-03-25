import { MapPin, Users, Settings, Rocket } from 'lucide-react';

const steps = [
  {
    num: '01',
    icon: MapPin,
    title: 'We come to you',
    desc: 'We\'re based in LA and we visit your business in person. No remote questionnaires — we sit down with you to understand how your business actually runs.',
  },
  {
    num: '02',
    icon: Users,
    title: 'We learn your business inside out',
    desc: 'From how you greet callers to your booking flow and pricing — we pull every detail directly from you and your team so nothing gets lost.',
  },
  {
    num: '03',
    icon: Settings,
    title: 'Custom setup built for you',
    desc: 'We build a fully custom AI receptionist tailored to your specific services, schedule, and the way you want calls handled. No cookie-cutter templates.',
  },
  {
    num: '04',
    icon: Rocket,
    title: 'Go live with confidence',
    desc: 'We test everything together, fine-tune the responses, and go live. You get ongoing support from a local team that knows your business.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="how-it-works">
      <div className="container">
        <div className="section-header">
          <h2>We know LA. We know your business.</h2>
          <p>Unlike remote-only solutions, we show up at your door. Our local team visits your business to build a receptionist that truly represents you.</p>
        </div>
        <div className="steps">
          {steps.map((s, i) => (
            <div key={i} className="step">
              <div className="step-num">{s.num}</div>
              <div className="step-content">
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
