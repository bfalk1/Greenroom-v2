import LandingPageContent from "@/components/landing/LandingPageContent";

// The public landing page. The page itself lives in LandingPageContent so the
// promo funnel (/promo) can render the identical page with its own CTA target
// and the VIP intro-offer band under the hero.
export default function LandingPage() {
  return <LandingPageContent />;
}
