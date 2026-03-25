import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import Industries from './components/Industries';
import HowItWorks from './components/HowItWorks';
import Pricing from './components/Pricing';
import CTA from './components/CTA';
import FAQ from './components/FAQ';
import BookMeeting from './components/BookMeeting';
import Footer from './components/Footer';

export default function App() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <Industries />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <CTA />
      <BookMeeting />
      <Footer />
    </>
  );
}
