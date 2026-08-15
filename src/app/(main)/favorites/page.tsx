import { redirect } from "next/navigation";

// Favorites now live as a tab inside the Library rather than as their own page.
// Nothing on web ever linked here (the sole link was the Electron sidebar), so
// hearted items were effectively invisible to browser users. Kept as a redirect
// so the desktop sidebar, bookmarks, and any shared links still land somewhere.
export default function FavoritesPage() {
  redirect("/library?tab=favorites");
}
