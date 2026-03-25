import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'How does the AI receptionist actually work?',
    a: 'Our AI receptionist answers your business calls using advanced voice AI. It greets callers naturally, answers questions about your business, books appointments, and routes calls — just like a real receptionist, but available 24/7.',
  },
  {
    q: 'How long does setup take?',
    a: 'We handle everything for you. Our team visits your business in person to learn how you operate, then we build and configure your custom AI receptionist. Most businesses are live within the same day!',
  },
  {
    q: 'Will the AI sound robotic?',
    a: 'Not at all. Our AI uses natural-sounding voices and is trained on your specific business details, so callers get a professional and human-like experience every time.',
  },
  {
    q: 'What happens if the AI can\'t handle a call?',
    a: 'If a call requires human attention, the AI will intelligently route it to the right person on your team. You\'ll also receive a text summary so nothing falls through the cracks.',
  },
  {
    q: 'Can I customize what the AI says?',
    a: 'Absolutely. During our in-person onboarding, we work with you to define exactly how calls should be handled — from greetings to FAQs to booking flows. Everything is tailored to your business.',
  },
  {
    q: 'What counts toward my 1,500 minutes?',
    a: 'Only active call time counts toward your minutes. Hold time, ringing, and voicemail do not count. Most small businesses find 1,500 minutes more than enough for their monthly call volume.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. There are no long-term contracts. You can cancel your plan at any time with no penalties or hidden fees.',
  },
  {
    q: 'Do you only serve businesses in Los Angeles?',
    a: 'We specialize in LA businesses because we provide in-person onboarding and local support. However, we can serve businesses anywhere in Southern California.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (i) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <section id="faq" className="faq">
      <div className="container">
        <div className="section-header">
          <h2>Frequently asked questions</h2>
          <p>Everything you need to know about Receptionist LA.</p>
        </div>
        <div className="faq-list">
          {faqs.map((faq, i) => (
            <div key={i} className={`faq-item ${openIndex === i ? 'open' : ''}`}>
              <button className="faq-question" onClick={() => toggle(i)}>
                <span>{faq.q}</span>
                <ChevronDown size={20} className="faq-chevron" />
              </button>
              <div className="faq-answer">
                <p>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
