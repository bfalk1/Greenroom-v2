import Link from "next/link";
import { Music } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Music className="h-6 w-6 text-emerald-500" />
          <span className="text-xl font-bold tracking-tight">
            GREEN<span className="text-emerald-500">ROOM</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/marketplace"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Marketplace
          </Link>
          <Link
            href="/library"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Library
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Get Started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
