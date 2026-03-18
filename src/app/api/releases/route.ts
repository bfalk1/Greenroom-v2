import { NextResponse } from "next/server";

const GITHUB_REPO = "bfalk1/Greenroom-v2";

export async function GET() {
  try {
    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Greenroom-App",
    };

    // Use GitHub token if available (for private repos)
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers, next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "No releases found" },
        { status: 404 }
      );
    }

    const data = await response.json();

    // Return only what the frontend needs
    return NextResponse.json({
      tag_name: data.tag_name,
      name: data.name,
      published_at: data.published_at,
      assets: data.assets.map((asset: { name: string; browser_download_url: string; size: number }) => ({
        name: asset.name,
        browser_download_url: asset.browser_download_url,
        size: asset.size,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch releases:", error);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}
