import Link from "next/link";
import { Music } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-emerald-500" />
            <span className="font-bold">
              GREEN<span className="text-emerald-500">ROOM</span>
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} GREENROOM. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
