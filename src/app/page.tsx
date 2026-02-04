import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h1 className="text-6xl font-bold tracking-tighter text-white">
          GREEN<span className="text-emerald-500">ROOM</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Premium Music Samples for Your Sound
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/marketplace">
            <Button size="lg">Browse Samples</Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline">
              View Plans
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
