import PricingPageContent from "@/components/pricing/PricingPageContent";

// Standard public pricing. The grid itself lives in PricingPageContent so
// /promo/pricing can render the identical page with the VIP intro offer.
export default function PricingPage() {
  return <PricingPageContent />;
}
