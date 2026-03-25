import { useEffect } from 'react';

export default function BookMeeting() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://static.hsappstatic.net/MeetingsEmbed/ex/MeetingsEmbedCode.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <section id="book" className="book-meeting">
      <div className="container">
        <div className="section-header">
          <h2>Book a call with us</h2>
          <p>Pick a time that works for you. We'll walk you through everything.</p>
        </div>
        <div className="meetings-embed">
          <div
            className="meetings-iframe-container"
            data-src="https://meetings.hubspot.com/ugur-yekta?embed=true"
          />
        </div>
      </div>
    </section>
  );
}
