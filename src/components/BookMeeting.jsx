import { useEffect } from 'react';

export default function BookMeeting() {
  useEffect(() => {
    (function (C, A, L) {
      let p = function (a, ar) { a.q.push(ar); };
      let d = C.document;
      C.Cal = C.Cal || function () {
        let cal = C.Cal;
        let ar = arguments;
        if (!cal.loaded) {
          cal.ns = {};
          cal.q = cal.q || [];
          d.head.appendChild(d.createElement("script")).src = A;
          cal.loaded = true;
        }
        if (ar[0] === L) {
          const api = function () { p(api, arguments); };
          const namespace = ar[1];
          api.q = api.q || [];
          if (typeof namespace === "string") {
            cal.ns[namespace] = cal.ns[namespace] || api;
            p(cal.ns[namespace], ar);
            p(cal, ["initNamespace", namespace]);
          } else p(cal, ar);
          return;
        }
        p(cal, ar);
      };
    })(window, "https://app.cal.com/embed/embed.js", "init");

    window.Cal("init", "30min", { origin: "https://app.cal.com" });
    window.Cal.ns["30min"]("inline", {
      elementOrSelector: "#my-cal-inline-30min",
      config: { layout: "month_view", useSlotsViewOnSmallScreen: "true" },
      calLink: "ugur-yekta/30min",
    });
    window.Cal.ns["30min"]("ui", { hideEventTypeDetails: false, layout: "month_view" });
  }, []);

  return (
    <section id="book" className="book-meeting">
      <div className="container">
        <div className="section-header">
          <h2>Book a Demo</h2>
          <p>Pick a time that works for you. We will be glad to visit you in your location after our free consultation call.</p>
        </div>
        <div className="meetings-embed">
          <div
            id="my-cal-inline-30min"
            style={{ width: '100%', height: '100%', overflow: 'scroll' }}
          />
        </div>
      </div>
    </section>
  );
}
