import { Check, ArrowRight } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    price: '699',
    desc: 'Everything you need to never miss a call.',
    features: [
      '300 minutes per month',
      '24/7 call answering',
      'FAQ handling',
      'Call summaries via text message',
      'Appointment booking',
      'Smart call routing',
      'Custom AI training',
      'In-person support at your location',
    ],
    featured: true,
    cta: 'Book Free Consultation',
    ctaStyle: 'btn-primary',
  },
  {
    name: 'Enterprise',
    price: null,
    desc: 'For multi-location and high-volume businesses.',
    features: [
      'Everything in Starter',
      'More minutes',
      'Multiple locations',
      'Outbound follow-ups',
      'Multiple phone lines',
      'Dedicated account manager',
    ],
    featured: false,
    cta: 'Book Free Consultation',
    ctaStyle: 'btn-outline',
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="pricing">
      <div className="container">
        <div className="section-header">
          <h2>Simple, transparent pricing</h2>
          <p>No hidden fees. Cancel anytime.</p>
        </div>
        <div className="pricing-grid two-col">
          {plans.map((plan, i) => (
            <div key={i} className={`pricing-card ${plan.featured ? 'featured' : ''}`}>
              {plan.featured && <div className="pricing-badge">Most Popular</div>}
              <h3>{plan.name}</h3>
              {plan.price ? (
                <>
                  <div className="pricing-amount">
                    <span className="currency">$</span>
                    <span className="price">{plan.price}</span>
                    <span className="period">/mo</span>
                  </div>
                  <div className="pricing-annual-highlight">
                    <span>$5,000/year</span> — save 40%
                  </div>
                </>
              ) : (
                <div className="pricing-amount custom">
                  <span className="price custom-price">Let's talk</span>
                </div>
              )}
              <p className="pricing-desc">{plan.desc}</p>
              <ul className="pricing-features">
                {plan.features.map((f, j) => (
                  <li key={j}>
                    <Check size={16} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a href="#book" className={`btn ${plan.ctaStyle} btn-full`}>
                {plan.cta}
                <ArrowRight size={16} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
