import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="legal-page">
      <div className="container">
        <Link to="/" className="legal-back">&larr; Back to Home</Link>
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: March 26, 2026</p>

        <h2>1. Service Description</h2>
        <p>Receptionist LA provides an AI-powered virtual receptionist service for small businesses. Our service answers incoming phone calls, provides information about your business, books appointments, takes messages, and routes calls based on your configuration.</p>

        <h2>2. Subscription and Billing</h2>
        <ul>
          <li>Our Starter Plan begins at $699/month and includes 1,500 minutes of active call time.</li>
          <li>Billing is processed monthly through Stripe.</li>
          <li>Additional minutes beyond your plan allowance may incur overage charges.</li>
          <li>You may cancel your subscription at any time. Cancellation takes effect at the end of your current billing period.</li>
          <li>No refunds are provided for partial months.</li>
        </ul>

        <h2>3. Your Responsibilities</h2>
        <ul>
          <li>Provide accurate and up-to-date business information for AI training</li>
          <li>Maintain the confidentiality of your account credentials</li>
          <li>Ensure your use of our service complies with all applicable laws</li>
          <li>Notify us promptly of any changes to your business information</li>
          <li>Not use the service for any illegal, fraudulent, or harmful purposes</li>
        </ul>

        <h2>4. AI Limitations</h2>
        <p>Our AI receptionist is designed to handle common business calls professionally. However:</p>
        <ul>
          <li>The AI may occasionally misunderstand callers or provide imperfect responses</li>
          <li>The AI is not a substitute for professional medical, legal, or financial advice</li>
          <li>We continuously improve our AI but cannot guarantee 100% accuracy</li>
          <li>Complex or unusual requests may require human follow-up</li>
        </ul>

        <h2>5. Service Availability</h2>
        <p>We aim for 99.9% uptime but do not guarantee uninterrupted service. Occasional downtime may occur for maintenance, updates, or circumstances beyond our control. We are not liable for any losses resulting from service interruptions.</p>

        <h2>6. Intellectual Property</h2>
        <p>The Receptionist LA platform, AI models, website, and all associated content are our intellectual property. Your business data and call recordings remain your property. You grant us a limited license to use your business information to provide the service.</p>

        <h2>7. Limitation of Liability</h2>
        <p>Receptionist LA is not liable for any indirect, incidental, special, or consequential damages arising from your use of our service. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.</p>

        <h2>8. Termination</h2>
        <p>We may suspend or terminate your account if you violate these terms, fail to pay, or use the service in a way that harms our platform or other users. You may terminate your account at any time by canceling your subscription.</p>

        <h2>9. Changes to Terms</h2>
        <p>We may update these terms from time to time. We will notify you of significant changes via email. Continued use of the service after changes constitutes acceptance of the new terms.</p>

        <h2>10. Governing Law</h2>
        <p>These terms are governed by the laws of the State of California. Any disputes shall be resolved in the courts of Los Angeles County, California.</p>

        <h2>11. Contact Us</h2>
        <p>For questions about these terms, contact us at:</p>
        <p>Email: <a href="mailto:admin@receptionistla.com">admin@receptionistla.com</a></p>
        <p>Phone: (844) 492-2681</p>
      </div>
    </div>
  );
}
